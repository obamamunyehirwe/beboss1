import { createFileRoute, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AppWindow, BarChart3, Bot, CreditCard, Megaphone, ExternalLink, FileClock, Inbox, KeyRound, LayoutDashboard, Loader2, LogOut, Menu, Radio, RefreshCw, Settings, ShieldAlert, Smartphone, Store, Users, UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { inboxQuery, paymentsQuery, syncEventsQuery } from "@/lib/admin-queries";
import { useNow } from "@/hooks/use-now";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAdminText } from '@/lib/admin-copy';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';
import { CommandPalette } from "@/components/admin/CommandPalette";
import "@/components/admin/admin-responsive.css";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "BeBoss Admin Center" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
  errorComponent: AdminRouteError,
});

function AdminRouteError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="grid min-h-[70vh] place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-xl rounded-3xl border border-warning/40 bg-card p-8 shadow-xl">
        <div className="flex items-center gap-3 text-warning">
          <ShieldAlert className="size-7" />
          <h1 className="text-xl font-bold">Admin page could not load</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          The admin page encountered an error. Your Supabase records and shop data have not been reset.
        </p>
        <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          {error.message || "Unexpected admin page error"}
        </pre>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={reset}><RefreshCw /> Retry page</Button>
          <Button variant="outline" asChild><Link to="/admin">Admin overview</Link></Button>
        </div>
      </div>
    </div>
  );
}

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/copilot", label: "AI Copilot", icon: Bot },
  { to: "/admin/payments", label: "Payments queue", icon: CreditCard, badge: "payments" },
  { to: "/admin/shops", label: "Shops", icon: Store },
  { to: "/admin/devices", label: "Devices", icon: Smartphone },
  { to: "/admin/users", label: "Shop staff", icon: Users },
  { to: "/admin/codes", label: "Unlock codes", icon: KeyRound },
  { to: "/admin/sync", label: "Cloud sync", icon: Radio, badge: "sync" },
  { to: "/admin/releases", label: "App releases", icon: AppWindow },
  { to: "/admin/inbox", label: "Inbox", icon: Inbox, badge: "inbox" },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/audit", label: "Audit log", icon: FileClock },
  { to: "/admin/team", label: "Admin team", icon: UsersRound },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

const NAV_PERMISSION: Record<string, string> = {
  "/admin": "shops.view",
  "/admin/analytics": "analytics.view",
  "/admin/copilot": "analytics.view",
  "/admin/payments": "payments.review",
  "/admin/shops": "shops.view",
  "/admin/devices": "devices.audit",
  "/admin/users": "users.manage",
  "/admin/codes": "payments.review",
  "/admin/sync": "sync.view",
  "/admin/releases": "releases.manage",
  "/admin/inbox": "inbox.manage",
  "/admin/announcements": "announcements.manage",
};
const NAV_SUPER_ADMIN_ONLY = new Set(["/admin/audit", "/admin/team", "/admin/settings"]);
function hasPermission(permissions: string[], permission?: string) {
  return !permission || permissions.includes("*") || permissions.includes(permission);
}

