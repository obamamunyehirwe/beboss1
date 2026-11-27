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
  activity?: Row[];
  serverTime: number;
};

export type RestorePreview = {
  ok: true;
  shopSyncKey: string;
  restoreAvailable: boolean;
  snapshotUpdatedAt: number;
  verifiedChunks: number;
  totalRecords: number;
  counts: {
    products: number;
    customers: number;
    sales: number;
    saleItems: number;
    customerPayments: number;
    purchases: number;
    stockTransfers: number;
    branches: number;
    users: number;
  };
  sourceDevices: Array<{
    deviceId: string;
    name: string;
    platform: "ANDROID" | "DESKTOP" | "OTHER";
    lastSyncedAt: number;
  }>;
};

export type NavKey =
  | "welcome"
  | "overview"
  | "management"
  | "checkout"
  | "products"
  | "sales"
  | "customers"
  | "purchases"
  | "reports"
  | "finance"
  | "branches"
  | "staff"
  | "devices"
  | "transfers"
  | "billing"
  | "diagnostics"
  | "sync"
  | "admin"
  | "masterAdmin"
  | "backup"
  | "settings";

export type ReceiptPayload = { sale: Row; items: Row[]; profile: Row };

export type CommitSnapshot = (mutator: (next: Snapshot) => void, operation?: string) => Promise<void>;
export type CloudAction = (action: any, payload: Row) => Promise<Row>;
export type DesktopPreferences = {
  theme: "dark" | "light" | "system";
  density: "comfortable" | "compact";
  accent: "orange" | "blue" | "green";
  defaultView: "welcome" | "overview" | "management";
  language: "en" | "rw" | "fr" | "sw";
  autoSync: boolean;
  refreshMinutes: 0 | 1 | 5 | 15;
  reducedMotion: boolean;
};

export type LanHub = {
  id: string;
  shopName: string;
  branchName: string;
  ipAddress: string;
  port: number;
  productsCount: number;
  salesCount: number;
  branchesCount: number;
  lastSeenAt: number;
};

export type LanSyncResult = {
  success: boolean;
  peerIp: string;
  pushedRecords: number;
  pulledRecords: number;
  conflictsAvailableForMerge: boolean;
  pulledSnapshot: Snapshot;
  latencyMs: number;
  message: string;
};
