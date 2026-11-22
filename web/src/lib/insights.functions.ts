import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeRetailInsights, decodeShareToken, extractShopRecords, mergeShareJson, parseShareToken, pickLatestChunkSet, type RetailInsights, type ShopRecords } from "./snapshot-analytics";
import { invokeSupabaseEdgeFunction, requireStaffRole, writeAudit, type AdminCtx } from "./admin-guard.server";

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
      let signature: ShopInsightsResult["signature"] = "UNCHECKED";
      try {
        const checks = set.map((r) => {
          try {
            const { sig, payload } = parseShareToken(r.payload_token);
            return { signature: sig, payload };
          } catch {
            return { signature: "", payload: "" };
          }
        });
        const verification = await invokeSupabaseEdgeFunction<{ configured: boolean; verified: boolean }>(
          ctx,
          "manage-app-secrets",
          { action: "verify_snapshot", checks },
        );
        if (verification.configured) signature = verification.verified ? "VERIFIED" : "MISMATCH";
      } catch (verificationError) {
        console.warn("[BeBoss insights] Snapshot verification failed", verificationError);
        signature = "MISMATCH";
      }
      if (signature !== "VERIFIED") {
        return { ...base, signature, error: "Snapshot integrity verification failed or unverified (fail-closed policy enforced)." };
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
    return await invokeSupabaseEdgeFunction<{ configured: boolean }>(
      ctx,
      "manage-app-secrets",
      { action: "snapshot_status" },
    );
  });

export const setDatashareKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { value: string }) => z.object({ value: z.string().trim().min(8, "Use at least 8 characters").max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AdminCtx;
    const admin = await requireStaffRole(ctx, true);
    await invokeSupabaseEdgeFunction(
      ctx,
      "manage-app-secrets",
      { action: "snapshot_save", value: data.value },
    );
    await writeAudit(ctx, admin.email, "SET_DATASHARE_KEY", DATASHARE_SECRET, "Snapshot verification key updated (value not logged)");
    return { ok: true };
  });

export const getShopRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shopId: string }) => z.object({ shopId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<{ records: ShopRecords | null; uploadedAt: number; error: string | null }> => {
    const ctx = context as unknown as AdminCtx;
    await requireStaffRole(ctx, false);

    // Live branch + transfer rows from their normalized cloud tables (written by the phone
    // and the owner portal). These are authoritative when present; otherwise fall back to
    // the snapshot payload.
    const [branchRes, transferRes] = await Promise.all([
      ctx.supabase
        .from("shop_branches")
        .select("id, name, code, address, phone, manager_name, is_main_branch, is_active, operational_status, stock_value_rwf, product_count, daily_sales_target_rwf, monthly_target_rwf, opening_cash_float, email, notes")
        .eq("shop_sync_key", data.shopId)
        .eq("is_active", true)
        .order("is_main_branch", { ascending: false })
        .limit(500),
      ctx.supabase
        .from("shop_stock_transfers")
        .select("id, transfer_number, product_name, from_branch_name, to_branch_name, quantity, unit, status, transferred_by, notes, transfer_date")
        .eq("shop_sync_key", data.shopId)
        .order("updated_at", { ascending: false })
        .limit(1000),
    ]);
    const liveBranches = (branchRes.data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      address: b.address,
      phone: b.phone,
      manager: b.manager_name,
      active: b.is_active,
      isMain: b.is_main_branch,
    }));
    const liveTransfers = (transferRes.data ?? []).map((t) => ({
      id: t.id,
      number: t.transfer_number,
      date: t.transfer_date,
      product: t.product_name,
      fromBranch: t.from_branch_name,
      toBranch: t.to_branch_name,
      quantity: t.quantity,
      unit: t.unit,
      status: t.status,
      transferredBy: t.transferred_by,
      notes: t.notes,
    }));

    const rows = await loadShopSnapshots(ctx, data.shopId);
    const set = pickLatestChunkSet(rows);
    if (!set.length) {
      // No snapshot yet, but live tables may still have data.
      if (liveBranches.length || liveTransfers.length) {
        const empty = await emptyRecords();
        empty.branches = liveBranches;
        empty.stockTransfers = liveTransfers;
        return { records: empty, uploadedAt: 0, error: null };
      }
      return {
        records: null,
        uploadedAt: 0,
        error: rows.length ? "The latest phone sync is incomplete. Waiting for its automatic retry." : null,
      };
    }
    const uploadedAt = Math.max(...set.map((r) => Number(r.updated_at)));
    try {
      const checks = set.map((r) => {
        try {
          const { sig, payload } = parseShareToken(r.payload_token);
          return { signature: sig, payload };
        } catch {
          return { signature: "", payload: "" };
        }
      });
      const verification = await invokeSupabaseEdgeFunction<{ configured: boolean; verified: boolean }>(
        ctx,
        "manage-app-secrets",
        { action: "verify_snapshot", checks },
      );
      if (!verification.configured || !verification.verified) {
        return { records: null, uploadedAt, error: "Snapshot integrity verification failed (fail-closed policy enforced)." };
      }

      const parts = await Promise.all(set.map((r) => decodeShareToken(r.payload_token)));
      const records = extractShopRecords(mergeShareJson(parts));
      // Overlay live cloud tables when present.
      if (liveBranches.length) records.branches = liveBranches;
      if (liveTransfers.length) records.stockTransfers = liveTransfers;
      return { records, uploadedAt, error: null };
    } catch (e) {
      return { records: null, uploadedAt, error: e instanceof Error ? e.message : "Could not read this snapshot" };
    }
  });

async function emptyRecords(): Promise<ShopRecords> {
  return {
    currency: "FRw",
    products: [],
    customers: [],
    sales: [],
    saleItems: [],
    payments: [],
    branches: [],
    stockTransfers: [],
    staff: [],
    purchases: [],
  };
}
