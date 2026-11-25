-- Preserve the public website's aggregate statistics endpoint without exposing
-- a SECURITY DEFINER function in the API-exposed public schema.
create or replace function beboss_private.public_platform_stats_internal()
returns json
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.json_build_object(
    'shops_total', (select count(*) from public.shop_accounts),
    'shops_active', (select count(*) from public.shop_accounts
                      where subscription_status in ('ACTIVE','TRIAL')
                        and subscription_expires_at > public.now_ms()
                        and not remote_kill_switch),
    'branches_total', (select coalesce(sum(branch_count), 0) from public.shop_accounts),
    'devices_active', (select count(*) from public.shop_devices where is_active),
    'devices_synced_24h', (select count(*) from public.shop_devices where last_synced_at > public.now_ms() - 86400000),
    'sync_events_24h', (select count(*) from public.cloud_sync_events where created_at > pg_catalog.now() - interval '24 hours'),
    'codes_redeemed', (select count(*) from public.unlock_codes where status = 'REDEEMED'),
    'last_sync_at', (select max(created_at) from public.cloud_sync_events),
    'activity_14d', (
      select coalesce(
        pg_catalog.json_agg(
          pg_catalog.json_build_object('day', d.day, 'events', d.events)
          order by d.day
        ),
        '[]'::json
      )
      from (
        select g.day::date as day,
               (select count(*) from public.cloud_sync_events e
                 where e.created_at >= g.day and e.created_at < g.day + interval '1 day') as events
        from pg_catalog.generate_series(
          pg_catalog.date_trunc('day', pg_catalog.now()) - interval '13 days',
          pg_catalog.date_trunc('day', pg_catalog.now()),
          interval '1 day'
        ) as g(day)
      ) d
    ),
    'server_time', pg_catalog.now()
  );
$function$;

revoke all on function beboss_private.public_platform_stats_internal() from public, authenticated;
grant execute on function beboss_private.public_platform_stats_internal() to anon, service_role;

create or replace function public.public_platform_stats()
returns json
language sql
stable
security invoker
set search_path = ''
as $function$
  select beboss_private.public_platform_stats_internal();
$function$;

revoke all on function public.public_platform_stats() from public, authenticated;
grant execute on function public.public_platform_stats() to anon, service_role;
comment on function public.public_platform_stats() is
  'Public website aggregate statistics. The invoker wrapper delegates to a non-exposed, narrowly scoped private reader.';
