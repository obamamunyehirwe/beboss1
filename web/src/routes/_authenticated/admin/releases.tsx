import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Download, Loader2, Star, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction, EmptyState, LoadingBlock, PageHeader, StatCard, useAdminAction } from "@/components/admin/ui";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { deleteRelease, publishRelease, setCurrentRelease } from "@/lib/admin.functions";
import { downloadsQuery, releasesQuery } from "@/lib/admin-queries";
import { DOWNLOAD_PATH } from "@/lib/queries";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/releases")({
  component: ReleasesPage,
});

const MAX_APK_BYTES = 100 * 1024 * 1024;

async function sha256Hex(file: File) {
  const buf = await file.arrayBuffer();
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ReleasesPage() {
  const a = useAdminText();
  const isAdmin = !!useAdminCtx().data?.isAdmin;
  const releases = useQuery(releasesQuery);
  const downloads = useQuery(downloadsQuery);
  const qc = useQueryClient();
  const publish = useServerFn(publishRelease);
  const setCurrent = useAdminAction(useServerFn(setCurrentRelease), { success: "Now the current download", invalidate: [["admin", "releases"], ["public-site"]] });
  const del = useAdminAction(useServerFn(deleteRelease), { success: "Release deleted", invalidate: [["admin", "releases"]] });

  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ version_name: "", version_code: 1, min_android: "Android 7.0+", release_notes: "", make_current: true });
  const [stage, setStage] = useState<"" | "hashing" | "uploading" | "publishing">("");

  const downloadUrl = typeof window !== "undefined" ? `${window.location.origin}${DOWNLOAD_PATH}` : DOWNLOAD_PATH;

  // Start new releases above the highest version code already published.
  useEffect(() => {
    const highestVersionCode = (releases.data ?? []).reduce(
      (highest, release) => Math.max(highest, Number(release.version_code) || 0),
      0,
    );
    const nextVersionCode = highestVersionCode + 1;
    setForm((current) => current.version_code < nextVersionCode
      ? { ...current, version_code: nextVersionCode }
      : current);
  }, [releases.data]);

  const daily = useMemo(() => {
    const out: { day: string; n: number }[] = [];
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      const start = new Date(now - i * 86_400_000);
      start.setHours(0, 0, 0, 0);
      const end = start.getTime() + 86_400_000;
      out.push({ day: start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), n: (downloads.data ?? []).filter((d) => { const t = new Date(d.created_at).getTime(); return t >= start.getTime() && t < end; }).length });
    }
    return out;
  }, [downloads.data]);
  const byChannel = useMemo(() => {
    const m: Record<string, number> = {};
    (downloads.data ?? []).forEach((d) => (m[d.channel] = (m[d.channel] ?? 0) + 1));
    return m;
  }, [downloads.data]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error(a("Choose the APK file"));
      return;
    }
    if (!file.name.toLowerCase().endsWith(".apk")) {
      toast.error(a("The file must be an .apk"));
      return;
    }
    if (file.size > MAX_APK_BYTES) {
      toast.error(a("The APK must be 100 MB or smaller."));
      return;
    }
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
      toast.error(a("This file does not have a valid APK/ZIP package signature."));
      return;
    }
    try {
      setStage("hashing");
      const sha = await sha256Hex(file);
      setStage("uploading");
      const safeName = `BeBoss-POS-v${form.version_name.replace(/[^0-9a-zA-Z.-]/g, "")}.apk`;
      const path = `v${form.version_name.replace(/[^0-9a-zA-Z.-]/g, "")}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("releases").upload(path, file, { contentType: "application/vnd.android.package-archive", upsert: false });
      if (error) throw new Error(error.message);
      setStage("publishing");
      await publish({ data: { ...form, file_path: path, file_name: safeName, size_bytes: file.size, sha256: sha, public_download_url: downloadUrl } });
      toast.success(`v${form.version_name} published${form.make_current ? " — the website and app now offer it" : ""}`);
      setFile(null);
      setForm({ ...form, version_name: "", release_notes: "", version_code: form.version_code + 1 });
      qc.invalidateQueries({ queryKey: ["admin", "releases"] });
      qc.invalidateQueries({ queryKey: ["public-site"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : a("Upload failed"));
    } finally {
      setStage("");
    }
  };

  const rows = releases.data ?? [];
  const total = rows.reduce((a, r) => a + r.download_count, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="App releases" sub="Publish new Android APKs. The website, QR codes and the app's update check all point to the current release." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="All-time downloads" value={total} icon={Download} tone="brand" />
        <StatCard label="Last 30 days" value={daily.reduce((a, d) => a + d.n, 0)} sub={Object.entries(byChannel).map(([k, v]) => `${k} ${v}`).join(" • ") || "—"} />
        <StatCard label="Current version" value={rows.find((r) => r.is_current)?.version_name ?? "—"} sub={<span className="break-all font-mono">{downloadUrl}</span>} icon={Star} />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">{a("Downloads per day")}</h2>
        <div className="mt-3 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily}>
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval={4} />
              <YAxis allowDecimals={false} width={24} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} cursor={{ fill: "var(--accent)" }} />
              <Bar dataKey="n" name="Downloads" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {isAdmin ? (
        <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-border bg-card p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <UploadCloud className="size-4 text-primary" /> {a("Publish a new version")}
            </h2>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-center hover:border-primary/50">
              <UploadCloud className="size-8 text-muted-foreground" />
              <span className="text-sm">{file ? `${file.name} • ${formatBytes(file.size)}` : "Choose the signed release APK (max 100 MB)"}</span>
              <input type="file" accept=".apk,application/vnd.android.package-archive" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{a("Version name")}</Label>
                <Input value={form.version_name} onChange={(e) => setForm({ ...form, version_name: e.target.value })} placeholder="2.1.0" required pattern="^[0-9]+(\.[0-9]+){0,3}$" />
              </div>
              <div className="space-y-1.5">
                <Label>{a("Version code")}</Label>
                <Input type="number" min={1} value={form.version_code} onChange={(e) => setForm({ ...form, version_code: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{a("Minimum")}</Label>
                <Input value={form.min_android} onChange={(e) => setForm({ ...form, min_android: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex-1 space-y-1.5">
              <Label>{a("What's new")}</Label>
              <Textarea rows={6} value={form.release_notes} onChange={(e) => setForm({ ...form, release_notes: e.target.value })} maxLength={5000} placeholder={a("• Faster checkout&#10;• New Kiswahili translations")} />
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={form.make_current} onCheckedChange={(v) => setForm({ ...form, make_current: v })} />
              {a("Make this the current download and push the update to apps")}
            </label>
            <Button type="submit" variant="hero" disabled={!!stage}>
              {stage ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              {stage === "hashing" ? a("Verifying file…") : stage === "uploading" ? a("Uploading…") : stage === "publishing" ? a("Publishing…") : a("Upload & publish")}
            </Button>
          </div>
        </form>
      ) : null}

      {releases.isLoading ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <EmptyState title="No releases yet" sub="Upload your signed BeBoss APK above. Until then the website shows a 'coming soon' notice." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-bold">v{r.version_name}</h3>
                  <span className="font-mono text-xs text-muted-foreground">({r.version_code})</span>
                  {r.is_current ? (
                    <Badge variant="success">
                      <CheckCircle2 className="mr-1 size-3" /> {a("Current")}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.file_name} • {formatBytes(Number(r.size_bytes))} • {r.min_android} • {formatDateTime(r.published_at)} • {r.created_by}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">sha256 {r.sha256}</p>
                {r.release_notes ? <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{r.release_notes}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="mr-2 text-sm">
                  <span className="font-display text-xl font-bold">{r.download_count}</span> <span className="text-muted-foreground">{a("downloads")}</span>
                </span>
                <Button size="sm" variant="glass" asChild>
                  <a href={`${DOWNLOAD_PATH}?release=${r.id}&ch=admin`}>
                    <Download /> {a("APK")}
                  </a>
                </Button>
                {isAdmin && !r.is_current ? (
                  <>
                    <Button size="sm" variant="soft" onClick={() => setCurrent.mutate({ id: r.id, public_download_url: downloadUrl })}>
                      <Star /> {a("Make current")}
                    </Button>
                    <ConfirmAction
                      trigger={
                        <Button size="icon" variant="ghost" aria-label={a("Delete release")}>
                          <Trash2 />
                        </Button>
                      }
                      title={a("Delete release?")}
                      description={a("The APK file is removed from storage and its download link stops working.")}
                      destructive
                      confirmLabel="Delete"
                      onConfirm={() => del.mutate({ id: r.id })}
                    />
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
