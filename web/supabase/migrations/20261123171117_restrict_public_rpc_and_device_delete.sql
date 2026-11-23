-- The aggregate stats endpoint is public by design. Only anon and the service
-- role need to execute it; signed-in users use the same public server response.
revoke execute on function public.public_platform_stats() from public, authenticated;
grant execute on function public.public_platform_stats() to anon, service_role;

-- APK download accounting is invoked by public-apk-download with the service role.
-- Do not expose a SECURITY DEFINER counter mutation to arbitrary API clients.
revoke execute on function public.record_apk_download(uuid, text) from public, anon, authenticated;
grant execute on function public.record_apk_download(uuid, text) to service_role;

-- Tenant-key-authenticated clients use delete_shop_device(), which validates the
-- actor in beboss_private. Direct row deletion is reserved for BeBoss administrators.
drop policy if exists "Tenant or admin delete shop_devices" on public.shop_devices;
create policy "Admin delete shop_devices"
on public.shop_devices for delete to authenticated
using ((select public.is_beboss_admin()));
