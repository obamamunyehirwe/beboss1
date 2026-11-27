import type React from "react";
import { useMemo, useState } from "react";
import { Check, Search, ShieldCheck, Users, UserCheck, UserX, SlidersHorizontal, RefreshCw, LockKeyhole, Info } from "lucide-react";
import { downloadCsv, errorText, rows, s } from "../../lib/format";
import type { CloudState, Row, Snapshot } from "../../lib/types";
import { Empty, Modal, PageHeading, StatCard, StatusPill } from "../ui";

type PermissionKey =
  | "canSellPOS" | "canApplyDiscounts" | "canManageInventory" | "canViewCostAndProfit"
  | "canViewAnalytics" | "canManageCustomers" | "canCollectDebt" | "canDeleteRecords"
  | "canExportReports" | "canManageCollaborators" | "canManageShopSettings" | "canExportImportData";

export type StaffPermissions = Record<PermissionKey, boolean>;
export type StaffUpdate = {
  userId: string; role: "MANAGER" | "CASHIER"; branchId: string; isActive: boolean;
  permissions?: StaffPermissions;
};

const PERMISSIONS: { key: PermissionKey; label: string; detail: string; group: string }[] = [
  { key: "canSellPOS", label: "Sell at POS", detail: "Create sales, complete checkout and issue receipts", group: "Sales & customers" },
  { key: "canApplyDiscounts", label: "Apply discounts", detail: "Apply approved discounts during checkout", group: "Sales & customers" },
  { key: "canManageCustomers", label: "Manage customers", detail: "Create and update customer accounts", group: "Sales & customers" },
  { key: "canCollectDebt", label: "Collect debt", detail: "Record customer credit repayments", group: "Sales & customers" },
  { key: "canManageInventory", label: "Manage inventory", detail: "Create products and manage stock levels", group: "Stock & reporting" },
  { key: "canViewCostAndProfit", label: "View cost and profit", detail: "View purchase costs, margins and profit figures", group: "Stock & reporting" },
  { key: "canViewAnalytics", label: "View analytics", detail: "Open business analytics and performance reports", group: "Stock & reporting" },
  { key: "canExportReports", label: "Export reports", detail: "Export permitted reports and summaries", group: "Stock & reporting" },
  { key: "canDeleteRecords", label: "Delete records", detail: "Delete records where the mobile app permits it", group: "Administration" },
  { key: "canManageCollaborators", label: "Manage collaborators", detail: "Manage staff identities and permissions", group: "Administration" },
  { key: "canManageShopSettings", label: "Manage shop settings", detail: "Change shop profile and operational settings", group: "Administration" },
  { key: "canExportImportData", label: "Export and import data", detail: "Run shop data export and import workflows", group: "Administration" }
];

const GROUPS = ["Sales & customers", "Stock & reporting", "Administration"] as const;

function defaultsForRole(role: string): StaffPermissions {
  return {
    canSellPOS: true,
    canApplyDiscounts: role === "MANAGER",
    canManageInventory: role === "MANAGER",
    canViewCostAndProfit: role === "MANAGER",
    canViewAnalytics: role === "MANAGER",
    canManageCustomers: true,
    canCollectDebt: role === "MANAGER",
    canDeleteRecords: false,
    canExportReports: role === "MANAGER",
    canManageCollaborators: false,
    canManageShopSettings: false,
    canExportImportData: false
  };
}

