import type React from "react";
import { useState } from "react";
import { Download, Plus, Truck } from "lucide-react";
import { activeProducts, dateOnly, downloadCsv, errorText, id, money, n, rows, s } from "../../lib/format";
import type { CommitSnapshot, Row, Snapshot } from "../../lib/types";
import { Empty, PageHeading, StatusPill } from "../ui";

export function PurchasesPage({ snapshot, onCommit, offline }: {
  snapshot: Snapshot | null; onCommit: CommitSnapshot; offline: boolean
}) {
  const [form, setForm] = useState({ productId: "", quantity: "1", unitCost: "", sellingPrice: "", supplier: "", supplierPhone: "", paymentStatus: "PAID_CASH", invoice: "", notes: "" });
  const products = activeProducts(snapshot);
  const purchases = rows(snapshot?.purchases).sort((a, b) => n(b.purchaseDate) - n(a.purchaseDate));
  async function record(e: React.FormEvent) {
    e.preventDefault();
    const p = products.find((x) => s(x.id) === form.productId);
    const quantity = n(form.quantity), unitCost = n(form.unitCost);
    if (!p || quantity <= 0 || unitCost < 0) throw new Error("Choose a product and a valid purchase quantity/cost.");
    const now = Date.now();
    const purchase = {
      id: id(), productId: s(p.id), productName: s(p.name), category: s(p.category), supplierName: form.supplier.trim() || "Direct Supplier",
      supplierPhone: form.supplierPhone.trim(), quantityPurchased: quantity, unitCostPrice: unitCost, totalPurchaseCost: quantity * unitCost,
      sellingPriceAtPurchase: n(form.sellingPrice) || n(p.sellingPrice), paymentStatus: form.paymentStatus, invoiceNumber: form.invoice.trim(),
      branchId: s(p.branchId) || "main_branch", branchName: "Main Store", purchasedByUserId: "DESKTOP", purchasedByName: "Desktop Owner",
      notes: form.notes.trim(), purchaseDate: now, isSynced: false, createdAt: now
    };
    await onCommit((next) => {
      next.purchases.unshift(purchase);
      const product = next.products.find((x) => s(x.id) === s(p.id));
      if (product) { product.quantityInStock = n(product.quantityInStock) + quantity; product.costPrice = unitCost; product.sellingPrice = purchase.sellingPriceAtPurchase; product.updatedAt = now; product.hlcTimestamp = now << 16; product.syncVersion = n(product.syncVersion) + 1; product.lastModifiedDeviceId = "DESKTOP"; }
    });
    setForm({ productId: "", quantity: "1", unitCost: "", sellingPrice: "", supplier: "", supplierPhone: "", paymentStatus: "PAID_CASH", invoice: "", notes: "" });
  }
  return <div className="page-stack"><PageHeading title="Purchasing & suppliers" description="Record supplier purchases and update stock quantity and product cost in one saved transaction." action={<button className="btn-outline" onClick={() => downloadCsv("beboss-purchases-" + Date.now() + ".csv", ["id", "invoiceNumber", "purchaseDate", "productId", "productName", "supplierName", "supplierPhone", "quantityPurchased", "unitCostPrice", "totalPurchaseCost", "paymentStatus", "branchId", "purchasedByName"], purchases)}><Download size={15} /> Export CSV</button>} />
    <div className="panel purchase-form"><div className="panel-heading"><div><span className="eyebrow muted">STOCK INFLOW</span><h3>Record a purchase</h3></div><Truck size={19} className="muted-icon" /></div>
      {!products.length ? <Empty title="Add products first" description="Purchases are linked to existing catalogue products." /> : <form className="form-grid" onSubmit={(e) => record(e).catch((x) => alert(errorText(x)))}>
        <label className="field-wide">Product<select required value={form.productId} onChange={(e) => { const p = products.find((x) => s(x.id) === e.target.value); setForm({ ...form, productId: e.target.value, unitCost: p ? String(p.costPrice) : "", sellingPrice: p ? String(p.sellingPrice) : "" }); }}><option value="">Choose product</option>{products.map((p) => <option key={s(p.id)} value={s(p.id)}>{s(p.name)} · {n(p.quantityInStock)} in stock</option>)}</select></label>
        <label>Quantity<input type="number" min="0.001" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label><label>Unit cost (FRw)<input type="number" min="0" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></label>
        <label>New selling price (FRw)<input type="number" min="0" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} /></label><label>Supplier name<input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></label>
        <label>Supplier phone<input value={form.supplierPhone} onChange={(e) => setForm({ ...form, supplierPhone: e.target.value })} /></label><label>Payment status<select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}>{["PAID_CASH", "PAID_MOMO", "PAID_BANK", "SUPPLIER_CREDIT"].map((v) => <option value={v} key={v}>{v.replaceAll("_", " ")}</option>)}</select></label>
        <label>Invoice number<input value={form.invoice} onChange={(e) => setForm({ ...form, invoice: e.target.value })} /></label><label className="field-wide">Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <div className="form-footer field-wide"><span>Purchase total <strong>{money(n(form.quantity) * n(form.unitCost))}</strong></span><button className="btn-primary"><Plus size={16} /> Save purchase & update stock</button></div>
      </form>}
    </div>
    <div className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow muted">PURCHASE HISTORY</span><h3>{purchases.length} recorded purchases</h3></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Invoice</th><th>Product</th><th>Supplier</th><th>Quantity</th><th>Total cost</th><th>Status</th></tr></thead><tbody>
      {purchases.map((p) => <tr key={s(p.id)}><td>{dateOnly(p.purchaseDate)}</td><td className="mono">{s(p.invoiceNumber) || "—"}</td><td>{s(p.productName)}</td><td>{s(p.supplierName)}</td><td>{n(p.quantityPurchased)} {s(p.unit) || "pcs"}</td><td className="strong">{money(p.totalPurchaseCost)}</td><td><StatusPill value={s(p.paymentStatus) || "PAID"} /></td></tr>)}
    </tbody></table></div>{!purchases.length && <Empty title="No purchases recorded" description="Purchase records are synchronized with the mobile app." />}</div>
  </div>;
}