import { 
  ScanLine, Wifi, WifiOff, Smartphone, ShieldCheck, 
  TrendingUp, Users, AlertTriangle, CheckCircle2, 
  Barcode, Layers, ArrowUpRight, MessageCircle,
  Plus, Minus, RotateCcw, Share2, Printer, Check,
  QrCode, Cloud, Database, Sparkles, RefreshCw,
  Coins, ArrowRight, Zap, ShoppingBag, Radio,
  Send, DollarSign, Package, AlertCircle
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { formatRwf } from "@/lib/format";
import { cn } from "@/lib/utils";

type ScreenMode = "pos" | "debt" | "stock" | "sync" | "report";

interface ProductItem {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  unit: string;
}

const PRODUCTS: ProductItem[] = [
  { id: "p1", name: "Inyange Milk 1L", category: "Dairy", price: 1200, stock: 14, unit: "btl" },
  { id: "p2", name: "Kabuye Sugar 1kg", category: "Staples", price: 1600, stock: 28, unit: "kg" },
  { id: "p3", name: "Mukamira Rice 5kg", category: "Staples", price: 7500, stock: 5, unit: "bag" },
  { id: "p4", name: "Panadol Extra 10s", category: "Pharmacy", price: 2000, stock: 19, unit: "pkt" },
  { id: "p5", name: "Cooking Oil 1L", category: "Staples", price: 3400, stock: 2, unit: "btl" },
  { id: "p6", name: "Kinazi Cassava 2kg", category: "Staples", price: 2200, stock: 11, unit: "bag" },
];

interface CustomerDebt {
  id: string;
  name: string;
  phone: string;
  debt: number;
  limit: number;
  status: "overdue" | "due_soon" | "good";
  dueDate: string;
}

const CUSTOMERS: CustomerDebt[] = [
  { id: "c1", name: "Mugisha Jean", phone: "+250 788 123 456", debt: 24000, limit: 50000, status: "due_soon", dueDate: "Due in 2 days" },
  { id: "c2", name: "Mukamana Sarah", phone: "+250 788 987 654", debt: 45000, limit: 40000, status: "overdue", dueDate: "Over limit by 5k" },
  { id: "c3", name: "Hakizimana Eric", phone: "+250 783 555 111", debt: 12500, limit: 60000, status: "good", dueDate: "Due next week" },
  { id: "c4", name: "Uwase Claudine", phone: "+250 789 222 333", debt: 38000, limit: 80000, status: "due_soon", dueDate: "Due tomorrow" },
];

export function PhoneMockup() {
  const { p } = useI18n();
  const m = p.mockup;
  const [screen, setScreen] = useState<ScreenMode>("pos");
  const [online, setOnline] = useState(true);
  const [currentTime, setCurrentTime] = useState("09:41");

  // Dynamic Island notification state
  const [islandAlert, setIslandAlert] = useState<string | null>(null);

  // Cart state for POS
  const [cart, setCart] = useState<Record<string, number>>({ p1: 2, p2: 1, p4: 1 });
  const [activeCartTab, setActiveCartTab] = useState<1 | 2>(1);
  const [isScanning, setIsScanning] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState<{
    receiptNo: string;
    total: number;
    items: { name: string; qty: number; total: number }[];
    seal: string;
    method: string;
  } | null>(null);

  // Debts state
  const [debtsList, setDebtsList] = useState<CustomerDebt[]>(CUSTOMERS);

  // Stock inventory state
  const [stockList, setStockList] = useState<ProductItem[]>(PRODUCTS);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(100);
  

  // Live Clock updater
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  // Cart totals
  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const prod = stockList.find((p) => p.id === id);
        return prod ? { ...prod, qty, total: prod.price * qty } : null;
      })
      .filter((item): item is ProductItem & { qty: number; total: number } => item !== null);
  }, [cart, stockList]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.total, 0);
  }, [cartItems]);

  const totalCartCount = useMemo(() => {
    return Object.values(cart).reduce((a, b) => a + b, 0);
  }, [cart]);

  // Show an alert inside the Dynamic Island
  const triggerIslandAlert = (text: string) => {
    setIslandAlert(text);
    setTimeout(() => {
      setIslandAlert(null);
    }, 3200);
  };

  // Add product to cart
  const addToCart = (productId: string) => {
    setCart((prev) => ({
      ...prev,
      [productId]: (prev[productId] ?? 0) + 1,
    }));
    const prod = stockList.find((p) => p.id === productId);
    if (prod) {
      triggerIslandAlert(`+1 ${prod.name}`);
    }
  };

  // Adjust cart item quantity
  const updateQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[productId] ?? 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  // Barcode scanner trigger simulation
  const handleScanLaser = () => {
    setIsScanning(true);
    triggerIslandAlert("Demo barcode scanner preview");
    setTimeout(() => {
      setIsScanning(false);
      addToCart("p5"); // Add cooking oil
      triggerIslandAlert("Sample item added to the demo cart");
    }, 1200);
  };

  // Complete checkout tender
  const handleCheckout = (method: string) => {
    if (cartItems.length === 0) return;
    const seal = `DEMO-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
    const receiptNo = `R-${Math.floor(100000 + Math.random() * 900000)}`;
    setCompletedReceipt({
      receiptNo,
      total: cartTotal,
      items: cartItems.map((i) => ({ name: i.name, qty: i.qty, total: i.total })),
      seal,
      method,
    });
    setCart({});
    triggerIslandAlert("Demo checkout completed — no payment was collected");
  };

  // Trigger manual cloud sync
  const handleCloudSync = () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncProgress(15);
    triggerIslandAlert("Starting the demo sync animation — no data will be sent");

    setTimeout(() => setSyncProgress(45), 400);
    setTimeout(() => setSyncProgress(85), 800);
    setTimeout(() => {
      setSyncProgress(100);
      setIsSyncing(false);
      triggerIslandAlert("Demo sync animation complete — no data was sent");
    }, 1300);
  };

  // Record customer debt payment
  const handlePayDebt = (customerId: string, amount: number) => {
    setDebtsList((prev) =>
      prev.map((c) => {
        if (c.id === customerId) {
          const nextDebt = Math.max(0, c.debt - amount);
          return {
            ...c,
            debt: nextDebt,
            status: nextDebt <= c.limit ? "good" : "overdue",
          };
        }
        return c;
      })
    );
    triggerIslandAlert(`Collected ${formatRwf(amount)}`);
  };

  // Restock inventory item
  const handleRestock = (productId: string, qty: number) => {
    setStockList((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          return { ...item, stock: item.stock + qty };
        }
        return item;
      })
    );
    const item = stockList.find((p) => p.id === productId);
    triggerIslandAlert(`Restocked +${qty} ${item?.name || "units"}`);
  };

  const totalDebtBalance = debtsList.reduce((acc, c) => acc + c.debt, 0);

  return (
    <div className="relative mx-auto w-full max-w-[352px] select-none py-1">
      {/* Dynamic Background Glow Ambient Aura */}
      <div 
        className="absolute -inset-3 rounded-[3.5rem] bg-gradient-to-tr from-primary/30 via-warning/20 to-success/30 opacity-50 blur-2xl transition-opacity duration-1000" 
        aria-hidden="true" 
      />

      {/* ---------------- SMARTPHONE HARDWARE CHASSIS ---------------- */}
      <div className="relative rounded-[2.7rem] bg-gradient-to-b from-[#2a2d34] via-[#1a1c22] to-[#0f1115] p-[8px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.15)] ring-1 ring-black/80">
        
        {/* Left Physical Hardware Buttons: Mute Switch & Volume Rocker */}
        <div className="absolute -left-[4px] top-20 h-5 w-[4px] rounded-l-md bg-[#3a3e47] border-y border-l border-white/20 shadow-xs" />
        <div className="absolute -left-[4px] top-30 h-9 w-[4px] rounded-l-md bg-[#3a3e47] border-y border-l border-white/20 shadow-xs" />
        <div className="absolute -left-[4px] top-42 h-9 w-[4px] rounded-l-md bg-[#3a3e47] border-y border-l border-white/20 shadow-xs" />

        {/* Right Physical Hardware Button: Power / Lock Button */}
        <div className="absolute -right-[4px] top-28 h-12 w-[4px] rounded-r-md bg-[#3a3e47] border-y border-r border-white/20 shadow-xs" />

        {/* Outer Bezel Rim */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-[2.2rem] bg-background text-foreground border border-black/60 shadow-inner h-[660px] max-h-[660px]">
          
          {/* ================= TOP STATUS BAR & DYNAMIC ISLAND ================= */}
          <div className="relative z-30 bg-background/95 pt-2 px-4 pb-1.5 backdrop-blur-md border-b border-border/40">
            {/* Top Bar Indicators */}
            <div className="flex items-center justify-between text-[10px] font-mono font-medium text-foreground">
              {/* Clock */}
              <span className="font-bold tracking-tight">{currentTime}</span>

              {/* DYNAMIC ISLAND (Interactive Pill) */}
              <div 
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 top-1.5 h-5 rounded-full bg-black text-white flex items-center justify-center px-2.5 transition-all duration-300 shadow-md",
                  islandAlert ? "w-48 bg-neutral-900 border border-primary/40 ring-1 ring-primary/30" : "w-20"
                )}
              >
                {islandAlert ? (
                  <span className="truncate text-[9px] font-sans font-semibold text-primary-foreground flex items-center gap-1 animate-fade-in">
                    <Sparkles className="size-2.5 text-warning shrink-0" />
                    {islandAlert}
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="size-1.5 rounded-full bg-neutral-800 border border-neutral-700" />
                    <div className="size-2 rounded-full bg-[#0d1624] border border-blue-950 flex items-center justify-center">
                      <div className="size-0.5 rounded-full bg-blue-500/80" />
                    </div>
                  </div>
                )}
              </div>

              {/* Status Icons: 5G, Wi-Fi toggle, Battery */}
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="text-[8.5px] font-sans font-bold text-foreground">5G</span>
                
                {/* Interactive Network Toggle */}
                <button
                  type="button"
                  title="Toggle simulated network state (demo only)" aria-label="Toggle demo network state"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = !online;
                    setOnline(next);
                    triggerIslandAlert(next ? "Network: Connected" : "Network: Offline");
                  }}
                  className="flex items-center hover:opacity-80 transition-opacity"
                >
                  {online ? (
                    <Wifi className="size-3 text-success animate-pulse" />
                  ) : (
                    <WifiOff className="size-3 text-warning" />
                  )}
                </button>

                {/* Battery with charge icon */}
                <div className="flex items-center gap-0.5 font-sans text-[9px] font-bold text-foreground">
                  <span>96%</span>
                  <div className="h-2 w-3.5 rounded-xs border border-foreground/60 p-[0.5px] flex items-center">
                    <div className="h-full w-2.5 bg-success rounded-[0.5px]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Store Identification Strip */}
            <div className="mt-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img 
                  src="/beboss-brand.svg" 
                  alt="" 
                  className="size-6 rounded-lg object-cover shadow-xs border border-border/60" 
                />
                <div>
                  <p className="font-display text-[11px] font-bold leading-none truncate max-w-[125px]">
                    BeBoss Sample Shop
                  </p>
                  <p className="text-[8.5px] text-muted-foreground mt-0.5 font-medium flex items-center gap-1">
                    <span className="size-1 rounded-full bg-success" />
                    DEMO DATA · sample account
                  </p>
                </div>
              </div>

              {/* Sync Status Badge */}
              <button
                type="button"
                onClick={handleCloudSync}
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[8.5px] font-bold flex items-center gap-1 border transition-all",
                  isSyncing
                    ? "bg-primary/20 text-primary border-primary/40 animate-pulse"
                    : online
                    ? "bg-success/15 text-success border-success/30 hover:bg-success/20"
                    : "bg-warning/15 text-warning border-warning/30"
                )}
              >
                <RefreshCw className={cn("size-2", isSyncing && "animate-spin")} />
                <span>{isSyncing ? "Demo sync..." : online ? "Online · Demo" : "Offline · Demo"}</span>
              </button>
            </div>
          </div>

          {/* ================= DYNAMIC INTERACTIVE SCREEN CONTENT ================= */}
          <div className="relative flex-1 overflow-y-auto px-3.5 py-2.5 text-xs">
            
            {/* LASER BARCODE SCANNING ANIMATION OVERLAY */}
            {isScanning && (
              <div className="pointer-events-none absolute inset-0 z-40 bg-black/30 backdrop-blur-[1px] flex flex-col items-center justify-center">
                <div className="w-48 h-28 border-2 border-primary/80 rounded-2xl relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-laser-scan shadow-[0_0_12px_rgba(249,115,22,0.9)]" />
                  <Barcode className="size-16 text-white/50" />
                </div>
                <p className="mt-2 text-[10px] font-bold text-white uppercase tracking-wider">Targeting Barcode...</p>
              </div>
            )}

            {/* RECEIPT MODAL SLIDE-OVER */}
            {completedReceipt && (
              <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm p-3 flex flex-col justify-end animate-fade-in">
                <div className="rounded-3xl border border-border bg-card p-4 shadow-2xl animate-fade-up">
                  <div className="text-center pb-2 border-b border-dashed border-border">
                    <p className="font-display text-sm font-black">BEBOSS DEMO RECEIPT</p>
                    <p className="text-[9px] text-muted-foreground font-mono">Sample preview · not a fiscal receipt</p>
                    <p className="text-[9px] font-mono text-primary font-bold mt-0.5">{completedReceipt.receiptNo}</p>
                  </div>

                  <div className="py-2.5 space-y-1 font-mono text-[10px] max-h-36 overflow-y-auto divide-y divide-border/40">
                    {completedReceipt.items.map((it, idx) => (
                      <div key={idx} className="pt-1 flex justify-between">
                        <span>{it.qty}× {it.name}</span>
                        <span className="font-bold">{it.total.toLocaleString()} FRw</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-border pt-2 space-y-0.5 text-[10px]">
                    <div className="flex justify-between font-bold text-xs">
                      <span>TOTAL PAID</span>
                      <span className="font-mono text-primary">{completedReceipt.total.toLocaleString()} FRw</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground text-[9px]">
                      <span>Payment Method</span>
                      <span className="uppercase font-semibold">{completedReceipt.method}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground text-[9px]">
                      <span>Demo reference · not a signature</span>
                      <span className="font-mono text-success font-bold">{completedReceipt.seal}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-1.5 pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => {
                        triggerIslandAlert("Share preview only — no message was sent");
                      }}
                      className="flex-1 rounded-xl bg-success/20 text-success hover:bg-success/30 font-bold py-1.5 text-[10px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Share2 className="size-3" /> Share preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompletedReceipt(null)}
                      className="flex-1 rounded-xl bg-primary text-primary-foreground font-bold py-1.5 text-[10px] flex items-center justify-center gap-1 shadow-sm"
                    >
                      <RotateCcw className="size-3" /> New Sale
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- SCREEN 1: POS COUNTER & QUICK CHECKOUT ---------------- */}
            {screen === "pos" && (
              <div className="space-y-2.5 animate-fade-in">
                {/* Hold Cart Switcher & Quick Scan Button */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-1 border border-border/50">
                    <button
                      type="button"
                      onClick={() => setActiveCartTab(1)}
                      className={cn(
                        "rounded-lg px-2.5 py-0.5 text-[10px] font-bold transition-all",
                        activeCartTab === 1 ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
                      )}
                    >
                      Cart 1 ({totalCartCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveCartTab(2)}
                      className={cn(
                        "rounded-lg px-2.5 py-0.5 text-[10px] font-bold transition-all",
                        activeCartTab === 2 ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
                      )}
                    >
                      Cart 2 (Hold)
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleScanLaser}
                    className="rounded-xl border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary flex items-center gap-1 hover:bg-primary/20 transition-colors shadow-xs"
                  >
                    <ScanLine className="size-3.5" /> Scan
                  </button>
                </div>

                {/* Product Catalog Grid (Tap to Add) */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Catalog · Tap Item to Add
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {stockList.map((prod) => {
                      const inCartQty = cart[prod.id] ?? 0;
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => addToCart(prod.id)}
                          className={cn(
                            "group rounded-2xl p-2 text-left border transition-all active:scale-95 flex flex-col justify-between h-[68px]",
                            inCartQty > 0
                              ? "border-primary bg-primary/5 shadow-xs"
                              : "border-border/60 bg-card hover:border-primary/40"
                          )}
                        >
                          <div className="flex items-start justify-between w-full">
                            <span className="font-semibold text-[11px] leading-tight line-clamp-2">
                              {prod.name}
                            </span>
                            {inCartQty > 0 && (
                              <span className="size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center shrink-0 ml-1">
                                {inCartQty}
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline justify-between w-full mt-1 font-mono text-[10px]">
                            <span className="font-bold text-primary">{prod.price.toLocaleString()} F</span>
                            <span className="text-[8.5px] text-muted-foreground">{prod.stock} left</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active Basket Tally Strip */}
                {cartItems.length > 0 ? (
                  <div className="rounded-2xl border border-border bg-surface-2 p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold flex items-center gap-1">
                        <ShoppingBag className="size-3 text-primary" /> Active Basket
                      </span>
                      <button
                        type="button"
                        onClick={() => setCart({})}
                        className="text-[9px] text-destructive hover:underline font-bold"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-24 overflow-y-auto divide-y divide-border/30">
                      {cartItems.map((item) => (
                        <div key={item.id} className="pt-1 flex items-center justify-between">
                          <span className="truncate pr-2 font-medium text-[10px]">{item.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono font-bold text-[10px]">{item.total.toLocaleString()} F</span>
                            <div className="flex items-center rounded-lg bg-background border border-border">
                              <button
                                type="button"
                                onClick={() => updateQty(item.id, -1)}
                                className="px-1 text-muted-foreground hover:text-foreground"
                              >
                                <Minus className="size-2.5" />
                              </button>
                              <span className="font-mono text-[9px] font-bold px-1">{item.qty}</span>
                              <button
                                type="button"
                                onClick={() => updateQty(item.id, 1)}
                                className="px-1 text-muted-foreground hover:text-foreground"
                              >
                                <Plus className="size-2.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total Checkout Bar */}
                    <div className="border-t border-border pt-1.5 flex items-baseline justify-between">
                      <span className="text-muted-foreground text-[10px] font-semibold">Total Payable</span>
                      <span className="font-display text-base font-extrabold text-foreground">
                        {cartTotal.toLocaleString()} FRw
                      </span>
                    </div>

                    {/* Quick Payment Tenders */}
                    <div className="grid grid-cols-3 gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => handleCheckout("Cash")}
                        className="rounded-xl bg-success/20 text-success hover:bg-success/30 font-bold py-1.5 text-[10px] flex items-center justify-center gap-1 transition-colors"
                      >
                        <Coins className="size-3" /> Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCheckout("MTN MoMo (*182#)")}
                        className="rounded-xl bg-warning/20 text-warning hover:bg-warning/30 font-bold py-1.5 text-[10px] flex items-center justify-center gap-1 transition-colors"
                      >
                        <Zap className="size-3" /> MoMo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCheckout("Amadeni (Debt)")}
                        className="rounded-xl bg-info/20 text-info hover:bg-info/30 font-bold py-1.5 text-[10px] flex items-center justify-center gap-1 transition-colors"
                      >
                        <Users className="size-3" /> Debt
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-4 text-center text-muted-foreground">
                    <p className="text-[11px] font-medium">Cart is empty</p>
                    <p className="text-[9px] mt-0.5">Tap products above to start ringing up sales</p>
                  </div>
                )}
              </div>
            )}

            {/* ---------------- SCREEN 2: DEBTS & AMADENI ---------------- */}
            {screen === "debt" && (
              <div className="space-y-2.5 animate-fade-in">
                {/* Total Debt Banner */}
                <div className="rounded-2xl bg-gradient-to-r from-warning/20 via-warning/10 to-transparent border border-warning/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-warning">Total Outstanding Debts</p>
                    <span className="rounded-full bg-warning/20 px-2 py-0.2 font-mono text-[9px] font-bold text-warning">
                      {debtsList.length} Clients
                    </span>
                  </div>
                  <p className="font-display text-lg font-black mt-0.5">{totalDebtBalance.toLocaleString()} FRw</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Illustrative balance; repayment varies by customer</p>
                </div>

                {/* Client Ledger Cards */}
                <div className="space-y-1.5">
                  {debtsList.map((client) => {
                    const isOver = client.status === "overdue";
                    return (
                      <div
                        key={client.id}
                        className={cn(
                          "rounded-2xl border p-2.5 transition-all bg-card",
                          isOver ? "border-destructive/40 bg-destructive/5" : "border-border/60"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-bold text-[11px] leading-tight flex items-center gap-1">
                              {client.name}
                              {isOver && <AlertCircle className="size-3 text-destructive" />}
                            </p>
                            <p className="font-mono text-[9px] text-muted-foreground">{client.phone}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-black text-xs text-foreground">
                              {client.debt.toLocaleString()} F
                            </p>
                            <p className="text-[8.5px] text-muted-foreground">Limit: {client.limit / 1000}k</p>
                          </div>
                        </div>

                        <div className="mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between gap-1.5">
                          <span className={cn("text-[9px] font-bold", isOver ? "text-destructive" : "text-muted-foreground")}>
                            {client.dueDate}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                triggerIslandAlert(`Demo reminder preview for ${client.name} — no message was sent`);
                              }}
                              className="rounded-lg bg-success/20 text-success hover:bg-success/30 px-2 py-0.5 font-bold text-[9px] flex items-center gap-1 transition-colors"
                            >
                              <MessageCircle className="size-2.5" /> WA
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePayDebt(client.id, 10000)}
                              className="rounded-lg bg-primary/20 text-primary hover:bg-primary/30 px-2 py-0.5 font-bold text-[9px] transition-colors"
                            >
                              -10k F
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------------- SCREEN 3: STOCK & AI DEMAND FORECAST ---------------- */}
            {screen === "stock" && (
              <div className="space-y-2.5 animate-fade-in">
                {/* AI Predictive Insight Banner */}
                <div className="rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-transparent border border-primary/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                      <Sparkles className="size-3 text-warning" /> Illustrative 14-Day Stock Estimate
                    </p>
                    <span className="text-[9px] font-mono bg-primary/20 text-primary px-1.5 py-0.2 rounded font-bold">
                      SAMPLE DATA
                    </span>
                  </div>
                  <p className="font-display text-sm font-black mt-0.5">Sample stock levels and reorder prompts</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Illustrative estimates only; real forecasts need recorded sales history.</p>
                </div>

                {/* Stock Forecast Items */}
                <div className="space-y-1.5">
                  {stockList.map((item) => {
                    const isLow = item.stock <= 4;
                    const daysRemaining = (item.stock / 2.2).toFixed(1);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-2xl border p-2.5 transition-all bg-card",
                          isLow ? "border-warning/50 bg-warning/5" : "border-border/60"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-[11px] leading-tight">{item.name}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              Sample sales velocity: 2.2 {item.unit}/day · {item.category}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={cn("font-mono font-bold text-xs", isLow ? "text-warning" : "text-foreground")}>
                              {item.stock} {item.unit}
                            </span>
                            <p className="text-[8.5px] font-semibold text-muted-foreground">
                              {daysRemaining} days left
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 pt-1.5 border-t border-border/40 flex items-center justify-between">
                          <span className={cn("text-[9px] font-bold", isLow ? "text-warning" : "text-success")}>
                            {isLow ? `⚠️ Reorder recommendation: +24 ${item.unit}` : "Stock level optimal"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRestock(item.id, 12)}
                            className="rounded-lg bg-surface-2 hover:bg-surface border border-border px-2 py-0.5 font-bold text-[9px] flex items-center gap-1 transition-colors"
                          >
                            <Plus className="size-2.5 text-primary" /> +12
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------------- SCREEN 4: SUPABASE CLOUD & MULTI-BRANCH SYNC ---------------- */}
            {screen === "sync" && (
              <div className="space-y-2.5 animate-fade-in">
                {/* This is a product simulator, not a connected Supabase session. */}
                <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Database className="size-3.5 text-primary" />
                      <p className="text-[9px] font-bold uppercase tracking-wider text-primary">Cloud sync experience preview</p>
                    </div>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[8px] font-bold text-primary">DEMO</span>
                  </div>
                  <p className="font-display text-sm font-black mt-1">No live Supabase connection</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">This public simulator sends no requests and displays no real shop or device records.</p>
                </div>

                {/* Illustrative diagnostics — not live device telemetry. */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="rounded-2xl border border-border bg-surface-2 p-2.5">
                    <p className="text-[8.5px] text-muted-foreground uppercase font-semibold">Sync mode</p>
                    <p className="font-mono font-bold text-primary mt-0.5">Preview only</p>
                    <p className="text-[8px] text-muted-foreground">No API request</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface-2 p-2.5">
                    <p className="text-[8.5px] text-muted-foreground uppercase font-semibold">Local queue</p>
                    <p className="font-mono font-bold mt-0.5">Sample state</p>
                    <p className="text-[8px] text-muted-foreground">Not a live outbox</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface-2 p-2.5">
                    <p className="text-[8.5px] text-muted-foreground uppercase font-semibold">Devices</p>
                    <p className="font-mono font-bold mt-0.5">Illustrative</p>
                    <p className="text-[8px] text-muted-foreground">No devices queried</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface-2 p-2.5">
                    <p className="text-[8.5px] text-muted-foreground uppercase font-semibold">Tenant records</p>
                    <p className="font-mono font-bold mt-0.5">Not loaded</p>
                    <p className="text-[8px] text-muted-foreground">Sign in for live data</p>
                  </div>
                </div>

                {/* Progress bar when syncing */}
                {isSyncing && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-mono">
                      <span>Playing the sample sync animation...</span>
                      <span>{syncProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                      <div 
                        className="h-full bg-gradient-brand transition-all duration-300" 
                        style={{ width: `${syncProgress}%` }} 
                      />
                    </div>
                  </div>
                )}

                {/* Trigger Sync Button */}
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handleCloudSync}
                  className="w-full rounded-2xl bg-primary text-primary-foreground font-bold py-2.5 text-xs flex items-center justify-center gap-1.5 shadow-md hover:opacity-95 active:scale-98 transition-all"
                >
                  <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin")} />
                  {isSyncing ? "Previewing sync..." : "Preview sync animation"}
                </button>
              </div>
            )}

            {/* ---------------- SCREEN 5: P&L ANALYTICS & REPORTS ---------------- */}
            {screen === "report" && (
              <div className="space-y-2.5 animate-fade-in">
                {/* Shift Performance Summary */}
                <div className="rounded-2xl bg-gradient-brand p-3 text-primary-foreground shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-semibold uppercase opacity-85">Sample shift turnover</p>
                    <span className="text-[9px] bg-black/20 px-1.5 py-0.2 rounded font-mono">DEMO FIGURES</span>
                  </div>
                  <p className="font-display text-xl font-black mt-0.5">248,500 FRw</p>
                  <div className="mt-1 flex items-center justify-between text-[9px] opacity-90 font-medium">
                    <span>Net Profit: +68,200 FRw</span>
                    <span className="font-bold bg-white/20 px-1.5 py-0.5 rounded">Margin: 27.4%</span>
                  </div>
                </div>

                {/* Cash vs MoMo Breakdown */}
                <div className="rounded-2xl border border-border bg-surface-2 p-2.5 space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Illustrative tender distribution</p>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[10px] font-medium">
                        <span>MTN MoMo (*182#)</span>
                        <span className="font-mono font-bold">145,000 F (58.3%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-border rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-warning rounded-full" style={{ width: "58.3%" }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-medium">
                        <span>Physical Cash</span>
                        <span className="font-mono font-bold">78,500 F (31.6%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-border rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-success rounded-full" style={{ width: "31.6%" }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-medium">
                        <span>Customer Debts</span>
                        <span className="font-mono font-bold">25,000 F (10.1%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-border rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-info rounded-full" style={{ width: "10.1%" }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Grossing Products */}
                <div className="rounded-2xl border border-border bg-card p-2.5 space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Top Profit Generators</p>
                  <div className="flex items-center justify-between text-[10px] pt-1">
                    <span className="font-medium">1. Inyange Fresh Milk</span>
                    <span className="font-mono font-bold text-success">+24.5% margin</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-medium">2. Panadol Extra 10s</span>
                    <span className="font-mono font-bold text-success">+42.0% margin</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================= BOTTOM PHONE NAVIGATION DOCK ================= */}
          <div className="relative z-30 border-t border-border/60 bg-surface/95 px-1.5 py-1 backdrop-blur-md">
            <div className="grid grid-cols-5 gap-0.5 text-center">
              {[
                { id: "pos", label: "POS", icon: ShoppingBag, badge: totalCartCount > 0 ? totalCartCount : null },
                { id: "debt", label: "Debts", icon: Users, badge: "!" },
                { id: "stock", label: "Stock", icon: Package, badge: null },
                { id: "sync", label: "Cloud", icon: Radio, badge: isSyncing ? "..." : null },
                { id: "report", label: "P&L", icon: TrendingUp, badge: null },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = screen === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setScreen(tab.id as ScreenMode)}
                    className={cn(
                      "relative rounded-xl py-1 flex flex-col items-center justify-center transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3" />
                    <span className="text-[8px] mt-0.5 leading-none">{tab.label}</span>
                    {tab.badge && (
                      <span className="absolute -top-1 right-1.5 size-3 rounded-full bg-destructive text-white text-[7.5px] font-black flex items-center justify-center ring-1 ring-card">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Smartphone Gesture Indicator Bar */}
            <div className="mx-auto mt-1.5 h-1 w-20 rounded-full bg-foreground/20 hover:bg-foreground/40 transition-colors" />
          </div>
        </div>

        {/* Bottom Speaker Grilles & USB-C Port Cutouts */}
        <div className="mt-1.5 flex items-center justify-center gap-5 px-10">
          <div className="flex gap-1">
            <div className="size-1 rounded-full bg-neutral-600" />
            <div className="size-1 rounded-full bg-neutral-600" />
            <div className="size-1 rounded-full bg-neutral-600" />
          </div>
          <div className="h-1 w-7 rounded-full bg-neutral-900 border border-neutral-700" />
          <div className="flex gap-1">
            <div className="size-1 rounded-full bg-neutral-600" />
            <div className="size-1 rounded-full bg-neutral-600" />
            <div className="size-1 rounded-full bg-neutral-600" />
          </div>
        </div>
      </div>

      {/* ================= FLOATING AMBIENT VALUE CARDS ================= */}
      {/* Left Badge: demo data indicator */}
      <div className="glass absolute -left-20 top-[48%] hidden items-center gap-2 rounded-2xl border border-border/80 px-3 py-2 text-xs shadow-xl backdrop-blur-lg lg:flex animate-float">
        <div className="size-7 rounded-lg bg-success/20 flex items-center justify-center text-success shrink-0">
          <Database className="size-3.5" />
        </div>
        <div>
          <p className="font-bold text-[10px] leading-tight">BeBoss product demo</p>
          <p className="text-[8.5px] text-muted-foreground font-mono">Sample data · no backend writes</p>
        </div>
      </div>

      {/* Right Top Badge: Receipt checksum */}
      <div className="glass absolute -right-16 top-10 hidden rounded-2xl border border-border/80 px-3 py-2 text-xs shadow-xl backdrop-blur-lg lg:block animate-float">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="size-3 text-success" />
          <p className="font-mono text-[9.5px] text-success font-black tracking-tight">DEMO-7F3C29A1</p>
        </div>
        <p className="text-[8.5px] text-muted-foreground mt-0.5">Sample receipt reference · not a checksum</p>
      </div>

      {/* Right Bottom Badge: Offline-first storage */}
      <div className="glass absolute -right-16 bottom-8 hidden items-center gap-1.5 rounded-2xl border border-border/80 px-3 py-2 text-xs shadow-xl backdrop-blur-lg lg:flex animate-float">
        <Smartphone className="size-3.5 text-primary" />
        <div>
          <p className="font-bold text-[10px] leading-tight">Offline SQLCipher</p>
          <p className="text-[8.5px] text-muted-foreground">Sync needs a connection</p>
        </div>
      </div>
    </div>
  );
}

export const PhoneTerminalPreview = PhoneMockup;
