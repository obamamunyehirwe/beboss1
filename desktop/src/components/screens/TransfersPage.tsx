import type React from "react";
import { useMemo, useState } from "react";
import { Activity, ArrowRight, Clock3, Download, Plus, Search, ShieldCheck, Truck, X } from "lucide-react";
import { activeProducts, dateTime, downloadCsv, errorText, id, money, n, rows, s } from "../../lib/format";
import type { CloudAction, CloudState, Row, Snapshot } from "../../lib/types";
import { Empty, Modal, PageHeading, StatCard, StatusPill } from "../ui";

export function TransfersPage({ cloud, snapshot, onAction, onRefresh, offline }: { cloud: CloudState; snapshot: Snapshot | null; onAction: CloudAction; onRefresh: () => Promise<void>; offline: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [showPolicy, setShowPolicy] = useState(false);
  const [transferThreshold, setTransferThreshold] = useState("0");
  const [varianceThreshold, setVarianceThreshold] = useState("0");
  const [policySaving, setPolicySaving] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [policyNotice, setPolicyNotice] = useState("");
  const latestPolicy = useMemo(() => {
    const event = rows(cloud.activity).find((item) =>
      s(item.entity).toUpperCase() === "APPROVAL_POLICY" && s(item.action).toUpperCase() === "UPDATED"
    );
    try {
      const value = JSON.parse(s(event?.detail));
      return {
        transferApprovalThresholdRwf: Math.max(0, n(value.transferApprovalThresholdRwf)),
        reconciliationVarianceThresholdRwf: Math.max(0, n(value.reconciliationVarianceThresholdRwf))
      };
    } catch {
      return { transferApprovalThresholdRwf: 0, reconciliationVarianceThresholdRwf: 0 };
    }
  }, [cloud.activity]);
  const [form, setForm] = useState({ productId: "", fromBranchId: "", toBranchId: "", quantity: "1", notes: "" });
  const transfers = rows(cloud.transfers);
  const products = activeProducts(snapshot);
  const branches = rows(cloud.branches).filter((b) => b.is_active);
  const openStatuses = ["REQUESTED", "IN_TRANSIT", "RECEIPT_REQUESTED", "CANCEL_REQUESTED"];
  const inTransit = transfers.filter((transfer) => s(transfer.status).toUpperCase() === "IN_TRANSIT");
  const unresolved = transfers.filter((transfer) => openStatuses.includes(s(transfer.status).toUpperCase()));
  const agedTransfers = unresolved.filter((transfer) => n(transfer.transfer_date) > 0 && Date.now() - n(transfer.transfer_date) > 24 * 60 * 60 * 1000);
  const totalInTransitValue = inTransit.reduce((sum, transfer) => sum + n(transfer.cost_value_rwf), 0);
  const visibleTransfers = useMemo(() => [...transfers].filter((transfer) => {
    const status = s(transfer.status).toUpperCase();
    const matchesStatus = statusFilter === "ALL" || status === statusFilter;
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || [transfer.transfer_number, transfer.product_name, transfer.from_branch_name,
      transfer.to_branch_name, transfer.transferred_by, transfer.received_by, transfer.notes]
      .some((value) => s(value).toLowerCase().includes(term));
    return matchesStatus && matchesQuery;
  }).sort((a, b) => n(b.transfer_date ?? b.created_at) - n(a.transfer_date ?? a.created_at)), [transfers, statusFilter, query]);

  function exportTransfers() {
    downloadCsv("BeBoss-Stock-Transfers-" + new Date().toISOString().slice(0,10) + ".csv",
      ["transfer_number","product_id","product_name","from_branch","to_branch","quantity","unit","cost_value_rwf","status","requested_at","transferred_by","received_by","received_at","notes"],
      visibleTransfers.map((transfer) => ({
        transfer_number: s(transfer.transfer_number), product_id: s(transfer.product_id),
        product_name: s(transfer.product_name), from_branch: s(transfer.from_branch_name),
        to_branch: s(transfer.to_branch_name), quantity: n(transfer.quantity), unit: s(transfer.unit),
        cost_value_rwf: n(transfer.cost_value_rwf), status: s(transfer.status),
        requested_at: transfer.transfer_date ? dateTime(transfer.transfer_date) : dateTime(transfer.created_at),
        transferred_by: s(transfer.transferred_by), received_by: s(transfer.received_by),
        received_at: transfer.received_at ? dateTime(transfer.received_at) : "",
        notes: s(transfer.notes)
      })));
  }

  function openPolicySettings() {
    setTransferThreshold(String(latestPolicy.transferApprovalThresholdRwf));
    setVarianceThreshold(String(latestPolicy.reconciliationVarianceThresholdRwf));
    setPolicyError("");
    setPolicyNotice("");
    setShowPolicy(true);
  }

  async function saveApprovalPolicy(event: React.FormEvent) {
    event.preventDefault();
    const transferValue = Number(transferThreshold);
    const varianceValue = Number(varianceThreshold);
    if (!Number.isFinite(transferValue) || !Number.isFinite(varianceValue) ||
        transferValue < 0 || varianceValue < 0 || transferValue > 10000000000 || varianceValue > 10000000000) {
      setPolicyError("Enter valid non-negative FRw thresholds up to 10,000,000,000. Zero disables that approval threshold.");
      return;
    }
    setPolicySaving(true);
    setPolicyError("");
    try {
      await onAction("approval_policy_save", {
        transferApprovalThresholdRwf: Math.round(transferValue),
        reconciliationVarianceThresholdRwf: Math.round(varianceValue)
      });
      setPolicyNotice("Owner approval thresholds saved to the shop cloud audit policy.");
      setShowPolicy(false);
    } catch (error) {
      setPolicyError(errorText(error));
    } finally {
      setPolicySaving(false);
    }
  }

  async function refreshTransfers() {
    setRefreshing(true); setPageError("");
    try { await onRefresh(); }
    catch (error) { setPageError(errorText(error)); }
    finally { setRefreshing(false); }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const p = products.find((x) => s(x.id) === form.productId);
    const from = branches.find((x) => s(x.id) === form.fromBranchId);
    const to = branches.find((x) => s(x.id) === form.toBranchId);
    if (!p || !from || !to || n(form.quantity) <= 0) throw new Error("Choose a product, source/destination branches and quantity.");
    const estimatedValue = Math.max(0, n(p.costPrice) * n(form.quantity));
    const approvalRequired = latestPolicy.transferApprovalThresholdRwf > 0 &&
      estimatedValue >= latestPolicy.transferApprovalThresholdRwf;
    let approvalConfirmed = false;
    let approvalReason = "";
    if (approvalRequired) {
      approvalConfirmed = window.confirm("This transfer is valued at approximately " + money(estimatedValue) +
        " and meets the owner approval threshold of " + money(latestPolicy.transferApprovalThresholdRwf) +
        ". Confirm owner review before sending the request?");
      if (!approvalConfirmed) return;
      approvalReason = window.prompt("Enter the owner approval explanation (at least 8 characters):", "")?.trim() ?? "";
      if (approvalReason.length < 8) throw new Error("An approval explanation of at least 8 characters is required.");
    }
    const result = await onAction("transfer_create", {
      id: id(), productId: form.productId, fromBranchId: form.fromBranchId, toBranchId: form.toBranchId,
      quantity: n(form.quantity), notes: form.notes, approvalConfirmed, approvalReason
    });
    setOpen(false); setForm({ productId: "", fromBranchId: "", toBranchId: "", quantity: "1", notes: "" });
    alert("Transfer " + s(result.transferNumber) + " has been sent to paired BeBoss terminals for stock validation.");
  }
  async function command(t: Row, cmd: string) {
    await onAction("transfer_command", { id: s(t.id), command: cmd });
  }
  return <div className="page-stack">
    <PageHeading eyebrow="INVENTORY · LOGISTICS · RECONCILIATION" title="Inter-branch stock transfers"
      description="Create governed branch-to-branch stock requests, follow mobile validation and monitor receiving confirmations."
      action={<div className="enterprise-page-actions">
        <button className="btn-outline" disabled={offline} onClick={openPolicySettings}><ShieldCheck size={15} /> Approval policy</button>
        <button className="btn-outline" disabled={offline || refreshing} onClick={() => void refreshTransfers()}><Activity size={15} className={refreshing ? "spin" : ""} /> Refresh cloud</button>
        <button className="btn-outline" onClick={exportTransfers}><Download size={15} /> Export view</button>
        <button className="btn-primary" disabled={offline || !products.length || branches.length < 2} onClick={() => setOpen(true)}><Plus size={17} /> New transfer</button>
      </div>} />
    {policyNotice && <div className="inline-alert success">{policyNotice}</div>}
    <div className="info-note"><Activity size={17} /> Desktop submits a signed cloud command. Source and destination terminals validate physical stock movement; this screen cannot mark inventory as transferred or received without terminal confirmation.</div>
    <div className="stat-grid four">
      <StatCard label="All transfer records" value={transfers.length.toLocaleString()} sub="Cloud transfer registry" icon={Truck} />
      <StatCard label="Awaiting resolution" value={unresolved.length.toLocaleString()} sub="Requested, in transit or waiting receipt" icon={Clock3} tone="orange" />
      <StatCard label="In transit" value={inTransit.length.toLocaleString()} sub={money(totalInTransitValue) + " recorded stock cost value"} icon={Activity} tone="blue" />
      <StatCard label="Older than 24 hours" value={agedTransfers.length.toLocaleString()} sub="Open requests requiring follow-up" icon={Clock3} tone={agedTransfers.length ? "orange" : "green"} />
    </div>
    {pageError && <div className="inline-alert error">{pageError}</div>}
    <section className="panel enterprise-transfer-toolbar">
      <div className="enterprise-toolbar-controls">
        <label className="enterprise-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, product, source, destination or operator" /></label>
        <select aria-label="Filter transfers by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">All statuses</option>
          {Array.from(new Set(transfers.map((transfer) => s(transfer.status).toUpperCase()).filter(Boolean))).sort().map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
        </select>
      </div>
      <div className="enterprise-toolbar-foot"><span>Showing {visibleTransfers.length} of {transfers.length} transfer records</span><span>Stock and costs are based on the latest synchronized transfer records</span></div>
    </section>
    <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Transfer</th><th>Product</th><th>Route</th><th>Quantity</th><th>Cost value</th><th>Requested</th><th>Age</th><th>Status</th><th></th></tr></thead><tbody>
      {visibleTransfers.map((t) => {
        const timestamp = n(t.transfer_date ?? t.created_at);
        const ageHours = timestamp ? Math.max(0, Math.floor((Date.now() - timestamp) / 3600000)) : 0;
        return <tr key={s(t.id)}><td className="mono">{s(t.transfer_number) || s(t.id).slice(0,8)}</td><td><strong>{s(t.product_name)}</strong><small className="cell-sub mono">{s(t.product_id)}</small></td><td>{s(t.from_branch_name)} <ArrowRight size={13} /> {s(t.to_branch_name)}</td><td>{n(t.quantity)} {s(t.unit) || "pcs"}</td><td>{money(t.cost_value_rwf)}</td><td>{timestamp ? dateTime(timestamp) : "—"}</td><td>{timestamp ? ageHours < 24 ? ageHours + "h" : Math.floor(ageHours/24) + "d" : "—"}</td><td><StatusPill value={s(t.status)} /></td><td>{s(t.status).toUpperCase() === "IN_TRANSIT" ? <div className="row-actions"><button className="btn-outline small" disabled={offline} onClick={() => command(t, "RECEIPT").catch((e) => setPageError(errorText(e)))}>Request receipt</button><button className="icon-btn danger-icon" disabled={offline} title="Request cancellation" onClick={() => { if (window.confirm("Request cancellation of transfer " + s(t.transfer_number) + "? The source/destination terminal still validates the final movement.")) command(t, "CANCEL").catch((e) => setPageError(errorText(e))); }}><X size={15} /></button></div> : <span className="muted small-text">Terminal workflow</span>}</td></tr>;
      })}
    </tbody></table></div>{!visibleTransfers.length && <Empty title={transfers.length ? "No transfers match this view" : "No stock transfers"} description={transfers.length ? "Change the status filter or search to see other transfer records." : "Create a transfer request between two active branches."} icon={Truck} />}</div>
    {showPolicy && <Modal title="Shop approval policy" onClose={() => !policySaving && setShowPolicy(false)}>
      <form className="form-grid" onSubmit={(event) => void saveApprovalPolicy(event)}>
        <div className="field-wide info-note"><ShieldCheck size={16} /> These thresholds are enforced by the cloud before transfer commands and branch cash close-outs are accepted. They record owner confirmation on the current authenticated owner terminal; this is not dual-person authorization.</div>
        <label className="field-wide">Stock transfer approval threshold (FRw)
          <input type="number" min="0" max="10000000000" step="1" value={transferThreshold}
            onChange={(event) => setTransferThreshold(event.target.value)} disabled={policySaving} />
          <small>Transfers at or above this recorded stock cost require owner confirmation and a reason. Set to 0 to disable.</small>
        </label>
        <label className="field-wide">Branch cash variance review threshold (FRw)
          <input type="number" min="0" max="10000000000" step="1" value={varianceThreshold}
            onChange={(event) => setVarianceThreshold(event.target.value)} disabled={policySaving} />
          <small>Absolute cash variance at or above this threshold requires owner review and a written explanation. Set to 0 to disable.</small>
        </label>
        <div className="field-wide panel" style={{ padding: 12 }}>
          <strong>Current policy</strong>
          <div className="metric-row"><span>Transfer threshold</span><b>{latestPolicy.transferApprovalThresholdRwf ? money(latestPolicy.transferApprovalThresholdRwf) : "Disabled"}</b></div>
          <div className="metric-row"><span>Cash variance threshold</span><b>{latestPolicy.reconciliationVarianceThresholdRwf ? money(latestPolicy.reconciliationVarianceThresholdRwf) : "Disabled"}</b></div>
          <small className="panel-hint">The latest version is reconstructed from this shop's append-only cloud activity log.</small>
        </div>
        {policyError && <div className="field-wide inline-alert error">{policyError}</div>}
        <div className="modal-actions field-wide">
          <button type="button" className="btn-outline" disabled={policySaving} onClick={() => setShowPolicy(false)}>Cancel</button>
          <button className="btn-primary" disabled={policySaving || offline}>{policySaving ? "Saving policy..." : <><ShieldCheck size={15} /> Save cloud policy</>}</button>
        </div>
      </form>
    </Modal>}
    {open && <Modal title="Create transfer request" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={(e) => create(e).catch((x) => alert(errorText(x)))}><label className="field-wide">Product<select required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">Select product</option>{products.map((p) => <option key={s(p.id)} value={s(p.id)}>{s(p.name)} · {n(p.quantityInStock)} {s(p.unit)}</option>)}</select></label><label>From branch<select required value={form.fromBranchId} onChange={(e) => setForm({ ...form, fromBranchId: e.target.value })}><option value="">Source</option>{branches.map((b) => <option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label><label>To branch<select required value={form.toBranchId} onChange={(e) => setForm({ ...form, toBranchId: e.target.value })}><option value="">Destination</option>{branches.map((b) => <option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label><label>Quantity<input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label><label className="field-wide">Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary"><Truck size={16} /> Submit transfer</button></div></form></Modal>}
  </div>;
}