import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Bot, Copy, Loader2, Mail, MessageCircle, Phone, Save, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { draftInboxReply } from "@/lib/ai.functions";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, matches, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { deleteContactMessage, updateContactMessage } from "@/lib/admin.functions";
import { inboxQuery, type ContactMessage } from "@/lib/admin-queries";
import { buildWhatsAppUrl } from "@/lib/pricing";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/inbox")({
  component: InboxPage,
});

type F = "OPEN" | "NEW" | "IN_PROGRESS" | "RESOLVED" | "SPAM" | "ALL";

function InboxPage() {
  const a = useAdminText();
  const { data, isLoading } = useQuery(inboxQuery);
  const [f, setF] = useState<F>("OPEN");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const all = data ?? [];
  const rows = all.filter((m) => (f === "ALL" ? true : f === "OPEN" ? m.status === "NEW" || m.status === "IN_PROGRESS" : m.status === f)).filter((m) => matches(q, m.full_name, m.shop_name, m.phone, m.email, m.message, m.topic));
  const current = all.find((m) => m.id === sel) ?? rows[0] ?? null;

  return (
    <div>
      <PageHeader title="Inbox" sub="Messages from the website contact form, updated live." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, shop, phone, message…" />
        <FilterChips<F>
          value={f}
          onChange={setF}
          options={[
            { value: "OPEN", label: "Open", count: all.filter((m) => m.status === "NEW" || m.status === "IN_PROGRESS").length },
            { value: "NEW", label: "New", count: all.filter((m) => m.status === "NEW").length },
            { value: "RESOLVED", label: "Resolved", count: all.filter((m) => m.status === "RESOLVED").length },
            { value: "SPAM", label: "Spam", count: all.filter((m) => m.status === "SPAM").length },
            { value: "ALL", label: "All", count: all.length },
          ]}
        />
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <EmptyState title="Inbox zero" sub="New messages from the Contact page show up here instantly." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {rows.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSel(m.id)}
                className={cn("w-full rounded-2xl border p-4 text-left transition-colors", current?.id === m.id ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-accent/40")}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{m.full_name}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(m.created_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {m.topic} {m.shop_name ? `• ${m.shop_name}` : ""}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{m.message}</p>
                <div className="mt-2">
                  <StatusBadge status={m.status} />
                </div>
              </button>
            ))}
          </div>
          {current ? <MessageDetail key={current.id} m={current} /> : null}
        </div>
      )}
    </div>
  );
}

function MessageDetail({ m }: { m: ContactMessage }) {
  const a = useAdminText();
  const isAdmin = !!useAdminCtx().data?.isAdmin;
  const [status, setStatus] = useState(m.status);
  const [note, setNote] = useState(m.admin_reply_note);
  useEffect(() => {
    setStatus(m.status);
    setNote(m.admin_reply_note);
  }, [m]);
  const save = useAdminAction(useServerFn(updateContactMessage), { success: "Message updated", invalidate: [["admin", "inbox"]] });
  const del = useAdminAction(useServerFn(deleteContactMessage), { success: "Message deleted", invalidate: [["admin", "inbox"]] });
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{m.full_name}</h2>
          <p className="text-sm text-muted-foreground">
            {m.shop_name || a("No shop given")} • {formatDateTime(m.created_at)}
          </p>
        </div>
        <StatusBadge status={m.status} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {m.phone ? (
          <>
            <Button size="sm" variant="success" asChild>
              <a href={buildWhatsAppUrl(m.phone, `Hello ${m.full_name}, this is the BeBoss team replying to your message.`)} target="_blank" rel="noreferrer">
                <MessageCircle /> {a("WhatsApp")}
              </a>
            </Button>
            <Button size="sm" variant="glass" asChild>
              <a href={`tel:${m.phone}`}>
                <Phone /> {m.phone}
              </a>
            </Button>
          </>
        ) : null}
        {m.email ? (
          <Button size="sm" variant="glass" asChild>
            <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your BeBoss message")}`}>
              <Mail /> {m.email}
            </a>
          </Button>
        ) : null}
      </div>
      <p className="mt-6 whitespace-pre-line rounded-2xl bg-muted/50 p-4 text-sm">{m.message}</p>
      <AiDraft m={m} />
      <div className="mt-6 grid gap-3 sm:grid-cols-[200px_1fr]">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["NEW", "IN_PROGRESS", "RESOLVED", "SPAM"].map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={a("Internal note — what was done for this person")} />
      </div>
      <div className="mt-3 flex justify-between">
        {isAdmin ? (
          <ConfirmAction
            trigger={
              <Button size="sm" variant="ghost" className="text-muted-foreground">
                <Trash2 /> {a("Delete")}
              </Button>
            }
            title={a("Delete this message?")}
            description={a("It is removed permanently.")}
            destructive
            confirmLabel="Delete"
            onConfirm={() => del.mutate({ id: m.id })}
          />
        ) : (
          <span />
        )}
        <Button size="sm" variant="hero" disabled={save.isPending} onClick={() => save.mutate({ id: m.id, status, note })}>
          <Save /> {a("Save")}
        </Button>
      </div>
    </div>
  );
}

function AiDraft({ m }: { m: ContactMessage }) {
  const draftFn = useServerFn(draftInboxReply);
  const [tone, setTone] = useState<"friendly" | "formal">("friendly");
  const [text, setText] = useState("");
  const draft = useMutation({
    mutationFn: () => draftFn({ data: { messageId: m.id, tone } }),
    onSuccess: (r) => setText(r.text),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't draft a reply"),
  });
  return (
    <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Bot className="size-4 text-primary" /> AI reply draft
        </p>
        <div className="flex items-center gap-2">
          <Select value={tone} onValueChange={(v) => setTone(v as "friendly" | "formal")}>
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="soft" disabled={draft.isPending} onClick={() => draft.mutate()}>
            {draft.isPending ? <Loader2 className="animate-spin" /> : <Bot />} {text ? "Redraft" : "Draft reply"}
          </Button>
        </div>
      </div>
      {text ? (
        <>
          <Textarea className="mt-3" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="glass" onClick={async () => { await navigator.clipboard.writeText(text); toast.success("Copied"); }}>
              <Copy /> Copy
            </Button>
            {m.phone ? (
              <Button size="sm" variant="success" asChild>
                <a href={buildWhatsAppUrl(m.phone, text)} target="_blank" rel="noreferrer">
                  <MessageCircle /> Send on WhatsApp
                </a>
              </Button>
            ) : null}
            {m.email ? (
              <Button size="sm" variant="glass" asChild>
                <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your BeBoss message")}&body=${encodeURIComponent(text)}`}>
                  <Mail /> Email it
                </a>
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Writes a reply in the customer's language using your current prices and payment numbers. Review before sending.</p>
      )}
    </div>
  );
}
