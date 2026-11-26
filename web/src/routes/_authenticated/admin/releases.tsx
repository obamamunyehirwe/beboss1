import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Apple, CheckCircle2, Download, FileCheck2, Laptop, Loader2, Monitor, Pencil, Smartphone, Star, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmAction, EmptyState, LoadingBlock, PageHeader, StatCard, useAdminAction } from "@/components/admin/ui";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { cleanupDesktopReleaseUpload, deleteDesktopRelease, deleteRelease, getAdminDesktopReleaseDownload, getAdminDesktopReleases, getAdminDesktopSourceVersion, getAdminReleaseDownload, publishDesktopRelease, publishRelease, setArchivedReleaseVisibility, setCurrentDesktopRelease, setCurrentRelease, setDesktopReleaseVisibility, setReleaseVisibility, updateRelease } from "@/lib/admin.functions";
import { downloadsQuery, releasesQuery } from "@/lib/admin-queries";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";
import { DOWNLOAD_PATH } from "@/lib/download-path";

export const Route = createFileRoute("/_authenticated/admin/releases")({
  component: ReleasesPage,
});

const MAX_APK_BYTES = 100 * 1024 * 1024;
const MAX_DESKTOP_BYTES = 512 * 1024 * 1024;
type DesktopPlatform = "windows" | "macos" | "linux";
type ReleaseTab = "mobile" | "desktop";

