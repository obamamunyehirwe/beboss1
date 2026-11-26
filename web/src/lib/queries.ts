import { queryOptions } from "@tanstack/react-query";
import { getPublicSite } from "./public.functions";

export const publicSiteQuery = queryOptions({
  queryKey: ["public-site"],
  queryFn: () => getPublicSite(),
  staleTime: 60_000,
});

export { DOWNLOAD_PATH } from "./download-path";

import { getPlatformStats } from "./platform.functions";

export const platformStatsQuery = queryOptions({
  queryKey: ["platform-stats"],
  queryFn: () => getPlatformStats(),
  staleTime: 15_000,
  refetchInterval: 30_000,
});
