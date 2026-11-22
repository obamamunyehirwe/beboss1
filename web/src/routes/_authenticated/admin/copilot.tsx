import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, Bot, Loader2, RotateCcw, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/admin/ui";
import { askCopilot } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/copilot")({
  head: () => ({ meta: [{ title: "Copilot — BeBoss Admin" }, { name: "robots", content: "noindex" }] }),
  component: CopilotPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Give me today's business briefing",
  "Which shops should I call this week before their license expires?",
  "How is revenue trending versus last month?",
  "Are any devices or payments stuck that need my attention?",
  "MTN vs Airtel: where does our money come from?",
];

function CopilotPage() {
  const a = useAdminText();
  const ask = useServerFn(askCopilot);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const run = useMutation({
    mutationFn: (history: Msg[]) => ask({ data: { messages: history.slice(-12) } }),
    onSuccess: (r) => setMsgs((m) => [...m, { role: "assistant", content: r.text }]),
    onError: (e) => toast.error(e instanceof Error ? e.message : "The copilot couldn't answer"),
  });
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs, run.isPending]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || run.isPending) return;
    const next = [...msgs, { role: "user" as const, content: t }];
    setMsgs(next);
    setInput("");
    run.mutate(next);
  };

  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-[480px] flex-col">
      <PageHeader
        title="BeBoss Copilot"
        sub="Ask about revenue, shops, payments and devices. Answers use live admin data only."
        actions={
          msgs.length ? (
            <Button size="sm" variant="glass" onClick={() => setMsgs([])}>
              <RotateCcw /> New chat
            </Button>
          ) : null
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-card p-4 sm:p-6">
        {!msgs.length ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-lg">
              <Bot className="size-7" />
            </span>
            <h2 className="mt-4 text-xl font-bold">{a("What do you want to know?")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{a("The copilot reads a fresh summary of shops, payments, codes, devices and sync activity each time you ask.")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", m.role === "user" ? "bg-secondary text-secondary-foreground" : "bg-primary/15 text-primary")}>
                  {m.role === "user" ? <UserRound className="size-4" /> : <Bot className="size-4" />}
                </span>
                <div className={cn("max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed", m.role === "user" ? "rounded-2xl bg-secondary px-4 py-2.5 text-secondary-foreground" : "pt-1 text-foreground")}>{m.content}</div>
              </div>
            ))}
            {run.isPending ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="grid size-8 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Loader2 className="size-4 animate-spin" />
                </span>
                {a("Reading your live data…")}
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <form
        className="mx-auto mt-3 flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-border bg-card p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={a("Ask the copilot… (Enter to send, Shift+Enter for a new line)") }
          className="max-h-40 min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button type="submit" size="icon" variant="hero" disabled={!input.trim() || run.isPending} aria-label={a("Send")}>
          {run.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
    </div>
  );
}
