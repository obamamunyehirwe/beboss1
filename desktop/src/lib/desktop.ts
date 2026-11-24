import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

type PendingTransaction = { id: string; payload: any; hlc: number; expectedUpdatedAt: number };

window.beBossDesktop = Object.freeze({
  secureStore: Object.freeze({
    get: (key: string) => invoke<string | null>("secure_get", { key }),
    set: async (key: string, value: string) => {
      await invoke("secure_set", { key, value });
      return true;
    },
    remove: async (key: string) => {
      await invoke("secure_remove", { key });
      return true;
    }
  }),
  getDeviceId: () => invoke<string>("get_device_id"),
  local: Object.freeze({
    load: () => invoke<Record<string, unknown> | null>("local_load"),
    queue: (operation: string, payload: any, deviceId: string, expectedUpdatedAt: number, requiresActiveSubscription: boolean, subscriptionExpiresAt: number, subscriptionStatus: string) =>
      invoke<{ id: string; payload: any; hlc: number; expectedUpdatedAt: number }>("local_queue", {
        operation, payload, deviceId, expectedUpdatedAt, requiresActiveSubscription, subscriptionExpiresAt, subscriptionStatus
      }).then((t) => ({ ...t, queued: true })),
    outboxCount: () => invoke<number>("local_outbox_count"),
    pending: () => invoke<PendingTransaction[]>("local_pending"),
    acknowledge: async (ids: string[]) => {
      await invoke("local_ack", { ids });
      return true;
    }
  }),
  openExternal: async (target: string) => {
    const url = new URL(target);
    if (url.protocol !== "https:") throw new Error("Only HTTPS links can be opened externally.");
    await openUrl(url.toString());
  },
  systemDiagnostics: () => invoke<any>("system_diagnostics"),
  networkPing: (targetHost?: string) => invoke<any>("network_ping", { targetHost }),
  printEscposThermal: (payload: any) => invoke<any>("print_escpos_thermal", { payload }),
  exportBackupFile: (jsonContent: string) => invoke<any>("export_backup_file", { jsonContent }),
  importBackupFile: (filePath: string) => invoke<any>("import_backup_file", { filePath }),
  verifyEmergencyCode: (code: string) => invoke<any>("verify_emergency_code", { code }),
  printReceipt: async (_lines: string[]) => { window.print(); },
  platform: navigator.platform,
  version: "1.2.0"
});
