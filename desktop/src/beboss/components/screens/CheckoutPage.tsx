import type React from "react";
import { useMemo, useState } from "react";
import { Check, Minus, Package, Pause, Play, Plus, Search, ShieldCheck, ShoppingCart, Trash2, X } from "lucide-react";
import { activeCustomers, activeProducts, errorText, id, money, n, s } from "../../lib/format";
import type { CommitSnapshot, Row, Snapshot } from "../../lib/types";
import { Empty, PageHeading } from "../ui";

type TenderKey = "cash" | "momo" | "airtel" | "card";
type CartLine = { product: Row; quantity: number };
type HeldCart = {
  id: string; label: string; cart: CartLine[]; customerId: string; discount: string;
  notes: string; split: boolean; tenders: Record<TenderKey, string>; payment: string; amountPaid: string;
};

const TENDER_LABELS: Record<TenderKey, string> = { cash: "Cash", momo: "MTN MoMo", airtel: "Airtel Money", card: "Card" };

export function CheckoutPage({ snapshot, onCommit, onReceipt, offline, busy }: {
  snapshot: Snapshot | null; onCommit: CommitSnapshot; onReceipt: (sale: Row, items: Row[]) => void; offline: boolean; busy: boolean
}) {
  const products = activeProducts(snapshot);
  const customers = activeCustomers(snapshot);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [payment, setPayment] = useState("CASH");
  const [split, setSplit] = useState(false);
  const [tenders, setTenders] = useState<Record<TenderKey, string>>({ cash: "", momo: "", airtel: "", card: "" });
  const [discount, setDiscount] = useState("0");
  const [amountPaid, setAmountPaid] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState("");
  const [held, setHeld] = useState<HeldCart[]>([]);

  const filtered = products.filter((p) => [p.name, p.barcode, p.category].some((v) => s(v).toLowerCase().includes(search.toLowerCase())));
  const subtotal = cart.reduce((sum, item) => sum + n(item.product.sellingPrice) * item.quantity, 0);
  const discountAmount = Math.max(0, Math.min(subtotal, n(discount)));
  const total = Math.max(0, subtotal - discountAmount);
  const splitPaid = (Object.keys(tenders) as TenderKey[]).reduce((sum, key) => sum + n(tenders[key]), 0);
  const paid = split ? splitPaid : payment === "DEBT" ? 0 : amountPaid === "" ? total : Math.max(0, n(amountPaid));
  const debt = Math.max(0, total - paid);
  const selectedCustomer = customers.find((c) => s(c.id) === customerId);
  const tenderRows = (Object.keys(tenders) as TenderKey[])
    .map((key) => ({ method: TENDER_LABELS[key], amount: n(tenders[key]) }))
    .filter((row) => row.amount > 0);
  const effectiveMethod = split ? (tenderRows.length > 1 ? "SPLIT" : tenderRows[0]?.method ?? payment) : payment;

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  function add(product: Row) {
    if (n(product.quantityInStock) <= 0) return;
    setCart((old) => {
      const exists = old.find((item) => s(item.product.id) === s(product.id));
      if (exists) return old.map((item) => s(item.product.id) === s(product.id) ? { ...item, quantity: Math.min(n(product.quantityInStock), item.quantity + 1) } : item);
      return [...old, { product, quantity: 1 }];
    });
    setDone("");
  }
  function setQty(productId: string, delta: number) {
    setCart((old) => old.map((item) => s(item.product.id) === productId
      ? { ...item, quantity: Math.max(1, Math.min(n(item.product.quantityInStock), item.quantity + delta)) }
      : item));
  }
  function holdOrder() {
    if (!cart.length) return;
    const label = window.prompt("Name this held order (e.g. takeaway, table 4):", "Order " + (held.length + 1));
    if (label === null) return;
    const snapshotCart: HeldCart = {
      id: id(), label: label.trim() || "Order " + (held.length + 1), cart, customerId, discount,
      notes, split, tenders, payment, amountPaid
    };
    setHeld((old) => [...old, snapshotCart]);
    setCart([]); setCustomerId(""); setDiscount("0"); setAmountPaid(""); setNotes("");
    setTenders({ cash: "", momo: "", airtel: "", card: "" });
  }
  function resumeOrder(order: HeldCart) {
    setCart(order.cart); setCustomerId(order.customerId); setDiscount(order.discount);
    setNotes(order.notes); setSplit(order.split); setTenders(order.tenders); setPayment(order.payment); setAmountPaid(order.amountPaid);
    setHeld((old) => old.filter((item) => item.id !== order.id));
    setDone("");
  }
  function removeHeld(orderId: string) { setHeld((old) => old.filter((item) => item.id !== orderId)); }

  async function completeSale() {
    if (!cart.length) throw new Error("Add at least one product to the cart.");
    if (payment === "DEBT" && !selectedCustomer) throw new Error("Select a customer before creating a credit sale.");
    if (debt > 0 && !selectedCustomer) throw new Error("Select a customer or collect the full sale amount.");
    if (selectedCustomer && debt + n(selectedCustomer.debtBalance) > n(selectedCustomer.creditLimit)) throw new Error("This sale would exceed the customer's credit limit.");
    const now = Date.now();
    const saleId = id();
    const receiptNumber = "BB-" + now.toString().slice(-10);
    const items = cart.map((item) => ({
      id: id(), saleId, productId: s(item.product.id), productName: s(item.product.name), category: s(item.product.category),
      unit: s(item.product.unit) || "pcs", quantitySold: item.quantity, costPriceAtSale: n(item.product.costPrice),
      unitPriceAtSale: n(item.product.sellingPrice), subtotal: n(item.product.sellingPrice) * item.quantity,
      profit: (n(item.product.sellingPrice) - n(item.product.costPrice)) * item.quantity, branchId: s(item.product.branchId) || "main_branch"
    }));
    const totalCost = items.reduce((sum, item) => sum + item.costPriceAtSale * item.quantitySold, 0);
    const sale = {
      id: saleId, customerId: customerId || null, customerName: selectedCustomer ? s(selectedCustomer.name) : "Walk-in Customer",
      saleDate: now, totalAmount: total, totalCost, totalProfit: total - totalCost, discountAmount,
      paymentMethod: effectiveMethod, paymentStatus: debt <= 0.01 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID",
      amountPaid: Math.min(total, paid), tenders: split ? tenderRows : [], notes: notes.trim(), receiptNumber,
      branchId: s(cart[0]?.product.branchId) || "main_branch", branchName: "", cashierId: "DESKTOP",
      cashierName: "Desktop Owner", synced: false, updatedAt: now, syncVersion: 1, hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP"
    };
    await onCommit((next) => {
      next.sales.unshift(sale);
      next.saleItems.push(...items);
      for (const item of items) {
        const p = next.products.find((product) => s(product.id) === item.productId);
        if (p) { p.quantityInStock = Math.max(0, n(p.quantityInStock) - item.quantitySold); p.updatedAt = now; p.hlcTimestamp = 0; p.syncVersion = n(p.syncVersion) + 1; p.lastModifiedDeviceId = "DESKTOP"; }
      }
      if (selectedCustomer && debt > 0) {
        const c = next.customers.find((customer) => s(customer.id) === customerId);
        if (c) { c.debtBalance = n(c.debtBalance) + debt; c.updatedAt = now; c.hlcTimestamp = 0; c.syncVersion = n(c.syncVersion) + 1; c.lastModifiedDeviceId = "DESKTOP"; }
      }
    }, "SALE");
    onReceipt(sale, items);
    setDone(receiptNumber); setCart([]); setDiscount("0"); setAmountPaid(""); setNotes("");
    setSplit(false); setTenders({ cash: "", momo: "", airtel: "", card: "" });
  }

  return <div className="page-stack">
    <PageHeading eyebrow="POINT OF SALE" title="New sale" description="Search the shop catalogue, add products, collect payment and post a sale to the shared BeBoss ledger." action={<span className="secure-label"><ShieldCheck size={15} /> {offline ? "Offline-capable, owner-authorized checkout" : "Online, owner-authorized checkout"}</span>} />
    {!snapshot ? <Empty title="No verified product catalogue" description="Sync the shop's Android terminal before starting desktop sales." /> : <div className="pos-layout">
      <section className="pos-products">
        <div className="pos-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products by name, barcode or category…" autoFocus /><span className="pos-search-count">{cartCount} in cart</span></div>
        <div className="product-grid">{filtered.map((p) => <button key={s(p.id)} className="product-tile" onClick={() => add(p)} disabled={n(p.quantityInStock) <= 0}>
          <span className="tile-image"><Package size={22} /></span><strong>{s(p.name)}</strong><small>{s(p.category)} · {n(p.quantityInStock)} {s(p.unit) || "pcs"} left</small><b>{money(p.sellingPrice)}</b>
        </button>)}</div>
        {!filtered.length && <Empty title="No products found" description="Change your search term or scan another barcode." />}
      </section>
      <section className="pos-cart panel">
        <div className="panel-heading"><div><span className="eyebrow muted">CURRENT ORDER</span><h3>Cart ({cart.length})</h3></div><div className="cart-head-actions"><button className="text-btn" onClick={holdOrder} disabled={!cart.length}><Pause size={13} /> Hold</button><button className="text-btn" onClick={() => setCart([])} disabled={!cart.length}>Clear cart</button></div></div>

        {held.length > 0 && <div className="held-strip">
          <span className="held-strip-label">HELD ORDERS</span>
          {held.map((order) => <div className="held-chip" key={order.id}>
            <button type="button" className="held-resume" onClick={() => resumeOrder(order)} title={"Resume " + order.label}><Play size={12} /> {order.label}<em>{money(order.cart.reduce((sum, i) => sum + n(i.product.sellingPrice) * i.quantity, 0))}</em></button>
            <button type="button" className="held-remove" onClick={() => removeHeld(order.id)} title="Discard held order"><X size={12} /></button>
          </div>)}
        </div>}

        <div className="cart-lines">{cart.map((item) => <div className="cart-line" key={s(item.product.id)}>
          <div className="cart-info"><strong>{s(item.product.name)}</strong><small>{money(item.product.sellingPrice)} each</small></div>
          <div className="quantity-control"><button onClick={() => setQty(s(item.product.id), -1)}>−</button><span>{item.quantity}</span><button onClick={() => setQty(s(item.product.id), 1)} disabled={item.quantity >= n(item.product.quantityInStock)}>+</button></div>
          <strong className="line-total">{money(n(item.product.sellingPrice) * item.quantity)}</strong>
          <button className="cart-remove icon-btn danger-icon" title="Remove line" onClick={() => setCart((old) => old.filter((x) => s(x.product.id) !== s(item.product.id)))}><Trash2 size={13} /></button>
        </div>)}
          {!cart.length && <Empty title="Your cart is empty" description="Select products from the catalogue to begin, or resume a held order." icon={ShoppingCart} />}</div>
        <div className="checkout-fields">
          <label>Customer<select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Walk-in customer</option>{customers.map((c) => <option key={s(c.id)} value={s(c.id)}>{s(c.name)} · Due {money(c.debtBalance)}</option>)}</select></label>
          <div className="field-pair"><label>Discount (FRw)<input type="number" min="0" max={subtotal} value={discount} onChange={(e) => setDiscount(e.target.value)} /></label><label>Payment mode<select value={split ? "SPLIT" : payment} onChange={(e) => { if (e.target.value === "SPLIT") setSplit(true); else { setSplit(false); setPayment(e.target.value); } }}>
            <option value="CASH">Cash</option><option value="MOMO">MTN MoMo</option><option value="AIRTEL">Airtel Money</option><option value="CARD">Card</option><option value="DEBT">Customer credit</option><option value="SPLIT">Split tender…</option>
          </select></label></div>
          {split ? <div className="tender-builder">
            <span className="tender-builder-label">Split payment across methods</span>
            <div className="tender-grid">
              {(Object.keys(tenders) as TenderKey[]).map((key) => <label key={key}>{TENDER_LABELS[key]}<input type="number" min="0" value={tenders[key]} onChange={(e) => setTenders({ ...tenders, [key]: e.target.value })} placeholder="0" /></label>)}
            </div>
            <div className="tender-remaining"><span>Split total</span><strong>{money(splitPaid)}</strong><span className={splitPaid >= total ? "ok" : "warn"}>{splitPaid >= total ? "Covered" : money(total - splitPaid) + " remaining"}</span></div>
          </div> : payment !== "DEBT" && <label>Amount received (FRw)<input type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder={String(total)} /></label>}
          <label>Sale notes<input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Optional cashier note" /></label>
          <div className="totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Discount</span><strong>− {money(discountAmount)}</strong></div><div className="grand-total"><span>Total</span><strong>{money(total)}</strong></div><div><span>Received</span><strong>{money(paid)}</strong></div>{debt > 0 && <div className="due-row"><span>Customer balance due</span><strong>{money(debt)}</strong></div>}</div>
          <button className="btn-primary full" disabled={busy || !cart.length} onClick={() => completeSale().catch((e) => alert(errorText(e)))}><Check size={18} />{busy ? "Saving sale…" : "Complete sale"}</button>
          {done && <div className="sale-complete"><Check size={17} /><span>{offline ? "Sale saved locally and queued for sync" : "Sale saved locally and synced to BeBoss Cloud"} · receipt {done}</span></div>}
        </div>
      </section>
    </div>}
  </div>;
}