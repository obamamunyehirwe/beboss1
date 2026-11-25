import type React from "react";
import { Activity, AlertTriangle, Boxes, Package, Printer, ShoppingBag, X } from "lucide-react";
import { dateTime, money, rows, s } from "../lib/format";
import type { Row } from "../lib/types";

export function StatCard({ label, value, sub, icon: Icon, tone = "blue" }: {
  label: string; value: string; sub?: string; icon: typeof Activity; tone?: string
}) {
  return <article className="stat-card">
    <div className={"stat-icon tone-" + tone}><Icon size={19} /></div>
    <div className="stat-copy"><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>
  </article>;
}

export function StatusPill({ value }: { value: string }) {
  const clean = value.toUpperCase();
  const tone = ["ACTIVE", "PAID", "APPROVED", "COMPLETED", "OPEN", "TRIAL", "VERIFIED", "PAID_CASH", "PAID_MOMO", "PAID_BANK"].includes(clean) ? "good"
    : ["PENDING", "PENDING_VERIFICATION", "IN_TRANSIT", "REQUESTED", "RECEIPT_REQUESTED", "PARTIAL", "UNPAID", "SUPPLIER_CREDIT"].includes(clean) ? "warn"
    : ["REJECTED", "EXPIRED", "SUSPENDED", "CANCELLED", "CLOSED", "INACTIVE", "NOT SYNCED", "REVOKED"].includes(clean) ? "bad" : "neutral";
  return <span className={"status-pill " + tone}>{value.replaceAll("_", " ")}</span>;
}

export function PageHeading({ eyebrow, title, description, action }: {
  eyebrow?: string; title: string; description?: string; action?: React.ReactNode
}) {
  return <div className="page-heading">
    <div><span className="eyebrow muted">{eyebrow || "BEBOSS WORKSPACE"}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {action && <div className="heading-actions">{action}</div>}
  </div>;
}

export function Empty({ title, description, icon: Icon = Boxes }: { title: string; description: string; icon?: typeof Package }) {
  return <div className="empty-state"><span><Icon size={25} /></span><strong>{title}</strong><p>{description}</p></div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal-card"><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>{children}</section>
  </div>;
}

export function SalesTable({ sales, onReceipt }: { sales: Row[]; onReceipt?: (sale: Row) => void }) {
  if (!sales.length) return <Empty title="No sales recorded" description="Sales made on a paired BeBoss terminal or this desktop appear here." icon={ShoppingBag} />;
  return <div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Cashier</th><th>Payment</th><th className="right">Total</th><th>Status</th>{onReceipt && <th>Receipt</th>}</tr></thead><tbody>
    {sales.map((sale) => <tr key={s(sale.id)}><td className="mono">{s(sale.receiptNumber) || s(sale.id).slice(0, 8)}</td><td>{dateTime(sale.saleDate)}</td><td>{s(sale.customerName) || "Walk-in"}</td><td>{s(sale.cashierName) || "—"}</td><td>{s(sale.paymentMethod) || "—"}</td><td className="right strong">{money(sale.totalAmount)}</td><td><StatusPill value={s(sale.paymentStatus) || "PAID"} /></td>{onReceipt && <td><button className="icon-btn receipt-row-action" title="Preview and print receipt" aria-label={"Preview receipt " + s(sale.receiptNumber)} onClick={() => onReceipt(sale)}><Printer size={14} /></button></td>}</tr>)}
  </tbody></table></div>;
}

export function LoginHint() {
  return <div className="sync-hint"><AlertTriangle size={17} /><div><strong>Waiting for the first shop snapshot</strong><span>Open the registered BeBoss Android terminal, complete one successful cloud sync, then refresh this desktop workspace.</span></div></div>;
}

export function rowsOf(value: unknown) { return rows(value); }