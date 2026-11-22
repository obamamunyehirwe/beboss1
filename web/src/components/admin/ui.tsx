import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Inbox, Loader2, Search, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAdminText } from '@/lib/admin-copy';
import { cn } from "@/lib/utils";

// ─── PageHeader ────────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  sub,
  actions,
  shortcuts,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
  /** Map of key (uppercase) → callback. E.g. { P: () => navigate('/admin/payments') } */
  shortcuts?: Record<string, () => void>;
}) {
  const a=useAdminText();
  useEffect(() => {
    if (!shortcuts) return;
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in an input/textarea/select
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const cb = shortcuts[e.key.toUpperCase()];
      if (cb) {
        e.preventDefault();
        cb();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);

  return (
    <div className="admin-heading mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{a(title)}</h1>
        {sub ? <p className="mt-1 text-sm text-muted-foreground">{a(sub)}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "brand" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
}) {
  const a = useAdminText();
  const toneCls = {
    default: "text-muted-foreground bg-muted",
    brand: "text-primary bg-primary/12",
    success: "text-success bg-success/12",
    warning: "text-warning bg-warning/12",
    danger: "text-destructive bg-destructive/15",
    info: "text-info bg-info/12",
  }[tone];
  return (
    <div
      className={cn("admin-stat rounded-xl border border-border bg-card p-5", onClick && "cursor-pointer transition-colors hover:bg-accent")}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{typeof label === "string" ? a(label) : label}</p>
        {Icon ? (
          <span className={cn("grid size-9 place-items-center rounded-xl", toneCls)}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{typeof sub === "string" ? a(sub) : sub}</p> : null}
    </div>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
const STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "danger" | "muted" | "brand"> = {
  ACTIVE: "success",
  APPROVED: "success",
  ISSUED: "success",
  RESOLVED: "success",
  TRIAL: "warning",
  PENDING_VERIFICATION: "warning",
  NEW: "brand",
  IN_PROGRESS: "info",
  REDEEMED: "info",
  EXPIRED: "danger",
  SUSPENDED: "danger",
  KILLED: "danger",
  REJECTED: "danger",
  REVOKED: "muted",
  SPAM: "muted",
  ONLINE: "success",
  TODAY: "info",
  IDLE: "warning",
  STALE: "danger",
  NEVER: "muted",
  APP: "info",
  WEB: "brand",
  ADMIN: "success",
  SYSTEM: "muted",
};

export function StatusBadge({ status }: { status: string }) {
  const a = useAdminText();
  const labels: Record<string, string> = {
    PENDING_VERIFICATION: "Pending verification",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    REDEEMED: "Redeemed",
    ISSUED: "Issued",
    REVOKED: "Revoked",
    ACTIVE: "Active",
    INACTIVE: "Inactive",
    SUSPENDED: "Suspended",
    EXPIRED: "Expired",
    TRIAL: "Trial",
    NEW: "New",
    IN_PROGRESS: "In progress",
    RESOLVED: "Resolved",
    SPAM: "Spam",
    SUCCESS: "Success",
    FAILED: "Failed",
    QUEUED: "Queued",
  };
  return <Badge variant={STATUS_VARIANT[status] ?? "muted"}>{a(labels[status] ?? status.replaceAll("_", " "))}</Badge>;
}

// ─── SearchInput ──────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const a = useAdminText();
  return (
    <div className="relative min-w-[220px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input aria-label={a(placeholder)} value={value} onChange={(e) => onChange(e.target.value)} placeholder={a(placeholder)} className="pl-9" />
    </div>
  );
}

// ─── FilterChips ──────────────────────────────────────────────────────────────
export function FilterChips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  const a = useAdminText();
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? "border-primary bg-primary/12 text-primary" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {a(o.label)}
          {o.count != null ? <span className="ml-1.5 font-mono opacity-70">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  const a = useAdminText();
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <Inbox className="size-10 text-muted-foreground" />
      <p className="mt-3 font-semibold">{a(title)}</p>
      {sub ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{a(sub)}</p> : null}
    </div>
  );
}

// ─── LoadingBlock ─────────────────────────────────────────────────────────────
export function LoadingBlock() {
  return (
    <div className="grid place-items-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─── useAdminAction ───────────────────────────────────────────────────────────
export function useAdminAction<TIn, TOut>(fn: (args: { data: TIn }) => Promise<TOut>, opts: { success?: string | ((r: TOut) => string); invalidate?: readonly (readonly string[])[] } = {}) {
  const qc = useQueryClient();
  const a = useAdminText();
  return useMutation({
    mutationFn: (input: TIn) => fn({ data: input }),
    onSuccess: (r) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : a(opts.success));
      (opts.invalidate ?? [["admin"]]).forEach((k) => qc.invalidateQueries({ queryKey: k as string[] }));
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });
}

// ─── ConfirmAction ────────────────────────────────────────────────────────────
export function ConfirmAction({ trigger, title, description, confirmLabel = "Confirm", destructive, onConfirm }: { trigger: ReactNode; title: string; description: ReactNode; confirmLabel?: string; destructive?: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const a = useAdminText();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{a(title)}</AlertDialogTitle>
          <AlertDialogDescription>{typeof description === "string" ? a(description) : description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{a("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── TableShell ───────────────────────────────────────────────────────────────
export function TableShell({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-card">{children}</div>;
}

// ─── matches ──────────────────────────────────────────────────────────────────
export function matches(q: string, ...vals: unknown[]) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return vals.some((v) => String(v ?? "").toLowerCase().includes(s));
}

// ─── downloadCsv ─────────────────────────────────────────────────────────────
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    toast.error("Nothing to export");
    return;
  }
  const cols = Object.keys(rows[0] ?? {});
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── NEW: TimelineItem ────────────────────────────────────────────────────────
/**
 * A single row in an activity timeline feed.
 * `isNew` causes a brief green-pulse animation to draw the eye.
 */
export function TimelineItem({
  icon: Icon,
  title,
  sub,
  time,
  isNew,
  iconClassName,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: ReactNode;
  sub?: ReactNode;
  time?: ReactNode;
  isNew?: boolean;
  iconClassName?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-border px-3 py-2 text-xs transition-colors", isNew && "animate-pulse border-success/40 bg-success/5")}>
      {Icon ? (
        <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-muted", iconClassName)}>
          <Icon className="size-3" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">{title}</span>
        {sub ? <span className="ml-1 text-muted-foreground">{sub}</span> : null}
      </span>
      {time ? <span className="shrink-0 text-muted-foreground">{time}</span> : null}
    </div>
  );
}

// ─── NEW: MetricDelta ─────────────────────────────────────────────────────────
/**
 * Shows a numeric value with a coloured percentage delta and an up/down arrow.
 */
export function MetricDelta({ value, delta, unit = "%" }: { value: ReactNode; delta: number | null; unit?: string }) {
  if (delta === null) return <span className="text-muted-foreground">{value}</span>;
  const up = delta >= 0;
  return (
    <span className="flex items-center gap-1.5">
      <span>{value}</span>
      <span className={cn("flex items-center gap-0.5 text-xs font-medium", up ? "text-success" : "text-destructive")}>
        {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
        {up ? "+" : ""}{delta.toFixed(1)}{unit}
      </span>
    </span>
  );
}

// ─── NEW: MiniSparkline ───────────────────────────────────────────────────────
/**
 * Tiny inline SVG sparkline — no Recharts dependency for small use-cases.
 * `values` is an array of numbers; colour is a CSS color string.
 */
export function MiniSparkline({
  values,
  color = "var(--primary)",
  width = 64,
  height = 24,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden>
      <polyline points={pts.join(" ")} stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── NEW: QuickActionCard ─────────────────────────────────────────────────────
/**
 * A tappable card that surfaces a quick admin action from the overview page.
 */
export function QuickActionCard({
  icon: Icon,
  label,
  description,
  onClick,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  onClick: () => void;
  tone?: "default" | "brand" | "success" | "warning" | "danger" | "info";
}) {
  const toneCls = {
    default: "text-muted-foreground bg-muted",
    brand: "text-primary bg-primary/12",
    success: "text-success bg-success/12",
    warning: "text-warning bg-warning/12",
    danger: "text-destructive bg-destructive/15",
    info: "text-info bg-info/12",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", toneCls)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description ? <p className="truncate text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </button>
  );
}
