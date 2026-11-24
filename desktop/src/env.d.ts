/// <reference types="vite/client" />

export interface SystemDiagnostics {
  osPlatform: string;
  osArch: string;
  appVersion: string;
  dbPath: string;
  dbSizeBytes: number;
  pendingOutboxCount: number;
  uptimeSeconds: number;
  hostname: string;
  databaseEncrypted: boolean;
  databaseCipherVersion: string;
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
  message: string;
}

export interface FileExportResult {
  success: boolean;
  filePath: string;
  fileSizeBytes: number;
  sha256: string;
}


declare global {
  interface Window {
    beBossDesktop: {
      secureStore: {
        get(key: string): Promise<string | null>;
        set(key: string, value: string): Promise<boolean>;
        remove(key: string): Promise<boolean>;
      };
      getDeviceId(): Promise<string>;
      local: {
        load(): Promise<any | null>;
        queue(
          operation: string,
          payload: any,
          deviceId: string,
          expectedUpdatedAt: number,
          requiresActiveSubscription: boolean,
          subscriptionExpiresAt: number,
          subscriptionStatus: string
        ): Promise<{ id: string; payload: any; hlc: number; expectedUpdatedAt: number; queued: boolean }>;
        outboxCount(): Promise<number>;
        pending(): Promise<{ id: string; payload: any; hlc: number; expectedUpdatedAt: number }[]>;
        acknowledge(ids: string[]): Promise<boolean>;
      };
      openExternal(url: string): Promise<void>;
      printReceipt(lines: string[]): Promise<void>;
      systemDiagnostics(): Promise<SystemDiagnostics>;
      networkPing(targetHost?: string): Promise<NetworkPingResult>;
      printEscposThermal(payload: ReceiptPrintPayload): Promise<EscposPrintResult>;
      exportBackupFile(encryptedContent: string): Promise<FileExportResult>;
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
