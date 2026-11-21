-- Keep trigger-only and role-enumeration helpers out of the exposed PostgREST RPC surface.
-- Trigger execution is performed by PostgreSQL; these functions are not application RPCs.
revoke execute on function public.guard_shop_account_admin_fields() from public, anon, authenticated;
revoke execute on function public.guard_tenant_redeem_fields() from public, anon, authenticated;
revoke execute on function public.handle_admin_bootstrap() from public, anon, authenticated;
revoke execute on function public.log_cloud_sync_event() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- has_role accepts an arbitrary user UUID. Keep role enumeration internal.
-- SECURITY DEFINER policy helpers call this as their owner.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
