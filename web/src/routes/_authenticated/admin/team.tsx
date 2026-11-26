import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { AlertCircle, Loader2, RefreshCw, Search, UserPlus, UserX, Users } from "lucide-react";
import { useMemo, useState } from "react";
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

type TeamMember = {
  userId: string;
  email: string;
  role: string;
  roleKey: string;
  permissions: string[];
  active: boolean;
  expiresAt: number | string | null;
  since: number | string;
  lastSignIn: string | null;
};

function TeamPage() {
  const a = useAdminText();
  const isAdmin = !!useAdminCtx().data?.isAdmin;
  const list = useServerFn(listTeam);
  const team = useQuery({
    queryKey: ["admin", "team"],
    queryFn: () => list(),
    enabled: isAdmin,
    staleTime: 30_000,
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SUPPORT");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const grant = useAdminAction(useServerFn(grantTeamRole), {
    success: "Invitation sent or access granted",
    invalidate: [["admin", "team"]],
  });
  const revoke = useAdminAction(useServerFn(revokeTeamRole), {
    success: "Access removed",
    invalidate: [["admin", "team"]],
  });

  const members = (team.data?.members ?? []) as TeamMember[];
  const filtered = useMemo(() => members.filter((member) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [
      member.email, member.roleKey, member.userId, ...(member.permissions ?? []),
    ].some((value) => String(value ?? "").toLowerCase().includes(needle));
    return matchesSearch && (roleFilter === "ALL" || member.roleKey === roleFilter);
  }), [members, search, roleFilter]);

  if (!isAdmin) return <EmptyState title="Master admins only" sub="Ask a master admin to manage the team." />;

  return (
    <div className="admin-team-page min-w-0 space-y-5">
      <PageHeader
        title="Admin team"
        sub="Manage platform administrators, assign least-privilege roles, and review each member's effective permissions."
      />

      <section className="grid min-w-0 gap-3 sm:grid-cols-3">
        <div className="admin-team-metric">
          <span className="admin-team-metric-icon"><Users className="size-4" /></span>
          <div><strong>{team.isError ? "—" : members.length}</strong><span>Team members</span></div>
        </div>
        <div className="admin-team-metric">
          <span className="admin-team-metric-icon"><UserPlus className="size-4" /></span>
          <div><strong>{team.isError ? "—" : members.filter((member) => member.active).length}</strong><span>Active access</span></div>
        </div>
        <div className="admin-team-metric">
          <span className="admin-team-metric-icon"><AlertCircle className="size-4" /></span>
          <div><strong>{team.isError ? "—" : members.filter((member) => !member.active).length}</strong><span>Suspended access</span></div>
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Invite or assign an administrator</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the smallest role that provides the required access. New users receive a Supabase invitation using the project's configured Auth redirect URL.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            grant.mutate({ email, role }, { onSuccess: () => setEmail("") });
          }}
          className="admin-team-grant-form"
        >
          <label className="admin-team-field">
            <span>{a("Team member email")}</span>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={200} autoComplete="email" placeholder={a("teammate@example.com")} />
          </label>
          <label className="admin-team-field">
            <span>Platform role</span>
            <Select value={role} onValueChange={(value) => setRole(value)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
          </label>
          <Button type="submit" variant="hero" disabled={grant.isPending || !email.trim()} className="admin-team-grant-button">
            {grant.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Invite / grant access
          </Button>
        </form>
      </section>

      <section className="min-w-0 space-y-3">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Team directory</h2>
            <p className="text-sm text-muted-foreground">Roles and permissions are loaded from live Supabase records.</p>
          </div>
          <Button variant="outline" size="sm" disabled={team.isFetching} onClick={() => void team.refetch()}>
            <RefreshCw className={team.isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {team.isError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 sm:p-5" role="alert">
            <div className="flex min-w-0 items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-destructive">Team data could not be loaded</h3>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {team.error instanceof Error ? team.error.message : "Supabase returned an unknown team-directory error."}
                </p>
                <Button className="mt-3" variant="outline" size="sm" disabled={team.isFetching} onClick={() => void team.refetch()}>
                  {team.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />} Retry team read
                </Button>
              </div>
            </div>
          </div>
        ) : team.isLoading ? (
          <LoadingBlock />
        ) : (
          <>
            <div className="admin-team-filters">
              <label className="admin-team-search">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email, role or permission…" aria-label="Search team members" />
              </label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="admin-team-role-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All roles</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Master admin</SelectItem>
                  <SelectItem value="SUPPORT">Support</SelectItem>
                  <SelectItem value="RELEASE_MANAGER">Release manager</SelectItem>
                  <SelectItem value="ANNOUNCEMENT_MANAGER">Announcement manager</SelectItem>
                  <SelectItem value="DEVICE_AUDITOR">Device auditor</SelectItem>
                  <SelectItem value="FINANCE_REVIEWER">Finance reviewer</SelectItem>
                  <SelectItem value="ANALYST">Analyst</SelectItem>
                  <SelectItem value="OPERATIONS_MANAGER">Operations manager</SelectItem>
                  <SelectItem value="STAFF_MANAGER">Staff manager</SelectItem>
                </SelectContent>
              </Select>
              <span className="admin-team-result-count">{filtered.length} of {members.length}</span>
            </div>

            {members.length === 0 ? (
              <EmptyState title="No administrator accounts found" sub="No Supabase Auth users currently have a BeBoss platform administrator role." />
            ) : filtered.length === 0 ? (
              <EmptyState title="No matching team members" sub="Change the search text or role filter to see other team members." />
            ) : (
              <div className="admin-team-member-grid">
                {filtered.map((member) => (
                  <article key={member.userId} className="admin-team-member-card">
                    <div className="admin-team-member-main">
                      <div className="admin-team-avatar" aria-hidden="true">{(member.email || "?").slice(0, 1).toUpperCase()}</div>
                      <div className="min-w-0 flex-1">
                        <p className="break-all font-semibold">{member.email || "Unknown email"}</p>
                        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{member.userId}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Assigned {member.since ? formatDateTime(member.since) : "—"}
                          {member.lastSignIn ? " · Last sign-in " + formatDateTime(member.lastSignIn) : " · Never signed in"}
                        </p>
                      </div>
                    </div>
                    <div className="admin-team-member-meta">
                      <Badge variant={member.active ? "success" : "secondary"}>{member.active ? "Active" : "Suspended"}</Badge>
                      <Badge variant={member.roleKey === "SUPER_ADMIN" ? "brand" : "info"}>{a(member.roleKey.replaceAll("_", " "))}</Badge>
                      {member.expiresAt ? <Badge variant="outline">Expires {formatDateTime(member.expiresAt)}</Badge> : null}
                    </div>
                    <div className="admin-team-permissions" aria-label="Assigned permissions">
                      {member.roleKey === "SUPER_ADMIN" ? (
                        <Badge variant="outline">Full platform access</Badge>
                      ) : (member.permissions ?? []).length > 0 ? (
                        member.permissions.map((permission) => <Badge key={permission} variant="outline" className="max-w-full break-all font-mono text-[10px]">{permission}</Badge>)
                      ) : <span className="text-xs text-muted-foreground">No permissions recorded</span>}
                    </div>
                    <div className="flex justify-end border-t border-border pt-3">
                      <ConfirmAction
                        trigger={
                          <Button size="sm" variant="outline" aria-label={a("Remove access")} disabled={member.userId === team.data?.me || revoke.isPending}>
                            <UserX /> Remove access
                          </Button>
                        }
                        title={a("Remove admin-team access?")}
                        description={a("Their BeBoss account remains, but every platform-admin role and delegated permission is revoked.")}
                        destructive
                        confirmLabel="Remove access"
                        onConfirm={() => revoke.mutate({ userId: member.userId })}
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
