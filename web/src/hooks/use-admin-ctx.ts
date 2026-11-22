import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/lib/use-server-fn";
import { getAdminContext } from "@/lib/admin.functions";

export function useAdminCtx() {
  const fn = useServerFn(getAdminContext);
  return useQuery({
    queryKey: ["admin", "ctx"],
    queryFn: () => fn(),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}
