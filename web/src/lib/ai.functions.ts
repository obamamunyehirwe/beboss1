import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { effectiveShopStatus } from "./pricing";
import { requireStaffRole, type AdminCtx } from "./admin-guard.server";
import { runAiText } from "./ai-gateway.server";

const DAY = 86_400_000;

/** Compact, numbers-only business digest the assistant reasons over (no phone numbers). */
async function buildDigest(ctx: AdminCtx) {
  const sb = ctx.supabase;
  const [shops, pays, devices, codes, events, inbox] = await Promise.all([
    sb.from("shop_accounts").select("id, shop_name, owner_username, branch_count, worker_count, device_count, monthly_fee_rwf, subscription_status, subscription_expires_at, remote_kill_switch, created_at, updated_at").limit(2000),
    sb.from("payment_requests").select("shop_name, provider, amount_rwf, duration_months, status, source, created_at, updated_at").order("created_at", { ascending: false }).limit(1500),
    sb.from("shop_devices").select("shop_name, is_active, last_synced_at, role").limit(3000),
    sb.from("unlock_codes").select("status, tier_code, plan_days, amount_rwf, issued_at").order("issued_at", { ascending: false }).limit(1500),
    sb.from("cloud_sync_events").select("entity, action, shop_name, created_at").order("id", { ascending: false }).limit(300),
    sb.from("contact_messages").select("topic, status, created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  const now = Date.now();
  const s = (shops.data ?? []) as any[];
  const p = (pays.data ?? []) as any[];
  const d = (devices.data ?? []) as any[];
  const status: Record<string, number> = {};
  let mrr = 0;
  for (const shop of s) {
    const st = effectiveShopStatus(shop, now);
    status[st] = (status[st] ?? 0) + 1;
    if (st === "ACTIVE") mrr += Number(shop.monthly_fee_rwf) || 0;
  }
  const approved = p.filter((x) => x.status === "APPROVED" || x.status === "REDEEMED");
  const sum = (rows: any[]) => rows.reduce((a, x) => a + (Number(x.amount_rwf) || 0), 0);
  const monthly: Record<string, number> = {};
  for (const x of approved) {
    const k = new Date(Number(x.updated_at)).toISOString().slice(0, 7);
    monthly[k] = (monthly[k] ?? 0) + (Number(x.amount_rwf) || 0);
  }
  const expiring = s
    .filter((x) => ["ACTIVE", "TRIAL"].includes(effectiveShopStatus(x, now)) && x.subscription_expires_at - now < 7 * DAY)
    .map((x) => ({ shop: x.shop_name, user: x.owner_username, daysLeft: Math.ceil((x.subscription_expires_at - now) / DAY), status: effectiveShopStatus(x, now) }));
  return {
    generatedAt: new Date(now).toISOString(),
    currency: "RWF (FRw)",
    shops: { total: s.length, byStatus: status, mrrRwf: mrr, newLast30d: s.filter((x) => now - x.created_at < 30 * DAY).length, expiringWithin7d: expiring.slice(0, 25) },
    payments: {
      pendingCount: p.filter((x) => x.status === "PENDING_VERIFICATION").length,
      pendingRwf: sum(p.filter((x) => x.status === "PENDING_VERIFICATION")),
      pendingOver24h: p.filter((x) => x.status === "PENDING_VERIFICATION" && now - x.created_at > DAY).length,
      approvedLast30dRwf: sum(approved.filter((x) => now - x.updated_at < 30 * DAY)),
      rejectedLast30d: p.filter((x) => x.status === "REJECTED" && now - x.updated_at < 30 * DAY).length,
      byProviderRwf: approved.reduce((a: Record<string, number>, x) => ((a[x.provider] = (a[x.provider] ?? 0) + (Number(x.amount_rwf) || 0)), a), {}),
      revenueByMonth: monthly,
    },
    devices: {
      total: d.length,
      active: d.filter((x) => x.is_active).length,
      syncedLast24h: d.filter((x) => now - Number(x.last_synced_at) < DAY).length,
      staleOver7d: d.filter((x) => x.is_active && Number(x.last_synced_at) > 0 && now - Number(x.last_synced_at) > 7 * DAY).length,
    },
    unlockCodes: { issued: (codes.data ?? []).length, redeemed: (codes.data ?? []).filter((c: any) => c.status === "REDEEMED").length, revoked: (codes.data ?? []).filter((c: any) => c.status === "REVOKED").length },
    recentSyncEvents: (events.data ?? []).slice(0, 40).map((e: any) => `${e.created_at.slice(0, 16)} ${e.entity} ${e.action} ${e.shop_name}`),
    inbox: { new: (inbox.data ?? []).filter((m: any) => m.status === "NEW").length, total: (inbox.data ?? []).length },
  };
}

const COPILOT_RULES = `You are BeBoss Copilot, the operations analyst inside the BeBoss admin center.
BeBoss is an offline-first Android point-of-sale app for shops in Rwanda; shops pay a subscription by MTN MoMo or Airtel Money and receive unlock codes.
Answer using ONLY the JSON business digest provided. If the data can't answer, say so plainly.
Be concise and practical: lead with the answer, then 2-5 short bullet points, then one recommended next action in the admin center when useful.
Format money as "12,000 FRw". Use plain text with "- " bullets; no tables, no markdown headings.`;

const msgSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(20),
});

export const askCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof msgSchema>) => msgSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AdminCtx;
    await requireStaffRole(ctx, false);
    const digest = await buildDigest(ctx);
    const text = await runAiText(`${COPILOT_RULES}\n\nBusiness digest (JSON):\n${JSON.stringify(digest)}`, data.messages);
    return { text };
  });

export const draftInboxReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { messageId: string; tone: "friendly" | "formal" }) => z.object({ messageId: z.string().uuid(), tone: z.enum(["friendly", "formal"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AdminCtx;
    await requireStaffRole(ctx, false);
    const { data: m, error } = await ctx.supabase.from("contact_messages").select("full_name, shop_name, topic, message").eq("id", data.messageId).maybeSingle();
    if (error || !m) throw new Error("Message not found.");
    const { data: cfg } = await ctx.supabase.from("app_config").select("mtn_momo_code, mtn_recipient_name, airtel_money_phone, per_device_fee_rwf, apk_version").eq("id", "global").maybeSingle();
    const instructions = `You write short WhatsApp/email replies for the BeBoss support team (offline-first Android POS for Rwandan shops).
Facts you may use: pricing starts at 5,000 FRw/month for 1 branch; extra devices ${cfg?.per_device_fee_rwf ?? 2000} FRw each; 10% off 3 months, 20% off 12 months; 4-day free trial; payments by MTN MoMo code ${cfg?.mtn_momo_code ?? ""} (${cfg?.mtn_recipient_name ?? "BeBoss Pay"}) or Airtel ${cfg?.airtel_money_phone ?? ""}; latest app version ${cfg?.apk_version ?? ""}; after paying, owners submit their shop username, registered phone, payer name and phone, payment date/time, provider and optional payment note in the app or on the website "My shop" page. BeBoss administrators verify payment with the provider and issue a payment-linked BB3 unlock code.
Reply in the same language the customer wrote in (English, Kinyarwanda, French or Swahili). Tone: ${data.tone}. Max 120 words. Never invent unlock codes, prices or promises beyond these facts. Sign off as "BeBoss Support". Output only the reply text.`;
    const text = await runAiText(instructions, [
      { role: "user", content: `Customer: ${m.full_name}${m.shop_name ? ` (${m.shop_name})` : ""}\nTopic: ${m.topic}\nMessage:\n${m.message}` },
    ]);
    return { text };
  });
