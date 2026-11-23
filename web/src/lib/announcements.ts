import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Announcement = Database["public"]["Tables"]["announcements"]["Row"];

export function isLive(a: Pick<Announcement, "is_active" | "starts_at" | "ends_at">, now = Date.now()) {
  return a.is_active && new Date(a.starts_at).getTime() <= now && (!a.ends_at || new Date(a.ends_at).getTime() > now);
}

/** A retired legacy announcement that must never be re-published on the public site. */
const SUPPRESSED_PUBLIC_ANNOUNCEMENT_IDS = new Set([
  "22222222-3333-4444-5555-666666666666",
]);

/** Live, everyone-targeted announcements for the public website. */
export const websiteAnnouncementsQuery = queryOptions({
  queryKey: ["announcements", "website"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .in("audience", ["ALL", "WEBSITE"])
      .eq("target_shop_key", "")
      .eq("is_active", true)
      .order("starts_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    return (data ?? []).filter((a) => !SUPPRESSED_PUBLIC_ANNOUNCEMENT_IDS.has(a.id) && isLive(a));
  },
  staleTime: 60_000,
});

export const announcementsAdminQuery = queryOptions({
  queryKey: ["admin", "announcements"],
  queryFn: async () => {
    const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
