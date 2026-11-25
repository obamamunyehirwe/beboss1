import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Barcode, Check, Minus, Package, Pause, Play, Plus, ReceiptText, Search, ShieldCheck, ShoppingCart, Trash2, X } from "lucide-react";
import { activeCustomers, activeProducts, errorText, id, money, n, s } from "../../lib/format";
import type { CommitSnapshot, Row, Snapshot } from "../../lib/types";
import { Empty, Modal, PageHeading } from "../ui";

type TenderKey = "cash" | "momo" | "airtel" | "card";
type CartLine = { product: Row; quantity: number };
type HeldCart = {
  id: string; label: string; heldAt: number; cart: CartLine[]; customerId: string; discount: string;
  notes: string; split: boolean; tenders: Record<TenderKey, string>; payment: string; amountPaid: string;
};
type StoredCartLine = { productId: string; quantity: number; productSnapshot?: Row };
type StoredOrder = {
  id: string; label: string; heldAt: number; cart: StoredCartLine[]; customerId: string; discount: string;
  notes: string; split: boolean; tenders: Record<TenderKey, string>; payment: string; amountPaid: string;
};
const EMPTY_TENDERS: Record<TenderKey, string> = { cash: "", momo: "", airtel: "", card: "" };

function restoreCartLines(value: unknown, catalog: Row[]): CartLine[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map(catalog.map((product) => [s(product.id), product]));
  return value.flatMap((line) => {
    if (!line || typeof line !== "object") return [];
    const stored = line as StoredCartLine;
    const productId = s(stored.productId);
    const currentProduct = byId.get(productId);
    const snapshot = stored.productSnapshot && typeof stored.productSnapshot === "object" ? stored.productSnapshot : null;
    const product = currentProduct ?? (snapshot ? { ...snapshot, id: productId, restoreUnavailable: true } : null);
    const quantity = Number(stored.quantity);
    if (!product || !Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ product, quantity }];
  });
}

function restoreHeldOrder(value: unknown, catalog: Row[]): HeldCart | null {
  if (!value || typeof value !== "object") return null;
  const order = value as Partial<StoredOrder>;
  const cart = restoreCartLines(order.cart, catalog);
  const payment = ["CASH", "MOMO", "AIRTEL", "CARD", "DEBT"].includes(s(order.payment)) ? s(order.payment) : "CASH";
  const rawTenders = order.tenders && typeof order.tenders === "object" ? order.tenders : {};
  const tenders = Object.fromEntries((Object.keys(EMPTY_TENDERS) as TenderKey[]).map((key) => [
    key, typeof rawTenders[key] === "string" ? rawTenders[key] : String(rawTenders[key] ?? "")
  ])) as Record<TenderKey, string>;
  if (!cart.length || !s(order.id)) return null;
  return {
    id: s(order.id), label: s(order.label) || "Held order", heldAt: n(order.heldAt) || Date.now(), cart,
    customerId: s(order.customerId), discount: String(order.discount ?? "0"), notes: s(order.notes),
    split: order.split === true, tenders, payment, amountPaid: String(order.amountPaid ?? "")
  };
}

function serializeCartLine(line: CartLine): StoredCartLine {
  const product = line.product;
  return {
    productId: s(product.id),
    quantity: line.quantity,
    productSnapshot: {
      id: s(product.id), name: s(product.name), category: s(product.category), barcode: s(product.barcode),
      sku: s(product.sku), productCode: s(product.productCode), costPrice: n(product.costPrice),
      sellingPrice: n(product.sellingPrice), quantityInStock: n(product.quantityInStock),
      lowStockThreshold: n(product.lowStockThreshold), unit: s(product.unit), branchId: s(product.branchId),
      isDeleted: product.isDeleted === true
    }
  };
}

function serializeOrder(order: HeldCart): StoredOrder {
  return {
    id: order.id, label: order.label, heldAt: order.heldAt,
    cart: order.cart.map(serializeCartLine),
    customerId: order.customerId, discount: order.discount, notes: order.notes,
    split: order.split, tenders: order.tenders, payment: order.payment, amountPaid: order.amountPaid
  };
}

const TENDER_LABELS: Record<TenderKey, string> = { cash: "Cash", momo: "MTN MoMo", airtel: "Airtel Money", card: "Card" };

