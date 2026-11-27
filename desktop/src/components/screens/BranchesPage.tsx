import type React from "react";
import { useMemo, useState } from "react";
import { Activity, Building2, Check, MapPin, Pencil, Plus, Search, Store, Trash2, Users, Warehouse } from "lucide-react";
import { downloadCsv, errorText, id, money, n, rows, s } from "../../lib/format";
import type { CloudAction, CloudState, Row, Snapshot } from "../../lib/types";
import { Empty, Modal, PageHeading, StatCard, StatusPill } from "../ui";

type BranchDraft = {
  name: string; code: string; address: string; phone: string; managerUserId: string;
  isMainBranch: boolean; operationalStatus: string; dailySalesTargetRwf: string;
  monthlyTargetRwf: string; openingCashFloat: string; email: string; notes: string;
};
const emptyDraft: BranchDraft = {
  name: "", code: "", address: "", phone: "", managerUserId: "", isMainBranch: false,
  operationalStatus: "OPEN", dailySalesTargetRwf: "0", monthlyTargetRwf: "0",
  openingCashFloat: "0", email: "", notes: ""
};

type BranchFilter = "ALL" | "OPEN" | "CLOSED" | "SUSPENDED" | "INACTIVE";

export function BranchesPage({ cloud, snapshot, onAction, onRefresh, offline }: {
  cloud: CloudState; snapshot: Snapshot | null; onAction: CloudAction;
  onRefresh: () => Promise<void> | void; offline: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState<BranchDraft>(emptyDraft);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BranchFilter>("ALL");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");

  const list = rows(cloud.branches);
  const managers = rows(cloud.staff).filter((user) =>
    user.is_active !== false && s(user.role).toUpperCase() === "MANAGER"
  );

  const salesByBranch = useMemo(() => {
    const result = new Map<string, { count: number; total: number }>();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    for (const sale of rows(snapshot?.sales)) {
      const branchId = s(sale.branchId || sale.branch_id);
      if (!branchId || n(sale.saleDate) < monthStart.getTime()) continue;
      const current = result.get(branchId) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += n(sale.totalAmount ?? sale.total_amount ?? sale.total);
      result.set(branchId, current);
    }
    return result;
  }, [snapshot?.sales]);

  const activeCount = list.filter((branch) =>
    branch.is_active !== false && s(branch.operational_status).toUpperCase() === "OPEN"
  ).length;
  const totalStock = list.reduce((sum, branch) => sum + n(branch.stock_value_rwf), 0);
  const networkRevenue = Array.from(salesByBranch.values()).reduce((sum, item) => sum + item.total, 0);
  const managedStaff = rows(cloud.staff).filter((user) => user.is_active !== false).length;
  const filtered = useMemo(() => list.filter((branch) => {
    const status = s(branch.operational_status || "OPEN").toUpperCase();
    const isActive = branch.is_active !== false;
    const searchable = [branch.name, branch.code, branch.address, branch.phone, branch.manager_name, branch.email]
      .map((value) => s(value).toLowerCase()).join(" ");
    const matchesQuery = !query.trim() || searchable.includes(query.trim().toLowerCase());
    const matchesFilter =
      filter === "ALL" ||
      (filter === "INACTIVE" ? !isActive : isActive && status === filter);
    return matchesQuery && matchesFilter;
  }), [list, query, filter]);

  function exportBranchNetwork() {
    const exported = list.map((branch) => {
      const branchId = s(branch.id);
      const metrics = salesByBranch.get(branchId) ?? { count: 0, total: 0 };
      const assignedStaff = rows(cloud.staff).filter((user) => user.is_active !== false && s(user.assigned_branch_id) === branchId);
      const assignedDevices = rows(cloud.devices).filter((device) => device.is_active && s(device.branch_id) === branchId);
      const monthlyTarget = n(branch.monthly_target_rwf);
      return {
        branch_name: s(branch.name), branch_code: s(branch.code), main_branch: branch.is_main_branch === true,
        active: branch.is_active !== false, operating_status: s(branch.operational_status || "OPEN"),
        manager: s(branch.manager_name), manager_user_id: s(branch.manager_user_id),
        address: s(branch.address), phone: s(branch.phone), email: s(branch.email),
        staff_count: assignedStaff.length, active_device_count: assignedDevices.length,
        sales_this_month: Math.round(metrics.total), transactions_this_month: metrics.count,
        monthly_target_rwf: monthlyTarget,
        target_progress_percent: monthlyTarget > 0 ? Number((metrics.total / monthlyTarget * 100).toFixed(1)) : "",
        stock_value_rwf: n(branch.stock_value_rwf), product_count: n(branch.product_count),
        daily_target_rwf: n(branch.daily_sales_target_rwf), opening_cash_float_rwf: n(branch.opening_cash_float),
        notes: s(branch.notes)
      };
    });
    downloadCsv("BeBoss-Branch-Network-" + new Date().toISOString().slice(0,10) + ".csv",
      ["branch_name","branch_code","main_branch","active","operating_status","manager","manager_user_id","address","phone","email","staff_count","active_device_count","sales_this_month","transactions_this_month","monthly_target_rwf","target_progress_percent","stock_value_rwf","product_count","daily_target_rwf","opening_cash_float_rwf","notes"],
      exported);
  }

  function start(branch?: Row) {
    setEditing(branch ?? null);
    setFormError("");
    setDraft(branch ? {
      name: s(branch.name), code: s(branch.code), address: s(branch.address), phone: s(branch.phone),
      managerUserId: s(branch.manager_user_id), isMainBranch: branch.is_main_branch === true,
      operationalStatus: s(branch.operational_status) || "OPEN",
      dailySalesTargetRwf: String(branch.daily_sales_target_rwf ?? 0),
      monthlyTargetRwf: String(branch.monthly_target_rwf ?? 0),
      openingCashFloat: String(branch.opening_cash_float ?? 0),
      email: s(branch.email), notes: s(branch.notes)
    } : { ...emptyDraft });
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (draft.name.trim().length < 2) throw new Error("Branch name must contain at least two characters.");
      const manager = managers.find((user) => s(user.user_id) === draft.managerUserId);
      await onAction("branch_upsert", { branch: {
        id: editing ? s(editing.id) : id(),
        name: draft.name.trim(), code: draft.code.trim(), address: draft.address.trim(),
        phone: draft.phone.trim(), managerUserId: draft.managerUserId,
        managerName: manager ? s(manager.full_name) : "",
        isMainBranch: draft.isMainBranch, operationalStatus: draft.operationalStatus,
        dailySalesTargetRwf: Math.max(0, n(draft.dailySalesTargetRwf)),
        monthlyTargetRwf: Math.max(0, n(draft.monthlyTargetRwf)),
        openingCashFloat: Math.max(0, n(draft.openingCashFloat)),
        email: draft.email.trim(), notes: draft.notes.trim(),
        colorHex: s(editing?.color_hex) || "#FF6B1A",
        stockValueRwf: n(editing?.stock_value_rwf), productCount: n(editing?.product_count)
      } });
      setOpen(false);
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(branch: Row) {
    if (branch.is_main_branch) return;
    const confirmed = confirm(
      "Deactivate " + s(branch.name) + "? Existing sales and stock history will remain. Move active staff and devices to another branch first."
    );
    if (!confirmed) return;
    setActionError("");
    try {
      await onAction("branch_delete", { id: s(branch.id) });
    } catch (error) {
      setActionError(errorText(error));
    }
  }

  async function refresh() {
    setRefreshing(true);
    setActionError("");
    try { await onRefresh(); }
    catch (error) { setActionError(errorText(error)); }
    finally { setRefreshing(false); }
  }

  return <div className="page-stack enterprise-branch-page">
    <PageHeading eyebrow="ORGANIZATION · MULTI-LOCATION CONTROL" title="Branch management"
      description="Operate every store location from one owner workspace. Manage branch leaders, targets, operating states and cloud-shared performance."
      action={<div className="enterprise-page-actions">\n        <button className="btn-outline" type="button" onClick={exportBranchNetwork}><Activity size={15} /> Export network</button>
        <button className="btn-outline" disabled={offline || refreshing} onClick={() => void refresh()}><Activity size={15} className={refreshing ? "spin" : ""} /> Refresh cloud</button>
        <button className="btn-primary" disabled={offline} onClick={() => start()}><Plus size={17} /> Add branch</button>
      </div>} />

    <div className="stat-grid four">
      <StatCard label="Registered branches" value={list.length.toLocaleString()} sub="Cloud-managed locations" icon={Building2} />
      <StatCard label="Open locations" value={activeCount.toLocaleString()} sub="Active and accepting operations" icon={Check} tone="green" />
      <StatCard label="Network stock value" value={money(totalStock)} sub="Latest branch stock snapshots" icon={Warehouse} tone="purple" />
      <StatCard label="Mapped sales" value={money(networkRevenue)} sub={salesByBranch.size + " branches with sales this month"} icon={Activity} tone="orange" />
    </div>

    <section className="enterprise-branch-toolbar panel">
      <div className="enterprise-toolbar-copy"><span className="eyebrow muted">LOCATION DIRECTORY</span><h3>Store network</h3><p>{managedStaff} active staff identities · {rows(cloud.devices).filter((device) => device.is_active).length} active terminals across the shop</p></div>
      <div className="enterprise-toolbar-controls">
        <label className="enterprise-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branch, manager, code or address" /></label>
        <select aria-label="Filter branches by status" value={filter} onChange={(event) => setFilter(event.target.value as BranchFilter)}>
          <option value="ALL">All branches</option><option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option><option value="SUSPENDED">Suspended</option>
          <option value="INACTIVE">Deactivated</option>
        </select>
      </div>
      <div className="enterprise-toolbar-foot"><span>Showing {filtered.length} of {list.length} locations</span><span>Branch records synchronize through the protected management API</span></div>
    </section>

    {actionError && <div className="inline-alert error">{actionError}</div>}

    <div className="enterprise-branch-grid">
      {filtered.map((branch) => {
        const branchId = s(branch.id);
        const metrics = salesByBranch.get(branchId) ?? { count: 0, total: 0 };
        const staffCount = rows(cloud.staff).filter((user) => user.is_active !== false && s(user.assigned_branch_id) === branchId).length;
        const deviceCount = rows(cloud.devices).filter((device) => device.is_active && s(device.branch_id) === branchId).length;
        const target = n(branch.monthly_target_rwf);
        const progress = target > 0 ? Math.min(100, (metrics.total / target) * 100) : 0;
        const status = s(branch.operational_status || "OPEN").toUpperCase();
        const statusLabel = branch.is_active === false ? "INACTIVE" : status;
        return <article className="enterprise-branch-card" key={branchId}>
          <div className="enterprise-branch-top">
            <span className="enterprise-branch-symbol"><Store size={19} /></span>
            <div className="enterprise-branch-badges">
              {branch.is_main_branch && <span className="enterprise-main-badge">Main branch</span>}
              <StatusPill value={statusLabel} />
            </div>
          </div>
          <div className="enterprise-branch-heading">
            <div><h3>{s(branch.name) || "Unnamed branch"}</h3><span className="mono">{s(branch.code) || "No branch code"}</span></div>
            <span className="enterprise-branch-id">{branchId.slice(0, 8)}</span>
          </div>
          <p className="enterprise-branch-address"><MapPin size={14} />{s(branch.address) || "No address recorded"}</p>
          <div className="enterprise-branch-kpis">
            <div><span>Sales this month</span><strong>{money(metrics.total)}</strong><small>{metrics.count.toLocaleString()} transactions this month</small></div>
            <div><span>Stock value</span><strong>{money(branch.stock_value_rwf)}</strong><small>{n(branch.product_count).toLocaleString()} products reported</small></div>
          </div>
          <div className="enterprise-branch-target">
            <div><span>Monthly target</span><strong>{target > 0 ? money(target) : "Not set"}</strong></div>
            {target > 0 && <><div className="enterprise-progress"><span style={{ width: progress + "%" }} /></div><small>{progress.toFixed(1)}% of target reached this month</small></>}
          </div>
          <div className="enterprise-branch-people">
            <span><Users size={14} />{staffCount} staff</span><span><Warehouse size={14} />{deviceCount} terminals</span>
            <span className="enterprise-branch-manager">{s(branch.manager_name) || "Manager not assigned"}</span>
          </div>
          <div className="enterprise-branch-contact">
            <span>{s(branch.phone) || "No phone"}{s(branch.email) ? " · " + s(branch.email) : ""}</span>
            <span>Daily target {money(branch.daily_sales_target_rwf)}</span>
          </div>
          {s(branch.notes) && <p className="enterprise-branch-notes">{s(branch.notes)}</p>}
          <div className="enterprise-branch-actions">
            <button className="btn-outline small" disabled={offline} onClick={() => start(branch)}><Pencil size={14} /> Edit branch</button>
            {!branch.is_main_branch && <button className="btn-outline small danger" disabled={offline || branch.is_active === false} onClick={() => void deactivate(branch)}><Trash2 size={14} /> Deactivate</button>}
          </div>
        </article>;
      })}
    </div>

    {!filtered.length && <Empty title={list.length ? "No branches match this view" : "No branches synchronized"} description={list.length ? "Change the search term or operating-state filter to see other branches." : "Create a branch from this owner workspace or refresh after the Android owner terminal synchronizes its branch registry."} icon={Building2} />}

    {open && <Modal title={editing ? "Edit branch profile" : "Create a branch"} onClose={() => !saving && setOpen(false)}>
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        <label className="field-wide">Branch name<input required minLength={2} maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Downtown Store" /></label>
        <label>Branch code<input maxLength={40} value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="BR-02" /></label>
        <label>Branch manager<select value={draft.managerUserId} onChange={(event) => setDraft({ ...draft, managerUserId: event.target.value })}><option value="">No manager assigned</option>{managers.map((manager) => <option key={s(manager.user_id)} value={s(manager.user_id)}>{s(manager.full_name)} · @{s(manager.username)}</option>)}</select></label>
        <label>Business phone<input maxLength={40} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
        <label>Branch email<input type="email" maxLength={120} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
        <label className="field-wide">Physical address<input maxLength={240} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
        <label>Operating state<select value={draft.operationalStatus} onChange={(event) => setDraft({ ...draft, operationalStatus: event.target.value })}>{["OPEN", "CLOSED", "SUSPENDED"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Daily sales target (FRw)<input type="number" min="0" max="1000000000" value={draft.dailySalesTargetRwf} onChange={(event) => setDraft({ ...draft, dailySalesTargetRwf: event.target.value })} /></label>
        <label>Monthly sales target (FRw)<input type="number" min="0" max="1000000000" value={draft.monthlyTargetRwf} onChange={(event) => setDraft({ ...draft, monthlyTargetRwf: event.target.value })} /></label>
        <label>Opening cash float (FRw)<input type="number" min="0" max="1000000000" value={draft.openingCashFloat} onChange={(event) => setDraft({ ...draft, openingCashFloat: event.target.value })} /></label>
        <label className="checkbox-field field-wide"><input type="checkbox" checked={draft.isMainBranch} onChange={(event) => setDraft({ ...draft, isMainBranch: event.target.checked })} /> Set as the main branch (replaces the current main designation)</label>
        <label className="field-wide">Operating notes<textarea rows={3} maxLength={1000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Opening hours, location instructions or branch-specific procedures" /></label>
        {formError && <div className="inline-alert error field-wide">{formError}</div>}
        <div className="modal-actions field-wide"><button type="button" className="btn-outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={saving || offline}>{saving ? "Saving..." : <><Check size={16} />{editing ? "Save changes" : "Create branch"}</>}</button></div>
      </form>
    </Modal>}
  </div>;
}