async function sha256Hex(file: File) {
  const buf = await file.arrayBuffer();
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ReleasesPage() {
  const a = useAdminText();
  const adminCtx = useAdminCtx();
  const isAdmin = !!adminCtx.data?.isAdmin;
  const canManageReleases = isAdmin || !!adminCtx.data?.permissions?.includes("releases.manage");
  const releases = useQuery(releasesQuery);
  const downloads = useQuery(downloadsQuery);
  type ReleaseWithVisibility = (NonNullable<typeof releases.data>[number]) & { is_public?: boolean };
  const rows = (releases.data ?? []) as ReleaseWithVisibility[];
  const qc = useQueryClient();

  const publish = useServerFn(publishRelease);
  const getPrivateDownload = useServerFn(getAdminReleaseDownload);
  const getDesktopReleases = useServerFn(getAdminDesktopReleases);
  const getDesktopSourceVersion = useServerFn(getAdminDesktopSourceVersion);
  const desktopSourceVersionQuery = useQuery({
    queryKey: ["admin", "desktop-source-version"],
    queryFn: () => getDesktopSourceVersion(),
    enabled: canManageReleases,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const uploadDesktopRelease = useServerFn(publishDesktopRelease);
  const removePendingDesktopUpload = useServerFn(cleanupDesktopReleaseUpload);
  const getDesktopPrivateDownload = useServerFn(getAdminDesktopReleaseDownload);

  const desktopReleases = useQuery({
    queryKey: ["admin", "desktop-releases"],
    queryFn: () => getDesktopReleases(),
    enabled: canManageReleases,
    staleTime: 15_000,
  });
  const desktopRows = desktopReleases.data ?? [];

  const setCurrent = useAdminAction(useServerFn(setCurrentRelease), { success: "Now the current download", invalidate: [["admin", "releases"], ["public-site"]] });
  const del = useAdminAction(useServerFn(deleteRelease), { success: "Release deleted", invalidate: [["admin", "releases"]] });
  const visibility = useAdminAction(useServerFn(setReleaseVisibility), { success: "Public release visibility updated", invalidate: [["admin", "releases"], ["public-site"]] });
  const bulkVisibility = useAdminAction(useServerFn(setArchivedReleaseVisibility), { success: "Archived release visibility updated", invalidate: [["admin", "releases"], ["public-site"]] });

  const setDesktopCurrent = useAdminAction(useServerFn(setCurrentDesktopRelease), {
    success: "Desktop installer is now the current public download",
    invalidate: [["admin", "desktop-releases"], ["public-desktop-release"]],
  });
  const setDesktopVisibility = useAdminAction(useServerFn(setDesktopReleaseVisibility), {
    success: "Desktop release visibility updated",
    invalidate: [["admin", "desktop-releases"], ["public-desktop-release"]],
  });
  const removeDesktopRelease = useAdminAction(useServerFn(deleteDesktopRelease), {
    success: "Desktop release removed",
    invalidate: [["admin", "desktop-releases"], ["public-desktop-release"]],
  });

  const [activeTab, setActiveTab] = useState<ReleaseTab>("mobile");
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ version_name: "", version_code: 1, min_android: "Android 7.0+", release_notes: "", make_current: true });
  const [stage, setStage] = useState<"" | "hashing" | "uploading" | "publishing">("");
  const [desktopPlatform, setDesktopPlatform] = useState<DesktopPlatform>("windows");
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const desktopFileInputRef = useRef<HTMLInputElement>(null);
  const [desktopVersion, setDesktopVersion] = useState("");
  const [desktopNotes, setDesktopNotes] = useState("");
  const [desktopMakeCurrent, setDesktopMakeCurrent] = useState(true);
  const [desktopStage, setDesktopStage] = useState<"" | "hashing" | "uploading" | "publishing">("");
  const [editingRelease, setEditingRelease] = useState<ReleaseWithVisibility | null>(null);
  const [editForm, setEditForm] = useState({ version_name: "", version_code: 1, min_android: "Android 7.0+", release_notes: "" });
  useEffect(() => {
    const sourceVersion = desktopSourceVersionQuery.data;
    if (sourceVersion) setDesktopVersion((current) => current.trim() ? current : sourceVersion);
  }, [desktopSourceVersionQuery.data]);

  const editReleaseAction = useAdminAction(useServerFn(updateRelease), { success: "Release updated", invalidate: [["admin", "releases"], ["public-site"]] });

  const downloadUrl = `https://beboss.rw${DOWNLOAD_PATH}`;
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

  const submitDesktopRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageReleases || desktopStage || !desktopFile) return;

    const version = desktopVersion.trim();
    const sourceVersion = desktopSourceVersionQuery.data;
    if (!sourceVersion) {
      toast.error("The current desktop source version could not be verified. Refresh and try again.");
      return;
    }
    if (version !== sourceVersion) {
      toast.error("Desktop release version must match the current source version " + sourceVersion + ". Update the desktop version manifests and rebuild first.");
      return;
    }
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
      toast.error("Enter a valid semantic version.");
      return;
    }

    const expectedExtension = desktopPlatform === "windows" ? ".exe" : desktopPlatform === "macos" ? ".dmg" : ".appimage";
    if (!desktopFile.name.toLowerCase().endsWith(expectedExtension)) {
      toast.error(`Select a ${desktopPlatform} ${expectedExtension} installer.`);
      return;
    }
    if (desktopFile.size < 1 || desktopFile.size > MAX_DESKTOP_BYTES) {
      toast.error("Desktop installer must be larger than 0 bytes and no larger than 512 MB.");
      return;
    }
    if (desktopPlatform === "windows") {
      const header = new Uint8Array(await desktopFile.slice(0, 2).arrayBuffer());
      if (header[0] !== 0x4d || header[1] !== 0x5a) {
        toast.error("The selected Windows installer does not have a valid PE executable header.");
        return;
      }
    }

    const safeName = desktopFile.name.replace(/[^0-9a-zA-Z._-]/g, "-");
    const path = `desktop/${desktopPlatform}/v${version}/${Date.now()}-${safeName}`;
    let uploaded = false;
    try {
      setDesktopStage("hashing");
      const sha = await sha256Hex(desktopFile);
      setDesktopStage("uploading");
      const contentType = desktopPlatform === "macos" ? "application/x-apple-diskimage" : "application/octet-stream";
      const { error: uploadError } = await supabase.storage.from("releases").upload(path, desktopFile, {
        contentType,
        upsert: false,
        cacheControl: "3600",
      });
      if (uploadError) throw new Error(uploadError.message);
      uploaded = true;

      setDesktopStage("publishing");
      await uploadDesktopRelease({
        data: {
          platform: desktopPlatform,
          version_name: version,
          file_path: path,
          file_name: safeName,
          size_bytes: desktopFile.size,
          sha256: sha,
          release_notes: desktopNotes.trim(),
          make_current: desktopMakeCurrent,
        },
      });

      toast.success(`${desktopPlatform} v${version} uploaded and ${desktopMakeCurrent ? "published as current" : "saved to the archive"}.`);
      setDesktopFile(null);
      if (desktopFileInputRef.current) desktopFileInputRef.current.value = "";
      setDesktopNotes("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "desktop-releases"] }),
        qc.invalidateQueries({ queryKey: ["public-desktop-release"] }),
      ]);
    } catch (error) {
      if (uploaded) {
        try {
          await removePendingDesktopUpload({ data: { file_path: path } });
        } catch (cleanupError) {
          console.error("[BeBoss release upload] Could not clean an unpublished desktop upload.", cleanupError);
        }
      }
      toast.error(error instanceof Error ? error.message : "Desktop installer upload failed.");
    } finally {
      setDesktopStage("");
    }
  };

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

  const archived = rows.filter((release) => !release.is_current);
  const visibleArchivedCount = archived.filter((release) => release.is_public !== false).length;
  const hiddenArchivedCount = archived.length - visibleArchivedCount;
  const archivedCount = archived.length;
  const total = rows.reduce((acc, r) => acc + r.download_count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="App releases"
        sub="Manage Android and desktop releases independently. Build locally, upload verified files, control public versions and review download activity."
      />
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-muted/30 p-1.5" role="tablist" aria-label="Release type">
        <button type="button" role="tab" aria-selected={activeTab === "mobile"} onClick={() => setActiveTab("mobile")}
          className={activeTab === "mobile" ? "flex min-h-14 items-center justify-center gap-2 rounded-xl bg-background px-3 py-3 text-sm font-semibold text-foreground shadow-sm ring-1 ring-border" : "flex min-h-14 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition hover:bg-background/70"}>
          <Smartphone className="size-5" /> Mobile releases <Badge variant="secondary">{rows.length}</Badge>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "desktop"} onClick={() => setActiveTab("desktop")}
          className={activeTab === "desktop" ? "flex min-h-14 items-center justify-center gap-2 rounded-xl bg-background px-3 py-3 text-sm font-semibold text-foreground shadow-sm ring-1 ring-border" : "flex min-h-14 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition hover:bg-background/70"}>
          <Laptop className="size-5" /> Desktop releases <Badge variant="secondary">{desktopRows.length}</Badge>
        </button>
      </div>
      {activeTab === "mobile" ? (
        <section role="tabpanel" className="space-y-6">
      {canManageReleases && archivedCount > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          {visibleArchivedCount > 0 ? <ConfirmAction
            trigger={<Button size="sm" variant="outline">Hide all archived ({visibleArchivedCount})</Button>}
            title="Hide every archived mobile release?"
            description="Older APKs remain stored in the admin archive but disappear from public listings and download links."
            destructive confirmLabel="Hide archived releases"
            onConfirm={() => bulkVisibility.mutate({ isPublic: false })}
          /> : null}
          {hiddenArchivedCount > 0 ? <ConfirmAction
            trigger={<Button size="sm" variant="outline">Show archived ({hiddenArchivedCount})</Button>}
            title="Show archived mobile releases publicly?"
            description="Every archived APK will become visible in public release listings and eligible for a download link."
            confirmLabel="Show archived releases"
            onConfirm={() => bulkVisibility.mutate({ isPublic: true })}
          /> : null}
        </div>
      ) : null}
      <Dialog open={!!editingRelease} onOpenChange={(open) => { if (!open) setEditingRelease(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{a("Edit APK release")}{editingRelease ? ` — v${editingRelease.version_name}` : ""}</DialogTitle>
            <DialogDescription>
              {a("Update the stored release metadata and public update information. Changes to the current release are synchronized to the global app version in the same database transaction. The APK binary itself remains immutable; publish a new version to replace the file.")}
            </DialogDescription>
          </DialogHeader>
          {editingRelease ? (
            <form
              id="edit-apk-release-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                editReleaseAction.mutate(
                  { id: editingRelease.id, ...editForm },
                  { onSuccess: () => setEditingRelease(null) },
                );
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{a("Version name")}</Label>
                  <Input
                    value={editForm.version_name}
                    onChange={(event) => setEditForm({ ...editForm, version_name: event.target.value })}
                    required
                    maxLength={40}
                    pattern="^[0-9]+([.][0-9]+){0,3}$"
                    placeholder="2.3.2"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{a("Version code")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000000}
                    value={editForm.version_code}
                    onChange={(event) => setEditForm({ ...editForm, version_code: Math.max(1, Math.min(1000000, Number(event.target.value) || 1)) })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{a("Minimum Android")}</Label>
                <Input
                  value={editForm.min_android}
                  onChange={(event) => setEditForm({ ...editForm, min_android: event.target.value })}
                  maxLength={40}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>{a("Release notes")}</Label>
                <Textarea
                  rows={6}
                  value={editForm.release_notes}
                  onChange={(event) => setEditForm({ ...editForm, release_notes: event.target.value })}
                  maxLength={5000}
                />
                <p className="text-right text-xs text-muted-foreground">{editForm.release_notes.length}/5000</p>
              </div>
            </form>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingRelease(null)}>
              {a("Cancel")}
            </Button>
            <Button type="submit" form="edit-apk-release-form" disabled={!editingRelease || editReleaseAction.isPending}>
              {editReleaseAction.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {editReleaseAction.isPending ? a("Saving…") : a("Save release")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="All-time downloads" value={total} icon={Download} tone="brand" />
        <StatCard label="Last 30 days" value={daily.reduce((acc, d) => acc + d.n, 0)} sub={Object.entries(byChannel).map(([k, v]) => `${k} ${v}`).join(" • ") || "—"} />
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

      {canManageReleases ? (
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
              <Textarea rows={6} value={form.release_notes} onChange={(e) => setForm({ ...form, release_notes: e.target.value })} maxLength={5000} placeholder={a("Release notes placeholder")} />
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
                  <Badge variant={r.is_public === false ? "secondary" : "outline"}>
                    {r.is_public === false ? "Hidden from public" : "Publicly listed"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.file_name} • {formatBytes(Number(r.size_bytes))} • {r.min_android} • {formatDateTime(r.published_at)} • {r.created_by}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">sha256 {r.sha256}</p>
                {r.release_notes ? <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{r.release_notes}</p> : null}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="mr-2 text-sm">
                  <span className="font-display text-xl font-bold">{r.download_count}</span> <span className="text-muted-foreground">{a("downloads")}</span>
                </span>
                {canManageReleases ? (
                  <Button size="sm" variant="glass" onClick={async () => {
                    try {
                      const signed = await getPrivateDownload({ data: { id: r.id } });
                      window.location.assign(signed.url);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Private release download failed");
                    }
                  }}>
                    <Download /> Admin APK
                  </Button>
                ) : null}
                {canManageReleases ? (
                  <>
                    <Button
                      size="sm"
                      variant="soft"
                      title={r.is_current ? a("Edit the current APK release details") : a("Edit this previous APK release")}
                      aria-label={r.is_current ? a("Edit current version") : a("Edit previous version")}
                      onClick={() => {
                        setEditingRelease(r);
                        setEditForm({
                          version_name: r.version_name,
                          version_code: Number(r.version_code),
                          min_android: r.min_android,
                          release_notes: r.release_notes ?? "",
                        });
                      }}
                    >
                      <Pencil className="size-4" />
                      {r.is_current ? a("Edit current version") : a("Edit previous version")}
                    </Button>
                    {!r.is_current ? (
                      <Button size="sm" variant="soft" onClick={() => setCurrent.mutate({ id: r.id, public_download_url: downloadUrl })}>
                        <Star /> {a("Make current")}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={r.is_current && r.is_public !== false}
                      onClick={() => visibility.mutate({ id: r.id, isPublic: r.is_public === false })}
                    >
                      {r.is_public === false ? "Show publicly" : "Hide publicly"}
                    </Button>
                    {isAdmin ? (
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
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
        </section>
      ) : (
        <section role="tabpanel" className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="desktop-release-heading">
          <div className="border-b border-border p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><Laptop className="size-6" /></span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="desktop-release-heading" className="text-lg font-bold">Desktop installers</h2>
                    <Badge variant="secondary">Local build · manual upload</Badge>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Build each installer on your own computer, select the finished artifact below, verify its checksum, then publish it to the public download page. No GitHub Actions or GitHub Releases are used.
                  </p>
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void desktopReleases.refetch()} disabled={desktopReleases.isFetching}>
                {desktopReleases.isFetching ? <Loader2 className="animate-spin" /> : <FileCheck2 />} Refresh archive
              </Button>
            </div>
          </div>

          <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]">
            <div className="min-w-0 space-y-5">
              <div className="space-y-2">
                <h3 className="font-semibold">1. Select the installer platform</h3>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Desktop installer platform">
                  {([
                    { id: "windows", name: "Windows", detail: ".exe", Icon: Monitor },
                    { id: "macos", name: "macOS", detail: ".dmg", Icon: Apple },
                    { id: "linux", name: "Linux", detail: ".AppImage", Icon: Laptop },
                  ] as const).map(({ id, name, detail, Icon }) => (
                    <button key={id} type="button" aria-pressed={desktopPlatform === id} onClick={() => { setDesktopPlatform(id); setDesktopFile(null); if (desktopFileInputRef.current) desktopFileInputRef.current.value = ""; }}
                      className={desktopPlatform === id
                        ? "rounded-xl border-2 border-primary bg-primary/5 p-3 text-left shadow-sm outline-none ring-2 ring-primary/10"
                        : "rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/50"}>
                      <Icon className={desktopPlatform === id ? "size-5 text-primary" : "size-5 text-muted-foreground"} />
                      <span className="mt-2 block text-sm font-semibold">{name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{detail} installer</span>
                      {desktopRows.some((row) => row.platform === id && row.is_current && row.is_public)
                        ? <Badge className="mt-2" variant="success">Live</Badge>
                        : <Badge className="mt-2" variant="secondary">No current build</Badge>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background/70 p-4">
                <h3 className="font-semibold">2. Build locally on the matching operating system</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Open a terminal in the <code>desktop</code> project folder. Run the matching commands on the machine for that operating system:</p>
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Common verification</p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6">npm ci{"\n"}npm run check:versions{"\n"}npm run check:types{"\n"}npm run build{"\n"}cargo test --locked --manifest-path src-tauri/Cargo.toml</pre>
                </div>
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {desktopPlatform === "windows" ? "Windows · signed NSIS installer" : desktopPlatform === "macos" ? "macOS · DMG package" : "Linux · AppImage package"}
                  </p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6">
                    {desktopPlatform === "windows"
                      ? "npm run release:win:local"
                      : desktopPlatform === "macos"
                        ? "npm run dist:mac"
                        : "npm run dist:linux"}
                  </pre>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Output folder: <code>{desktopPlatform === "windows"
                      ? "src-tauri/target/release/bundle/nsis"
                      : desktopPlatform === "macos"
                        ? "src-tauri/target/release/bundle/dmg"
                        : "src-tauri/target/release/bundle/appimage"}</code>
                  </p>
                </div>
              </div>

              <form className="space-y-4 rounded-xl border border-border p-4" onSubmit={(event) => void submitDesktopRelease(event)}>
                {desktopSourceVersionQuery.isError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                    {desktopSourceVersionQuery.error instanceof Error ? desktopSourceVersionQuery.error.message : "Could not verify the current desktop source version."}
                    <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => void desktopSourceVersionQuery.refetch()}>Retry</Button>
                  </div>
                ) : null}
                <div>
                  <h3 className="font-semibold">3. Upload and publish the local build</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">The file is uploaded from this browser to private BeBoss release storage. Its SHA-256 is calculated locally before upload.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,170px)_1fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor="desktop-version">Desktop version</Label>
                    <p className="text-xs text-muted-foreground">Must match the app version embedded in desktop/package.json: {desktopSourceVersionQuery.data ?? "checking source…"}.</p>
                    <Input id="desktop-version" value={desktopVersion} onChange={(event) => setDesktopVersion(event.target.value)} required maxLength={40} pattern="^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$" placeholder={desktopSourceVersionQuery.data ?? "Checking desktop/package.json…"} disabled={!desktopSourceVersionQuery.data || !!desktopStage} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="desktop-notes">Release notes</Label>
                    <Textarea id="desktop-notes" rows={2} value={desktopNotes} onChange={(event) => setDesktopNotes(event.target.value)} maxLength={5000} placeholder="Improvements, fixes and compatibility notes" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="desktop-artifact">Local {desktopPlatform === "windows" ? "Windows EXE" : desktopPlatform === "macos" ? "macOS DMG" : "Linux AppImage"} file</Label>
                  <label htmlFor="desktop-artifact" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition hover:border-primary/50 hover:bg-primary/5">
                    {desktopFile ? <FileCheck2 className="size-8 text-success" /> : <UploadCloud className="size-8 text-muted-foreground" />}
                    <span className="break-all text-sm font-semibold">{desktopFile ? desktopFile.name : `Choose .${desktopPlatform === "windows" ? "exe" : desktopPlatform === "macos" ? "dmg" : "AppImage"} installer`}</span>
                    <span className="text-xs text-muted-foreground">{desktopFile ? `${formatBytes(desktopFile.size)} · ready to verify` : "Up to 512 MB · only the selected platform format is accepted"}</span>
                    <input id="desktop-artifact" ref={desktopFileInputRef} type="file" className="sr-only"
                      accept={desktopPlatform === "windows" ? ".exe,application/vnd.microsoft.portable-executable,application/octet-stream" : desktopPlatform === "macos" ? ".dmg,application/x-apple-diskimage,application/octet-stream" : ".AppImage,.appimage,application/octet-stream"}
                      onChange={(event) => setDesktopFile(event.target.files?.[0] ?? null)} />
                  </label>
                </div>
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                  <Switch checked={desktopMakeCurrent} onCheckedChange={setDesktopMakeCurrent} />
                  <span><strong className="block">Publish as the current {desktopPlatform} download</strong><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">When enabled, this platform's public download link switches to the uploaded version. Other platforms are unchanged.</span></span>
                </label>
                <Button type="submit" variant="hero" className="w-full" disabled={!canManageReleases || !!desktopStage || !desktopFile}>
                  {desktopStage ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                  {desktopStage === "hashing" ? "Calculating SHA-256…" : desktopStage === "uploading" ? "Uploading local installer…" : desktopStage === "publishing" ? "Publishing release…" : "Verify, upload and publish"}
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">Publishing a new current version automatically archives the previous build for this platform. A current release cannot be hidden or deleted.</p>
              </form>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Current platform releases</h3>
                  <Badge variant="secondary">{desktopRows.filter((row) => row.is_current && row.is_public).length}/3 live</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {(["windows", "macos", "linux"] as const).map((platform) => {
                    const current = desktopRows.find((row) => row.platform === platform && row.is_current && row.is_public);
                    const platformName = platform === "windows" ? "Windows" : platform === "macos" ? "macOS" : "Linux";
                    return <div key={platform} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                      <span className="font-medium">{platformName}</span>
                      {current ? <span className="text-right"><Badge variant="success">v{current.version_name}</Badge><span className="mt-1 block text-[11px] text-muted-foreground">{formatBytes(Number(current.size_bytes))} · {current.download_count.toLocaleString()} downloads</span></span> : <Badge variant="secondary">Not published</Badge>}
                    </div>;
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Release archive</h3>
                  <span className="text-xs text-muted-foreground">{desktopRows.length} stored installer(s)</span>
                </div>
                {desktopReleases.isLoading ? <LoadingBlock /> : desktopReleases.isError ? (
                  <p className="mt-3 text-sm text-destructive" role="alert">{desktopReleases.error instanceof Error ? desktopReleases.error.message : "Could not load desktop releases."}</p>
                ) : desktopRows.length === 0 ? (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">No desktop installers have been uploaded. Build locally, then upload the artifact using the form.</p>
                ) : (
                  <div className="mt-3 max-h-[740px] space-y-3 overflow-y-auto pr-1">
                    {desktopRows.map((release) => {
                      const platformName = release.platform === "windows" ? "Windows" : release.platform === "macos" ? "macOS" : "Linux";
                      return <article key={release.id} className="rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm">{platformName} · v{release.version_name}</strong>
                            {release.is_current ? <Badge variant="success">Current</Badge> : <Badge variant="secondary">Archived</Badge>}
                            <Badge variant={release.is_public ? "outline" : "secondary"}>{release.is_public ? "Public" : "Private"}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{release.download_count.toLocaleString()} downloads</span>
                        </div>
                        <p className="mt-2 break-all text-xs text-muted-foreground">{release.file_name} · {formatBytes(Number(release.size_bytes))} · {formatDateTime(release.published_at)}</p>
                        <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">SHA-256 {release.sha256}</p>
                        {release.release_notes ? <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs leading-5 text-muted-foreground">{release.release_notes}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={async () => {
                            try {
                              const signed = await getDesktopPrivateDownload({ data: { id: release.id } });
                              window.location.assign(signed.url);
                            } catch (error) { toast.error(error instanceof Error ? error.message : "Could not download the stored installer."); }
                          }}><Download className="size-3.5" /> Admin download</Button>
                          {!release.is_current ? <Button size="sm" variant="soft" onClick={() => setDesktopCurrent.mutate({ id: release.id })}><Star className="size-3.5" /> Make current</Button> : null}
                          {!release.is_current ? <Button size="sm" variant="outline" onClick={() => setDesktopVisibility.mutate({ id: release.id, isPublic: !release.is_public })}>{release.is_public ? "Hide publicly" : "Show publicly"}</Button> : null}
                          {isAdmin && !release.is_current ? <ConfirmAction
                            trigger={<Button size="sm" variant="ghost"><Trash2 className="size-3.5" /> Delete</Button>}
                            title={`Delete ${platformName} v${release.version_name}?`}
                            description="This permanently removes the installer and its release history record."
                            destructive confirmLabel="Delete installer"
                            onConfirm={() => removeDesktopRelease.mutate({ id: release.id })}
                          /> : null}
                        </div>
                      </article>;
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-3 border-t border-border bg-muted/20 p-4 sm:grid-cols-3 sm:p-5">
            <div className="flex items-center gap-2 text-sm"><Monitor className="size-4 text-primary" /><span>Windows · NSIS EXE</span></div>
            <div className="flex items-center gap-2 text-sm"><Apple className="size-4 text-primary" /><span>macOS · DMG</span></div>
            <div className="flex items-center gap-2 text-sm"><Laptop className="size-4 text-primary" /><span>Linux · AppImage</span></div>
          </div>
        </section>
        </section>
      )}
    </div>
  );
}