function AdminQueryStatusBanner() {
  const queryClient = useQueryClient();
  const [failures, setFailures] = useState<Array<{ key: string; label: string; message: string }>>([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const refreshFailures = () => {
      const current = queryClient.getQueryCache().getAll()
        .filter((query) => query.queryKey[0] === "admin" && query.state.status === "error" && query.state.fetchStatus === "idle")
        .map((query) => {
          const label = query.queryKey.map(String).slice(1).join(" / ") || "admin data";
          const error = query.state.error;
          const raw = error instanceof Error ? error.message : String(error ?? "Unknown read error");
          const message = raw
            .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
            .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/gi, "[redacted key]")
            .slice(0, 500);
          return { key: JSON.stringify(query.queryKey), label, message };
        });
      setFailures(current);
    };

    refreshFailures();
    return queryClient.getQueryCache().subscribe(refreshFailures);
  }, [queryClient]);

  if (failures.length === 0) return null;

  const retryFailedReads = async () => {
    setRetrying(true);
    try {
      await queryClient.refetchQueries({
        type: "active",
        predicate: (query) => query.queryKey[0] === "admin" && query.state.status === "error",
      });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section role="alert" className="mx-auto mt-4 w-full max-w-[1400px] rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 sm:px-6" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-destructive">Some Admin data could not be loaded</h2>
          <p className="mt-1 text-sm text-muted-foreground">Failed reads are shown here instead of being presented as successful empty tables or sample figures.</p>
        </div>
        <Button variant="outline" size="sm" disabled={retrying} onClick={() => void retryFailedReads()}>
          <RefreshCw className={retrying ? "animate-spin" : ""} />
          {retrying ? "Checking…" : "Retry failed reads"}
        </Button>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {failures.map((failure) => (
          <li key={failure.key} className="min-w-0 rounded-xl border border-border bg-card/80 p-3">
            <p className="text-sm font-semibold">{failure.label}</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">{failure.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
function AdminLayout() {
  const ctx = useAdminCtx();
  const router = useRouter();
  const currentPath = useRouterState({ select: (state) => state.location.pathname });
  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  if (ctx.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (ctx.error) {
    return (
      <div className="grid min-h-screen place-items-center bg-ember px-4">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto size-10 text-warning" />
          <h1 className="mt-4 text-xl font-bold">Could not verify admin access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            BeBoss could not complete the secure role check with Supabase. Your permissions have not been changed. Retry the connection, or sign out and sign in again.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="hero" onClick={() => void ctx.refetch()}>
              <RefreshCw /> Retry
            </Button>
            <Button variant="glass" asChild>
              <Link to="/">Back to site</Link>
            </Button>
            <Button variant="secondary" onClick={signOut}>
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!ctx.data?.isStaff) {
    return (
      <div className="grid min-h-screen place-items-center bg-ember px-4">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto size-10 text-warning" />
          <h1 className="mt-4 text-xl font-bold">Waiting for admin access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You're signed in as <span className="text-foreground">{ctx.data?.email || "this account"}</span>, but it doesn't have admin rights yet. The master admin can grant access from Admin team.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="glass" asChild>
              <Link to="/">Back to site</Link>
            </Button>
            <Button variant="secondary" onClick={signOut}>
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const permissions = ctx.data.permissions ?? [];
  const activeNav = NAV.find((item) => currentPath === item.to || (item.to !== "/admin" && currentPath.startsWith(item.to + "/")));
  const isSuperAdminPage = NAV_SUPER_ADMIN_ONLY.has(activeNav?.to ?? "");
  const pageAllowed = !!ctx.data.isAdmin || (!isSuperAdminPage && hasPermission(permissions, activeNav ? NAV_PERMISSION[activeNav.to] : undefined));

  return (
    <div className="admin-workspace flex min-h-screen">
      <aside className="admin-sidebar sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarBody email={ctx.data.email} isAdmin={ctx.data.isAdmin} permissions={permissions} onSignOut={signOut} />
      </aside>
      <div className="admin-main-column flex min-w-0 flex-1 flex-col">
        <TopBar email={ctx.data.email} isAdmin={ctx.data.isAdmin} permissions={permissions} onSignOut={signOut} />
        <LiveFeed />
        <AdminQueryStatusBanner />
        <main className="admin-main-content mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {!ctx.data.signingKeyConfigured && ctx.data.isAdmin ? (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <span className="text-warning">New unlock codes require the matching BB3 ECDSA P-256 private key. Add or verify it in Settings. Legacy BB2 codes are validated online against their original issued record; they do not use a shared signing key.</span>
              <Button asChild size="sm" variant="soft">
                <Link to="/admin/settings">Add signing key</Link>
              </Button>
            </div>
          ) : null}
          {pageAllowed ? <Outlet /> : (
            <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-border bg-card p-7 text-center">
              <ShieldAlert className="mx-auto size-9 text-warning" />
              <h1 className="mt-3 text-lg font-bold">This area is not assigned to your role</h1>
              <p className="mt-2 text-sm text-muted-foreground">Your account can use only the administration tools granted by a Super Admin. Ask your platform owner to update the role when access is required.</p>
              <Button asChild className="mt-5" variant="outline"><Link to="/admin">Return to your workspace</Link></Button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function useBadges(permissions: string[], isAdmin: boolean) {
  const pay = useQuery({ ...paymentsQuery, enabled: isAdmin || hasPermission(permissions, "payments.review") });
  const inbox = useQuery({ ...inboxQuery, enabled: isAdmin || hasPermission(permissions, "inbox.manage") });
  const sync = useQuery({ ...syncEventsQuery, enabled: isAdmin || hasPermission(permissions, "sync.view") });
  const now = useNow(30_000);
  return {
    sync: (sync.data ?? []).filter((e) => now - new Date(e.created_at).getTime() < 15 * 60_000).length,
    payments: (pay.data ?? []).filter((p) => p.status === "PENDING_VERIFICATION").length,
    inbox: (inbox.data ?? []).filter((m) => m.status === "NEW").length,
  };
}

function SidebarBody({ email, isAdmin, permissions, onSignOut, onNavigate }: { email: string; isAdmin: boolean; permissions: string[]; onSignOut: () => void; onNavigate?: () => void }) {
  const a=useAdminText();
  const badges = useBadges(permissions, isAdmin);
  const visibleNav = NAV.filter((item) => isAdmin || (!NAV_SUPER_ADMIN_ONLY.has(item.to) && hasPermission(permissions, NAV_PERMISSION[item.to])));
  return (
    <div className="flex h-full flex-col">
      <div className="admin-sidebar-brand px-5 py-5">
        <Logo to="/admin" suffix="Admin" />
      </div>
      <nav className="admin-side-nav flex-1 space-y-0.5 overflow-y-auto px-3">
        {visibleNav.map((n,i) => {
          const count = "badge" in n ? badges[n.badge] : 0;
          return (
            <div key={n.to}>
            {[0,3,12].includes(i) && <p className="admin-nav-group-label px-3 pt-4 pb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{a(i===0?'Workspace':i===3?'Operations':'Administration')}</p>}
            <Link
              to={n.to}
              onClick={onNavigate}
              activeOptions={{ exact: "exact" in n && n.exact }}
              className="admin-nav-item flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{ className: "admin-nav-item admin-nav-item-active bg-sidebar-accent text-sidebar-foreground font-medium" }}
            >
              <n.icon className="size-4" />
              <span className="flex-1">{a(n.label)}</span>
              {count ? <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">{count}</span> : null}
            </Link></div>
          );
        })}
      </nav>
      <div className="admin-sidebar-footer space-y-2 border-t border-sidebar-border p-4">
        <Link to="/" className="admin-live-pulse flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-3.5" /> {a('View public site')}
        </Link>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm">{email}</p>
            <p className="text-[11px] text-muted-foreground">{a(isAdmin ? "Master admin" : "Support (read-only)")}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onSignOut} aria-label="Sign out">
            <LogOut />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TopBar({ email, isAdmin, permissions, onSignOut }: { email: string; isAdmin: boolean; permissions: string[]; onSignOut: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const a=useAdminText();
  const [spinning, setSpinning] = useState(false);
  return (
    <div className="admin-topbar glass sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Open admin menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="admin-mobile-sheet w-64 bg-sidebar p-0">
            <SheetTitle className="sr-only">Admin menu</SheetTitle>
            <SidebarBody email={email} isAdmin={isAdmin} permissions={permissions} onSignOut={onSignOut} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="admin-topbar-mobile-brand lg:hidden">
          <Logo to="/admin" suffix="Admin" />
        </div>
        <div className="hidden sm:block">
          <LivePulse enabled={isAdmin || permissions.includes("sync.view")} />
        </div>
      </div>
      <div className="flex items-center gap-2">
      <LanguageSwitcher /><ThemeToggle /><CommandPalette nav={NAV.filter((item) => isAdmin || (!NAV_SUPER_ADMIN_ONLY.has(item.to) && hasPermission(permissions, NAV_PERMISSION[item.to]))).map(n=>({...n,label:a(n.label)}))} />
      <Button
        size="sm"
        variant="glass"
        onClick={async () => {
          setSpinning(true);
          await qc.invalidateQueries({ queryKey: ["admin"] });
          setSpinning(false);
          toast.success("Data refreshed");
        }}
      >
        <RefreshCw className={cn(spinning && "animate-spin")} /> <span className="hidden sm:inline">{a('Refresh')}</span>
      </Button>
      </div>
    </div>
  );
}

function LivePulse({ enabled = true }: { enabled?: boolean }) {
  const { data, isLoading, isError } = useQuery({ ...syncEventsQuery, enabled });
  const now = useNow(10_000);
  const last = data?.[0];
  const lastAt = last ? Date.parse(last.created_at) : Number.NaN;
  const isRecent = enabled && Number.isFinite(lastAt) && lastAt <= now && now - lastAt < 15 * 60_000;
  const label = !enabled
    ? "Cloud activity is not assigned to this role"
    : isLoading
    ? "Checking cloud activity"
    : isError
      ? "Cloud activity unavailable"
      : isRecent
        ? "Recent cloud activity"
        : last
          ? "No recent sync activity"
          : "No sync activity recorded";
  const tone = isRecent ? "text-success" : isError ? "text-destructive" : "text-muted-foreground";

  return (
    <Link
      to="/admin/sync"
      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      title={label}
      aria-label={label}
    >
      <span className={cn("size-2 rounded-full", isRecent ? "bg-success" : isError ? "bg-destructive" : "bg-muted-foreground/50")} />
      <Activity className={cn("size-3.5", tone)} />
      <span className="hidden sm:inline">{label}</span>
      {last ? <span className="text-muted-foreground/80">· last {relativeTime(last.created_at, now)}</span> : null}
    </Link>
  );
}

/** Realtime: new payment claims, shop changes and inbox messages refresh the admin instantly. */
function LiveFeed() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`admin-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_requests" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["admin", "payments"] });
        if (payload.eventType === "INSERT") {
          const row = payload.new as { shop_name?: string; amount_rwf?: number; provider?: string };
          toast.info(`New payment claim: ${row.shop_name ?? "shop"} — ${Number(row.amount_rwf ?? 0).toLocaleString()} FRw via ${row.provider ?? "MoMo"}`);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_accounts" }, () => qc.invalidateQueries({ queryKey: ["admin", "shops"] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "cloud_sync_events" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["admin", "sync-events"] });
        const e = payload.new as { entity?: string; action?: string; shop_name?: string };
        if (e.entity === "SHOP" && e.action === "REGISTERED") toast.success(`New shop registered: ${e.shop_name ?? ""}`);
        if (e.entity === "UNLOCK_CODE" && e.action === "REDEEMED") toast.success(`${e.shop_name || "A shop"} redeemed an unlock code`);
        if (e.entity === "DEVICE" && e.action === "PAIRED") toast.info(`New device paired at ${e.shop_name ?? "a shop"}`);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_devices" }, () => qc.invalidateQueries({ queryKey: ["admin", "devices"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_users" }, () => qc.invalidateQueries({ queryKey: ["admin", "users"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "branch_sync_snapshots" }, () => {
        qc.invalidateQueries({ queryKey: ["admin", "snapshots"] });
        qc.invalidateQueries({ queryKey: ["admin", "records"] });
        qc.invalidateQueries({ queryKey: ["admin", "insights"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "unlock_codes" }, () => qc.invalidateQueries({ queryKey: ["admin", "codes"] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contact_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["admin", "inbox"] });
        toast.info("New message in the inbox");
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
  return null;
}
