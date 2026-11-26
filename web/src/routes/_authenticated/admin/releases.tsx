import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Apple, CheckCircle2, Download, Eye, EyeOff, FileCheck2, FileText, HardDrive, Laptop, Loader2, Monitor, PackageCheck, Pencil, Search, ShieldCheck, Smartphone, Star, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { cleanupDesktopReleaseUpload, deleteDesktopRelease, deleteRelease, getAdminDesktopReleaseDownload, getAdminDesktopReleases, getAdminReleaseDownload, publishDesktopRelease, publishRelease, setArchivedReleaseVisibility, setCurrentDesktopRelease, setCurrentRelease, setDesktopReleaseVisibility, setReleaseVisibility, updateRelease } from "@/lib/admin.functions";
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
  const [desktopManifestFile, setDesktopManifestFile] = useState<File | null>(null);
  const [desktopManifestVersion, setDesktopManifestVersion] = useState("");
  const [desktopVersion, setDesktopVersion] = useState("");
  const [desktopNotes, setDesktopNotes] = useState("");
  const [desktopMakeCurrent, setDesktopMakeCurrent] = useState(true);
  const [desktopStage, setDesktopStage] = useState<"" | "hashing" | "uploading" | "publishing">("");
  const [desktopArchivePlatform, setDesktopArchivePlatform] = useState<"all" | DesktopPlatform>("all");
  const [desktopArchiveSearch, setDesktopArchiveSearch] = useState("");
  const [editingRelease, setEditingRelease] = useState<ReleaseWithVisibility | null>(null);
  const [editForm, setEditForm] = useState({ version_name: "", version_code: 1, min_android: "Android 7.0+", release_notes: "" });
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
  const desktopArchiveRows = useMemo(() => {
    const query = desktopArchiveSearch.trim().toLowerCase();
    return desktopRows.filter((release) => desktopArchivePlatform === "all" || release.platform === desktopArchivePlatform)
      .filter((release) => !query || [
        release.version_name,
        release.file_name,
        release.platform,
        release.release_notes ?? "",
      ].some((value) => String(value).toLowerCase().includes(query)));
  }, [desktopRows, desktopArchivePlatform, desktopArchiveSearch]);

  const handleDesktopManifestChange = async (manifestFile: File | null) => {
    setDesktopManifestFile(manifestFile);
    setDesktopManifestVersion("");
    setDesktopVersion("");
    if (!manifestFile) return;
    if (manifestFile.name.toLowerCase() !== "package.json" || manifestFile.size > 1024 * 1024) {
      setDesktopManifestFile(null);
      const manifestInput = document.getElementById("desktop-source-manifest") as HTMLInputElement | null;
      if (manifestInput) manifestInput.value = "";
      toast.error("Choose the small package.json file from your local desktop project folder.");
      return;
    }
    try {
      const parsed = JSON.parse(await manifestFile.text()) as { version?: unknown };
      const version = typeof parsed.version === "string" ? parsed.version.trim() : "";
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
        throw new Error("The selected package.json does not contain a valid semantic version.");
      }
      setDesktopManifestVersion(version);
      setDesktopVersion(version);
      toast.success(`Local desktop source version v${version} loaded.`);
    } catch (error) {
      setDesktopManifestFile(null);
      const manifestInput = document.getElementById("desktop-source-manifest") as HTMLInputElement | null;
      if (manifestInput) manifestInput.value = "";
      toast.error(error instanceof Error ? error.message : "Could not read the local desktop package.json.");
    }
  };

  const submitDesktopRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageReleases || desktopStage || !desktopFile) return;

    if (!desktopManifestFile || !desktopManifestVersion) {
      toast.error("Select the local desktop/package.json file first so the release version can be checked against your working copy.");
      return;
    }

    const version = desktopVersion.trim();
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || version !== desktopManifestVersion) {
      toast.error("The release version must match the version read from your selected local desktop/package.json.");
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
    } else if (desktopPlatform === "linux") {
      const header = new Uint8Array(await desktopFile.slice(0, 4).arrayBuffer());
      if (header[0] !== 0x7f || header[1] !== 0x45 || header[2] !== 0x4c || header[3] !== 0x46) {
        toast.error("The selected Linux AppImage does not have a valid ELF executable header.");
        return;
      }
    } else {
      const trailerStart = Math.max(0, desktopFile.size - 512);
      const trailer = new TextDecoder("ascii").decode(await desktopFile.slice(trailerStart).arrayBuffer());
      if (!trailer.startsWith("koly")) {
        toast.error("The selected macOS disk image does not contain the expected UDIF/DMG trailer.");
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
          source_manifest_version: desktopManifestVersion,
          file_path: path,
          file_name: safeName,
          size_bytes: desktopFile.size,
          sha256: sha,
          release_notes: desktopNotes.trim(),
          make_current: desktopMakeCurrent,
        },
      });

      toast.success(`${desktopPlatform} v${version} uploaded and ${desktopMakeCurrent ? "published as current" : "saved to the private archive"}.`);
      setDesktopFile(null);
      setDesktopManifestFile(null);
      setDesktopManifestVersion("");
      setDesktopVersion("");
      setDesktopNotes("");
      const input = document.getElementById("desktop-artifact") as HTMLInputElement | null;
      if (input) input.value = "";
      const manifestInput = document.getElementById("desktop-source-manifest") as HTMLInputElement | null;
      if (manifestInput) manifestInput.value = "";
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
        sub="Manage Android and desktop distribution separately. Build signed artifacts on your computer, upload them manually, and control public versions and release history."
      />
      <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Choose mobile or desktop releases">
        <button type="button" role="tab" id="mobile-release-tab" aria-controls="mobile-release-panel" aria-selected={activeTab === "mobile"} onClick={() => setActiveTab("mobile")}
          className={activeTab === "mobile"
            ? "flex min-h-20 items-center gap-4 rounded-2xl border-2 border-primary bg-primary/5 p-4 text-left shadow-sm ring-2 ring-primary/10"
            : "flex min-h-20 items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-muted/30"}>
          <span className={activeTab === "mobile" ? "grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" : "grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"}><Smartphone className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-bold">Mobile releases <Badge variant="secondary">{rows.length}</Badge></span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">Android APKs, app updates and mobile download activity</span>
          </span>
          <span className={activeTab === "mobile" ? "text-xs font-semibold text-primary" : "text-xs text-muted-foreground"}>{activeTab === "mobile" ? "Selected" : "Open"}</span>
        </button>
        <button type="button" role="tab" id="desktop-release-tab" aria-controls="desktop-release-panel" aria-selected={activeTab === "desktop"} onClick={() => setActiveTab("desktop")}
          className={activeTab === "desktop"
            ? "flex min-h-20 items-center gap-4 rounded-2xl border-2 border-primary bg-primary/5 p-4 text-left shadow-sm ring-2 ring-primary/10"
            : "flex min-h-20 items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-muted/30"}>
          <span className={activeTab === "desktop" ? "grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground" : "grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"}><Laptop className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-bold">Desktop releases <Badge variant="secondary">{desktopRows.length}</Badge></span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">Windows, macOS and Linux installers built on your computer</span>
          </span>
          <span className={activeTab === "desktop" ? "text-xs font-semibold text-primary" : "text-xs text-muted-foreground"}>{activeTab === "desktop" ? "Selected" : "Open"}</span>
        </button>
      </div>
      {activeTab === "mobile" ? (
        <section role="tabpanel" id="mobile-release-panel" aria-labelledby="mobile-release-tab" className="space-y-6">
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
        <div className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <HardDrive className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h3 className="font-semibold">Build the Android release locally</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">From the repository root, build the production-signed APK on your own computer, then select that output below. Do not upload a debug APK.</p>
              <code className="mt-3 block overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">.\\gradlew.bat :app:assembleRelease</code>
              <p className="mt-2 text-xs text-muted-foreground">Expected output: <code>app\\build\\outputs\\apk\\release\\app-release.apk</code>. The release keystore and passwords must already be configured locally and kept outside source control.</p>
            </div>
          </div>
        </div>
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
        <section role="tabpanel" id="desktop-release-panel" aria-labelledby="desktop-release-tab" className="space-y-5">
          <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Laptop className="size-6" /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="desktop-release-heading" className="text-lg font-bold">Desktop release workspace</h2>
                  <Badge variant="secondary">Local build · manual upload</Badge>
                  <Badge variant="outline"><ShieldCheck className="mr-1 size-3" /> Private storage</Badge>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Build the installer on the matching operating system, choose the local package and its local package.json, then upload it here. This release workflow does not trigger GitHub Actions or download installers from GitHub.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void desktopReleases.refetch()} disabled={desktopReleases.isFetching}>
                {desktopReleases.isFetching ? <Loader2 className="animate-spin" /> : <FileCheck2 />} Refresh releases
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <a href="/download?platform=desktop" target="_blank" rel="noreferrer">View public page</a>
              </Button>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-3">
            {([
              { id: "windows", label: "Windows", detail: "NSIS installer · .exe", Icon: Monitor },
              { id: "macos", label: "macOS", detail: "Disk image · .dmg", Icon: Apple },
              { id: "linux", label: "Linux", detail: "AppImage · .AppImage", Icon: Laptop },
            ] as const).map(({ id, label, detail, Icon }) => {
              const current = desktopRows.find((release) => release.platform === id && release.is_current && release.is_public);
              const platformDownloads = desktopRows.filter((release) => release.platform === id).reduce((sum, release) => sum + Number(release.download_count || 0), 0);
              return (
                <button key={id} type="button" aria-pressed={desktopPlatform === id} onClick={() => {
                    setDesktopPlatform(id);
                    setDesktopFile(null);
                    const input = document.getElementById("desktop-artifact") as HTMLInputElement | null;
                    if (input) input.value = "";
                  }}
                  className={desktopPlatform === id
                    ? "rounded-2xl border-2 border-primary bg-primary/5 p-4 text-left shadow-sm ring-2 ring-primary/10"
                    : "rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-muted/20"}>
                  <div className="flex items-start justify-between gap-3">
                    <span className={desktopPlatform === id ? "grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground" : "grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground"}><Icon className="size-5" /></span>
                    {current ? <Badge variant="success">Live</Badge> : <Badge variant="secondary">Not published</Badge>}
                  </div>
                  <p className="mt-3 font-semibold">{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="text-sm font-bold">{current ? `v${current.version_name}` : "No current build"}</span>
                    <span className="text-xs text-muted-foreground">{platformDownloads.toLocaleString()} downloads</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,.82fr)_minmax(0,1.18fr)]">
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border p-5">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Step 1 · Local build</p>
                <h3 className="mt-1 text-lg font-bold">Build on your computer</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Run the checks and native build in the <code>desktop</code> directory on the operating system you are packaging for.</p>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Common validation · PowerShell or terminal</p>
                  <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs leading-6">npm ci{"\n"}npm run check:versions{"\n"}npm run check:types{"\n"}npm run build{"\n"}cargo test --locked --manifest-path src-tauri/Cargo.toml</pre>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {desktopPlatform === "windows" ? "Windows · signed NSIS package" : desktopPlatform === "macos" ? "macOS · DMG package" : "Linux · AppImage package"}
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-xl border border-primary/20 bg-primary/5 p-3 font-mono text-sm font-semibold leading-6">
                    {desktopPlatform === "windows" ? "npm run release:win:local" : desktopPlatform === "macos" ? "npm run dist:mac" : "npm run dist:linux"}
                  </pre>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">Output folder</p>
                  <code className="mt-1 block break-all rounded-lg bg-muted/40 px-3 py-2 text-xs">
                    {desktopPlatform === "windows"
                      ? "src-tauri/target/release/bundle/nsis"
                      : desktopPlatform === "macos"
                        ? "src-tauri/target/release/bundle/dmg"
                        : "src-tauri/target/release/bundle/appimage"}
                  </code>
                </div>
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-muted-foreground">
                  <strong className="text-foreground">Release safety:</strong> upload only a completed production build. Windows must pass Authenticode signing and verification; macOS signing/notarization and Linux runtime checks must be completed before customer distribution.
                </div>
                <p className="text-xs leading-5 text-muted-foreground">The admin page never runs these commands and never builds source code for you. It only receives the local files you select.</p>
              </div>
            </section>

            <form onSubmit={(event) => void submitDesktopRelease(event)} className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Step 2 · Upload</p>
                  <h3 className="mt-1 text-lg font-bold">Publish a desktop installer</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Choose the platform, local version manifest and the installer built from that same source checkout.</p>
                </div>
                <Badge variant="outline">{desktopPlatform === "windows" ? "Windows EXE" : desktopPlatform === "macos" ? "macOS DMG" : "Linux AppImage"}</Badge>
              </div>

              <div className="space-y-2">
                <Label>Target platform</Label>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Choose desktop release platform">
                  {([
                    { id: "windows", name: "Windows", ext: ".exe", Icon: Monitor },
                    { id: "macos", name: "macOS", ext: ".dmg", Icon: Apple },
                    { id: "linux", name: "Linux", ext: ".AppImage", Icon: Laptop },
                  ] as const).map(({ id, name, ext, Icon }) => (
                    <button key={id} type="button" aria-pressed={desktopPlatform === id} onClick={() => {
                        setDesktopPlatform(id);
                        setDesktopFile(null);
                        const input = document.getElementById("desktop-artifact") as HTMLInputElement | null;
                        if (input) input.value = "";
                      }}
                      className={desktopPlatform === id
                        ? "rounded-xl border-2 border-primary bg-primary/5 px-2 py-3 text-center shadow-sm"
                        : "rounded-xl border border-border bg-background px-2 py-3 text-center transition hover:border-primary/50"}>
                      <Icon className={desktopPlatform === id ? "mx-auto size-5 text-primary" : "mx-auto size-5 text-muted-foreground"} />
                      <span className="mt-1.5 block text-xs font-semibold">{name}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{ext}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="desktop-source-manifest">Local source manifest</Label>
                  <label htmlFor="desktop-source-manifest" className="flex min-h-[112px] cursor-pointer flex-col justify-center rounded-xl border border-dashed border-border bg-muted/20 p-3 transition hover:border-primary/50 hover:bg-primary/5">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {desktopManifestVersion ? <PackageCheck className="size-5 text-success" /> : <FileText className="size-5 text-muted-foreground" />}
                      {desktopManifestVersion ? "Local version verified" : "Choose desktop/package.json"}
                    </span>
                    <span className="mt-1 break-all text-xs text-muted-foreground">{desktopManifestFile?.name ?? "Select package.json from your local desktop folder"}</span>
                    {desktopManifestVersion ? <Badge className="mt-2 w-fit" variant="success">Source version v{desktopManifestVersion}</Badge> : <span className="mt-2 text-[11px] text-muted-foreground">Version is read from this file. No GitHub lookup is made.</span>}
                    <input id="desktop-source-manifest" type="file" accept=".json,application/json" className="sr-only" disabled={!!desktopStage}
                      onChange={(event) => void handleDesktopManifestChange(event.target.files?.[0] ?? null)} />
                  </label>
                  <p className="text-[11px] leading-5 text-muted-foreground">Select the same local source checkout used to produce the installer. Run <code>npm run check:versions</code> before building.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desktop-version">Release version</Label>
                  <Input id="desktop-version" value={desktopVersion} readOnly placeholder="Loaded from local package.json" disabled={!!desktopStage} />
                  <p className="text-[11px] leading-5 text-muted-foreground">The publish API checks this value against the selected local manifest version.</p>
                  <Label htmlFor="desktop-notes" className="pt-1">Release notes</Label>
                  <Textarea id="desktop-notes" rows={3} value={desktopNotes} onChange={(event) => setDesktopNotes(event.target.value)} maxLength={5000} placeholder="Improvements, fixes and compatibility notes" disabled={!!desktopStage} />
                  <p className="text-right text-[11px] text-muted-foreground">{desktopNotes.length}/5000</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="desktop-artifact">Locally built installer</Label>
                <label htmlFor="desktop-artifact" className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center transition hover:border-primary/50 hover:bg-primary/5">
                  {desktopFile ? <FileCheck2 className="size-8 text-success" /> : <UploadCloud className="size-8 text-muted-foreground" />}
                  <span className="mt-2 max-w-full break-all text-sm font-semibold">{desktopFile ? desktopFile.name : `Choose local ${desktopPlatform === "windows" ? ".exe" : desktopPlatform === "macos" ? ".dmg" : ".AppImage"} installer`}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{desktopFile ? `${formatBytes(desktopFile.size)} · ready for validation` : "Maximum 512 MB · file stays local until you start the upload"}</span>
                  <input id="desktop-artifact" type="file" className="sr-only"
                    accept={desktopPlatform === "windows" ? ".exe,application/vnd.microsoft.portable-executable,application/octet-stream" : desktopPlatform === "macos" ? ".dmg,application/x-apple-diskimage,application/octet-stream" : ".AppImage,.appimage,application/octet-stream"}
                    disabled={!!desktopStage}
                    onChange={(event) => setDesktopFile(event.target.files?.[0] ?? null)} />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
                <Switch checked={desktopMakeCurrent} onCheckedChange={setDesktopMakeCurrent} disabled={!!desktopStage} />
                <span className="min-w-0">
                  <strong className="block">Make this the current public {desktopPlatform} installer</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">When enabled, the selected platform's public download changes to this version. Other platforms are not changed. Turn it off to upload into the private archive first.</span>
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="flex min-w-0 items-center gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-success" /> SHA-256 is calculated in your browser before the file is uploaded.</p>
                <Button type="submit" variant="hero" disabled={!canManageReleases || !!desktopStage || !desktopFile || !desktopManifestVersion}>
                  {desktopStage ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                  {desktopStage === "hashing" ? "Calculating SHA-256…" : desktopStage === "uploading" ? "Uploading local installer…" : desktopStage === "publishing" ? "Publishing release…" : "Verify, upload and publish"}
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">Publishing a new current build automatically archives the previous current version for this platform. Current releases cannot be hidden or deleted.</p>
            </form>
          </div>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="desktop-archive-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Step 3 · Manage</p>
                <h3 id="desktop-archive-heading" className="mt-1 text-lg font-bold">Desktop release archive</h3>
                <p className="mt-1 text-sm text-muted-foreground">Review every uploaded installer, change public availability, restore a previous version or remove an archived build.</p>
              </div>
              <div className="rounded-xl bg-muted/40 px-3 py-2 text-right">
                <p className="text-lg font-bold tabular-nums">{desktopRows.length}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Stored builds</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={desktopArchiveSearch} onChange={(event) => setDesktopArchiveSearch(event.target.value)} placeholder="Search version, filename or release notes…" className="pl-9" aria-label="Search desktop release archive" />
              </div>
              <select value={desktopArchivePlatform} onChange={(event) => setDesktopArchivePlatform(event.target.value as "all" | DesktopPlatform)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" aria-label="Filter desktop archive by platform">
                <option value="all">All platforms</option>
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
              </select>
            </div>

            {desktopReleases.isLoading ? <LoadingBlock /> : desktopReleases.isError ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{desktopReleases.error instanceof Error ? desktopReleases.error.message : "Could not load desktop releases."}</p>
            ) : desktopArchiveRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-9 text-center">
                <PackageCheck className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 font-semibold">{desktopRows.length ? "No releases match these filters" : "No desktop installers uploaded yet"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{desktopRows.length ? "Try another platform or search term." : "Build an installer locally and upload it using the workspace above."}</p>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {desktopArchiveRows.map((release) => {
                  const platformName = release.platform === "windows" ? "Windows" : release.platform === "macos" ? "macOS" : "Linux";
                  const PlatformIcon = release.platform === "windows" ? Monitor : release.platform === "macos" ? Apple : Laptop;
                  return (
                    <article key={release.id} className="min-w-0 rounded-xl border border-border bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><PlatformIcon className="size-4" /></span>
                          <div className="min-w-0">
                            <h4 className="break-words font-semibold">{platformName} · v{release.version_name}</h4>
                            <p className="mt-1 break-all text-xs text-muted-foreground">{release.file_name}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {release.is_current ? <Badge variant="success">Current</Badge> : <Badge variant="secondary">Archived</Badge>}
                          <Badge variant={release.is_public ? "outline" : "secondary"}>{release.is_public ? "Public" : "Private"}</Badge>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-muted/40 px-3 py-2">
                          <p className="text-muted-foreground">Package size</p>
                          <p className="mt-1 font-semibold">{formatBytes(Number(release.size_bytes))}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 px-3 py-2">
                          <p className="text-muted-foreground">Downloads · Published</p>
                          <p className="mt-1 font-semibold">{Number(release.download_count).toLocaleString()} · {formatDateTime(release.published_at)}</p>
                        </div>
                      </div>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-primary">View SHA-256 and release notes</summary>
                        <p className="mt-2 break-all rounded-lg bg-muted/40 p-2 font-mono text-[10px] leading-5">SHA-256 {release.sha256}</p>
                        {release.release_notes ? <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">{release.release_notes}</p> : <p className="mt-2 text-xs text-muted-foreground">No release notes supplied.</p>}
                      </details>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            const signed = await getDesktopPrivateDownload({ data: { id: release.id } });
                            window.location.assign(signed.url);
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Could not download the stored installer.");
                          }
                        }}><Download className="size-3.5" /> Admin download</Button>
                        {!release.is_current ? <Button size="sm" variant="soft" onClick={() => setDesktopCurrent.mutate({ id: release.id })}><Star className="size-3.5" /> Make current</Button> : null}
                        {!release.is_current ? <Button size="sm" variant="outline" onClick={() => setDesktopVisibility.mutate({ id: release.id, isPublic: !release.is_public })}>
                          {release.is_public ? <><EyeOff className="size-3.5" /> Hide publicly</> : <><Eye className="size-3.5" /> Show publicly</>}
                        </Button> : null}
                        {isAdmin && !release.is_current ? <ConfirmAction
                          trigger={<Button size="sm" variant="ghost"><Trash2 className="size-3.5" /> Delete</Button>}
                          title={`Delete ${platformName} v${release.version_name}?`}
                          description="This permanently removes the installer and its release history record. Current releases must be replaced before deletion."
                          destructive confirmLabel="Delete installer"
                          onConfirm={() => removeDesktopRelease.mutate({ id: release.id })}
                        /> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      )}
    </div>
  );
}