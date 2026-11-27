import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, Package, Search, ShoppingCart, UserRound, type LucideIcon } from "lucide-react";
import { money, n, rows, s } from "../lib/format";
import type { CloudState, NavKey, Snapshot } from "../lib/types";

export type PaletteNav = { id: NavKey; label: string; group: string; icon: LucideIcon };

type Cmd = {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
};

export function CommandPalette({ cloud, snapshot, nav, onClose, onNavigate, onQuickSearch, onRefresh }: {
  cloud: CloudState;
  snapshot: Snapshot | null;
  nav: PaletteNav[];
  onClose: () => void;
  onNavigate: (view: NavKey) => void;
  onQuickSearch: (view: NavKey, term: string) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const commands = useMemo<Cmd[]>(() => {
    const go = (view: NavKey) => () => onNavigate(view);
    const actions: Cmd[] = [
      { key: "act-sale", group: "Actions", label: "Start a new sale", icon: ShoppingCart, keywords: "pos checkout sell", run: go("checkout") },
      { key: "act-refresh", group: "Actions", label: "Refresh and sync cloud data", icon: ArrowRight, keywords: "sync reload update", run: () => { onRefresh(); onClose(); } },
      { key: "act-backup", group: "Actions", label: "Back up shop data", icon: Package, keywords: "export recovery", run: go("backup") }
    ];
    const navCmds: Cmd[] = nav.map((item) => ({
      key: "nav-" + item.id, group: "Go to", label: item.label, icon: item.icon,
      keywords: item.group + " " + item.id, run: go(item.id)
    }));
    const productCmds: Cmd[] = rows(snapshot?.products).filter((p) => p.isDeleted !== true).map((p) => {
      const name = s(p.productName) || s(p.name) || "Product";
      const code = s(p.barcode) || s(p.sku) || s(p.id).slice(0, 8);
      const term = s(p.barcode) || name;
      return { key: "prod-" + s(p.id), group: "Products", label: name, hint: code + " · " + n(p.quantityInStock) + " in stock", icon: Package, keywords: code + " " + s(p.category), run: () => onQuickSearch("products", term) };
    });
    const customerCmds: Cmd[] = rows(snapshot?.customers).filter((c) => c.isDeleted !== true).map((c) => {
      const name = s(c.name) || s(c.customerName) || "Customer";
      const phone = s(c.phone) || s(c.phoneNumber);
      return { key: "cust-" + s(c.id), group: "Customers", label: name, hint: phone || s(c.email), icon: UserRound, keywords: phone + " " + s(c.email), run: () => onQuickSearch("customers", phone || name) };
    });
    const saleCmds: Cmd[] = rows(snapshot?.sales).map((sale) => {
      const receipt = s(sale.receiptNumber) || s(sale.id).slice(0, 8);
      return { key: "sale-" + s(sale.id), group: "Sales", label: receipt, hint: (s(sale.customerName) || "Walk-in") + " · " + money(sale.totalAmount), icon: ShoppingCart, keywords: s(sale.cashierName), run: () => onQuickSearch("sales", receipt) };
    });
    return [...actions, ...navCmds, ...productCmds, ...customerCmds, ...saleCmds];
  }, [cloud, snapshot, nav, onNavigate, onQuickSearch, onRefresh, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (c: Cmd) => !q || (c.label + " " + (c.hint || "") + " " + (c.keywords || "")).toLowerCase().includes(q);
    return commands.filter(match);
  }, [commands, query]);

  const grouped = useMemo(() => {
    const order = ["Actions", "Go to", "Products", "Customers", "Sales"];
    const map = new Map<string, Cmd[]>();
    for (const c of filtered) { const arr = map.get(c.group) || []; arr.push(c); map.set(c.group, arr); }
    const limits: Record<string, number> = { Products: 8, Customers: 8, Sales: 8, "Go to": 20, Actions: 5 };
    return order.filter((g) => map.has(g)).map((g) => ({ group: g, items: (map.get(g) || []).slice(0, limits[g] ?? 8) }));
  }, [filtered]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const cmd = flat[active]; if (cmd) { cmd.run(); onClose(); } }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  let runningIndex = -1;

  return <div className="command-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="command-palette" role="dialog" aria-label="Command menu">
      <div className="command-search">
        <Search size={18} />
        <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKey}
          placeholder="Search pages, products, customers, receipts…" aria-label="Command search" />
        <kbd className="command-esc">Esc</kbd>
      </div>
      <div className="command-results" ref={listRef}>
        {grouped.length === 0 && <div className="command-empty">No matches for “{query}”. Try a product name, customer, receipt number or page.</div>}
        {grouped.map((section) => <div className="command-group" key={section.group}>
          <span className="command-group-label">{section.group}</span>
          {section.items.map((cmd) => {
            runningIndex += 1;
            const index = runningIndex;
            const Icon = cmd.icon;
            const isActive = index === active;
            return <button key={cmd.key} data-active={isActive} className={"command-item" + (isActive ? " active" : "")}
              onMouseEnter={() => setActive(index)} onClick={() => { cmd.run(); onClose(); }}>
              <span className="command-item-icon"><Icon size={16} /></span>
              <span className="command-item-copy"><strong>{cmd.label}</strong>{cmd.hint && <small>{cmd.hint}</small>}</span>
              {isActive && <CornerDownLeft className="command-enter" size={14} />}
            </button>;
          })}
        </div>)}
      </div>
      <div className="command-shortcut-help" aria-label="Desktop keyboard shortcuts">
        <span>Quick navigation:</span>
        <span><kbd>Ctrl / ⌘</kbd><kbd>1</kbd> Overview</span>
        <span><kbd>2</kbd> POS</span>
        <span><kbd>3</kbd> Inventory</span>
        <span><kbd>4</kbd> Sales</span>
        <span><kbd>5</kbd> Reports</span>
      </div>
      <div className="command-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>Esc</kbd> close</span>
        <span className="command-foot-brand"><img src="/beboss-app-icon.png" alt="" /> BeBoss Command</span>
      </div>
    </section>
  </div>;
}