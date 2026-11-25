-- Admin-only visibility and staged credential coverage regression test.
-- Every fixture row is rolled back. No real shop, credential, or account is changed.
begin;

-- The public aggregate endpoint stays available to anonymous website visitors,
-- but only through an invoker wrapper. Its elevated reader stays non-exposed.
do $test$
begin
  if (select prosecdef from pg_catalog.pg_proc where oid = 'public.public_platform_stats()'::regprocedure) then
    raise exception 'The public platform-stats RPC must remain SECURITY INVOKER.';
  end if;
  if not has_function_privilege('anon', 'public.public_platform_stats()', 'EXECUTE') then
    raise exception 'The public platform-stats RPC must remain callable by the website.';
  end if;
  if has_function_privilege('authenticated', 'public.public_platform_stats()', 'EXECUTE') then
    raise exception 'The public platform-stats RPC must not expand access to authenticated app users.';
  end if;
  if not (select prosecdef from pg_catalog.pg_proc where oid = 'beboss_private.public_platform_stats_internal()'::regprocedure) then
    raise exception 'The internal platform-stats reader must remain isolated in the private schema.';
  end if;
end
$test$;

set local role anon;
do $test$
declare
  stats json;
begin
  stats := public.public_platform_stats();
  if stats is null or not ((stats::jsonb) ? 'shops_total') then
    raise exception 'The anonymous website stats endpoint must return its safe aggregate payload.';
  end if;
end
$test$;
reset role;



insert into public.shop_accounts (
  id, shop_name, owner_name, owner_username, owner_phone, legacy_sync_disabled
) values (
  '__beboss_admin_rollout_shop__',
  'Admin Rollout Regression Shop',
  'Regression Owner',
  '__beboss_admin_rollout_owner__',
  '+250780000091',
  false
);

insert into public.shop_devices (
  id, shop_sync_key, shop_name, device_id, device_name,
  assigned_user_id, assigned_username, assigned_user_name,
  role, branch_id, branch_name, is_owner_primary, is_active, monthly_fee_addon_rwf
) values
  (
    '__beboss_admin_rollout_device_a__',
    '__beboss_admin_rollout_shop__',
    'Admin Rollout Regression Shop',
    'DEV-ROLLOUT-001',
    'Enrolled regression terminal',
    'rollout-owner-user',
    'rollout_owner',
    'Regression Owner',
    'OWNER',
    'main_branch',
    'Main Store',
    true,
    true,
    0
  ),
  (
    '__beboss_admin_rollout_device_b__',
    '__beboss_admin_rollout_shop__',
    'Admin Rollout Regression Shop',
    'DEV-ROLLOUT-002',
    'Pending regression terminal',
    'rollout-manager-user',
    'rollout_manager',
    'Regression Manager',
    'MANAGER',
    'main_branch',
    'Main Store',
    false,
    true,
    2000
  );

insert into beboss_private.android_device_credentials (
  shop_id, device_id, device_record_id, assigned_user_id, actor_role,
  access_token_hash, refresh_token_hash, access_expires_at, refresh_expires_at,
  revoked_at
) values (
  '__beboss_admin_rollout_shop__',
  'DEV-ROLLOUT-001',
  '__beboss_admin_rollout_device_a__',
  'rollout-owner-user',
  'OWNER',
  repeat('a', 64),
  repeat('b', 64),
  public.now_ms() + 3600000,
  public.now_ms() + 86400000,
  0
);

insert into auth.users (id, email, phone, raw_user_meta_data)
values
  ('90000000-0000-4000-8000-000000000001', 'rollout-admin-test@beboss.invalid', '+250780000092', '{}'::jsonb),
  ('90000000-0000-4000-8000-000000000002', 'rollout-support-test@beboss.invalid', '+250780000093', '{}'::jsonb);

insert into public.user_roles (user_id, role)
values
  ('90000000-0000-4000-8000-000000000001', 'admin'::public.app_role),
  ('90000000-0000-4000-8000-000000000002', 'support'::public.app_role);

do $test$
begin
  if has_function_privilege('anon', 'public.admin_android_device_credential_rollout()', 'EXECUTE')
     or has_function_privilege('anon', 'beboss_private.admin_android_device_credential_rollout()', 'EXECUTE') then
    raise exception 'Anonymous users must not be able to execute either rollout function.';
  end if;
  if (select prosecdef from pg_catalog.pg_proc where oid = 'public.admin_android_device_credential_rollout()'::regprocedure) then
    raise exception 'The public rollout RPC must remain SECURITY INVOKER.';
  end if;
  if not (select prosecdef from pg_catalog.pg_proc where oid = 'beboss_private.admin_android_device_credential_rollout()'::regprocedure) then
    raise exception 'The private aggregate reader must use SECURITY DEFINER to read the private credential registry.';
  end if;
end
$test$;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

do $test$
declare
  report record;
begin
  select * into report
  from public.admin_android_device_credential_rollout()
  where shop_sync_key = '__beboss_admin_rollout_shop__';

  if report.shop_sync_key is null
     or report.active_device_count <> 2
     or report.enrolled_device_count <> 1
     or report.missing_device_count <> 1
     or report.ready_to_retire then
    raise exception 'Admin rollout summary must report 1 of 2 devices enrolled and block retirement.';
  end if;
end
$test$;

reset role;
insert into beboss_private.android_device_credentials (
  shop_id, device_id, device_record_id, assigned_user_id, actor_role,
  access_token_hash, refresh_token_hash, access_expires_at, refresh_expires_at,
  revoked_at
) values (
  '__beboss_admin_rollout_shop__',
  'DEV-ROLLOUT-002',
  '__beboss_admin_rollout_device_b__',
  'rollout-manager-user',
  'MANAGER',
  repeat('c', 64),
  repeat('d', 64),
  public.now_ms() + 3600000,
  public.now_ms() + 86400000,
  0
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);

do $test$
declare
  report record;
begin
  select * into report
  from public.admin_android_device_credential_rollout()
  where shop_sync_key = '__beboss_admin_rollout_shop__';

  if report.active_device_count <> 2
     or report.enrolled_device_count <> 2
     or report.missing_device_count <> 0
     or not report.ready_to_retire then
    raise exception 'All active terminals enrolled with valid credentials should be ready for owner review.';
  end if;
end
$test$;

reset role;
update beboss_private.android_device_credentials
set refresh_expires_at = public.now_ms() - 1
where shop_id = '__beboss_admin_rollout_shop__'
  and device_id = 'DEV-ROLLOUT-001';

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);

do $test$
declare
  report record;
begin
  select * into report
  from public.admin_android_device_credential_rollout()
  where shop_sync_key = '__beboss_admin_rollout_shop__';

  if report.enrolled_device_count <> 1
     or report.missing_device_count <> 1
     or report.ready_to_retire then
    raise exception 'An expired refresh credential must block legacy retirement readiness.';
  end if;
end
$test$;

select pg_catalog.set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);

do $test$
begin
  begin
    perform * from public.admin_android_device_credential_rollout();
    raise exception 'Support accounts must not access master-admin rollout data.';
  exception
    when insufficient_privilege then null;
  end;
end
$test$;

reset role;
rollback;
