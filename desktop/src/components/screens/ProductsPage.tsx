import type React from "react";
import { useRef, useState } from "react";
import { Check, Download, LoaderCircle, Package, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { activeProducts, downloadCsv, errorText, id, money, n, parseCsv, rows, s } from "../../lib/format";
import type { CommitSnapshot, Row, Snapshot } from "../../lib/types";
import { Empty, Modal, PageHeading } from "../ui";

function productsForExport(snapshot: Snapshot | null) { return activeProducts(snapshot); }

export function ProductsPage({ snapshot, onCommit, offline, query }: {
  snapshot: Snapshot | null; onCommit: CommitSnapshot; offline: boolean; query: string
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState({ name: "", category: "General", barcode: "", costPrice: "", sellingPrice: "", quantityInStock: "0", lowStockThreshold: "5", unit: "pcs", branchId: "main_branch" });
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const list = activeProducts(snapshot).filter((p) => {
    const q = query.trim().toLowerCase();
    const fitsQuery = !q || [p.name, p.barcode, p.category].some((v) => s(v).toLowerCase().includes(q));
    const fitsFilter = filter === "ALL" || (filter === "LOW" && n(p.quantityInStock) <= n(p.lowStockThreshold)) || (filter === "OUT" && n(p.quantityInStock) <= 0);
    return fitsQuery && fitsFilter;
  });
  const branches = rows(snapshot?.branches).filter((b) => b.isActive !== false);

  function startEdit(product?: Row) {
    const p = product ?? {};
    setEditing(product ?? null);
    setDraft({
      name: s(p.name), category: s(p.category) || "General", barcode: s(p.barcode),
      costPrice: String(p.costPrice ?? ""), sellingPrice: String(p.sellingPrice ?? ""),
      quantityInStock: String(p.quantityInStock ?? 0), lowStockThreshold: String(p.lowStockThreshold ?? 5),
      unit: s(p.unit) || "pcs", branchId: s(p.branchId) || "main_branch"
    });
    setOpen(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      if (!draft.name.trim()) throw new Error("Product name is required.");
      const now = Date.now();
      const product = {
        id: editing ? s(editing.id) : id(), name: draft.name.trim(), category: draft.category.trim() || "General",
        barcode: draft.barcode.trim(), costPrice: Math.max(0, n(draft.costPrice)), sellingPrice: Math.max(0, n(draft.sellingPrice)),
        quantityInStock: Math.max(0, n(draft.quantityInStock)), lowStockThreshold: Math.max(0, n(draft.lowStockThreshold)),
        unit: draft.unit, branchId: draft.branchId, isDeleted: false,
        createdAt: editing ? n(editing.createdAt) || now : now, updatedAt: now,
        syncVersion: (editing ? n(editing.syncVersion) : 0) + 1, hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP"
      };
      await onCommit((next) => {
        const at = next.products.findIndex((p) => s(p.id) === product.id);
        if (at >= 0) next.products[at] = product; else next.products.unshift(product);
        next.tombstones = next.tombstones.filter((t) => !(s(t.tableName) === "products" && s(t.recordId) === product.id));
      });
      setOpen(false);
    } finally { setBusy(false); }
  }
  async function remove(product: Row) {
    if (!confirm("Deactivate " + s(product.name) + "? Historical sales will be kept.")) return;
    const now = Date.now();
    await onCommit((next) => {
      const target = next.products.find((p) => s(p.id) === s(product.id));
      if (target) { target.isDeleted = true; target.updatedAt = now; target.hlcTimestamp = 0; target.lastModifiedDeviceId = "DESKTOP"; }
      next.tombstones.push({ id: "products:" + s(product.id), tableName: "products", recordId: s(product.id), deletedAt: now, hlcTimestamp: 0, deletedByDeviceId: "DESKTOP" });
    });
  }
  async function importProducts(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a CSV file smaller than 5 MB.");
      const matrix = parseCsv(await file.text());
      if (matrix.length < 2) throw new Error("The CSV has no product rows.");
      const headers = matrix[0]!.map((value) => value.replace(/^\uFEFF/, "").trim().toLowerCase());
      const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
      const nameIndex = column("name", "product", "productname", "product_name");
      const priceIndex = column("sellingprice", "selling_price", "price");
      if (nameIndex < 0 || priceIndex < 0) throw new Error("CSV must include name and sellingPrice columns.");
      const get = (cells: string[], ...names: string[]) => {
        const at = column(...names);
        return at >= 0 ? String(cells[at] ?? "").trim() : "";
      };
      const numeric = (value: string, label: string, defaultValue: number) => {
        if (value === "") return defaultValue;
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Invalid " + label + " value in CSV.");
        return parsed;
      };
      const records = matrix.slice(1).filter((cells) => cells.some((cell) => cell.trim() !== ""));
      if (records.length > 100000) throw new Error("A single CSV import is limited to 100,000 product rows.");
      let imported = 0;
      const now = Date.now();
      await onCommit((next) => {
        for (const cells of records) {
          const name = get(cells, "name", "product", "productname", "product_name");
          if (!name) continue;
          const barcode = get(cells, "barcode", "sku");
          const branchRaw = get(cells, "branchid", "branch_id");
          const branchId = branchRaw === "main_branch" || branches.some((branch) => s(branch.id) === branchRaw) ? branchRaw : "main_branch";
          const existing = next.products.find((product) =>
            (barcode && s(product.barcode) === barcode) ||
            (!barcode && s(product.name).trim().toLowerCase() === name.toLowerCase() && s(product.branchId || "main_branch") === branchId)
          );
          const productId = existing ? s(existing.id) : (get(cells, "id") || id());
          const product = {
            id: productId, name, category: get(cells, "category") || "General", barcode,
            costPrice: numeric(get(cells, "costprice", "cost_price"), "cost price", n(existing?.costPrice)),
            sellingPrice: numeric(get(cells, "sellingprice", "selling_price", "price"), "selling price", 0),
            quantityInStock: numeric(get(cells, "quantityinstock", "quantity_in_stock", "quantity", "stock"), "stock", n(existing?.quantityInStock)),
            lowStockThreshold: numeric(get(cells, "lowstockthreshold", "low_stock_threshold", "reorderlevel", "reorder_level"), "reorder threshold", 5),
            unit: get(cells, "unit") || "pcs", branchId, isDeleted: false,
            createdAt: existing ? n(existing.createdAt) || now : now, updatedAt: now,
            syncVersion: (existing ? n(existing.syncVersion) : 0) + 1, hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP"
          };
          const at = next.products.findIndex((row) => s(row.id) === product.id);
          if (at >= 0) next.products[at] = product; else next.products.unshift(product);
          next.tombstones = next.tombstones.filter((t) => !(s(t.tableName) === "products" && s(t.recordId) === product.id));
          imported++;
        }
      });
      if (imported === 0) throw new Error("No usable product rows were found in the CSV.");
      alert(imported + " products saved locally and queued for synchronization.");
    } catch (error) {
      alert(errorText(error));
    } finally {
      setImporting(false);
      input.value = "";
    }
  }

  return <div className="page-stack">
    <PageHeading title="Inventory management" description="Control product catalogue, stock valuation, pricing and reorder levels." action={<div className="heading-actions"><button className="btn-outline" disabled={!snapshot} onClick={() => downloadCsv("beboss-products-" + Date.now() + ".csv", ["id", "name", "category", "barcode", "costPrice", "sellingPrice", "quantityInStock", "lowStockThreshold", "unit", "branchId"], productsForExport(snapshot))}><Download size={15} /> Export CSV</button><button className="btn-outline" disabled={importing} onClick={() => fileInput.current?.click()}><Upload size={15} />{importing ? "Importing…" : "Import CSV"}</button><button className="btn-primary" onClick={() => startEdit()}><Plus size={17} /> Add product</button><input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={importProducts} /></div>} />
    <div className="toolbar"><div className="filter-tabs">{[["ALL", "All products"], ["LOW", "Low stock"], ["OUT", "Out of stock"]].map(([key, label]) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div><span className="muted">{list.length} products shown</span></div>
    {!snapshot ? <Empty title="Shop data is not initialized" description="Sync the registered Android terminal to load the real product catalogue." /> :
      list.length ? <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Product</th><th>Barcode</th><th>Category</th><th>Stock</th><th>Cost</th><th>Selling price</th><th>Margin</th><th></th></tr></thead><tbody>
        {list.map((p) => <tr key={s(p.id)}><td><div className="product-cell"><span className="product-icon"><Package size={16} /></span><div><strong>{s(p.name)}</strong><small>{s(p.unit) || "pcs"} · {s(p.branchId) || "Main branch"}</small></div></div></td><td className="mono">{s(p.barcode) || "—"}</td><td>{s(p.category)}</td><td><span className={"stock-value " + (n(p.quantityInStock) <= 0 ? "negative" : n(p.quantityInStock) <= n(p.lowStockThreshold) ? "warning" : "")}>{n(p.quantityInStock).toLocaleString()} {s(p.unit)}</span></td><td>{money(p.costPrice)}</td><td className="strong">{money(p.sellingPrice)}</td><td>{money(n(p.sellingPrice) - n(p.costPrice))}</td><td><div className="row-actions"><button className="icon-btn" title="Edit product" onClick={() => startEdit(p)}><Pencil size={15} /></button><button className="icon-btn danger-icon" title="Deactivate product" onClick={() => remove(p)}><Trash2 size={15} /></button></div></td></tr>)}
      </tbody></table></div></div> : <Empty title="No matching products" description="Try another filter or add a product to your catalogue." />}
    {open && <Modal title={editing ? "Edit product" : "Add product"} onClose={() => setOpen(false)}><form className="form-grid" onSubmit={save}>
      <label className="field-wide">Product name<input required maxLength={160} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Category<input value={draft.category} maxLength={80} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></label>
      <label>Barcode<input value={draft.barcode} maxLength={80} onChange={(e) => setDraft({ ...draft, barcode: e.target.value })} /></label>
      <label>Cost price (FRw)<input type="number" min="0" step="1" value={draft.costPrice} onChange={(e) => setDraft({ ...draft, costPrice: e.target.value })} /></label>
      <label>Selling price (FRw)<input type="number" min="0" step="1" value={draft.sellingPrice} onChange={(e) => setDraft({ ...draft, sellingPrice: e.target.value })} /></label>
      <label>Stock quantity<input type="number" min="0" step="0.001" value={draft.quantityInStock} onChange={(e) => setDraft({ ...draft, quantityInStock: e.target.value })} /></label>
      <label>Low-stock threshold<input type="number" min="0" step="0.001" value={draft.lowStockThreshold} onChange={(e) => setDraft({ ...draft, lowStockThreshold: e.target.value })} /></label>
      <label>Unit<select value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>{["pcs", "kg", "g", "litre", "ml", "pack", "box", "bottle", "m", "pair", "set"].map((v) => <option key={v}>{v}</option>)}</select></label>
      <label>Branch<select value={draft.branchId} onChange={(e) => setDraft({ ...draft, branchId: e.target.value })}><option value="main_branch">Main branch</option>{branches.map((b) => <option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label>
      <div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Save product</button></div>
    </form></Modal>}
  </div>;
}