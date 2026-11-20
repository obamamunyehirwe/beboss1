import { 
  Banknote, Check, HandCoins, Minus, Plus, Printer, RotateCcw, 
  ShieldCheck, Smartphone, Split, Wifi, WifiOff, ScanLine, 
  Search, Trash2, ShoppingCart, Share2, Download, Pause, Play, 
  User, CheckCircle2, AlertCircle, FileText
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QRCodeSVG } from "qrcode.react";
import { useI18n } from "@/lib/i18n";
import { formatRwf } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ProductItem {
  id: string;
  name: string;
  category: "Dairy & Drinks" | "Staples & Grains" | "Household" | "Pharmacy" | "Hardware";
  price: number;
  cost: number;
  barcode: string;
  stock: number;
}

export const CATALOG: ProductItem[] = [
  { id: "p1", name: "Inyange Fresh Milk 1L", category: "Dairy & Drinks", price: 1100, cost: 900, barcode: "616110001234", stock: 48 },
  { id: "p2", name: "Bralirwa Primus Beer 500ml", category: "Dairy & Drinks", price: 1200, cost: 950, barcode: "616110005678", stock: 72 },
  { id: "p3", name: "Fanta Orange 500ml", category: "Dairy & Drinks", price: 600, cost: 450, barcode: "616110009012", stock: 60 },
  { id: "p4", name: "Sugar Kabuye 1kg", category: "Staples & Grains", price: 1600, cost: 1350, barcode: "616220003456", stock: 120 },
  { id: "p5", name: "Mukamira Rice Grade-1 5kg", category: "Staples & Grains", price: 7500, cost: 6200, barcode: "616220007890", stock: 35 },
  { id: "p6", name: "Azam Wheat Flour 2kg", category: "Staples & Grains", price: 2400, cost: 1950, barcode: "616220001122", stock: 40 },
  { id: "p7", name: "Cooking Oil Golden Drop 1L", category: "Household", price: 3200, cost: 2650, barcode: "616330004455", stock: 28 },
  { id: "p8", name: "Bar Soap Blue Pearl", category: "Household", price: 800, cost: 600, barcode: "616330006677", stock: 95 },
  { id: "p9", name: "Eggs Full Tray (30 pcs)", category: "Household", price: 4500, cost: 3800, barcode: "616330008899", stock: 22 },
  { id: "p10", name: "Panadol Extra 10 Tablets", category: "Pharmacy", price: 1500, cost: 1000, barcode: "616440001212", stock: 85 },
  { id: "p11", name: "Coartem Malaria Pack", category: "Pharmacy", price: 3500, cost: 2700, barcode: "616440003434", stock: 18 },
  { id: "p12", name: "Cement Cimerwa 32.5N 50kg", category: "Hardware", price: 11500, cost: 10200, barcode: "616550005656", stock: 50 },
];

const CUSTOMERS = [
  { id: "c1", name: "Kamanzi Jean Paul", phone: "0788392014", limit: 60000, debt: 12500 },
  { id: "c2", name: "Mukamana Marie", phone: "0785129481", limit: 40000, debt: 0 },
  { id: "c3", name: "Uwase Claudine (VIP)", phone: "0722998811", limit: 120000, debt: 45000 },
];

type PaymentMethod = "cash" | "momo" | "split" | "credit";

export interface CompletedSale {
  receiptNo: string;
  timestamp: string;
  total: number;
  profit: number;
  items: { name: string; qty: number; unitPrice: number; subtotal: number }[];
  method: PaymentMethod;
  cashGiven: number;
  change: number;
  momoAmount: number;
  customer?: string;
  seal: string;
}

export async function generateSeal(tin: string, receiptNo: string, isoTimestamp: string, total: number): Promise<string> {
  const payload = `${tin}|${receiptNo}|${isoTimestamp}|${Math.round(total)}`;
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `BB-${hex.slice(0, 10).toUpperCase()}`;
}

