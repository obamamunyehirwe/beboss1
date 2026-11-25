import type { CloudState, Row, Snapshot } from "./types";

export const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((x) => x && typeof x === "object") : [];
export const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const s = (value: unknown) => value == null ? "" : String(value);
export const id = () => crypto.randomUUID();
export const money = (value: unknown) => "FRw " + Math.round(n(value)).toLocaleString("en-US");
export const dateTime = (value: unknown) => n(value) ? new Date(n(value)).toLocaleString() : "—";
export const dateOnly = (value: unknown) => n(value) ? new Date(n(value)).toLocaleDateString() : "—";
export const isToday = (value: unknown) => n(value) > 0 && new Date(n(value)).toDateString() === new Date().toDateString();
export const activeProducts = (snapshot: Snapshot | null) => rows(snapshot?.products).filter((p) => p.isDeleted !== true);
export const activeCustomers = (snapshot: Snapshot | null) => rows(snapshot?.customers).filter((c) => c.isDeleted !== true);
export const activeStaff = (data: CloudState | null) => rows(data?.staff).filter((u) => u.is_active !== false);
export const errorText = (error: unknown) => error instanceof Error ? error.message : "An unexpected BeBoss operation failed.";

export const blankSnapshot = (): Snapshot => ({
  metadata: {}, shopProfile: {}, products: [], customers: [], sales: [], saleItems: [],
  customerPayments: [], purchases: [], stockTransfers: [], branches: [], users: [], tombstones: []
});

export function ensureSnapshot(value: Snapshot | null): Snapshot | null {
  if (!value) return null;
  return {
    metadata: value.metadata ?? {},
    shopProfile: value.shopProfile ?? {},
    products: rows(value.products), customers: rows(value.customers), sales: rows(value.sales),
    saleItems: rows(value.saleItems), customerPayments: rows(value.customerPayments),
    purchases: rows(value.purchases), stockTransfers: rows(value.stockTransfers),
    branches: rows(value.branches), users: rows(value.users), tombstones: rows(value.tombstones)
  };
}

export function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  return /[",\r\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw;
}

export function downloadCsv(filename: string, columns: string[], data: Row[]) {
  const content = "\uFEFF" + [
    columns.map(csvCell).join(","),
    ...data.map((row) => columns.map((column) => csvCell(row[column])).join(","))
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function parseCsv(input: string): string[][] {
  const output: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim() !== "")) output.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) output.push(row);
  }
  return output;
}