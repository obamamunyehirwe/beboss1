import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeRetailInsights, decodeShareToken, extractShopRecords, mergeShareJson, parseShareToken, pickLatestChunkSet, shareSignature, type RetailInsights, type ShopRecords } from "./snapshot-analytics";
import { readServerSecret, requireStaffRole, writeAudit, type AdminCtx } from "./admin-guard.server";

const DATASHARE_SECRET = "BEBOSS_DATASHARE_HMAC_SECRET";
const SNAPSHOT_PAGE_SIZE = 1000;

async function loadShopSnapshots(ctx: AdminCtx, shopId: string) {
  const rows: {
    id: string;
    device_id: string;
    branch_name: string;
    payload_token: string;
    updated_at: number;
    sync_generation: string;
    chunk_index: number;
    chunk_count: number;
    records_summary: string;
  }[] = [];

  for (let from = 0; ; from += SNAPSHOT_PAGE_SIZE) {
    const { data, error } = await ctx.supabase
      .from("branch_sync_snapshots")
      .select("id, device_id, branch_name, payload_token, updated_at, sync_generation, chunk_index, chunk_count, records_summary")
      .eq("shop_sync_key", shopId)
      .order("updated_at", { ascending: false })
      .range(from, from + SNAPSHOT_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < SNAPSHOT_PAGE_SIZE) break;
  }
  return rows;
}

export interface ShopInsightsResult {
  insights: RetailInsights | null;
  chunks: number;
  deviceId: string;
  branchName: string;
  uploadedAt: number;
  signature: "VERIFIED" | "MISMATCH" | "UNCHECKED";
  error: string | null;
}

export const getShopInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shopId: string }) => z.object({ shopId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<ShopInsightsResult> => {
    const ctx = context as unknown as AdminCtx;
    await requireStaffRole(ctx, false);
    const rows = await loadShopSnapshots(ctx, data.shopId);
    const set = pickLatestChunkSet(rows);
    const empty: ShopInsightsResult = { insights: null, chunks: 0, deviceId: "", branchName: "", uploadedAt: 0, signature: "UNCHECKED", error: null };
    if (!set.length) {
      return rows.length
        ? { ...empty, error: "The latest phone sync is incomplete. Waiting for its automatic retry." }
        : empty;
    }
    const head = set.find((r) => !r.device_id.includes("#")) ?? set[0]!;
    const base = { ...empty, chunks: set.length, deviceId: head.device_id, branchName: head.branch_name, uploadedAt: Math.max(...set.map((r) => Number(r.updated_at))) };
    try {
      const secret = await readServerSecret(DATASHARE_SECRET).catch(() => null);
      let signature: ShopInsightsResult["signature"] = "UNCHECKED";
      if (secret) {
        signature = "VERIFIED";
        for (const r of set) {
          const { sig, payload } = parseShareToken(r.payload_token);
          const expected = (await shareSignature(payload, secret)).slice(0, Math.min(Math.max(sig.length, 8), 16));
          if (expected !== sig) signature = "MISMATCH";
        }
      }
      const parts = await Promise.all(set.map((r) => decodeShareToken(r.payload_token)));
      return { ...base, signature, insights: computeRetailInsights(mergeShareJson(parts)) };
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : "Could not read this snapshot" };
    }
  });

export const getDatashareKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as AdminCtx;
    await requireStaffRole(ctx, true);
    return { configured: !!(await readServerSecret(DATASHARE_SECRET).catch(() => null)) };
  });

export const setDatashareKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { value: string }) => z.object({ value: z.string().trim().min(8, "Use at least 8 characters").max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AdminCtx;
    const admin = await requireStaffRole(ctx, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_secrets").upsert({ name: DATASHARE_SECRET, value: data.value, updated_by: admin.email, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await writeAudit(ctx, admin.email, "SET_DATASHARE_KEY", DATASHARE_SECRET, "Snapshot verification key updated (value not logged)");
    return { ok: true };
  });

export const getShopRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shopId: string }) => z.object({ shopId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<{ records: ShopRecords | null; uploadedAt: number; error: string | null }> => {
    const ctx = context as unknown as AdminCtx;
    await requireStaffRole(ctx, false);
    const rows = await loadShopSnapshots(ctx, data.shopId);
    const set = pickLatestChunkSet(rows);
    if (!set.length) {
      return {
        records: null,
        uploadedAt: 0,
        error: rows.length ? "The latest phone sync is incomplete. Waiting for its automatic retry." : null,
      };
    }
    const uploadedAt = Math.max(...set.map((r) => Number(r.updated_at)));
    try {
      const parts = await Promise.all(set.map((r) => decodeShareToken(r.payload_token)));
      return { records: extractShopRecords(mergeShareJson(parts)), uploadedAt, error: null };
    } catch (e) {
      return { records: null, uploadedAt, error: e instanceof Error ? e.message : "Could not read this snapshot" };
    }
  });
