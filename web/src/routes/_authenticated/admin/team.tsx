import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Loader2, UserPlus, UserX } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmAction, EmptyState, LoadingBlock, PageHeader, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { grantTeamRole, listTeam, revokeTeamRole } from "@/lib/admin.functions";
import { formatDateTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/team")({
  component: TeamPage,
});

function TeamPage() {
  const a = useAdminText();
  const isAdmin = !!useAdminCtx().data?.isAdmin;
  const list = useServerFn(listTeam);
  const team = useQuery({ queryKey: ["admin", "team"], queryFn: () => list(), enabled: isAdmin });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SUPPORT");
  const grant = useAdminAction(useServerFn(grantTeamRole), { success: "Invitation sent or access granted", invalidate: [["admin", "team"]] });
  const revoke = useAdminAction(useServerFn(revokeTeamRole), { success: "Access removed", invalidate: [["admin", "team"]] });

  if (!isAdmin) return <EmptyState title="Master admins only" sub="Ask a master admin to manage the team." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Admin team" sub="Assign named roles with server-enforced permissions. Only a Master Admin can invite or change team roles." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          grant.mutate({ email, role }, { onSuccess: () => setEmail("") });
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-5"
      >
        <div className="min-w-[240px] flex-1 space-y-1.5">
          <label className="text-sm font-medium">{a("Team member email")}</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder={a("teammate@example.com")} />
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SUPPORT">Support · inbox and shop lookup</SelectItem>
            <SelectItem value="RELEASE_MANAGER">Release manager</SelectItem>
            <SelectItem value="ANNOUNCEMENT_MANAGER">Announcement manager</SelectItem>
            <SelectItem value="DEVICE_AUDITOR">Device and sync auditor</SelectItem>
            <SelectItem value="FINANCE_REVIEWER">Finance reviewer</SelectItem>
            <SelectItem value="ANALYST">Business analyst</SelectItem>
            <SelectItem value="OPERATIONS_MANAGER">Operations manager</SelectItem>
            <SelectItem value="STAFF_MANAGER">Staff manager</SelectItem>
            <SelectItem value="SUPER_ADMIN">Master admin · full access</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="hero" disabled={grant.isPending}>
          {grant.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Invite / grant access
        </Button>
        <p className="w-full text-xs text-muted-foreground">{a("If the email has no account yet, BeBoss sends a secure invitation. Their selected role is ready when they accept it.")}</p>
      </form>
      {team.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {(team.data?.members ?? []).map((m) => (
            <div key={`${m.userId}-${m.role}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">
                  {m.email} {m.userId === team.data?.me ? <span className="text-xs text-muted-foreground">({a("you")})</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a("Since")} {formatDateTime(m.since)} • {a("last sign-in")} {m.lastSignIn ? formatDateTime(m.lastSignIn) : a("never")}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant={m.active ? "success" : "secondary"}>{m.active ? "Active" : "Suspended"}</Badge>
                  {(m.permissions ?? []).map((permission) => (
                    <Badge key={permission} variant="outline" className="font-mono text-[10px]">{permission}</Badge>
                  ))}
                  {m.roleKey === "SUPER_ADMIN" ? <Badge variant="outline">Full access</Badge> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.roleKey === "SUPER_ADMIN" ? "brand" : "info"}>{a(m.roleKey.replaceAll("_", " "))}</Badge>
                <ConfirmAction
                  trigger={
                    <Button size="icon" variant="ghost" aria-label={a("Remove access")} disabled={m.userId === team.data?.me}>
                      <UserX />
                    </Button>
                  }
                  title={a("Remove admin-team access?")}
                  description={a("Their BeBoss account remains, but every platform-admin role and delegated permission is revoked.")}
                  destructive
                  confirmLabel="Remove access"
                  onConfirm={() => revoke.mutate({ userId: m.userId })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
