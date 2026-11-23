import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmAction, EmptyState, FilterChips, LoadingBlock, PageHeader, SearchInput, StatusBadge, TableShell, downloadCsv, matches, useAdminAction } from "@/components/admin/ui";
import { useAdminCtx } from "@/hooks/use-admin-ctx";
import { deleteShopUser, updateShopUser } from "@/lib/admin.functions";
import { usersQuery } from "@/lib/admin-queries";
import { relativeTime } from "@/lib/format";
import { useAdminText } from "@/lib/admin-copy";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
});

type F = "ALL" | "OWNER" | "MANAGER" | "CASHIER" | "SUSPENDED";

function UsersPage() {
  const a = useAdminText();
  const { data, isLoading } = useQuery(usersQuery);
  const isAdmin = !!useAdminCtx().data?.isAdmin;
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>("ALL");
  const update = useAdminAction(useServerFn(updateShopUser), { success: "Staff account updated", invalidate: [["admin", "users"]] });
  const del = useAdminAction(useServerFn(deleteShopUser), { success: "Staff account removed", invalidate: [["admin", "users"]] });
  const all = data ?? [];
  const rows = all.filter((u) => (f === "ALL" ? true : f === "SUSPENDED" ? !u.is_active : u.role === f)).filter((u) => matches(q, u.full_name, u.username, u.phone, u.shop_name, u.assigned_branch_name));

  return (
    <div>
      <PageHeader
        title={a("Shop staff")}
        sub="Owners, managers and cashiers synced from every shop. PINs and passwords never leave the phones."
        actions={
          <Button size="sm" variant="glass" onClick={() => downloadCsv(`beboss-staff-${Date.now()}.csv`, rows)}>
            <Download /> {a("Export")}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder={a("Search name, @username, phone, shop, branch…")} />
        <FilterChips<F>
          value={f}
          onChange={setF}
          options={[
            { value: "ALL", label: "All", count: all.length },
            { value: "OWNER", label: "Owners", count: all.filter((u) => u.role === "OWNER").length },
            { value: "MANAGER", label: "Managers", count: all.filter((u) => u.role === "MANAGER").length },
            { value: "CASHIER", label: "Cashiers", count: all.filter((u) => u.role === "CASHIER").length },
            { value: "SUSPENDED", label: "Suspended", count: all.filter((u) => !u.is_active).length },
          ]}
        />
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <EmptyState title={a("No staff accounts")} />
      ) : (
        <TableShell>
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{a("Person")}</th>
                <th className="px-4 py-3">{a("Shop")}</th>
                <th className="px-4 py-3">{a("Branch")}</th>
                <th className="px-4 py-3">{a("Role")}</th>
                <th className="px-4 py-3">{a("Active")}</th>
                <th className="px-4 py-3">{a("Updated")}</th>
                {isAdmin ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{u.full_name || u.username}</p>
                    <p className="text-xs text-muted-foreground">
                      @{u.username} • {u.phone || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/admin/shops/$shopId" params={{ shopId: u.shop_sync_key }} className="hover:text-primary">
                      {u.shop_name || u.shop_sync_key}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{u.assigned_branch_name}</td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <Select value={u.role} onValueChange={(v) => update.mutate({ id: u.id, role: v })}>
                        <SelectTrigger className="h-8 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OWNER">{a("Owner")}</SelectItem>
                          <SelectItem value="MANAGER">{a("Manager")}</SelectItem>
                          <SelectItem value="CASHIER">{a("Cashier")}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      u.role
                    )}
                  </td>
                  <td className="px-4 py-3">{isAdmin ? <Switch checked={u.is_active} onCheckedChange={(v) => update.mutate({ id: u.id, isActive: v })} /> : <StatusBadge status={u.is_active ? "ACTIVE" : "SUSPENDED"} />}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{relativeTime(u.updated_at)}</td>
                  {isAdmin ? (
                    <td className="px-4 py-3 text-right">
                      <ConfirmAction
                        trigger={
                          <Button size="icon" variant="ghost" aria-label={a("Remove staff account")}>
                            <Trash2 />
                          </Button>
                        }
                        title={a("Remove staff account?")}
                        description={a("Removes this person from the cloud directory. The shop owner can re-add them from the app.")}
                        destructive
                        confirmLabel={a("Remove")}
                        onConfirm={() => del.mutate({ id: u.id })}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
    </div>
  );
}
