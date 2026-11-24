import type React from "react";
import { useState } from "react";
import { AlertTriangle, Check, Download, Plus, Users, Wallet } from "lucide-react";
import { activeCustomers, dateOnly, downloadCsv, errorText, id, money, n, s } from "../../lib/format";
import type { CommitSnapshot, Row, Snapshot } from "../../lib/types";
import { Empty, Modal, PageHeading, StatCard } from "../ui";

export function CustomersPage({ snapshot, onCommit, offline, query }: {
  snapshot: Snapshot | null; onCommit: CommitSnapshot; offline: boolean; query: string
}) {
  const [open, setOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<Row | null>(null);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", address: "", creditLimit: "500000", notes: "" });
  const [payment, setPayment] = useState({ amount: "", method: "Cash", notes: "" });
  const list = activeCustomers(snapshot).filter((c) => [c.name, c.phone, c.email].some((v) => s(v).toLowerCase().includes(query.toLowerCase())));
  function openCustomer(c?: Row) {
    setDraft({ name: s(c?.name), phone: s(c?.phone), email: s(c?.email), address: s(c?.address), creditLimit: String(c?.creditLimit ?? 500000), notes: s(c?.notes) });
    setOpen(true);
  }
  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) throw new Error("Customer name is required.");
    const now = Date.now();
    const customer = {
      id: id(), name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim(), address: draft.address.trim(),
      city: "", taxIdOrNin: "", category: "Regular Customer", creditLimit: Math.max(0, n(draft.creditLimit)), notes: draft.notes.trim(),
      debtBalance: 0, isDeleted: false, createdAt: now, updatedAt: now, syncVersion: 1, hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP"
    };
    await onCommit((next) => next.customers.unshift(customer));
    setOpen(false);
  }
  async function collect(e: React.FormEvent) {
    e.preventDefault();
    const target = paymentTarget!;
    const amount = n(payment.amount);
    if (amount <= 0 || amount > n(target.debtBalance)) throw new Error("Enter a payment greater than zero and no larger than the outstanding debt.");
    const now = Date.now();
    await onCommit((next) => {
      const c = next.customers.find((row) => s(row.id) === s(target.id));
      if (!c) throw new Error("The customer record changed. Refresh and retry.");
      const previous = n(c.debtBalance);
      c.debtBalance = Math.max(0, previous - amount); c.updatedAt = now; c.hlcTimestamp = 0; c.syncVersion = n(c.syncVersion) + 1; c.lastModifiedDeviceId = "DESKTOP";
      next.customerPayments.unshift({ id: id(), customerId: s(c.id), customerName: s(c.name), amount, previousDebt: previous, remainingDebt: c.debtBalance,
        paymentMethod: payment.method, notes: payment.notes.trim(), receiptNumber: "PAY-" + now.toString().slice(-8), paymentDate: now,
        recordedBy: "Desktop Owner", branchId: "main_branch", branchName: "Main Branch" });
    });
    setPaymentTarget(null); setPayment({ amount: "", method: "Cash", notes: "" });
  }

  return <div className="page-stack"><PageHeading title="Customers & credit" description="Manage customer contacts, credit limits, receivables and payment collection." action={<div className="heading-actions"><button className="btn-outline" onClick={() => downloadCsv("beboss-customers-" + Date.now() + ".csv", ["id", "name", "phone", "email", "address", "category", "creditLimit", "debtBalance", "notes"], list)}><Download size={15} /> Export CSV</button><button className="btn-primary" onClick={() => openCustomer()}><Plus size={17} /> Add customer</button></div>} />
    <div className="stat-grid three"><StatCard label="Customers" value={list.length.toLocaleString()} icon={Users} /><StatCard label="Outstanding credit" value={money(list.reduce((sum, c) => sum + n(c.debtBalance), 0))} icon={Wallet} tone="orange" /><StatCard label="Over credit limit" value={String(list.filter((c) => n(c.creditLimit) > 0 && n(c.debtBalance) > n(c.creditLimit)).length)} icon={AlertTriangle} tone="red" /></div>
    <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Credit limit</th><th>Outstanding</th><th>Utilization</th><th>Last updated</th><th></th></tr></thead><tbody>
      {list.map((c) => { const due = n(c.debtBalance), limit = n(c.creditLimit); return <tr key={s(c.id)}><td><strong>{s(c.name)}</strong><small className="cell-sub">{s(c.email)}</small></td><td>{s(c.phone) || "—"}</td><td>{money(limit)}</td><td className="strong">{money(due)}</td><td><div className="util-bar"><span style={{ width: (limit > 0 ? Math.min(100, due / limit * 100) : 0) + "%" }} /></div><small>{limit > 0 ? Math.round(due / limit * 100) + "%" : "No credit limit"}</small></td><td>{dateOnly(c.updatedAt)}</td><td>{due > 0 && <button className="btn-outline small" onClick={() => setPaymentTarget(c)}>Collect</button>}</td></tr>; })}
    </tbody></table></div>{!list.length && <Empty title="No customer records" description="Customers created on BeBoss terminals will synchronize here." />}</div>
    {open && <Modal title="Add customer" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={(e) => saveCustomer(e).catch((x) => alert(errorText(x)))}><label className="field-wide">Customer name<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label>Phone<input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label><label>Email<input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label><label className="field-wide">Address<input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label><label>Credit limit (FRw)<input type="number" min="0" value={draft.creditLimit} onChange={(e) => setDraft({ ...draft, creditLimit: e.target.value })} /></label><label className="field-wide">Notes<input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary"><Check size={16} />Save customer</button></div></form></Modal>}
    {paymentTarget && <Modal title={"Collect from " + s(paymentTarget.name)} onClose={() => setPaymentTarget(null)}><form className="form-grid" onSubmit={(e) => collect(e).catch((x) => alert(errorText(x)))}><div className="field-wide debt-summary"><span>Outstanding debt</span><strong>{money(paymentTarget.debtBalance)}</strong></div><label>Amount received (FRw)<input type="number" min="1" max={n(paymentTarget.debtBalance)} required value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></label><label>Payment method<select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>{["Cash", "MTN MoMo", "Airtel Money", "Bank", "Card"].map((v) => <option key={v}>{v}</option>)}</select></label><label className="field-wide">Reference / notes<input value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} /></label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => setPaymentTarget(null)}>Cancel</button><button className="btn-primary"><Wallet size={16} />Record payment</button></div></form></Modal>}
  </div>;
}