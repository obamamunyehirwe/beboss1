-- Transactional tenant-isolation regression test for authenticated Android device sync.
-- Run with: supabase test db
-- All fixture rows and the temporary assertion function are rolled back.
begin;

insert into public.shop_accounts (
  id, shop_name, owner_name, owner_username, owner_phone
) values
  ('__beboss_device_test_shop_a__', 'Device Auth Test A', 'Test Owner A', 'device_test_a', '+250780000001'),
  ('__beboss_device_test_shop_b__', 'Device Auth Test B', 'Test Owner B', 'device_test_b', '+250780000002')
on conflict (id) do nothing;

insert into public.shop_devices (
  id, shop_sync_key, shop_name, device_id, device_name,
  assigned_user_id, assigned_username, assigned_user_name,
  role, branch_id, branch_name, is_owner_primary, is_active,
  monthly_fee_addon_rwf
) values (
  '__beboss_device_test_record_a__',
  '__beboss_device_test_shop_a__',
  'Device Auth Test A',
  'DEV-TEST-ANDROID-001',
  'Migration test terminal',
  'device-test-owner-user',
  'device_test_a',
  'Test Owner A',
  'OWNER',
  'main_branch',
  'Main Store',
  true,
  true,
  0
)
on conflict (id) do update set
  device_id = excluded.device_id,
  assigned_user_id = excluded.assigned_user_id,
  role = excluded.role,
  is_active = true;

-- A second active terminal deliberately has no credential at first. This proves
-- the shop-wide legacy cutover cannot happen just because the current device enrolled.
insert into public.shop_devices (
  id, shop_sync_key, shop_name, device_id, device_name,
  assigned_user_id, assigned_username, assigned_user_name,
  role, branch_id, branch_name, is_owner_primary, is_active,
  monthly_fee_addon_rwf
) values (
  '__beboss_device_test_record_b__',
  '__beboss_device_test_shop_a__',
  'Device Auth Test A',
  'DEV-TEST-ANDROID-002',
  'Unenrolled migration test terminal',
  'device-test-manager-user',
  'device_test_manager',
  'Test Manager',
  'MANAGER',
  'main_branch',
  'Main Store',
  false,
  true,
  0
)
on conflict (id) do update set
  device_id = excluded.device_id,
  assigned_user_id = excluded.assigned_user_id,
  role = excluded.role,
  is_active = true;

insert into beboss_private.android_device_credentials (
  shop_id, device_id, device_record_id, assigned_user_id, actor_role,
  access_token_hash, refresh_token_hash,
  access_expires_at, refresh_expires_at,
  revoked_at
) values (
  '__beboss_device_test_shop_a__',
  'DEV-TEST-ANDROID-001',
  '__beboss_device_test_record_a__',
  'device-test-owner-user',
  'OWNER',
  encode(extensions.digest(convert_to(repeat('a', 64), 'UTF8'), 'sha256'), 'hex'),
  encode(extensions.digest(convert_to(repeat('b', 64), 'UTF8'), 'sha256'), 'hex'),
  public.now_ms() + 3600000,
  public.now_ms() + 86400000,
  0
)
on conflict (shop_id, device_id) do update set
  access_token_hash = excluded.access_token_hash,
  refresh_token_hash = excluded.refresh_token_hash,
  access_expires_at = excluded.access_expires_at,
  refresh_expires_at = excluded.refresh_expires_at,
  revoked_at = 0;

