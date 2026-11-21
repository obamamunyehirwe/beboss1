import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
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
import { CommandPalette } from "@/components/admin/CommandPalette";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "BeBoss Admin Center" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
});

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

function AdminLayout() {
  const ctx = useAdminCtx();
  const router = useRouter();
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
  if (ctx.error || !ctx.data?.isStaff) {
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

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarBody email={ctx.data.email} isAdmin={ctx.data.isAdmin} onSignOut={signOut} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar email={ctx.data.email} isAdmin={ctx.data.isAdmin} onSignOut={signOut} />
        <LiveFeed />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {!ctx.data.signingKeyConfigured && ctx.data.isAdmin ? (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <span className="text-warning">Unlock codes can't be issued until you add the BB2 signing key used in your Android app.</span>
              <Button asChild size="sm" variant="soft">
                <Link to="/admin/settings">Add signing key</Link>
              </Button>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function useBadges() {
  const pay = useQuery(paymentsQuery);
  const inbox = useQuery(inboxQuery);
  const sync = useQuery(syncEventsQuery);
  const now = useNow(30_000);
  return {
    sync: (sync.data ?? []).filter((e) => now - new Date(e.created_at).getTime() < 15 * 60_000).length,
    payments: (pay.data ?? []).filter((p) => p.status === "PENDING_VERIFICATION").length,
    inbox: (inbox.data ?? []).filter((m) => m.status === "NEW").length,
  };
}

function SidebarBody({ email, isAdmin, onSignOut, onNavigate }: { email: string; isAdmin: boolean; onSignOut: () => void; onNavigate?: () => void }) {
  const badges = useBadges();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo to="/admin" suffix="Admin" />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map((n) => {
          const count = "badge" in n ? badges[n.badge] : 0;
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              activeOptions={{ exact: "exact" in n && n.exact }}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-foreground font-medium" }}
            >
              <n.icon className="size-4" />
              <span className="flex-1">{n.label}</span>
              {count ? <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">{count}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-sidebar-border p-4">
        <Link to="/" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-3.5" /> View public site
        </Link>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm">{email}</p>
            <p className="text-[11px] text-muted-foreground">{isAdmin ? "Master admin" : "Support (read-only)"}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onSignOut} aria-label="Sign out">
            <LogOut />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TopBar({ email, isAdmin, onSignOut }: { email: string; isAdmin: boolean; onSignOut: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  return (
    <div className="glass sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Open admin menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 bg-sidebar p-0">
            <SheetTitle className="sr-only">Admin menu</SheetTitle>
            <SidebarBody email={email} isAdmin={isAdmin} onSignOut={onSignOut} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <LivePulse />
      </div>
      <div className="flex items-center gap-2">
      <CommandPalette nav={NAV} />
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
        <RefreshCw className={cn(spinning && "animate-spin")} /> <span className="hidden sm:inline">Refresh</span>
      </Button>
      </div>
    </div>
  );
}

function LivePulse() {
  const { data } = useQuery(syncEventsQuery);
  const now = useNow(10_000);
  const last = data?.[0];
  return (
    <Link to="/admin/sync" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      <Activity className="size-3.5 text-success" />
      <span className="hidden sm:inline">Live cloud sync</span>
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
