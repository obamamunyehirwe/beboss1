import type { PreviewAuthStorage } from './previewAuthStorage';

export interface BeBossDesktopBridge {
  isDesktop: boolean;
  platform: string;
  isSecureStorageAvailable: () => Promise<boolean>;
  readWorkspaceCache: () => Promise<string | null>;
  writeWorkspaceCache: (value: string) => Promise<boolean>;
  clearWorkspaceCache: () => Promise<boolean>;
  secureAuthStorage: PreviewAuthStorage;
  getVersion: () => Promise<string>;
  getUpdateStatus: () => Promise<{ state: string; version?: string | null }>;
  checkForUpdates: () => Promise<{ state: string; version?: string | null }>;
  printCurrentPage: () => Promise<{ success: boolean; failureReason?: string }>;
}

declare global {
  interface Window { beBossDesktop?: BeBossDesktopBridge; }
}

export function desktopAuthStorage(): PreviewAuthStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  const bridge = window.beBossDesktop;
  if (bridge?.isDesktop && bridge.secureAuthStorage) return bridge.secureAuthStorage;
  return undefined;
}
