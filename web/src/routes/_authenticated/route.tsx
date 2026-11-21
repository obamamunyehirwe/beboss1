import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { liveConfigured } from '@/lib/live-config';
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (!liveConfigured) throw redirect({to:'/auth',search:{redirect:location.href}});
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
