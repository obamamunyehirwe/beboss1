-- Regression tests for authenticated-callable SECURITY DEFINER admin RPCs.
-- These RPCs are intentionally used by delegated administrators. Their public
-- execution grant is safe only because every mutation rechecks releases.manage.
-- This test proves ordinary signed-in users and anonymous callers cannot mutate
-- application release records through the RPC boundary.
begin;

do $test$
begin
  if has_function_privilege('anon', 'public.current_admin_permissions()', 'EXECUTE') then
    raise exception 'Anonymous callers must not execute current_admin_permissions.';
  end if;
  if has_function_privilege('anon', 'public.has_admin_permission(text)', 'EXECUTE') then
    raise exception 'Anonymous callers must not execute has_admin_permission.';
  end if;
  if has_function_privilege('anon', 'public.admin_set_app_release_visibility(uuid,boolean)', 'EXECUTE') then
    raise exception 'Anonymous callers must not execute admin_set_app_release_visibility.';
  end if;
  if has_function_privilege('anon', 'public.admin_set_archived_release_visibility(boolean)', 'EXECUTE') then
    raise exception 'Anonymous callers must not execute admin_set_archived_release_visibility.';
  end if;
  if has_function_privilege('anon', 'public.admin_update_app_release(uuid,text,integer,text,text)', 'EXECUTE') then
    raise exception 'Anonymous callers must not execute admin_update_app_release.';
  end if;
  if has_function_privilege('anon', 'public.admin_set_current_app_release(uuid,text)', 'EXECUTE') then
    raise exception 'Anonymous callers must not execute admin_set_current_app_release.';
  end if;
end
$test$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000123', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000123","role":"authenticated"}',
  true
);

do $test$
declare
  v_permissions text[];
begin
  v_permissions := public.current_admin_permissions();
  if coalesce(cardinality(v_permissions), 0) <> 0 then
    raise exception 'A non-admin user received platform admin permissions: %', v_permissions;
  end if;

  if public.has_admin_permission('releases.manage') then
    raise exception 'A non-admin user unexpectedly has releases.manage.';
  end if;

  -- Each mutation must fail with insufficient_privilege before it can reach
  -- release lookup, URL validation, or row mutation.
  begin
    perform public.admin_set_app_release_visibility(
      '00000000-0000-4000-8000-000000000001'::uuid, true
    );
    raise exception 'A non-admin user changed app release visibility.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.admin_set_archived_release_visibility(false);
    raise exception 'A non-admin user changed archived release visibility.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.admin_update_app_release(
      '00000000-0000-4000-8000-000000000001'::uuid,
      '99.99.99', 999999, 'Android 7', 'Unauthorized release update'
    );
    raise exception 'A non-admin user edited app release metadata.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.admin_set_current_app_release(
      '00000000-0000-4000-8000-000000000001'::uuid,
      'https://example.invalid/should-not-be-used.apk'
    );
    raise exception 'A non-admin user changed the current app release.';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;

reset role;

do $test$
begin
  if not has_function_privilege('service_role', 'public.admin_set_app_release_visibility(uuid,boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_set_archived_release_visibility(boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_update_app_release(uuid,text,integer,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_set_current_app_release(uuid,text)', 'EXECUTE') then
    raise exception 'Service role must retain the privileged release management grant.';
  end if;
end
$test$;

rollback;
