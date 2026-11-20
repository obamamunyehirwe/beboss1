import { createServerFn } from "@tanstack/react-start";
import { createPublicClient } from "./server/public-client";

export interface PlatformStats {
  shops_total: number;
  shops_active: number;
  branches_total: number;
  devices_active: number;
  devices_synced_24h: number;
  sync_events_24h: number;
  codes_redeemed: number;
  last_sync_at: string | null;
  activity_14d: { day: string; events: number }[];
  server_time: string;
}

/** Public, aggregate-only platform health (no shop names or personal data). */
export const getPlatformStats = createServerFn({ method: "GET" }).handler(async () => {
  const started = Date.now();
  const sb = createPublicClient();
  const { data, error } = await sb.rpc("public_platform_stats");
  const latencyMs = Date.now() - started;
  if (error) return { ok: false as const, latencyMs, stats: null };
  return { ok: true as const, latencyMs, stats: data as unknown as PlatformStats };
});
