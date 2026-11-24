import type React from "react";
import { useState } from "react";
import { Activity, ArrowRight, Plus, Truck, X } from "lucide-react";
import { activeProducts, dateTime, errorText, id, n, rows, s } from "../../lib/format";
import type { CloudAction, CloudState, Row, Snapshot } from "../../lib/types";
import { Empty, Modal, PageHeading, StatusPill } from "../ui";

export function TransfersPage({ cloud, snapshot, onAction, offline }: { cloud: CloudState; snapshot: Snapshot | null; onAction: CloudAction; offline: boolean }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ productId: "", fromBranchId: "", toBranchId: "", quantity: "1", notes: "" });
  const transfers = rows(cloud.transfers);
  const products = activeProducts(snapshot);
  const branches = rows(cloud.branches).filter((b) => b.is_active);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const p = products.find((x) => s(x.id) === form.productId);
    const from = branches.find((x) => s(x.id) === form.fromBranchId);
    const to = branches.find((x) => s(x.id) === form.toBranchId);
    if (!p || !from || !to || n(form.quantity) <= 0) throw new Error("Choose a product, source/destination branches and quantity.");
    const result = await onAction("transfer_create", { id: id(), productId: form.productId, fromBranchId: form.fromBranchId, toBranchId: form.toBranchId, quantity: n(form.quantity), notes: form.notes });
    setOpen(false); setForm({ productId: "", fromBranchId: "", toBranchId: "", quantity: "1", notes: "" });
    alert("Transfer " + s(result.transferNumber) + " has been sent to paired BeBoss terminals for stock validation.");
  }
  async function command(t: Row, cmd: string) {
    await onAction("transfer_command", { id: s(t.id), command: cmd });
  }
  return <div className="page-stack"><PageHeading title="Inter-branch stock transfers" description="Request branch-to-branch stock movement and track mobile terminal validation and destination receipt." action={<button className="btn-primary" disabled={offline || !products.length || branches.length < 2} onClick={() => setOpen(true)}><Plus size={17} /> New transfer</button>} />
    <div className="info-note"><Activity size={17} /> Transfers requested from desktop are cloud commands. A paired Android terminal validates source stock and processes the movement; the destination terminal confirms receipt.</div>
    <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Transfer</th><th>Product</th><th>Route</th><th>Quantity</th><th>Requested</th><th>Status</th><th></th></tr></thead><tbody>
      {transfers.map((t) => <tr key={s(t.id)}><td className="mono">{s(t.transfer_number)}</td><td><strong>{s(t.product_name)}</strong></td><td>{s(t.from_branch_name)} <ArrowRight size={13} /> {s(t.to_branch_name)}</td><td>{n(t.quantity)} {s(t.unit) || "pcs"}</td><td>{dateTime(t.transfer_date)}</td><td><StatusPill value={s(t.status)} /></td><td>{t.status === "IN_TRANSIT" ? <div className="row-actions"><button className="btn-outline small" disabled={offline} onClick={() => command(t, "RECEIPT").catch((e) => alert(errorText(e)))}>Request receipt</button><button className="icon-btn danger-icon" disabled={offline} title="Request cancellation" onClick={() => command(t, "CANCEL").catch((e) => alert(errorText(e)))}><X size={15} /></button></div> : <span className="muted small-text">Mobile processing</span>}</td></tr>)}
    </tbody></table></div>{!transfers.length && <Empty title="No stock transfers" description="Create a transfer request between two active branches." icon={Truck} />}</div>
    {open && <Modal title="Create transfer request" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={(e) => create(e).catch((x) => alert(errorText(x)))}><label className="field-wide">Product<select required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">Select product</option>{products.map((p) => <option key={s(p.id)} value={s(p.id)}>{s(p.name)} · {n(p.quantityInStock)} {s(p.unit)}</option>)}</select></label><label>From branch<select required value={form.fromBranchId} onChange={(e) => setForm({ ...form, fromBranchId: e.target.value })}><option value="">Source</option>{branches.map((b) => <option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label><label>To branch<select required value={form.toBranchId} onChange={(e) => setForm({ ...form, toBranchId: e.target.value })}><option value="">Destination</option>{branches.map((b) => <option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label><label>Quantity<input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label><label className="field-wide">Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary"><Truck size={16} /> Submit transfer</button></div></form></Modal>}
  </div>;
}