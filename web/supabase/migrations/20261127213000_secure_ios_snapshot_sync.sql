-- Give enrolled iPhones the same immutable, signed snapshot-generation exchange
-- used by Android and desktop. Only the trusted iOS Edge Function can commit.
create or replace function public.commit_ios_snapshot_generation(
  p_shop_sync_key text,
  p_device_id text,
  p_device_record_id text,
  p_assigned_user_id text,
  p_role text,
  p_sync_generation text,
  p_expected_chunk_count integer,
  p_expected_latest_updated_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := floor(extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint;
  v_device public.shop_devices%rowtype;
  v_staff public.shop_users%rowtype;
  v_expected integer;
  v_actual bigint;
  v_distinct_indexes bigint;
  v_distinct_counts bigint;
  v_min_index integer;
  v_max_index integer;
  v_latest bigint := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Only the trusted iOS Edge Function can commit an iPhone snapshot.';
  end if;

  if coalesce(p_shop_sync_key, '') = ''
     or p_device_id !~ '^IOS:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(p_device_record_id, '') = ''
     or coalesce(p_assigned_user_id, '') = ''
     or p_role not in ('OWNER','MANAGER','CASHIER')
     or coalesce(p_sync_generation, '') = ''
     or p_expected_chunk_count < 1
     or p_expected_chunk_count > 100000 then
    raise exception using errcode = '22023', message = 'Invalid iPhone snapshot-generation parameters.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_shop_sync_key, 741902)
  );

  select d.* into v_device
  from public.shop_devices d
  where d.id = p_device_record_id
    and d.shop_sync_key = p_shop_sync_key
    and d.device_id = p_device_id
  for update;

  if not found or not v_device.is_active
     or v_device.assigned_user_id <> p_assigned_user_id
     or v_device.role <> p_role then
    raise exception using errcode = '42501', message = 'The iPhone is no longer assigned to an active shop device.';
  end if;

  select u.* into v_staff
  from public.shop_users u
  where u.shop_sync_key = p_shop_sync_key
    and u.user_id = p_assigned_user_id
  for share;

  if not found or not v_staff.is_active or v_staff.role <> p_role then
    raise exception using errcode = '42501', message = 'The iPhone user is inactive or its role no longer matches.';
  end if;

  if not exists (
    select 1 from public.shop_accounts s
    where s.id = p_shop_sync_key and s.remote_kill_switch = false
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled or unavailable.';
  end if;

  select
    max(chunk_count),
    count(*),
    count(distinct chunk_index),
    count(distinct chunk_count),
    min(chunk_index),
    max(chunk_index)
  into
    v_expected,
    v_actual,
    v_distinct_indexes,
    v_distinct_counts,
    v_min_index,
    v_max_index
  from public.branch_sync_snapshots
  where shop_sync_key = p_shop_sync_key
    and pg_catalog.regexp_replace(device_id, '#c[0-9]+$', '') = p_device_id
    and sync_generation = p_sync_generation;

  if coalesce(v_expected, 0) <> p_expected_chunk_count
     or v_actual <> p_expected_chunk_count
     or v_distinct_indexes <> p_expected_chunk_count
     or v_distinct_counts <> 1
     or v_min_index <> 0
     or v_max_index <> p_expected_chunk_count - 1 then
    -- Keep the previous complete generation; incomplete new rows are never committed.
    delete from public.branch_sync_snapshots
    where shop_sync_key = p_shop_sync_key
      and pg_catalog.regexp_replace(device_id, '#c[0-9]+$', '') = p_device_id
      and sync_generation = p_sync_generation;
    return jsonb_build_object('accepted', false, 'conflict', false, 'reason', 'incomplete_generation');
  end if;

  -- Only complete generations count toward the optimistic-concurrency version.
  select coalesce(max(generation_updated_at), 0)
    into v_latest
  from (
    select
      pg_catalog.regexp_replace(device_id, '#c[0-9]+$', '') as base_device_id,
      coalesce(nullif(sync_generation, ''), 'legacy') as generation_key,
      max(updated_at) as generation_updated_at
    from public.branch_sync_snapshots
    where shop_sync_key = p_shop_sync_key
    group by
      pg_catalog.regexp_replace(device_id, '#c[0-9]+$', ''),
      coalesce(nullif(sync_generation, ''), 'legacy')
    having count(*) = max(coalesce(nullif(chunk_count, 0), 1))
       and count(distinct chunk_index) = max(coalesce(nullif(chunk_count, 0), 1))
       and min(chunk_index) = 0
       and max(chunk_index) = max(coalesce(nullif(chunk_count, 0), 1)) - 1
  ) complete_generations
  where not (
    complete_generations.base_device_id = p_device_id
    and complete_generations.generation_key = p_sync_generation
  );

  if v_latest <> greatest(0, coalesce(p_expected_latest_updated_at, 0)) then
    delete from public.branch_sync_snapshots
    where shop_sync_key = p_shop_sync_key
      and pg_catalog.regexp_replace(device_id, '#c[0-9]+$', '') = p_device_id
      and sync_generation = p_sync_generation;
    return jsonb_build_object('accepted', false, 'conflict', true, 'latestUpdatedAt', v_latest);
  end if;

  update public.branch_sync_snapshots
  set updated_at = v_now
  where shop_sync_key = p_shop_sync_key
    and pg_catalog.regexp_replace(device_id, '#c[0-9]+$', '') = p_device_id
    and sync_generation = p_sync_generation;

  -- Keep five complete/most recent generations for this iPhone installation.
  with keep_generations as (
    select sync_generation
    from public.branch_sync_snapshots
    where shop_sync_key = p_shop_sync_key
      and pg_catalog.regexp_replace(device_id, '#c[0-9]+$', '') = p_device_id
    group by sync_generation
    order by max(updated_at) desc, sync_generation desc
    limit 5
  )
  delete from public.branch_sync_snapshots older
  where older.shop_sync_key = p_shop_sync_key
    and pg_catalog.regexp_replace(older.device_id, '#c[0-9]+$', '') = p_device_id
    and not exists (
      select 1 from keep_generations keep
      where keep.sync_generation = older.sync_generation
    );

  return jsonb_build_object(
    'accepted', true,
    'conflict', false,
    'uploadedAt', v_now,
    'latestUpdatedAt', v_now,
    'chunkCount', p_expected_chunk_count
  );
end;
$function$;

revoke all on function public.commit_ios_snapshot_generation(text,text,text,text,text,text,integer,bigint)
  from public, anon, authenticated;
grant execute on function public.commit_ios_snapshot_generation(text,text,text,text,text,text,integer,bigint)
  to service_role;

comment on function public.commit_ios_snapshot_generation(text,text,text,text,text,text,integer,bigint)
  is 'Atomically validates and commits a complete iOS signed snapshot generation with device assignment and cross-device optimistic concurrency checks.';
