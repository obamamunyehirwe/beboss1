-- Lock down the remaining helper functions to PostgreSQL built-ins only.
alter function public.computed_shop_sync_key(text, text) set search_path = pg_catalog;
alter function public.now_ms() set search_path = pg_catalog;
alter function public.current_shop_sync_key() set search_path = pg_catalog;

-- Cover the release foreign key used by download history lookups and cleanup.
create index if not exists idx_apk_downloads_release_id on public.apk_downloads(release_id);
