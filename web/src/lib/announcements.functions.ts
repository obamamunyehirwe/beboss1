import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaffRole, writeAudit, type AdminCtx } from "./admin-guard.server";

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().max(2000),
  severity: z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"]),
  audience: z.enum(["ALL", "WEBSITE", "APP"]),
  target_shop_key: z.string().trim().max(200),
  cta_label: z.string().trim().max(40),
  cta_url: z.union([z.literal(""), z.string().trim().url().max(500), z.string().trim().regex(/^\/[^/].*/).max(500)]),
  is_active: z.boolean(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().nullable(),
});
export type AnnouncementInput = z.infer<typeof schema>;

const piece = z.object({ title: z.string().max(240), body: z.string().max(3000), cta_label: z.string().max(80) });
const translationsSchema = z.object({ rw: piece, fr: piece, sw: piece });

/** Translates announcement text into Kinyarwanda, French and Swahili. Returns null if the AI step fails. */
async function translateAnnouncement(row: { title: string; body: string; cta_label: string }) {
  try {
    const { runAiText } = await import("./ai-gateway.server");
    const out = await runAiText(
      "You translate short retail-software announcements for shop owners in Rwanda and East Africa. " +
        "Translate the JSON values into Kinyarwanda (rw), French (fr) and Swahili (sw). Keep brand names (BeBoss, MoMo, Airtel, MTN), numbers, prices and URLs unchanged. " +
        "Keep it natural and short. Empty strings stay empty. Reply with only JSON shaped exactly like " +
        '{"rw":{"title":"","body":"","cta_label":""},"fr":{...},"sw":{...}}.',
      [{ role: "user", content: JSON.stringify(row) }],
    );
    const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    return translationsSchema.parse(JSON.parse(json));
  } catch (e) {
    console.error("announcement translation failed", e);
    return null;
  }
}

export const saveAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AnnouncementInput) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AdminCtx;
    const admin = await requireStaffRole(ctx, true);
    if (data.ends_at && new Date(data.ends_at) <= new Date(data.starts_at)) throw new Error("End date must be after the start date.");
    const { id, ...row } = data;
    const translations = await translateAnnouncement({ title: row.title, body: row.body, cta_label: row.cta_label });
    const payload = { ...row, translations: translations ?? {}, updated_at: new Date().toISOString() };
    const res = id
      ? await ctx.supabase.from("announcements").update(payload).eq("id", id).select("id").single()
      : await ctx.supabase.from("announcements").insert({ ...payload, created_by: admin.email }).select("id").single();
    if (res.error) throw new Error(res.error.message);
    await writeAudit(ctx, admin.email, id ? "UPDATE_ANNOUNCEMENT" : "CREATE_ANNOUNCEMENT", res.data.id, `${data.severity} • ${data.audience} • ${data.title}`);
    return { id: res.data.id as string, translated: translations !== null };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as AdminCtx;
    const admin = await requireStaffRole(ctx, true);
    const { error } = await ctx.supabase.from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(ctx, admin.email, "DELETE_ANNOUNCEMENT", data.id, "Removed announcement");
    return { ok: true };
  });