export function CheckoutPage({ snapshot, onCommit, onReceipt, offline, busy, storageKey, cashierName }: {
  snapshot: Snapshot | null; onCommit: CommitSnapshot; onReceipt: (sale: Row, items: Row[]) => void;
  offline: boolean; busy: boolean; storageKey: string; cashierName: string; cashierName: string;
}) {
  const products = activeProducts(snapshot);
  const customers = activeCustomers(snapshot);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [payment, setPayment] = useState("CASH");
  const [split, setSplit] = useState(false);
  const [tenders, setTenders] = useState<Record<TenderKey, string>>(EMPTY_TENDERS);
  const [discount, setDiscount] = useState("0");
  const [amountPaid, setAmountPaid] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState("");
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [quickSaleName, setQuickSaleName] = useState("");
  const [quickSaleAmount, setQuickSaleAmount] = useState("");
  const [quickSaleCost, setQuickSaleCost] = useState("");
  const [quickSalePayment, setQuickSalePayment] = useState("CASH");
  const [quickSaleBranchId, setQuickSaleBranchId] = useState("");
  const [quickSaleNotes, setQuickSaleNotes] = useState("");
  const [quickSaleBusy, setQuickSaleBusy] = useState(false);
  const [quickSaleError, setQuickSaleError] = useState("");
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [checkoutRestored, setCheckoutRestored] = useState(false);
  const [storageWritable, setStorageWritable] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [scanFeedback, setScanFeedback] = useState("");
  const productsRef = useRef(products);
  productsRef.current = products;
  const persistenceQueue = useRef<Promise<void>>(Promise.resolve());

  // Restore the active basket and held orders from encrypted native storage.
  // The storage key is scoped to the authenticated shop, not shared between owners.
  useEffect(() => {
    let active = true;
    setCheckoutRestored(false);
    setStorageWritable(false);
    setStorageWarning("");
    void (async () => {
      try {
        const raw = await window.beBossDesktop.secureStore.get(storageKey);
        if (!active) return;
        if (raw) {
          const saved = JSON.parse(raw) as { version?: number; active?: Partial<StoredOrder>; held?: unknown[] };
          if (saved.version !== 1) throw new Error("The saved checkout uses an unsupported version.");
          const draft = saved.active;
          const restoredCart = restoreCartLines(draft?.cart, productsRef.current);
          if (restoredCart.length) {
            setCart(restoredCart);
            setCustomerId(s(draft?.customerId));
            setDiscount(String(draft?.discount ?? "0"));
            setNotes(s(draft?.notes));
            setSplit(draft?.split === true);
            setPayment(["CASH", "MOMO", "AIRTEL", "CARD", "DEBT"].includes(s(draft?.payment)) ? s(draft?.payment) : "CASH");
            setAmountPaid(String(draft?.amountPaid ?? ""));
            const rawTenders = draft?.tenders && typeof draft.tenders === "object" ? draft.tenders : {};
            setTenders(Object.fromEntries((Object.keys(EMPTY_TENDERS) as TenderKey[]).map((key) => [
              key, typeof rawTenders[key] === "string" ? rawTenders[key] : String(rawTenders[key] ?? "")
            ])) as Record<TenderKey, string>);
          }
          const restoredHeld = (Array.isArray(saved.held) ? saved.held : [])
            .map((order) => restoreHeldOrder(order, productsRef.current))
            .filter((order): order is HeldCart => order !== null)
            .slice(0, 50);
          setHeld(restoredHeld);
        }
        if (active) setStorageWritable(true);
      } catch (error) {
        if (active) {
          setStorageWritable(false);
          setStorageWarning("Saved checkout data could not be read. Existing saved data was preserved; this session's basket cannot be persisted. " + errorText(error));
        }
      } finally {
        if (active) setCheckoutRestored(true);
      }
    })();
    return () => { active = false; };
  }, [storageKey]);

  // Keep the displayed basket aligned with the latest synchronized catalogue.
  useEffect(() => {
    const latest = new Map(products.map((product) => [s(product.id), product]));
    setCart((current) => current.map((line) => {
      const currentProduct = latest.get(s(line.product.id));
      return { ...line, product: currentProduct ?? { ...line.product, restoreUnavailable: true } };
    }));
    setHeld((current) => current.map((order) => ({
      ...order,
      cart: order.cart.map((line) => {
        const currentProduct = latest.get(s(line.product.id));
        return { ...line, product: currentProduct ?? { ...line.product, restoreUnavailable: true } };
      })
    })));
  }, [snapshot]);

  // Serialize writes so an earlier, slower request cannot overwrite a newer basket.
  useEffect(() => {
    if (!checkoutRestored || !storageWritable) return;
    const activeOrder = {
      cart: cart.map(serializeCartLine),
      customerId, discount, notes, split, tenders, payment, amountPaid
    };
    const payload = JSON.stringify({ version: 1, savedAt: Date.now(), active: activeOrder, held: held.map(serializeOrder) });
    persistenceQueue.current = persistenceQueue.current.then(async () => {
      const saved = await window.beBossDesktop.secureStore.set(storageKey, payload);
      if (!saved) throw new Error("The encrypted local store rejected the checkout update.");
    }).catch((error) => {
      setStorageWarning("Checkout changes remain on screen but could not be persisted: " + errorText(error));
    });
  }, [checkoutRestored, storageWritable, storageKey, cart, customerId, discount, notes, split, tenders, payment, amountPaid, held]);

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
    if (n(product.quantityInStock) <= 0) {
      setScanFeedback(s(product.name) + " is out of stock.");
      return;
    }
    setCart((old) => {
      const exists = old.find((item) => s(item.product.id) === s(product.id));
      if (exists) return old.map((item) => s(item.product.id) === s(product.id) ? { ...item, quantity: Math.min(n(product.quantityInStock), item.quantity + 1) } : item);
      return [...old, { product, quantity: 1 }];
    });
    setDone("");
    setScanFeedback(s(product.name) + " added to the basket.");
  }
  function scanBarcode(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const code = search.trim().toLowerCase();
    if (!code) return;
    event.preventDefault();
    const matches = products.filter((product) =>
      [product.barcode, product.sku, product.productCode].some((value) => s(value).trim().toLowerCase() === code)
    );
    if (matches.length === 1) {
      add(matches[0]);
      setSearch("");
    } else if (matches.length > 1) {
      setScanFeedback("This barcode is assigned to more than one product. Correct the catalogue before scanning it.");
    } else {
      setScanFeedback("No exact barcode match. Search by product name or check the barcode and try again.");
    }
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
      id: id(), label: label.trim() || "Order " + (held.length + 1), heldAt: Date.now(),
      cart, customerId, discount, notes, split, tenders, payment, amountPaid
    };
    setHeld((old) => [...old, snapshotCart]);
    setCart([]); setCustomerId(""); setDiscount("0"); setAmountPaid(""); setNotes("");
    setSplit(false); setPayment("CASH"); setTenders(EMPTY_TENDERS);
  }
  function resumeOrder(order: HeldCart) {
    setCart(order.cart); setCustomerId(order.customerId); setDiscount(order.discount);
    setNotes(order.notes); setSplit(order.split); setTenders(order.tenders); setPayment(order.payment); setAmountPaid(order.amountPaid);
    setHeld((old) => old.filter((item) => item.id !== order.id));
    setDone("");
  }
  function removeHeld(orderId: string) { setHeld((old) => old.filter((item) => item.id !== orderId)); }

  async function completeSale() {
    if (!checkoutRestored) throw new Error("Saved checkout data is still being restored. Please try again.");
    if (!cart.length) throw new Error("Add at least one product to the cart.");

    // Validate against the latest catalogue, not a product object captured before
    // another terminal changed inventory or pricing.
    const latestProducts = activeProducts(snapshot);
    const latestById = new Map(latestProducts.map((product) => [s(product.id), product]));
    const saleCart = cart.map((line) => {
      const product = latestById.get(s(line.product.id));
      if (!product) throw new Error(s(line.product.name) + " is no longer active in this shop catalogue.");
      const available = n(product.quantityInStock);
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error("A basket quantity is invalid.");
      if (line.quantity > available) throw new Error(s(product.name) + " has only " + available + " " + (s(product.unit) || "units") + " available. Refresh the basket before checkout.");
      return { product, quantity: line.quantity };
    });
    const saleSubtotal = saleCart.reduce((sum, line) => sum + n(line.product.sellingPrice) * line.quantity, 0);
    const saleDiscount = Math.max(0, Math.min(saleSubtotal, n(discount)));
    const saleTotal = Math.max(0, saleSubtotal - saleDiscount);
    const saleSplitPaid = (Object.keys(tenders) as TenderKey[]).reduce((sum, key) => sum + Math.max(0, n(tenders[key])), 0);
    const salePaid = split ? saleSplitPaid : payment === "DEBT" ? 0 : amountPaid === "" ? saleTotal : Math.max(0, n(amountPaid));
    const saleDebt = Math.max(0, saleTotal - salePaid);
    const saleCustomer = activeCustomers(snapshot).find((customer) => s(customer.id) === customerId);
    if (saleTotal <= 0) throw new Error("The sale total must be greater than zero.");
    const saleBranches = new Set(saleCart.map((line) => s(line.product.branchId) || "main_branch"));
    if (saleBranches.size > 1) throw new Error("A checkout can only contain products from one branch. Complete one branch sale at a time.");
    if (split && saleSplitPaid <= 0) throw new Error("Enter at least one amount for the split payment.");
    if (split && saleSplitPaid > saleTotal) throw new Error("Split tender amounts cannot exceed the sale total.");
    if (payment === "DEBT" && !saleCustomer) throw new Error("Select a customer before creating a credit sale.");
    if (saleDebt > 0 && !saleCustomer) throw new Error("Select a customer or collect the full sale amount.");
    if (saleCustomer && saleDebt > 0 && saleDebt + n(saleCustomer.debtBalance) > n(saleCustomer.creditLimit)) throw new Error("This sale would exceed the customer's credit limit.");
    const now = Date.now();
    const saleId = id();
    const receiptNumber = "BB-" + now.toString().slice(-10);
    const items = saleCart.map((item) => ({
      id: id(), saleId, productId: s(item.product.id), productName: s(item.product.name), category: s(item.product.category),
      unit: s(item.product.unit) || "pcs", quantitySold: item.quantity, costPriceAtSale: n(item.product.costPrice),
      unitPriceAtSale: n(item.product.sellingPrice), subtotal: n(item.product.sellingPrice) * item.quantity,
      profit: (n(item.product.sellingPrice) - n(item.product.costPrice)) * item.quantity, branchId: s(item.product.branchId) || "main_branch"
    }));
    const totalCost = items.reduce((sum, item) => sum + item.costPriceAtSale * item.quantitySold, 0);
    const sale = {
      id: saleId, customerId: saleCustomer ? s(saleCustomer.id) : null, customerName: saleCustomer ? s(saleCustomer.name) : "Walk-in Customer",
      saleDate: now, totalAmount: saleTotal, totalCost, totalProfit: saleTotal - totalCost, discountAmount: saleDiscount,
      paymentMethod: effectiveMethod, paymentStatus: saleDebt <= 0.01 ? "PAID" : salePaid > 0 ? "PARTIAL" : "UNPAID",
      amountPaid: Math.min(saleTotal, salePaid), tenders: split ? tenderRows : [], notes: notes.trim(), receiptNumber,
      branchId: s(saleCart[0]?.product.branchId) || "main_branch", branchName: "", cashierId: "DESKTOP",
      cashierName: cashierName || "Shop Owner", synced: false, updatedAt: now, syncVersion: 1, hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP"
    };
    await onCommit((next) => {
      const stockUpdates = items.map((item) => {
        const product = next.products.find((row) => s(row.id) === item.productId && row.isDeleted !== true);
        if (!product) throw new Error(item.productName + " is no longer available. Refresh inventory and retry.");
        const available = n(product.quantityInStock);
        if (item.quantitySold > available) throw new Error(item.productName + " now has only " + available + " available. The sale was not posted.");
        return { product, quantity: item.quantitySold };
      });
      const customer = saleDebt > 0
        ? next.customers.find((row) => s(row.id) === customerId && row.isDeleted !== true)
        : undefined;
      if (saleDebt > 0 && !customer) throw new Error("The selected customer record is no longer available. Refresh and retry.");
      if (customer && n(customer.debtBalance) + saleDebt > n(customer.creditLimit)) {
        throw new Error("The latest customer balance would exceed the credit limit. The sale was not posted.");
      }
      next.sales.unshift(sale);
      next.saleItems.push(...items);
      for (const update of stockUpdates) {
        update.product.quantityInStock = n(update.product.quantityInStock) - update.quantity;
        update.product.updatedAt = now; update.product.hlcTimestamp = 0;
        update.product.syncVersion = n(update.product.syncVersion) + 1;
        update.product.lastModifiedDeviceId = "DESKTOP";
      }
      if (customer && saleDebt > 0) {
        customer.debtBalance = n(customer.debtBalance) + saleDebt;
        customer.updatedAt = now; customer.hlcTimestamp = 0;
        customer.syncVersion = n(customer.syncVersion) + 1;
        customer.lastModifiedDeviceId = "DESKTOP";
      }
    }, "SALE");
    onReceipt(sale, items);
    setDone(receiptNumber); setCart([]); setCustomerId(""); setDiscount("0"); setAmountPaid(""); setNotes("");
    setSplit(false); setPayment("CASH"); setTenders(EMPTY_TENDERS);
  }

  async function completeQuickSale(event: React.FormEvent) {
    event.preventDefault();
    if (quickSaleBusy) return;
    const name = quickSaleName.trim();
    const amount = n(quickSaleAmount);
    const cost = quickSaleCost.trim() === "" ? amount * 0.7 : n(quickSaleCost);
    if (!snapshot) throw new Error("A verified shop snapshot is required before recording a quick sale.");
    if (name.length < 2) { setQuickSaleError("Enter a description for this item or service."); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setQuickSaleError("Sale amount must be greater than zero."); return; }
    if (!Number.isFinite(cost) || cost < 0) { setQuickSaleError("Cost estimate must be zero or greater."); return; }

    const availableBranches = rows(snapshot.branches).filter((branch) => branch.isActive !== false);
    const chosenBranch = availableBranches.find((branch) => s(branch.id) === quickSaleBranchId)
      ?? availableBranches.find((branch) => branch.isMainBranch === true)
      ?? availableBranches[0];
    const branchId = s(chosenBranch?.id) || "main_branch";
    const branchName = s(chosenBranch?.name) || "Main Branch";
    const now = Date.now();
    const saleId = id();
    const receiptNumber = "BB-QS-" + now.toString().slice(-8);
    const productId = "custom_" + saleId;
    const item = {
      id: id(), saleId, productId, productName: name, category: "Quick Sale", unit: "item",
      quantitySold: 1, costPriceAtSale: cost, unitPriceAtSale: amount, subtotal: amount,
      profit: amount - cost, branchId
    };
    const sale = {
      id: saleId, customerId: null, customerName: "Quick Cash Customer", saleDate: now,
      totalAmount: amount, totalCost: cost, totalProfit: amount - cost, discountAmount: 0,
      paymentMethod: quickSalePayment, paymentStatus: "PAID", amountPaid: amount, tenders: [],
      notes: ("Quick POS Sale: " + name + (quickSaleNotes.trim() ? " · " + quickSaleNotes.trim() : "") +
        (quickSaleCost.trim() ? "" : " · estimated cost 70% of sale value")).slice(0, 1000),
      receiptNumber, branchId, branchName, cashierId: cashierName || "DESKTOP", cashierName: cashierName || "Shop Owner",
      synced: false, updatedAt: now, syncVersion: 1, hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP"
    };

    setQuickSaleBusy(true);
    setQuickSaleError("");
    try {
      await onCommit((next) => {
        if (next.sales.some((existing) => s(existing.id) === saleId)) {
          throw new Error("This quick sale already exists. Refresh the ledger before retrying.");
        }
        if (branchId !== "main_branch" && !next.branches.some((branch) => s(branch.id) === branchId && branch.isActive !== false)) {
          throw new Error("The selected branch is no longer active. Refresh branches and try again.");
        }
        next.sales.unshift(sale);
        next.saleItems.push(item);
      }, "SALE");
      onReceipt(sale, [item]);
      setDone(receiptNumber);
      setQuickSaleOpen(false);
      setQuickSaleName("");
      setQuickSaleAmount("");
      setQuickSaleCost("");
      setQuickSalePayment("CASH");
      setQuickSaleNotes("");
    } catch (error) {
      setQuickSaleError(errorText(error));
    } finally {
      setQuickSaleBusy(false);
    }
  }

  return <div className="page-stack">
    <PageHeading eyebrow="POINT OF SALE" title="New sale" description="Search the shop catalogue, add products, collect payment and post a sale to the shared BeBoss ledger." action={<div className="heading-actions"><span className="secure-label"><ShieldCheck size={15} /> {offline ? "Offline-capable, owner-authorized checkout" : "Online, owner-authorized checkout"}</span><button type="button" className="btn-outline" onClick={() => { setQuickSaleError(""); setQuickSaleBranchId(s(snapshot?.metadata?.activeBranchId)); setQuickSaleOpen(true); }} disabled={!snapshot || busy}><ReceiptText size={15} /> Quick custom sale</button></div>} />
    {!snapshot ? <Empty title="No verified product catalogue" description="Sync the shop's Android terminal before starting desktop sales." /> : <div className="pos-layout">
      <section className="pos-products">
        <div className="pos-search"><Barcode size={16} /><input value={search} onChange={(e) => { setSearch(e.target.value); setScanFeedback(""); }} onKeyDown={scanBarcode} placeholder="Search or scan a barcode, then press Enter…" autoFocus /><span className="pos-search-count">{cartCount} in cart</span></div>
        <div className="panel-hint checkout-assist-row"><span>USB / Bluetooth keyboard-wedge barcode scanners are supported.</span>{!checkoutRestored ? <strong>Restoring saved checkout…</strong> : scanFeedback ? <strong>{scanFeedback}</strong> : null}</div>
        {storageWarning && <div className="global-alert error">{storageWarning}</div>}
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
          <div className="cart-info"><strong>{s(item.product.name)}</strong>{item.product.restoreUnavailable ? <small className="warn-text">No longer in the live catalogue — remove or replace this line before checkout.</small> : <small>{money(item.product.sellingPrice)} each</small>}</div>
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
          <button className="btn-primary full" disabled={busy || !checkoutRestored || !cart.length} onClick={() => completeSale().catch((e) => alert(errorText(e)))}><Check size={18} />{busy ? "Saving sale…" : "Complete sale"}</button>
          {done && <div className="sale-complete"><Check size={17} /><span>{offline ? "Sale saved locally and queued for sync" : "Sale saved locally and synced to BeBoss Cloud"} · receipt {done}</span></div>}
        </div>
      </section>
    </div>}
    {quickSaleOpen && <Modal title="Quick custom sale" onClose={() => { if (!quickSaleBusy) setQuickSaleOpen(false); }}>
      <form className="form-grid" onSubmit={(event) => void completeQuickSale(event)}>
        {quickSaleError && <div className="inline-alert error field-wide">{quickSaleError}</div>}
        <label className="field-wide">Item or service description<input required minLength={2} maxLength={120} autoFocus value={quickSaleName} onChange={(event) => setQuickSaleName(event.target.value)} placeholder="e.g. Phone repair, delivery or service" /></label>
        <label>Sale amount (FRw)<input required type="number" min="1" step="1" value={quickSaleAmount} onChange={(event) => setQuickSaleAmount(event.target.value)} placeholder="0" /></label>
        <label>Cost estimate (FRw)<input type="number" min="0" step="1" value={quickSaleCost} onChange={(event) => setQuickSaleCost(event.target.value)} placeholder={quickSaleAmount ? String(Math.round(n(quickSaleAmount) * 0.7)) + " · 70% estimate" : "Enter cost"} /></label>
        <label>Payment method<select value={quickSalePayment} onChange={(event) => setQuickSalePayment(event.target.value)}><option value="CASH">Cash</option><option value="MOMO">MTN MoMo</option><option value="AIRTEL">Airtel Money</option><option value="CARD">Card</option></select></label>
        <label>Branch<select value={quickSaleBranchId} onChange={(event) => setQuickSaleBranchId(event.target.value)}>{rows(snapshot?.branches).filter((branch) => branch.isActive !== false).map((branch) => <option key={s(branch.id)} value={s(branch.id)}>{s(branch.name) || s(branch.code)}</option>)}{!rows(snapshot?.branches).length && <option value="main_branch">Main Branch</option>}</select></label>
        <label className="field-wide">Notes (optional)<textarea rows={2} maxLength={500} value={quickSaleNotes} onChange={(event) => setQuickSaleNotes(event.target.value)} placeholder="Service details or transaction note" /></label>
        <p className="panel-hint field-wide">This creates a paid sale and receipt in the shared ledger without adding a catalogue product or deducting stock. A blank cost uses the Android app's 70% estimated-cost rule; enter the actual cost to improve margin reporting.</p>
        <div className="form-actions field-wide"><button type="button" className="btn-outline" disabled={quickSaleBusy} onClick={() => setQuickSaleOpen(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={quickSaleBusy}>{quickSaleBusy ? "Saving sale…" : "Record quick sale"}</button></div>
      </form>
    </Modal>}
  </div>;
}