export type Row = Record<string, any>;

export type Snapshot = {
  metadata: Row;
  shopProfile: Row;
  products: Row[];
  customers: Row[];
  sales: Row[];
  saleItems: Row[];
  customerPayments: Row[];
  purchases: Row[];
  stockTransfers: Row[];
  branches: Row[];
  users: Row[];
  tombstones: Row[];
};

export type CloudState = {
  shop: Row;
  owner: Row;
  snapshot: Snapshot | null;
  snapshotUpdatedAt: number;
  verifiedChunks: number;
  payments: Row[];
  codes: Row[];
  devices: Row[];
  branches: Row[];
  transfers: Row[];
  staff: Row[];
  announcements: Row[];
  serverTime: number;
};

export type NavKey =
  | "overview"
  | "checkout"
  | "products"
  | "sales"
  | "customers"
  | "purchases"
  | "reports"
  | "branches"
  | "staff"
  | "devices"
  | "transfers"
  | "billing"
  | "diagnostics"
  | "sync"
  | "admin"
  | "backup"
  | "settings";

export type ReceiptPayload = { sale: Row; items: Row[]; profile: Row };

export type CommitSnapshot = (mutator: (next: Snapshot) => void, operation?: string) => Promise<void>;
export type CloudAction = (action: any, payload: Row) => Promise<Row>;