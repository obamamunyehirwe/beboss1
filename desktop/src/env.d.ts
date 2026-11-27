/// <reference types="vite/client" />

export interface SetupPreflight { osPlatform:string; osArch:string; appVersion:string; databaseState:"ready"|"locked"; databaseMessage:string; databasePath:string; databaseSizeBytes:number; pendingOutboxCount:number|null; recoveryArchiveCount:number; dpapiBackupAvailable:boolean; }
export interface SystemDiagnostics {
  osPlatform: string;
  osArch: string;
  appVersion: string;
  dbPath: string;
  dbSizeBytes: number;
  pendingOutboxCount: number;
  oldestPendingAt: number | null;
  uptimeSeconds: number;
  hostname: string;
  databaseEncrypted: boolean;
  databaseCipherVersion: string;
  databaseIntegrity: string;
  journalMode: string;
  defaultPrinterName: string | null;
}

export interface LocalDatabaseRecoveryResult {
  backupPath: string;
  archivedFiles: string[];
  recoveryKeyReference: string | null;
}

export interface NetworkPingResult {
  host: string;
  latencyMs: number;
  reachable: boolean;
  details: string;
}

export interface ReceiptItemPrint {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ReceiptPrintPayload {
  shopName: string;
  receiptNumber: string;
  date: string;
  cashier: string;
  customer: string;
  items: ReceiptItemPrint[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  paymentMethod: string;
  tin: string;
  address: string;
  phone: string;
  header: string;
  footer: string;
  seal: string;
}

export interface EscposPrintResult {
  success: boolean;
  base64Bytes: string;
  spoolPath: string;
  printerName: string;
  jobId: string;
  message: string;
}

export interface FileExportResult {
  success: boolean;
  filePath: string;
  fileSizeBytes: number;
  sha256: string;
}


export interface SupportBundleInput {
  osPlatform: string;
  osArch: string;
  uptimeSeconds: number;
  dbSizeBytes: number;
  pendingOutboxCount: number;
  oldestPendingAt: number | null;
  databaseEncrypted: boolean;
  databaseCipherVersion: string;
  databaseIntegrity: string;
  journalMode: string;
  defaultPrinterConfigured: boolean;
  networkOnline: boolean;
  cloudTestPerformed: boolean;
  cloudReachable: boolean | null;
  cloudLatencyMs: number | null;
  verifiedCloudChunks: number;
  lastCloudSnapshotAt: number | null;
}

export interface LanHub {
  id: string;
  shopName: string;
  branchName: string;
  ipAddress: string;
  port: number;
  productsCount: number;
  salesCount: number;
  branchesCount: number;
  lastSeenAt: number;
}

export interface LanSyncResult {
  success: boolean;
  peerIp: string;
  pushedRecords: number;
  pulledRecords: number;
  conflictsAvailableForMerge: boolean;
  pulledSnapshot: Record<string, unknown>;
  latencyMs: number;
  message: string;
}


declare global {
  interface Window {
    beBossDesktop: {
      isNative: boolean;
      secureStore: {
        get(key: string): Promise<string | null>;
        set(key: string, value: string): Promise<boolean>;
        remove(key: string): Promise<boolean>;
      };
      getDeviceId(): Promise<string>;
      recoverLocalDatabase(): Promise<LocalDatabaseRecoveryResult>;
      setupPreflight(): Promise<SetupPreflight>;
      testCredentialVault(): Promise<void>;
      local: {
        load(shopSyncKey: string): Promise<any | null>;
        saveBaseline(shopSyncKey: string, snapshot: Record<string, unknown>, snapshotUpdatedAt: number): Promise<boolean>;
        queue(
          shopSyncKey: string,
          operation: string,
          payload: any,
          deviceId: string,
          expectedUpdatedAt: number,
          requiresActiveSubscription: boolean,
          subscriptionExpiresAt: number,
          subscriptionStatus: string
        ): Promise<{ id: string; payload: any; hlc: number; expectedUpdatedAt: number; queued: boolean }>;
        outboxCount(shopSyncKey?: string): Promise<number>;
        unassignedOutboxCount(): Promise<number>;
        pending(shopSyncKey: string): Promise<{ id: string; payload: any; hlc: number; expectedUpdatedAt: number }[]>;
        acknowledge(shopSyncKey: string, ids: string[]): Promise<boolean>;
      };
      openExternal(url: string): Promise<void>;
      printReceipt(lines: string[]): Promise<void>;
      systemDiagnostics(): Promise<SystemDiagnostics>;
      networkPing(targetHost?: string): Promise<NetworkPingResult>;
      printEscposThermal(payload: ReceiptPrintPayload): Promise<EscposPrintResult>;
      exportBackupFile(encryptedContent: string): Promise<FileExportResult>;
      exportSupportBundle(payload: SupportBundleInput): Promise<FileExportResult>;
      lan: {
        storeShopSecret(shopSyncKey: string, secret: string): Promise<void>;
        discoverHubs(shopSyncKey: string, timeoutMs?: number): Promise<LanHub[]>;
        pullFromHub(shopSyncKey: string, ipAddress: string, port?: number): Promise<LanSyncResult>;
        syncWithHub(shopSyncKey: string, ipAddress: string, port: number, snapshot: Record<string, unknown>): Promise<LanSyncResult>;
      };
      printReceipt(lines?: string[]): Promise<void>;
      platform: string;
      version: string;
    };
  }
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