export function StaffPage({ cloud, snapshot, onSaveStaff, offline }: {
  cloud: CloudState; snapshot: Snapshot | null; onSaveStaff: (value: StaffUpdate) => Promise<void>; offline: boolean
}) {
  const [editing, setEditing] = useState<Row | null>(null);
  const [role, setRole] = useState<"MANAGER" | "CASHIER">("CASHIER");
  const [branchId, setBranchId] = useState("");
  const [active, setActive] = useState(true);
  const [permissions, setPermissions] = useState<StaffPermissions>(defaultsForRole("CASHIER"));
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "MANAGER" | "CASHIER">("ALL");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState<"KEEP" | "MANAGER" | "CASHIER">("KEEP");
  const [bulkBranch, setBulkBranch] = useState("__KEEP__");
  const [bulkState, setBulkState] = useState<"KEEP" | "ACTIVE" | "INACTIVE">("KEEP");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [bulkError, setBulkError] = useState("");

  const staff = rows(cloud.staff);
  const branches = rows(cloud.branches).filter((b) => b.is_active);
  const activeCount = staff.filter((u) => u.is_active !== false).length;
  const managerCount = staff.filter((u) => s(u.role).toUpperCase() === "MANAGER" && u.is_active !== false).length;
  const cashierCount = staff.filter((u) => s(u.role).toUpperCase() === "CASHIER" && u.is_active !== false).length;
  const filtered = useMemo(() => staff.filter((u) => {
    const text = [u.full_name, u.username, u.phone, u.role, u.assigned_branch_name].map((v) => s(v).toLowerCase()).join(" ");
    return (!search.trim() || text.includes(search.trim().toLowerCase())) &&
      (stateFilter === "ALL" || (stateFilter === "ACTIVE" ? u.is_active !== false : u.is_active === false)) &&
      (roleFilter === "ALL" || s(u.role).toUpperCase() === roleFilter);
  }), [staff, search, stateFilter, roleFilter]);

  const selectableFiltered = filtered.filter((user) => s(user.role).toUpperCase() !== "OWNER");
  const selectedStaff = staff.filter((user) => selectedIds.includes(s(user.user_id)) && s(user.role).toUpperCase() !== "OWNER");

  function toggleStaffSelection(userId: string, checked: boolean) {
    setSelectedIds((current) => checked
      ? Array.from(new Set([...current, userId]))
      : current.filter((id) => id !== userId));
  }

  function toggleFilteredSelection(checked: boolean) {
    const ids = selectableFiltered.map((user) => s(user.user_id));
    setSelectedIds((current) => checked
      ? Array.from(new Set([...current, ...ids]))
      : current.filter((id) => !ids.includes(id)));
  }

  function exportStaffDirectory() {
    const report = staff.map((user) => {
      const profile = rows(snapshot?.users).find((item) =>
        s(item.id) === s(user.user_id) || (s(user.username) && s(item.username).toLowerCase() === s(user.username).toLowerCase())
      );
      return {
        full_name: s(user.full_name), username: s(user.username), phone: s(user.phone),
        role: s(user.role), branch: s(user.assigned_branch_name) || "All branches",
        status: user.is_active === false ? "INACTIVE" : "ACTIVE",
        permissions_enabled: profile ? PERMISSIONS.filter((item) => profile[item.key] === true).length : "Not synchronized",
        last_updated: user.updated_at ? new Date(s(user.updated_at)).toLocaleString() : ""
      };
    });
    downloadCsv("BeBoss-Staff-Directory-" + new Date().toISOString().slice(0, 10) + ".csv",
      ["full_name", "username", "phone", "role", "branch", "status", "permissions_enabled", "last_updated"], report);
  }

  async function applyBulkAccess() {
    if (!selectedStaff.length) return;
    if (bulkRole === "KEEP" && bulkBranch === "__KEEP__" && bulkState === "KEEP") {
      setBulkError("Choose at least one bulk change before applying.");
      return;
    }
    const changes: string[] = [];
    if (bulkRole !== "KEEP") changes.push("role to " + bulkRole);
    if (bulkBranch !== "__KEEP__") changes.push("branch assignment");
    if (bulkState !== "KEEP") changes.push("account state to " + bulkState);
    const inactiveCount = bulkState === "INACTIVE" ? selectedStaff.filter((user) => user.is_active !== false).length : 0;
    const confirmation = "Apply " + changes.join(", ") + " to " + selectedStaff.length + " selected staff accounts?" +
      (inactiveCount ? "\\n\\n" + inactiveCount + " active accounts will be disabled. Existing sales history will remain unchanged." : "");
    if (!window.confirm(confirmation)) return;
    setBulkSaving(true);
    setBulkError("");
    setBulkProgress("Preparing " + selectedStaff.length + " staff updates…");
    const completed: string[] = [];
    try {
      for (let index = 0; index < selectedStaff.length; index++) {
        const user = selectedStaff[index];
        const nextRole = bulkRole === "KEEP" ? (s(user.role).toUpperCase() === "MANAGER" ? "MANAGER" : "CASHIER") : bulkRole;
        const nextBranch = bulkBranch === "__KEEP__" ? s(user.assigned_branch_id) : bulkBranch;
        const nextActive = bulkState === "KEEP" ? user.is_active !== false : bulkState === "ACTIVE";
        setBulkProgress("Updating " + (index + 1) + " of " + selectedStaff.length + " · " + (s(user.full_name) || s(user.username)));
        await onSaveStaff({ userId: s(user.user_id), role: nextRole, branchId: nextBranch, isActive: nextActive });
        completed.push(s(user.user_id));
      }
      setSelectedIds((current) => current.filter((id) => !completed.includes(id)));
      setBulkProgress("Successfully updated " + completed.length + " staff accounts in BeBoss Cloud.");
      setBulkRole("KEEP"); setBulkBranch("__KEEP__"); setBulkState("KEEP");
    } catch (error) {
      setSelectedIds((current) => current.filter((id) => completed.includes(id) ? false : true));
      setBulkError((error instanceof Error ? error.message : "A staff update failed.") +
        (completed.length ? " " + completed.length + " earlier updates were saved; the remaining selections are still selected for review." : ""));
      setBulkProgress("Stopped after " + completed.length + " successful update(s).");
    } finally { setBulkSaving(false); }
  }

  const editingProfile = editing ? rows(snapshot?.users).find((item) =>
    s(item.id) === s(editing.user_id) ||
    (s(item.username).toLowerCase() && s(item.username).toLowerCase() === s(editing.username).toLowerCase())
  ) ?? null : null;

  function open(user: Row) {
    const localProfile = rows(snapshot?.users).find((item) =>
      s(item.id) === s(user.user_id) ||
      (s(item.username).toLowerCase() && s(item.username).toLowerCase() === s(user.username).toLowerCase())
    ) ?? null;
    setEditing(user);
    const nextRole = s(user.role).toUpperCase() === "MANAGER" ? "MANAGER" : "CASHIER";
    setRole(nextRole);
    setBranchId(s(user.assigned_branch_id));
    setActive(user.is_active !== false);
    setPermissions(localProfile
      ? Object.fromEntries(PERMISSIONS.map((item) => [item.key, localProfile[item.key] === true])) as StaffPermissions
      : defaultsForRole(nextRole));
    setPermissionSearch("");
    setSaveError("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSaveStaff({
        userId: s(editing.user_id),
        role,
        branchId,
        isActive: active,
        ...(editingProfile ? { permissions } : {})
      });
      setEditing(null);
    } catch (error) { setSaveError(errorText(error)); }
    finally { setSaving(false); }
  }

  function setPermission(key: PermissionKey, value: boolean) {
    setPermissions((current) => ({ ...current, [key]: value }));
  }

  const visiblePermissions = PERMISSIONS.filter((permission) =>
    !permissionSearch.trim() ||
    permission.label.toLowerCase().includes(permissionSearch.toLowerCase()) ||
    permission.detail.toLowerCase().includes(permissionSearch.toLowerCase())
  );

  return <div className="page-stack">
    <PageHeading eyebrow="PEOPLE · IDENTITY · GOVERNANCE" title="Staff & access control"
      description="Manage staff roles, assigned branches, operating status and the same granular permissions synchronized by the Android app." />
    <div className="staff-security-note"><ShieldCheck size={18} /><span><strong>Credential isolation is active.</strong> Staff PINs and password hashes remain on the registered Android owner terminal. Desktop edits only synchronized access policy and cannot read or export credentials.</span><LockKeyhole size={17} /></div>
    <div className="stat-grid four">
      <StatCard label="Enrolled staff" value={staff.length.toLocaleString()} sub="Cloud-registered staff identities" icon={Users} tone="blue" />
      <StatCard label="Active accounts" value={activeCount.toLocaleString()} sub="Currently permitted to operate" icon={UserCheck} tone="green" />
      <StatCard label="Managers" value={managerCount.toLocaleString()} sub="Active manager accounts" icon={ShieldCheck} tone="purple" />
      <StatCard label="Cashiers" value={cashierCount.toLocaleString()} sub="Active cashier accounts" icon={UserX} tone="orange" />
    </div>
    <section className="panel staff-directory">
      <div className="staff-directory-toolbar">
        <div><span className="eyebrow muted">STAFF DIRECTORY</span><h3>Enrolled shop users</h3><p>Access changes are saved to the cloud staff registry and signed shared snapshot.</p></div>
        <div className="staff-directory-tools">
          <button className="btn-outline small" type="button" onClick={exportStaffDirectory}><Users size={13} /> Export CSV</button>
          <label className="staff-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, username or branch" /></label>
          <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)} aria-label="Filter staff by state">
            <option value="ALL">All states</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
          </select>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)} aria-label="Filter staff by role">
            <option value="ALL">All roles</option><option value="MANAGER">Managers</option><option value="CASHIER">Cashiers</option>
          </select>
        </div>
      </div>
      {selectedIds.length > 0 && <section className="staff-bulk-panel">
        <div className="staff-bulk-heading"><div><strong>{selectedStaff.length} selected staff accounts</strong><small>Bulk changes are submitted through the same owner-authorized cloud operation as individual edits.</small></div><button type="button" className="text-action" disabled={bulkSaving} onClick={() => setSelectedIds([])}>Clear selection</button></div>
        <div className="staff-bulk-controls">
          <label>Role<select value={bulkRole} disabled={bulkSaving} onChange={(event) => setBulkRole(event.target.value as typeof bulkRole)}><option value="KEEP">Keep current role</option><option value="MANAGER">Set Manager</option><option value="CASHIER">Set Cashier</option></select></label>
          <label>Branch<select value={bulkBranch} disabled={bulkSaving} onChange={(event) => setBulkBranch(event.target.value)}><option value="__KEEP__">Keep current branch</option><option value="">All branches</option>{branches.map((branch) => <option key={s(branch.id)} value={s(branch.id)}>{s(branch.name)}</option>)}</select></label>
          <label>Account state<select value={bulkState} disabled={bulkSaving} onChange={(event) => setBulkState(event.target.value as typeof bulkState)}><option value="KEEP">Keep current state</option><option value="ACTIVE">Activate</option><option value="INACTIVE">Deactivate</option></select></label>
          <button type="button" className="btn-primary" disabled={offline || bulkSaving || !selectedStaff.length} onClick={() => void applyBulkAccess()}>{bulkSaving ? "Applying…" : "Apply to selected"}</button>
        </div>
        {bulkProgress && <p className="staff-bulk-progress">{bulkProgress}</p>}
        {bulkError && <div className="inline-alert error">{bulkError}</div>}
      </section>}
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th><input type="checkbox" aria-label="Select all visible staff" checked={selectableFiltered.length > 0 && selectableFiltered.every((user) => selectedIds.includes(s(user.user_id)))} disabled={!selectableFiltered.length || offline || bulkSaving} onChange={(event) => toggleFilteredSelection(event.target.checked)} /></th><th>Staff member</th><th>Role</th><th>Branch</th><th>Permissions</th><th>Operating state</th><th></th></tr></thead><tbody>
        {filtered.map((user) => {
          const profile = rows(snapshot?.users).find((item) =>
            s(item.id) === s(user.user_id) ||
            (s(item.username).toLowerCase() && s(item.username).toLowerCase() === s(user.username).toLowerCase())
          );
          const permissionCount = profile ? PERMISSIONS.filter((item) => profile[item.key] === true).length : null;
          return <tr key={s(user.user_id)}>
            <td><input type="checkbox" aria-label={"Select " + (s(user.full_name) || s(user.username))} checked={selectedIds.includes(s(user.user_id))} disabled={offline || bulkSaving || s(user.role).toUpperCase() === "OWNER"} onChange={(event) => toggleStaffSelection(s(user.user_id), event.target.checked)} /></td>
            <td><div className="staff-person"><span>{s(user.full_name).slice(0,1).toUpperCase() || "•"}</span><strong>{s(user.full_name) || s(user.username)}</strong></div><small className="staff-username">@{s(user.username)}</small></td>
            <td><StatusPill value={s(user.role)} /></td>
            <td>{s(user.assigned_branch_name) || "All branches"}</td>
            <td>{permissionCount == null ? <span className="staff-permission-unavailable">Not synchronized</span> : <span className="staff-permission-count">{permissionCount} / 12 enabled</span>}</td>
            <td><StatusPill value={user.is_active === false ? "INACTIVE" : "ACTIVE"} /></td>
            <td><button className="btn-outline small" disabled={offline || saving || s(user.role).toUpperCase() === "OWNER"} onClick={() => open(user)}>Manage access</button></td>
          </tr>;
        })}
      </tbody></table></div>
      {!filtered.length && <Empty title={staff.length ? "No staff match these filters" : "No staff synchronized"} description={staff.length ? "Adjust your search or filters to see other staff accounts." : "Enroll staff on the registered Android owner terminal, where secure PIN and password enrollment is completed. Their account and permissions then synchronize here."} icon={Users} />}
    </section>
    {editing && <Modal title={"Manage " + (s(editing.full_name) || s(editing.username))} onClose={() => !saving && setEditing(null)}>
      <form className="staff-access-form" onSubmit={(event) => void save(event)}>
        <div className="staff-edit-identity"><span className="staff-profile-avatar">{s(editing.full_name).slice(0,1).toUpperCase() || "•"}</span><div><strong>{s(editing.full_name) || s(editing.username)}</strong><small>@{s(editing.username)} · {s(editing.phone) || "No phone listed"}</small></div><StatusPill value={active ? "ACTIVE" : "INACTIVE"} /></div>
        <div className="staff-basic-grid">
          <label>Role<select value={role} onChange={(event) => setRole(event.target.value as "MANAGER" | "CASHIER")}><option value="MANAGER">Manager</option><option value="CASHIER">Cashier</option></select></label>
          <label>Assigned branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">All branches</option>{branches.map((branch) => <option key={s(branch.id)} value={s(branch.id)}>{s(branch.name)}</option>)}</select></label>
        </div>
        <label className="staff-active-switch"><span><strong>Allow this account to operate</strong><small>Inactive staff cannot sign in to their BeBoss operator account.</small></span><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /></label>
        <div className="staff-permission-header"><div><span className="eyebrow muted">GRANULAR PERMISSIONS</span><h3>What this staff member can do</h3><p>Changes apply to the user's shared mobile permission record.</p></div><button type="button" className="btn-outline small" disabled={!editingProfile} onClick={() => setPermissions(defaultsForRole(role))}><RefreshCw size={13} /> Apply role defaults</button></div>
        {!editingProfile ? <div className="staff-permission-warning"><Info size={16} /><span>This staff profile is not present in the latest signed mobile snapshot. Role, branch and active status can still be managed, but the permission matrix is locked until the owner terminal synchronizes the staff record.</span></div> : <>
          <label className="staff-search permission-search"><Search size={14} /><input value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="Find a permission" /></label>
          {GROUPS.map((group) => {
            const items = visiblePermissions.filter((permission) => permission.group === group);
            if (!items.length) return null;
            return <section className="staff-permission-group" key={group}><h4>{group}</h4>
              <div className="staff-permission-grid">{items.map((permission) => <label className="staff-permission-row" key={permission.key}>
                <span><strong>{permission.label}</strong><small>{permission.detail}</small></span>
                <input type="checkbox" checked={permissions[permission.key]} onChange={(event) => setPermission(permission.key, event.target.checked)} />
              </label>)}</div>
            </section>;
          })}
          <div className="staff-permission-summary"><SlidersHorizontal size={15} /><span>{PERMISSIONS.filter((item) => permissions[item.key]).length} of 12 permissions enabled</span></div>
        </>}
        <p className="staff-credential-note"><LockKeyhole size={14} /> PIN and password enrollment or reset must be performed on the registered Android owner terminal. Desktop never exports credential hashes.</p>
        {saveError && <div className="inline-alert error">{saveError}</div>}
        <div className="modal-actions"><button type="button" className="btn-outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</button><button className="btn-primary" disabled={saving || offline}>{saving ? <RefreshCw size={15} className="spin" /> : <Check size={15} />} Save access policy</button></div>
      </form>
    </Modal>}
  </div>;
}
