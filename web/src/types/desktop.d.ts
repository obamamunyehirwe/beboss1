export interface BeBossDesktopBridge {
  isDesktop: boolean;
  platform: string;
  getVersion(): Promise<string>;
  getUpdateStatus(): Promise<{ state: string; version: string | null }>;
  checkForUpdates(): Promise<{ state: string; version: string | null }>;
  printCurrentPage(): Promise<{ success: boolean; failureReason?: string }>;
  isSecureStorageAvailable(): Promise<boolean>;
  readWorkspaceCache(): Promise<string | null>;
  writeWorkspaceCache(value: string): Promise<boolean>;
  clearWorkspaceCache(): Promise<boolean>;
  secureAuthStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
}

declare global {
  interface Window {
    beBossDesktop?: BeBossDesktopBridge;
  }
}

export {};
