import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createPublicClient } from "./server/public-client";
import { computeShopKey, normalizePhoneLast9 } from "./pricing";
import { decodeShareToken, extractShopRecords, mergeShareJson, pickLatestChunkSet, type ShopRecords } from "./snapshot-analytics";

export const getPublicSite = createServerFn({ method: "GET" }).handler(async () => {
  const sb = createPublicClient();
  const [cfg, rel] = await Promise.all([
    sb.from("app_config").select("admin_whatsapp_number, mtn_momo_code, mtn_momo_phone, mtn_recipient_name, airtel_money_phone, airtel_recipient_name, per_device_fee_rwf, apk_version, support_email").eq("id", "global").maybeSingle(),
    sb.from("app_releases").select("id, version_name, version_code, file_name, size_bytes, sha256, min_android, release_notes, published_at, download_count").order("published_at", { ascending: false }).limit(8),
  ]);
  const releases = rel.data ?? [];
  const { data: currentRow } = await sb.from("app_releases").select("id").eq("is_current", true).maybeSingle();
  const current = releases.find((r) => r.id === currentRow?.id) ?? null;
  return { config: cfg.data ?? null, current, releases };
});

const lookupSchema = z.object({
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
});

export const lookupMyShop = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof lookupSchema>) => lookupSchema.parse(d))
  .handler(async ({ data }) => {
    if (normalizePhoneLast9(data.phone).length < 9) throw new Error("Enter the full phone number registered in the app.");
    const key = computeShopKey(data.username, data.phone);
    const sb = createPublicClient(key);
    const [shop, pays, codes, devices, news, snaps] = await Promise.all([
      sb.from("shop_accounts").select("shop_name, owner_name, owner_username, branch_count, worker_count, device_count, device_limit, monthly_fee_rwf, subscription_status, subscription_expires_at, remote_kill_switch, updated_at").eq("id", key).maybeSingle(),
      sb.from("payment_requests").select("id, provider, amount_rwf, duration_months, telco_reference, status, approval_mode, generated_unlock_code, rejection_reason, created_at, updated_at").order("created_at", { ascending: false }).limit(20),
      sb.from("unlock_codes").select("unlock_code, tier_code, plan_days, status, issued_at, redeemed_at").order("issued_at", { ascending: false }).limit(20),
      sb.from("shop_devices").select("id, device_name, device_id, role, branch_name, is_active, is_owner_primary, assigned_user_name, last_synced_at").eq("shop_sync_key", key).order("last_synced_at", { ascending: false }).limit(50),
      sb.from("announcements").select("*").in("audience", ["ALL", "APP"]).order("starts_at", { ascending: false }).limit(5),
      sb.from("branch_sync_snapshots").select("id, device_id, branch_name, records_summary, payload_token, updated_at").eq("shop_sync_key", key).order("updated_at", { ascending: false }).limit(20),
    ]);

    let decodedRecords: ShopRecords | null = null;
    let snapshotUploadedAt = 0;
    const snapRows = snaps.data ?? [];
    if (snapRows.length > 0) {
      try {
        const set = pickLatestChunkSet(snapRows as { id: string; device_id: string; branch_name: string; payload_token: string; updated_at: number }[]);
        if (set.length > 0) {
          snapshotUploadedAt = Math.max(...set.map((r) => Number(r.updated_at)));
          const parts = await Promise.all(set.map((r) => decodeShareToken(r.payload_token)));
          decodedRecords = extractShopRecords(mergeShareJson(parts));
        }
      } catch (err) {
        console.warn("Could not decode public snapshot for shop", key, err);
      }
    }

    return {
      shopKey: key,
      shop: shop.data ?? null,
      payments: pays.data ?? [],
      codes: codes.data ?? [],
      devices: devices.data ?? [],
      announcements: news.data ?? [],
      snapshots: snapRows.map((s) => ({
        id: s.id,
        branch_name: s.branch_name,
        device_id: s.device_id,
        records_summary: s.records_summary,
        updated_at: s.updated_at,
      })),
      records: decodedRecords,
      snapshotUploadedAt,
    };
  });

const proofSchema = z.object({
  shopName: z.string().trim().min(2).max(120),
  username: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(30),
  provider: z.enum(["MTN MoMo", "Airtel Money"]),
  payerPhone: z.string().trim().min(9).max(30),
  payerName: z.string().trim().min(2).max(120),
  telcoReference: z.string().trim().min(4).max(60),
  months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  branches: z.number().int().min(1).max(100),
  workers: z.number().int().min(1).max(500),
  devices: z.number().int().min(1).max(100),
  ussd: z.string().max(80),
});

export const submitPaymentProof = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof proofSchema>) => proofSchema.parse(d))
  .handler(async ({ data }) => {
    const key = computeShopKey(data.username, data.phone);
    const sb = createPublicClient(key);
    // Refuse duplicate references for the same shop so the queue stays clean.
    const { data: dup } = await sb.from("payment_requests").select("id").eq("telco_reference", data.telcoReference).limit(1);
    if (dup && dup.length) throw new Error("This transaction reference was already submitted for your shop.");
    const now = Date.now();
    const { error } = await sb.from("payment_requests").insert({
      id: `WEB-${crypto.randomUUID()}`,
      shop_name: data.shopName,
      owner_username: data.username.toLowerCase(),
      owner_phone: data.phone,
      provider: data.provider,
      ussd_code: data.ussd,
      payer_phone: data.payerPhone,
      payer_full_name: data.payerName,
      duration_months: data.months,
      branch_count: data.branches,
      worker_count: data.workers,
      device_count: data.devices,
      telco_reference: data.telcoReference,
      status: "PENDING_VERIFICATION",
      source: "WEB",
      created_at: now,
      updated_at: now,
    });
    if (error) throw new Error("Could not submit your payment proof. Please try again.");
    return { ok: true };
  });
