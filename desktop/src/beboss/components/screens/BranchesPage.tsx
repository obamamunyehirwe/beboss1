import type React from "react";
import { useState } from "react";
import { Building2, Check, Pencil, Plus, Store, Trash2, Warehouse } from "lucide-react";
import { errorText, id, money, n, rows, s } from "../../lib/format";
import type { CloudAction, CloudState, Row } from "../../lib/types";
import { Empty, Modal, PageHeading, StatCard, StatusPill } from "../ui";

export function BranchesPage({ cloud, onAction, offline }: { cloud: CloudState; onAction: CloudAction; offline: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState({ name: "", code: "", address: "", phone: "", managerName: "", isMainBranch: false, operationalStatus: "OPEN", dailySalesTargetRwf: "0", monthlyTargetRwf: "0", openingCashFloat: "0", email: "", notes: "" });
  const list = rows(cloud.branches);
  function start(branch?: Row) {
    setEditing(branch ?? null);
    setDraft({
      name: s(branch?.name), code: s(branch?.code), address: s(branch?.address), phone: s(branch?.phone), managerName: s(branch?.manager_name),
      isMainBranch: branch?.is_main_branch === true, operationalStatus: s(branch?.operational_status) || "OPEN",
      dailySalesTargetRwf: String(branch?.daily_sales_target_rwf ?? 0), monthlyTargetRwf: String(branch?.monthly_target_rwf ?? 0),
      openingCashFloat: String(branch?.opening_cash_float ?? 0), email: s(branch?.email), notes: s(branch?.notes)
    });
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    await onAction("branch_upsert", { branch: {
      id: editing ? s(editing.id) : id(), name: draft.name, code: draft.code, address: draft.address, phone: draft.phone, managerName: draft.managerName,
      isMainBranch: draft.isMainBranch, operationalStatus: draft.operationalStatus, dailySalesTargetRwf: n(draft.dailySalesTargetRwf),
      monthlyTargetRwf: n(draft.monthlyTargetRwf), openingCashFloat: n(draft.openingCashFloat), email: draft.email, notes: draft.notes,
      colorHex: s(editing?.color_hex) || "#FF6B1A", stockValueRwf: n(editing?.stock_value_rwf), productCount: n(editing?.product_count)
    } });
    setOpen(false);
  }
  async function deactivate(branch: Row) {
    if (!confirm("Deactivate branch " + s(branch.name) + "? Existing records remain in the shop history.")) return;
    await onAction("branch_delete", { id: s(branch.id) });
  }
  return <div className="page-stack"><PageHeading title="Branch management" description="Manage branch identity, daily and monthly targets, operational state and store details." action={<button className="btn-primary" disabled={offline} onClick={() => start()}><Plus size={17} /> Add branch</button>} />
    <div className="stat-grid three"><StatCard label="Branches" value={String(list.length)} icon={Building2} /><StatCard label="Operational" value={String(list.filter((b) => b.is_active && b.operational_status === "OPEN").length)} icon={Check} tone="green" /><StatCard label="Branch stock value" value={money(list.reduce((sum, b) => sum + n(b.stock_value_rwf), 0))} icon={Warehouse} tone="purple" /></div>
    <div className="branch-grid">{list.map((b) => <article className="branch-card" key={s(b.id)}><div className="branch-card-top"><span className="branch-symbol"><Store size={20} /></span><StatusPill value={s(b.operational_status) || "OPEN"} /></div><h3>{s(b.name)}</h3><span className="mono muted">{s(b.code) || "No branch code"}</span><p>{s(b.address) || "No address saved"}</p><div className="branch-metrics"><div><small>Daily target</small><strong>{money(b.daily_sales_target_rwf)}</strong></div><div><small>Stock value</small><strong>{money(b.stock_value_rwf)}</strong></div></div><div className="branch-card-foot"><span>{b.is_main_branch ? "Main branch" : s(b.manager_name) || "No manager"}</span><div><button className="icon-btn" disabled={offline} onClick={() => start(b)}><Pencil size={15} /></button>{!b.is_main_branch && <button className="icon-btn danger-icon" disabled={offline} onClick={() => deactivate(b)}><Trash2 size={15} /></button>}</div></div></article>)}</div>
    {!list.length && <Empty title="No branches in cloud" description="Create a branch or sync the Android owner terminal to load existing branches." icon={Building2} />}
    {open && <Modal title={editing ? "Edit branch" : "Create branch"} onClose={() => setOpen(false)}><form className="form-grid" onSubmit={(e) => save(e).catch((x) => alert(errorText(x)))}><label className="field-wide">Branch name<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label>Branch code<input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></label><label>Manager name<input value={draft.managerName} onChange={(e) => setDraft({ ...draft, managerName: e.target.value })} /></label><label>Phone<input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label><label>Email<input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label><label className="field-wide">Address<input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label><label>Operating status<select value={draft.operationalStatus} onChange={(e) => setDraft({ ...draft, operationalStatus: e.target.value })}>{["OPEN", "CLOSED", "SUSPENDED"].map((v) => <option key={v}>{v}</option>)}</select></label><label>Daily sales target<input type="number" min="0" value={draft.dailySalesTargetRwf} onChange={(e) => setDraft({ ...draft, dailySalesTargetRwf: e.target.value })} /></label><label>Monthly sales target<input type="number" min="0" value={draft.monthlyTargetRwf} onChange={(e) => setDraft({ ...draft, monthlyTargetRwf: e.target.value })} /></label><label>Opening float<input type="number" min="0" value={draft.openingCashFloat} onChange={(e) => setDraft({ ...draft, openingCashFloat: e.target.value })} /></label><label className="field-wide">Operational notes<input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label><label className="checkbox-field field-wide"><input type="checkbox" checked={draft.isMainBranch} onChange={(e) => setDraft({ ...draft, isMainBranch: e.target.checked })} /> Set as main branch</label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary"><Check size={16} />{editing ? "Save branch" : "Create branch"}</button></div></form></Modal>}
  </div>;
}