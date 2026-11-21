import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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

export const Route = createFileRoute("/_authenticated/admin/team")({
  component: TeamPage,
});

function TeamPage() {
  const isAdmin = !!useAdminCtx().data?.isAdmin;
  const list = useServerFn(listTeam);
  const team = useQuery({ queryKey: ["admin", "team"], queryFn: () => list(), enabled: isAdmin });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "support">("support");
  const grant = useAdminAction(useServerFn(grantTeamRole), { success: "Invitation sent or access granted", invalidate: [["admin", "team"]] });
  const revoke = useAdminAction(useServerFn(revokeTeamRole), { success: "Access removed", invalidate: [["admin", "team"]] });

  if (!isAdmin) return <EmptyState title="Master admins only" sub="Ask a master admin to manage the team." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Admin team" sub="Master admins can do everything. Support members can view all data and handle the inbox, but can't approve payments or change shops." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          grant.mutate({ email, role }, { onSuccess: () => setEmail("") });
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-5"
      >
        <div className="min-w-[240px] flex-1 space-y-1.5">
          <label className="text-sm font-medium">Team member email</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="teammate@example.com" />
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="support">Support</SelectItem>
            <SelectItem value="admin">Master admin</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="hero" disabled={grant.isPending}>
          {grant.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Invite / grant access
        </Button>
        <p className="w-full text-xs text-muted-foreground">If the email has no account yet, BeBoss sends a secure invitation. Their selected role is ready when they accept it.</p>
      </form>
      {team.isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {(team.data?.members ?? []).map((m) => (
            <div key={`${m.userId}-${m.role}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">
                  {m.email} {m.userId === team.data?.me ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Since {formatDateTime(m.since)} • last sign-in {m.lastSignIn ? formatDateTime(m.lastSignIn) : "never"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.role === "admin" ? "brand" : "info"}>{m.role === "admin" ? "Master admin" : "Support"}</Badge>
                <ConfirmAction
                  trigger={
                    <Button size="icon" variant="ghost" aria-label="Remove access">
                      <UserX />
                    </Button>
                  }
                  title={`Remove ${m.role} access for ${m.email}?`}
                  description="They keep their account but lose access to the admin center immediately."
                  destructive
                  confirmLabel="Remove access"
                  onConfirm={() => revoke.mutate({ userId: m.userId, role: m.role })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
