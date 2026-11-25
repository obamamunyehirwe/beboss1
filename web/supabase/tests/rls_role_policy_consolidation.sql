-- Role-separated RLS policies must not overlap between anon and authenticated.
-- Full tenant-isolation behavior is also covered by android_device_credentials.sql.
do $test$
declare
  duplicated record;
begin
  select schemaname, tablename, cmd, count(*) as policy_count
    into duplicated
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = any (array[
      'announcements','branch_sync_snapshots','device_security_telemetry',
      'payment_requests','shop_accounts','shop_branches','shop_devices',
      'shop_stock_transfers','shop_users','unlock_codes'
    ])
    and (
      roles @> array['anon'::name]
      or roles @> array['authenticated'::name]
    )
  group by schemaname, tablename, cmd
  having count(*) filter (where roles @> array['anon'::name]) > 1
      or count(*) filter (where roles @> array['authenticated'::name]) > 1
  limit 1;

  if duplicated.tablename is not null then
    raise exception 'Overlapping permissive policies remain for %.% % (% policies)',
      duplicated.schemaname, duplicated.tablename, duplicated.cmd, duplicated.policy_count;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'announcements','branch_sync_snapshots','device_security_telemetry',
        'payment_requests','shop_accounts','shop_branches','shop_devices',
        'shop_stock_transfers','shop_users','unlock_codes'
      ])
      and roles @> array['anon'::name]
      and (
        coalesce(qual, '') ilike '%is_beboss_staff%'
        or coalesce(with_check, '') ilike '%is_beboss_staff%'
        or coalesce(qual, '') ilike '%is_beboss_admin%'
        or coalesce(with_check, '') ilike '%is_beboss_admin%'
      )
  ) then
    raise exception 'An anonymous RLS policy references a staff/admin-only function.';
  end if;
end
$test$;
