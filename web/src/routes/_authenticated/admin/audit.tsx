import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingBlock, PageHeader, SearchInput, StatusBadge, TableShell, downloadCsv, matches } from "@/components/admin/ui";
import { auditQuery } from "@/lib/admin-queries";
import { formatDateTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const a = useAdminText();
  const { data, isLoading } = useQuery(auditQuery);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("ALL");
  const actions = useMemo(() => Array.from(new Set((data ?? []).map((a) => a.action))).sort(), [data]);
  const rows = (data ?? []).filter((a) => (action === "ALL" || a.action === action) && matches(q, a.admin_email, a.action, a.target_id, a.details));
  return (
    <div>
      <PageHeader
        title={a("Audit log")}
        sub="Every admin action — from the web admin center and the in-app master console — recorded with who, what and when."
        actions={
          <Button size="sm" variant="glass" onClick={() => downloadCsv(`beboss-audit-${Date.now()}.csv`, rows.map((r) => ({ ...r, created_at_iso: new Date(r.created_at).toISOString() })))}>
            <Download /> {a("Export")}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search admin, target, details…" />
        <select value={action} onChange={(e) => setAction(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="ALL">{a("All actions")}</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <EmptyState title={a("No audit entries")} />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{a("When")}</th>
                <th className="px-4 py-3">{a("Action")}</th>
                <th className="px-4 py-3">{a("Target")}</th>
                <th className="px-4 py-3">{a("Details")}</th>
                <th className="px-4 py-3">{a("Admin")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a) => (
                <tr key={a.id} className="align-top hover:bg-accent/40">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDateTime(a.created_at)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.action} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{a.target_id}</td>
                  <td className="max-w-md px-4 py-3 text-xs text-muted-foreground">{a.details}</td>
                  <td className="px-4 py-3 text-xs">{a.admin_email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  );
}
