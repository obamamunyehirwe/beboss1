-- Master-admin-only view of Android per-device credential rollout coverage.
-- The privileged reader stays in the non-exposed private schema; the public RPC is invoker-only.
create or replace function beboss_private.admin_android_device_credential_rollout()
returns table (
  shop_sync_key text,
  shop_name text,
  legacy_sync_disabled boolean,
  active_device_count bigint,
  enrolled_device_count bigint,
  missing_device_count bigint,
  ready_to_retire boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not beboss_private.is_beboss_admin_internal() then
    raise exception using errcode = '42501', message = 'Master admin access required.';
  end if;

  return query
  select
    s.id,
    s.shop_name,
    s.legacy_sync_disabled,
    count(distinct d.id)::bigint as active_device_count,
    count(distinct c.device_record_id)::bigint as enrolled_device_count,
    greatest(count(distinct d.id) - count(distinct c.device_record_id), 0)::bigint as missing_device_count,
    (
      count(distinct d.id) > 0
      and count(distinct d.id) = count(distinct c.device_record_id)
      and s.legacy_sync_disabled = false
    ) as ready_to_retire
  from public.shop_accounts s
  left join public.shop_devices d
    on d.shop_sync_key = s.id
   and d.is_active = true
  left join beboss_private.android_device_credentials c
    on c.shop_id = s.id
   and c.device_record_id = d.id
   and c.device_id = d.device_id
   and c.assigned_user_id = d.assigned_user_id
   and c.actor_role = d.role
   and c.revoked_at = 0
   and c.refresh_expires_at > public.now_ms()
  group by s.id, s.shop_name, s.legacy_sync_disabled
  order by s.shop_name, s.id;
end;
$function$;

revoke all on function beboss_private.admin_android_device_credential_rollout() from public, anon;
grant execute on function beboss_private.admin_android_device_credential_rollout() to authenticated;

create or replace function public.admin_android_device_credential_rollout()
returns table (
  shop_sync_key text,
  shop_name text,
  legacy_sync_disabled boolean,
  active_device_count bigint,
  enrolled_device_count bigint,
  missing_device_count bigint,
  ready_to_retire boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select *
  from beboss_private.admin_android_device_credential_rollout();
$function$;

revoke all on function public.admin_android_device_credential_rollout() from public, anon;
grant execute on function public.admin_android_device_credential_rollout() to authenticated;
comment on function public.admin_android_device_credential_rollout() is
  'Master-admin-only read-only aggregate of active Android terminal credential coverage. Does not expose credentials or allow legacy-sync cutover.';