create or replace function public._assert_android_device_tenant_test(
  p_expected_shop text,
  p_other_shop text,
  p_expected_role text,
  p_expected_device text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_shop text;
  v_role text;
  v_device text;
  v_expected_count bigint;
  v_other_count bigint;
begin
  v_shop := public.current_shop_sync_key();
  v_role := public.current_shop_actor_role();
  v_device := public.current_shop_device_id();

  if v_shop <> p_expected_shop then
    raise exception 'Expected tenant %, received %', p_expected_shop, v_shop;
  end if;
  if v_role <> p_expected_role then
    raise exception 'Expected actor role %, received %', p_expected_role, v_role;
  end if;
  if v_device <> p_expected_device then
    raise exception 'Expected device %, received %', p_expected_device, v_device;
  end if;

  select count(*) into v_expected_count
  from public.shop_accounts
  where id = p_expected_shop;
  select count(*) into v_other_count
  from public.shop_accounts
  where id = p_other_shop;

  if (p_expected_shop = '' and v_expected_count <> 0)
     or (p_expected_shop <> '' and v_expected_count <> 1) then
    raise exception 'Tenant RLS did not return the expected shop row.';
  end if;
  if v_other_count <> 0 then
    raise exception 'Cross-tenant shop row leaked through RLS.';
  end if;
end;
$function$;

grant execute on function public._assert_android_device_tenant_test(text,text,text,text) to anon;

set local role anon;

-- Valid device bearer: resolves the server-registered shop, role and device.
select set_config(
  'request.headers',
  '{"x-beboss-device-id":"DEV-TEST-ANDROID-001","x-beboss-device-token":"' || repeat('a', 64) || '"}',
  true
);
select public._assert_android_device_tenant_test(
  '__beboss_device_test_shop_a__',
  '__beboss_device_test_shop_b__',
  'OWNER',
  'DEV-TEST-ANDROID-001'
);

-- During the compatibility period the old header continues to resolve only
-- its registered tenant. It must never expose another shop's row.
select set_config(
  'request.headers',
  '{"x-shop-sync-key":"__beboss_device_test_shop_a__"}',
  true
);
select public._assert_android_device_tenant_test(
  '__beboss_device_test_shop_a__',
  '__beboss_device_test_shop_b__',
  'LEGACY',
  ''
);

reset role;

do $function$
begin
  if beboss_private.retire_legacy_android_sync('__beboss_device_test_shop_a__') then
    raise exception 'Legacy cutover succeeded while an active terminal was missing a credential.';
  end if;
end
$function$;

insert into beboss_private.android_device_credentials (
  shop_id, device_id, device_record_id, assigned_user_id, actor_role,
  access_token_hash, refresh_token_hash,
  access_expires_at, refresh_expires_at, revoked_at
) values (
  '__beboss_device_test_shop_a__',
  'DEV-TEST-ANDROID-002',
  '__beboss_device_test_record_b__',
  'device-test-manager-user',
  'MANAGER',
  encode(extensions.digest(convert_to(repeat('c', 64), 'UTF8'), 'sha256'), 'hex'),
  encode(extensions.digest(convert_to(repeat('d', 64), 'UTF8'), 'sha256'), 'hex'),
  public.now_ms() + 3600000,
  public.now_ms() + 86400000,
  0
)
on conflict (shop_id, device_id) do update set
  access_token_hash = excluded.access_token_hash,
  refresh_token_hash = excluded.refresh_token_hash,
  access_expires_at = excluded.access_expires_at,
  refresh_expires_at = excluded.refresh_expires_at,
  revoked_at = 0;

do $function$
begin
  if not beboss_private.retire_legacy_android_sync('__beboss_device_test_shop_a__') then
    raise exception 'Legacy cutover failed after all active terminals received valid credentials.';
  end if;
end
$function$;

set local role anon;

-- After the owner cutover, the old deterministic header is no longer accepted.
select set_config(
  'request.headers',
  '{"x-shop-sync-key":"__beboss_device_test_shop_a__"}',
  true
);
select public._assert_android_device_tenant_test('', '__beboss_device_test_shop_b__', '', '');

-- The device bearer remains valid after the legacy header is retired.
select set_config(
  'request.headers',
  '{"x-beboss-device-id":"DEV-TEST-ANDROID-001","x-beboss-device-token":"' || repeat('a', 64) || '","x-shop-sync-key":"__beboss_device_test_shop_b__"}',
  true
);
select public._assert_android_device_tenant_test(
  '__beboss_device_test_shop_a__',
  '__beboss_device_test_shop_b__',
  'OWNER',
  'DEV-TEST-ANDROID-001'
);

reset role;
update beboss_private.android_device_credentials
set access_expires_at = public.now_ms() - 1
where shop_id = '__beboss_device_test_shop_a__'
  and device_id = 'DEV-TEST-ANDROID-001';
set local role anon;
select public._assert_android_device_tenant_test('', '__beboss_device_test_shop_b__', '', '');

reset role;
update beboss_private.android_device_credentials
set access_expires_at = public.now_ms() + 3600000,
    revoked_at = public.now_ms()
where shop_id = '__beboss_device_test_shop_a__'
  and device_id = 'DEV-TEST-ANDROID-001';
set local role anon;
select set_config(
  'request.headers',
  '{"x-beboss-device-id":"DEV-TEST-ANDROID-001","x-beboss-device-token":"' || repeat('a', 64) || '"}',
  true
);
select public._assert_android_device_tenant_test('', '__beboss_device_test_shop_b__', '', '');

reset role;
drop function public._assert_android_device_tenant_test(text,text,text,text);
rollback;
