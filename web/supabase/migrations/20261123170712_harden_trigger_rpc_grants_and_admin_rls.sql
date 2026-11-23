-- Trigger-only SECURITY DEFINER functions are not application RPCs.
revoke execute on function public.enforce_payment_request_server_fee() from public, anon, authenticated;
revoke execute on function public.protect_shop_lan_sync_secret() from public, anon, authenticated;
revoke execute on function public.require_manual_provider_verification() from public, anon, authenticated;

-- Role predicates remain callable by authenticated policy evaluation and server functions,
-- but they must not be callable by unauthenticated clients.
revoke execute on function public.is_beboss_admin() from public, anon;
revoke execute on function public.is_beboss_staff() from public, anon;
grant execute on function public.is_beboss_admin() to authenticated, service_role;
grant execute on function public.is_beboss_staff() to authenticated, service_role;

-- SECURITY DEFINER functions use a restricted name-resolution path.
alter function public.enforce_payment_request_server_fee() set search_path = pg_catalog;
alter function public.protect_shop_lan_sync_secret() set search_path = pg_catalog;
alter function public.require_manual_provider_verification() set search_path = pg_catalog;
alter function public.is_beboss_admin() set search_path = pg_catalog;
alter function public.is_beboss_staff() set search_path = pg_catalog;
alter function public.public_platform_stats() set search_path = pg_catalog;
alter function public.record_apk_download(uuid, text) set search_path = pg_catalog;

drop policy if exists "Users read own roles; admins read all" on public.user_roles;
create policy "Users read own roles; admins read all"
on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_beboss_admin()));

drop policy if exists "Staff read own profile; admins all" on public.admin_profiles;
create policy "Staff read own profile; admins all"
on public.admin_profiles for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_beboss_admin()));

drop policy if exists "Staff insert own profile" on public.admin_profiles;
create policy "Staff insert own profile"
on public.admin_profiles for insert to authenticated
with check (user_id = (select auth.uid()) and (select public.is_beboss_staff()));

drop policy if exists "Own or admin update profile" on public.admin_profiles;
create policy "Own or admin update profile"
on public.admin_profiles for update to authenticated
using (user_id = (select auth.uid()) or (select public.is_beboss_admin()))
with check (user_id = (select auth.uid()) or (select public.is_beboss_admin()));

comment on table public.admin_bootstrap_emails is
  'Server-only allowlist. RLS is enabled with no anon/authenticated policies by design.';
comment on table public.app_secrets is
  'Server-only operational secrets. RLS is enabled with no anon/authenticated policies by design.';
comment on table public.unlock_code_verification_attempts is
  'Server-only hashed rate-limit telemetry. RLS is enabled with no anon/authenticated policies by design.';