export function WebPosTerminal() {
  const { t } = useI18n();

  // Active Cart Hold & Resume tabs
  const [activeTab, setActiveTab] = useState<"cart1" | "cart2" | "cart3">("cart1");
  const [carts, setCarts] = useState<Record<string, Record<string, number>>>({
    cart1: { p1: 2, p4: 1, p7: 1 },
    cart2: { p5: 1, p8: 2 },
    cart3: {},
  });

  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [given, setGiven] = useState("10000");
  const [momoSplit, setMomoSplit] = useState("5000");
  const [selectedCustomer, setSelectedCustomer] = useState(CUSTOMERS[0].id);
  const [momoRef, setMomoRef] = useState("");
  const [receiptWidth, setReceiptWidth] = useState<"58mm" | "80mm">("80mm");
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [salesHistory, setSalesHistory] = useState<CompletedSale[]>([]);
  const [onlineSync, setOnlineSync] = useState(true);
  const [viewMode, setViewMode] = useState<"pos" | "history">("pos");

  const currentCart = carts[activeTab] || {};

  const lines = useMemo(() => {
    return Object.entries(currentCart)
      .map(([id, qty]) => {
        const prod = CATALOG.find((p) => p.id === id);
        if (!prod || qty <= 0) return null;
        return {
          ...prod,
          qty,
          subtotal: prod.price * qty,
          profit: (prod.price - prod.cost) * qty,
        };
      })
      .filter(Boolean) as (ProductItem & { qty: number; subtotal: number; profit: number })[];
  }, [currentCart]);

  const total = lines.reduce((acc, l) => acc + l.subtotal, 0);
  const totalProfit = lines.reduce((acc, l) => acc + l.profit, 0);
  const totalItemsCount = lines.reduce((acc, l) => acc + l.qty, 0);

  const cashGiven = Math.max(0, Math.floor(Number(given) || 0));
  const momoPart = Math.min(total, Math.max(0, Math.floor(Number(momoSplit) || 0)));
  const cashDue = method === "split" ? total - momoPart : total;
  const change = method === "cash" || method === "split" ? cashGiven - cashDue : 0;

  const activeCustomer = CUSTOMERS.find((c) => c.id === selectedCustomer);
  const customerOverLimit = method === "credit" && activeCustomer ? activeCustomer.debt + total > activeCustomer.limit : false;

  const canComplete =
    total > 0 &&
    (method === "momo" ||
      (method === "cash" && change >= 0) ||
      (method === "split" && change >= 0) ||
      (method === "credit" && !customerOverLimit));

  const updateCartItem = (id: string, delta: number) => {
    setCarts((prev) => {
      const targetCart = { ...(prev[activeTab] || {}) };
      const nextQty = Math.max(0, (targetCart[id] || 0) + delta);
      if (nextQty <= 0) delete targetCart[id];
      else targetCart[id] = nextQty;
      return { ...prev, [activeTab]: targetCart };
    });
  };

  const clearCurrentCart = () => {
    setCarts((prev) => ({ ...prev, [activeTab]: {} }));
  };

  const handleCheckout = async () => {
    if (!canComplete) return;

    const receiptNo = `BB-${String(Math.floor(Date.now() / 1000) % 1_000_000).padStart(6, "0")}`;
    const timestamp = new Date().toISOString();
    const tin = "100849201";
    const seal = await generateSeal(tin, receiptNo, timestamp, total);

    const sale: CompletedSale = {
      receiptNo,
      timestamp,
      total,
      profit: totalProfit,
      items: lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.price, subtotal: l.subtotal })),
      method,
      cashGiven: method === "cash" || method === "split" ? cashGiven : 0,
      change: Math.max(0, change),
      momoAmount: method === "split" ? momoPart : method === "momo" ? total : 0,
      customer: method === "credit" ? activeCustomer?.name : undefined,
      seal,
    };

    setCompletedSale(sale);
    setSalesHistory((prev) => [sale, ...prev]);
    clearCurrentCart();
  };

  const categories = ["All", "Dairy & Drinks", "Staples & Grains", "Household", "Pharmacy", "Hardware"];

  const filteredProducts = CATALOG.filter((p) => {
    const matchesCat = category === "All" || p.category === category;
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search);
    return matchesCat && matchesSearch;
  });

  const printReceipt = () => {
    window.print();
  };

  const shareWhatsApp = () => {
    if (!completedSale) return;
    const itemsList = completedSale.items.map((i) => `• ${i.qty}x ${i.name} = ${formatRwf(i.subtotal)}`).join("\n");
    const text = `*BEBOSS POS OFFICIAL RECEIPT*\nReceipt: ${completedSale.receiptNo}\nDate: ${new Date(completedSale.timestamp).toLocaleString()}\n\n${itemsList}\n\n*TOTAL: ${formatRwf(completedSale.total)}*\nPaid by: ${completedSale.method.toUpperCase()}\nSeal: ${completedSale.seal}\n\nMurakoze gukorana natwe!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="rounded-[2.5rem] border border-border bg-card shadow-soft overflow-hidden">
      {/* Top POS Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <ShoppingCart className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold">BeBoss Enterprise Web POS Terminal</h3>
              <Badge variant="success" className="text-[10px] uppercase">v2.0 Cloud Connected</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Kigali Main Store • Counter Station #1 • Rwanda FRw</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Hold / Resume Multi-Cart Tabs */}
          <div className="flex rounded-xl border border-border bg-background p-1">
            {(["cart1", "cart2", "cart3"] as const).map((tab, idx) => {
              const count = Object.values(carts[tab] || {}).reduce((a, b) => a + b, 0);
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all",
                    activeTab === tab ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Tab {idx + 1}
                  {count > 0 && (
                    <span className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                      activeTab === tab ? "bg-primary-foreground text-primary" : "bg-primary/20 text-primary"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <Button
            size="sm"
            variant={viewMode === "history" ? "secondary" : "glass"}
            onClick={() => setViewMode(viewMode === "pos" ? "history" : "pos")}
          >
            <FileText className="size-3.5" />
            History ({salesHistory.length})
          </Button>

          <button
            type="button"
            onClick={() => setOnlineSync(!onlineSync)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all",
              onlineSync ? "border-success/40 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning"
            )}
          >
            {onlineSync ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {onlineSync ? "Cloud Sync: LIVE" : "Offline: Room Outbox"}
          </button>
        </div>
      </div>

      {viewMode === "history" ? (
        /* Terminal Sales History View */
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-bold">Today's Terminal Sales Ledger</h4>
              <p className="text-xs text-muted-foreground">Transactions committed atomically to local storage and queued for Supabase sync.</p>
            </div>
            <Button size="sm" variant="hero" onClick={() => setViewMode("pos")}>
              <ShoppingCart className="size-4" /> Return to Counter POS
            </Button>
          </div>

          {salesHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              <ShoppingCart className="mx-auto size-8 opacity-40 mb-2" />
              <p>No sales completed yet on this counter station today.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="p-3">Receipt No</th>
                    <th className="p-3">Time</th>
                    <th className="p-3">Items</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Profit Margin</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Cryptographic Seal</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-xs">
                  {salesHistory.map((s) => (
                    <tr key={s.receiptNo} className="hover:bg-surface/50">
                      <td className="p-3 font-bold text-foreground">{s.receiptNo}</td>
                      <td className="p-3 text-muted-foreground">{new Date(s.timestamp).toLocaleTimeString()}</td>
                      <td className="p-3 font-sans">{s.items.length} line items</td>
                      <td className="p-3 font-bold text-success">{formatRwf(s.total)}</td>
                      <td className="p-3 text-primary">+{formatRwf(s.profit)} ({Math.round((s.profit / s.total) * 100)}%)</td>
                      <td className="p-3 font-sans">
                        <Badge variant="muted" className="text-[10px]">{s.method.toUpperCase()}</Badge>
                      </td>
                      <td className="p-3 font-bold text-primary">{s.seal}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setCompletedSale(s)}>
                          <Printer className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Main POS Counter View */
        <div className="grid gap-0 lg:grid-cols-[1.5fr_1fr]">
          {/* Left Column: Product Grid & Barcode Scanner */}
          <div className="border-r border-border p-6 space-y-4">
            {/* Search & Category Filter */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products by name, SKU or barcode..."
                  className="pl-9 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                      category === c ? "bg-primary text-primary-foreground font-semibold" : "bg-surface hover:bg-surface-2 text-muted-foreground"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Cards Grid */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 max-h-[460px] overflow-y-auto pr-1">
              {filteredProducts.map((p) => {
                const inCart = currentCart[p.id] || 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => updateCartItem(p.id, 1)}
                    className={cn(
                      "group relative flex flex-col justify-between rounded-2xl border p-3 text-left transition-all hover:border-primary/50 hover:shadow-sm active:scale-[0.98]",
                      inCart > 0 ? "border-primary bg-primary/10 shadow-soft" : "border-border bg-card"
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">{p.category}</span>
                        {inCart > 0 && (
                          <span className="grid size-5 animate-pop place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                            {inCart}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs font-medium leading-tight group-hover:text-primary transition-colors">
                        {p.name}
                      </p>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between border-t border-border/50 pt-2 text-[11px]">
                      <span className="font-mono text-xs font-bold text-foreground">{formatRwf(p.price)}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">Stock: {p.stock - inCart}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Checkout Cart & Payment */}
          <div className="flex flex-col justify-between p-6 bg-surface-2/40">
            <div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm">Active Basket ({lines.length} items)</h4>
                  <span className="text-xs text-muted-foreground">• Total Units: {totalItemsCount}</span>
                </div>
                {lines.length > 0 && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/10" onClick={clearCurrentCart}>
                    <Trash2 className="size-3 mr-1" /> Clear
                  </Button>
                )}
              </div>

              {/* Cart Items List */}
              <div className="mt-3 max-h-[180px] space-y-1.5 overflow-y-auto pr-1">
                {lines.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    <ShoppingCart className="mx-auto size-6 opacity-30 mb-1.5" />
                    <p>No products in this cart.</p>
                    <p className="text-[11px]">Click items on the left to ring up sales.</p>
                  </div>
                ) : (
                  lines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 rounded-xl bg-card border border-border px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{l.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{formatRwf(l.price)} each</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateCartItem(l.id, -1)}
                          className="grid size-6 place-items-center rounded-md border border-border hover:bg-surface"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="w-5 text-center font-mono text-xs font-bold">{l.qty}</span>
                        <button
                          type="button"
                          onClick={() => updateCartItem(l.id, 1)}
                          className="grid size-6 place-items-center rounded-md border border-border hover:bg-surface"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                      <span className="w-20 text-right font-mono font-bold">{formatRwf(l.subtotal)}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Payment Methods */}
              <div className="mt-4 pt-3 border-t border-border space-y-3">
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: "cash", icon: Banknote, label: "Cash" },
                      { id: "momo", icon: Smartphone, label: "MTN MoMo" },
                      { id: "split", icon: Split, label: "Split Pay" },
                      { id: "credit", icon: HandCoins, label: "Debt (Amadeni)" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-medium transition-all",
                        method === m.id
                          ? "border-primary bg-primary/15 text-primary font-bold shadow-sm"
                          : "border-border text-muted-foreground hover:bg-surface hover:text-foreground"
                      )}
                    >
                      <m.icon className="size-4" />
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Method Specific Inputs */}
                {method === "cash" && (
                  <div className="rounded-xl border border-border bg-card p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Cash Tendered:</span>
                      <Input
                        type="number"
                        value={given}
                        onChange={(e) => setGiven(e.target.value)}
                        className="h-8 w-32 text-right font-mono font-bold"
                      />
                    </div>
                    {/* Quick Cash Presets */}
                    <div className="flex flex-wrap gap-1">
                      {[1000, 2000, 5000, 10000, 20000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setGiven(String(amt))}
                          className="rounded-lg border border-border bg-surface px-2 py-0.5 font-mono text-[10px] hover:border-primary"
                        >
                          +{amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between font-medium border-t border-border pt-1.5">
                      <span className="text-muted-foreground">Change Due:</span>
                      <span className={cn("font-mono font-bold", change < 0 ? "text-destructive" : "text-success")}>
                        {formatRwf(change)}
                      </span>
                    </div>
                  </div>
                )}

                {method === "momo" && (
                  <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-warning">MTN MoMo Dial Code:</span>
                      <span className="font-mono font-bold bg-background/80 px-2 py-0.5 rounded border border-warning/30">
                        *182*8*1*0788123456*{total}#
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Telco TxID / Ref:</span>
                      <Input
                        value={momoRef}
                        onChange={(e) => setMomoRef(e.target.value)}
                        placeholder="e.g. MP261120.1432.A1"
                        className="h-7 w-44 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                {method === "split" && (
                  <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">MoMo Share:</span>
                      <Input
                        type="number"
                        value={momoSplit}
                        onChange={(e) => setMomoSplit(e.target.value)}
                        className="h-7 w-28 text-right font-mono"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Cash Due ({formatRwf(cashDue)}):</span>
                      <Input
                        type="number"
                        value={given}
                        onChange={(e) => setGiven(e.target.value)}
                        className="h-7 w-28 text-right font-mono"
                      />
                    </div>
                    <div className="flex justify-between font-medium border-t border-border/50 pt-1">
                      <span className="text-muted-foreground">Cash Change:</span>
                      <span className={cn("font-mono font-bold", change < 0 ? "text-destructive" : "text-success")}>
                        {formatRwf(change)}
                      </span>
                    </div>
                  </div>
                )}

                {method === "credit" && (
                  <div className="rounded-xl border border-info/30 bg-info/10 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Select Customer:</span>
                      <select
                        value={selectedCustomer}
                        onChange={(e) => setSelectedCustomer(e.target.value)}
                        className="h-7 rounded-lg border border-border bg-card px-2 text-xs font-medium"
                      >
                        {CUSTOMERS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({formatRwf(c.debt)} debt)
                          </option>
                        ))}
                      </select>
                    </div>
                    {activeCustomer && (
                      <div className="text-[11px] space-y-0.5 border-t border-info/20 pt-1 text-muted-foreground">
                        <p>Credit Limit: {formatRwf(activeCustomer.limit)} • Current Balance: {formatRwf(activeCustomer.debt)}</p>
                        {customerOverLimit ? (
                          <p className="font-bold text-destructive">Sale exceeds customer credit limit by {formatRwf(activeCustomer.debt + total - activeCustomer.limit)}!</p>
                        ) : (
                          <p className="text-success font-medium">Remaining Credit after sale: {formatRwf(activeCustomer.limit - (activeCustomer.debt + total))}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Total Summary & Checkout Button */}
            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <span className="text-xs text-muted-foreground">Total Checkout Amount</span>
                  <p className="text-[11px] text-success font-mono font-medium">Est. Gross Profit: +{formatRwf(totalProfit)}</p>
                </div>
                <span className="font-display text-2xl font-extrabold text-foreground">{formatRwf(total)}</span>
              </div>

              <Button
                variant="hero"
                size="lg"
                className="w-full font-bold shadow-brand"
                disabled={!canComplete}
                onClick={handleCheckout}
              >
                <Printer className="size-4" />
                Complete Sale & Generate BB- Receipt
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sealed Thermal Receipt Modal / Dialog */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-pop">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" />
                <h4 className="font-bold text-base">Receipt Generated & Sealed</h4>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setReceiptWidth(receiptWidth === "58mm" ? "80mm" : "58mm")}
                  className="rounded-lg border border-border px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:bg-surface"
                >
                  Roll: {receiptWidth}
                </button>
                <Button size="sm" variant="ghost" onClick={() => setCompletedSale(null)}>
                  ✕
                </Button>
              </div>
            </div>

            {/* The Actual Thermal Receipt */}
            <div className="my-4 mx-auto bg-foreground p-5 font-mono text-[11px] leading-relaxed text-background rounded-2xl shadow-soft max-w-[340px]">
              <div className="text-center">
                <p className="text-sm font-extrabold tracking-wider">BEBOSS RETAIL POS</p>
                <p className="text-[10px]">KIMIRONKO COMMERCIAL CENTER, KIGALI</p>
                <p className="text-[10px]">TIN: 100849201 • TEL: +250 788 123 456</p>
              </div>

              <div className="my-2 border-t border-dashed border-background/40" />
              <div className="flex justify-between text-[10px]">
                <span>NO: {completedSale.receiptNo}</span>
                <span>{new Date(completedSale.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="text-[10px]">DATE: {new Date(completedSale.timestamp).toLocaleDateString()}</div>
              <div className="my-2 border-t border-dashed border-background/40" />

              <div className="space-y-1">
                {completedSale.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="truncate">{item.qty}x {item.name}</span>
                    <span>{formatRwf(item.subtotal)}</span>
                  </div>
                ))}
              </div>

              <div className="my-2 border-t border-dashed border-background/40" />
              <div className="flex justify-between text-xs font-bold">
                <span>TOTAL AMOUNT:</span>
                <span>{formatRwf(completedSale.total)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-background/80">
                <span>PAYMENT METHOD:</span>
                <span>{completedSale.method.toUpperCase()}</span>
              </div>
              {completedSale.change > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span>CHANGE TENDERED:</span>
                  <span>{formatRwf(completedSale.change)}</span>
                </div>
              )}
              {completedSale.customer && (
                <div className="flex justify-between text-[10px]">
                  <span>DEBTOR:</span>
                  <span>{completedSale.customer}</span>
                </div>
              )}

              <div className="my-3 border-t border-dashed border-background/40" />

              {/* QR Code and Cryptographic Seal */}
              <div className="flex flex-col items-center justify-center gap-1.5 text-center">
                <div className="bg-white p-1 rounded-md">
                  <QRCodeSVG value={`BEBOSS|${completedSale.receiptNo}|${completedSale.seal}|${completedSale.total}`} size={64} />
                </div>
                <p className="flex items-center gap-1 font-bold text-[10px] mt-1">
                  <ShieldCheck className="size-3" /> SEAL: {completedSale.seal}
                </p>
                <p className="text-[9px] opacity-70">OFFLINE SHA-256 TAMPER-PROOF AUTHENTICATION</p>
                <p className="text-[9px] font-sans font-semibold mt-1">MURAKOZE CYANE • THANK YOU FOR SHOPPING</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              <Button size="sm" variant="glass" onClick={shareWhatsApp}>
                <Share2 className="size-3.5" /> WhatsApp
              </Button>
              <Button size="sm" variant="glass" onClick={printReceipt}>
                <Printer className="size-3.5" /> Print Roll
              </Button>
              <Button size="sm" variant="hero" onClick={() => setCompletedSale(null)}>
                <RotateCcw className="size-3.5" /> New Sale
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const CheckoutDemo = WebPosTerminal;
