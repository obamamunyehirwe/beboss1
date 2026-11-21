import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Tables = Database["public"]["Tables"];
export type ShopAccount = Tables["shop_accounts"]["Row"];
export type PaymentRequest = Tables["payment_requests"]["Row"];
export type ShopDevice = Tables["shop_devices"]["Row"];
export type ShopUser = Tables["shop_users"]["Row"];
export type UnlockCode = Tables["unlock_codes"]["Row"];
export type Snapshot = Tables["branch_sync_snapshots"]["Row"];
export type AuditLog = Tables["admin_audit_logs"]["Row"];
export type AppRelease = Tables["app_releases"]["Row"];
export type ContactMessage = Tables["contact_messages"]["Row"];
export type AppConfig = Tables["app_config"]["Row"];

async function all<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  cap = Number.POSITIVE_INFINITY,
): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; from < cap; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
    if (out.length >= cap) break;
  }
  return out;
}

export const adminKeys = {
  shops: ["admin", "shops"] as const,
  payments: ["admin", "payments"] as const,
  devices: ["admin", "devices"] as const,
  users: ["admin", "users"] as const,
  codes: ["admin", "codes"] as const,
  snapshots: ["admin", "snapshots"] as const,
  audit: ["admin", "audit"] as const,
  releases: ["admin", "releases"] as const,
  downloads: ["admin", "downloads"] as const,
  inbox: ["admin", "inbox"] as const,
  config: ["admin", "config"] as const,
};

export const shopsQuery = queryOptions({
  queryKey: adminKeys.shops,
  queryFn: () => all<ShopAccount>((a, b) => supabase.from("shop_accounts").select("*").order("updated_at", { ascending: false }).range(a, b)),
  staleTime: 5_000,
  refetchInterval: 15_000,
});
export const paymentsQuery = queryOptions({
  queryKey: adminKeys.payments,
  queryFn: () => all<PaymentRequest>((a, b) => supabase.from("payment_requests").select("*").order("created_at", { ascending: false }).range(a, b)),
  staleTime: 5_000,
  refetchInterval: 10_000,
});
export const devicesQuery = queryOptions({
  queryKey: adminKeys.devices,
  queryFn: () => all<ShopDevice>((a, b) => supabase.from("shop_devices").select("*").order("updated_at", { ascending: false }).range(a, b)),
  staleTime: 5_000,
  refetchInterval: 15_000,
});
export const usersQuery = queryOptions({
  queryKey: adminKeys.users,
  queryFn: () => all<ShopUser>((a, b) => supabase.from("shop_users").select("*").order("updated_at", { ascending: false }).range(a, b)),
  staleTime: 5_000,
  refetchInterval: 15_000,
});
export const codesQuery = queryOptions({
  queryKey: adminKeys.codes,
  queryFn: () => all<UnlockCode>((a, b) => supabase.from("unlock_codes").select("*").order("issued_at", { ascending: false }).range(a, b)),
  staleTime: 5_000,
  refetchInterval: 15_000,
});
export const snapshotsQuery = queryOptions({
  queryKey: adminKeys.snapshots,
  queryFn: () => all<Omit<Snapshot, "payload_token"> & { payload_size: number }>((a, b) =>
    supabase.from("branch_sync_snapshots").select("id, shop_sync_key, device_id, branch_id, branch_name, shop_name, owner_username, records_summary, sync_generation, chunk_index, chunk_count, updated_at").order("updated_at", { ascending: false }).range(a, b) as never,
  ),
  staleTime: 5_000,
  refetchInterval: 10_000,
});
export const auditQuery = queryOptions({
  queryKey: adminKeys.audit,
  queryFn: () => all<AuditLog>((a, b) => supabase.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).range(a, b), 3000),
});
export const releasesQuery = queryOptions({
  queryKey: adminKeys.releases,
  queryFn: async () => {
    const { data, error } = await supabase.from("app_releases").select("*").order("published_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
export const downloadsQuery = queryOptions({
  queryKey: adminKeys.downloads,
  queryFn: async () => {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    return all<{ created_at: string; channel: string; release_id: string | null }>((a, b) =>
      supabase.from("apk_downloads").select("created_at, channel, release_id").gte("created_at", since).order("created_at", { ascending: false }).range(a, b),
    );
  },
});
export const inboxQuery = queryOptions({
  queryKey: adminKeys.inbox,
  queryFn: async () => {
    const { data, error } = await supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
export const configQuery = queryOptions({
  queryKey: adminKeys.config,
  queryFn: async () => {
    const { data, error } = await supabase.from("app_config").select("*").eq("id", "global").maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
});

export type SyncEvent = Tables["cloud_sync_events"]["Row"];
export const syncEventsQuery = queryOptions({
  queryKey: ["admin", "sync-events"] as const,
  queryFn: async () => {
    const { data, error } = await supabase.from("cloud_sync_events").select("*").order("id", { ascending: false }).limit(600);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  staleTime: 5_000,
  // Realtime is the fast path; polling keeps the admin monitor current after a socket reconnect.
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
});
