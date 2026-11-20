import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction, EmptyState, LoadingBlock, PageHeader, StatusBadge, useAdminAction } from "@/components/admin/ui";
import { AnnouncementCard } from "@/components/site/AnnouncementBanner";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { announcementsAdminQuery, type Announcement } from "@/lib/announcements";
import { deleteAnnouncement, saveAnnouncement, type AnnouncementInput } from "@/lib/announcements.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/announcements")({
  head: () => ({ meta: [{ title: "Announcements — BeBoss Admin" }, { name: "robots", content: "noindex" }] }),
  component: AnnouncementsPage,
});

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function liveState(a: Announcement, now = Date.now()) {
  if (!a.is_active) return "PAUSED";
  if (new Date(a.starts_at).getTime() > now) return "SCHEDULED";
  if (a.ends_at && new Date(a.ends_at).getTime() <= now) return "ENDED";
  return "LIVE";
}

function AnnouncementsPage() {
  const isAdmin = !!useAdminCtx().data?.isAdmin;
  const { data, isLoading } = useQuery(announcementsAdminQuery);
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const del = useAdminAction(useServerFn(deleteAnnouncement), { success: "Announcement removed", invalidate: [["admin", "announcements"], ["announcements"]] });

  return (
    <div>
      <PageHeader
        title="Announcements"
        sub="Broadcast news, promotions and outage notices to the website, the Android app, or a single shop."
        actions={
          isAdmin ? (
            <Button variant="hero" size="sm" onClick={() => setEditing("new")}>
              <Plus /> New announcement
            </Button>
          ) : null
        }
      />
      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState title="No announcements yet" sub="Create one to show a banner on the website and inside shop owners' My shop page. The app can read the same messages." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((a) => {
            const st = liveState(a);
            return (
              <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={st === "LIVE" ? "ACTIVE" : st === "SCHEDULED" ? "PENDING_VERIFICATION" : "REVOKED"} />
                  <span className="text-xs text-muted-foreground">{st.toLowerCase()} · {a.audience.toLowerCase()} {a.target_shop_key ? `· shop ${a.target_shop_key}` : "· everyone"}</span>
                  {a.translations && Object.keys(a.translations as object).length ? <span className="text-xs text-success">· translated RW · FR · SW</span> : <span className="text-xs text-muted-foreground">· English only</span>}
                </div>
                <div className="mt-3">
                  <AnnouncementCard a={a} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {formatDateTime(a.starts_at)} → {a.ends_at ? formatDateTime(a.ends_at) : "no end"} · by {a.created_by || "admin"}
                  </span>
                  {isAdmin ? (
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                        <Pencil /> Edit
                      </Button>
                      <ConfirmAction
                        trigger={
                          <Button size="sm" variant="ghost" className="text-destructive">
                            <Trash2 />
                          </Button>
                        }
                        title="Delete announcement?"
                        description="It disappears from the website and apps immediately."
                        destructive
                        confirmLabel="Delete"
                        onConfirm={() => del.mutate({ id: a.id })}
                      />
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="size-4 text-primary" /> {editing === "new" ? "New announcement" : "Edit announcement"}
            </DialogTitle>
          </DialogHeader>
          {editing ? <Editor initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Editor({ initial, onDone }: { initial: Announcement | null; onDone: () => void }) {
  const save = useAdminAction(useServerFn(saveAnnouncement), { success: "Announcement saved and translated — it's live for everyone it targets", invalidate: [["admin", "announcements"], ["announcements"]] });
  const [f, setF] = useState({
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    severity: (initial?.severity ?? "INFO") as AnnouncementInput["severity"],
    audience: (initial?.audience ?? "ALL") as AnnouncementInput["audience"],
    target_shop_key: initial?.target_shop_key ?? "",
    cta_label: initial?.cta_label ?? "",
    cta_url: initial?.cta_url ?? "",
    is_active: initial?.is_active ?? true,
    starts: toLocal(initial?.starts_at ?? new Date().toISOString()),
    ends: toLocal(initial?.ends_at ?? null),
  });
  const preview: Announcement = {
    id: initial?.id ?? "preview",
    translations: {},
    title: f.title || "Your headline",
    body: f.body,
    severity: f.severity,
    audience: f.audience,
    target_shop_key: f.target_shop_key,
    cta_label: f.cta_label,
    cta_url: f.cta_url,
    is_active: f.is_active,
    starts_at: new Date().toISOString(),
    ends_at: null,
    created_by: "",
    created_at: "",
    updated_at: "",
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          {
            ...(initial ? { id: initial.id } : {}),
            title: f.title,
            body: f.body,
            severity: f.severity,
            audience: f.audience,
            target_shop_key: f.target_shop_key.trim().toLowerCase(),
            cta_label: f.cta_label,
            cta_url: f.cta_url,
            is_active: f.is_active,
            starts_at: fromLocal(f.starts) ?? new Date().toISOString(),
            ends_at: fromLocal(f.ends),
          },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="space-y-1.5">
        <Label>Headline</Label>
        <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={2} maxLength={160} placeholder="e.g. 20% off 12-month plans this week" />
      </div>
      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={3} maxLength={2000} placeholder="Optional details" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Style</Label>
          <Select value={f.severity} onValueChange={(v) => setF({ ...f, severity: v as AnnouncementInput["severity"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["INFO", "SUCCESS", "WARNING", "CRITICAL"].map((s) => <SelectItem key={s} value={s}>{s.toLowerCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Show on</Label>
          <Select value={f.audience} onValueChange={(v) => setF({ ...f, audience: v as AnnouncementInput["audience"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Website and app</SelectItem>
              <SelectItem value="WEBSITE">Website only</SelectItem>
              <SelectItem value="APP">App and My shop only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Button label</Label>
          <Input value={f.cta_label} onChange={(e) => setF({ ...f, cta_label: e.target.value })} maxLength={40} placeholder="e.g. See pricing" />
        </div>
        <div className="space-y-1.5">
          <Label>Button link</Label>
          <Input value={f.cta_url} onChange={(e) => setF({ ...f, cta_url: e.target.value })} maxLength={500} placeholder="/pricing or https://…" />
        </div>
        <div className="space-y-1.5">
          <Label>Starts</Label>
          <Input type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Ends (optional)</Label>
          <Input type="datetime-local" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Only for one shop (optional)</Label>
        <Input value={f.target_shop_key} onChange={(e) => setF({ ...f, target_shop_key: e.target.value })} maxLength={200} placeholder="shop key, e.g. mama_788123456 — leave empty for everyone" />
      </div>
      <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
        Active
        <Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} />
      </label>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">Preview</p>
        <AnnouncementCard a={preview} />
      </div>
      <Button type="submit" variant="hero" className="w-full" disabled={save.isPending}>
        {initial ? "Save changes" : "Publish announcement"}
      </Button>
    </form>
  );
}
