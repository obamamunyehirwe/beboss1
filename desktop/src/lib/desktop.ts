import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

type PendingTransaction = { id: string; payload: any; hlc: number; expectedUpdatedAt: number };
type TauriWindow = Window & { __TAURI_INTERNALS__?: { invoke?: (...args: unknown[]) => Promise<unknown> } };

const NATIVE_RUNTIME_REQUIRED =
  "BeBoss Desktop's setup and local services run inside the installed native app, not in Chrome or a normal browser. Close this browser preview and launch BeBoss Desktop from the Windows Start Menu or desktop shortcut.";

export function isNativeDesktopRuntime(): boolean {
  return typeof window !== "undefined" &&
    typeof (window as TauriWindow).__TAURI_INTERNALS__?.invoke === "function";
}

function nativeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isNativeDesktopRuntime()) {
    return Promise.reject(new Error(NATIVE_RUNTIME_REQUIRED));
  }
  return invoke<T>(command, args);
}

window.beBossDesktop = Object.freeze({
  isNative: isNativeDesktopRuntime(),
  secureStore: Object.freeze({
    get: (key: string) => nativeInvoke<string | null>("secure_get", { key }),
    set: async (key: string, value: string) => {
      await nativeInvoke("secure_set", { key, value });
      return true;
    },
    remove: async (key: string) => {
      await nativeInvoke("secure_remove", { key });
      return true;
    }
  }),
  getDeviceId: () => nativeInvoke<string>("get_device_id"),
  local: Object.freeze({
    load: () => nativeInvoke<Record<string, unknown> | null>("local_load"),
    queue: (operation: string, payload: any, deviceId: string, expectedUpdatedAt: number, requiresActiveSubscription: boolean, subscriptionExpiresAt: number, subscriptionStatus: string) =>
      nativeInvoke<{ id: string; payload: any; hlc: number; expectedUpdatedAt: number }>("local_queue", {
        operation, payload, deviceId, expectedUpdatedAt, requiresActiveSubscription, subscriptionExpiresAt, subscriptionStatus
      }).then((t) => ({ ...t, queued: true })),
    outboxCount: () => nativeInvoke<number>("local_outbox_count"),
    pending: () => nativeInvoke<PendingTransaction[]>("local_pending"),
    acknowledge: async (ids: string[]) => {
      await nativeInvoke("local_ack", { ids });
      return true;
    }
  }),
  openExternal: async (target: string) => {
    const url = new URL(target);
    if (url.protocol !== "https:") throw new Error("Only HTTPS links can be opened externally.");
    if (!isNativeDesktopRuntime()) throw new Error(NATIVE_RUNTIME_REQUIRED);
    await openUrl(url.toString());
  },
  systemDiagnostics: () => nativeInvoke<any>("system_diagnostics"),
  networkPing: (targetHost?: string) => nativeInvoke<any>("network_ping", { targetHost }),
  printEscposThermal: (payload: any) => nativeInvoke<any>("print_escpos_thermal", { payload }),
  exportBackupFile: (encryptedContent: string) => nativeInvoke<any>("export_backup_file", { encryptedContent }),
  lan: Object.freeze({
    storeShopSecret: (shopSyncKey: string, secret: string) =>
      nativeInvoke<void>("lan_store_shop_secret", { shopSyncKey, secret }),
    discoverHubs: (shopSyncKey: string, timeoutMs?: number) =>
      nativeInvoke<LanHub[]>("lan_discover_hubs", { shopSyncKey, timeoutMs }),
    syncWithHub: (shopSyncKey: string, ipAddress: string, port: number, snapshot: Record<string, unknown>) =>
      nativeInvoke<LanSyncResult>("lan_sync_with_hub", { shopSyncKey, ipAddress, port, snapshot })
  }),
  printReceipt: async (_lines: string[]) => { window.print(); },
  platform: navigator.platform,
  version: "1.3.0"
});
