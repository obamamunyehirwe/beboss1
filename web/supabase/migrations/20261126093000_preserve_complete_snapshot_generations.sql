-- Preserve the last known-good snapshot while another device generation is uploading.
-- Each generation has immutable row IDs. Retention only runs after the new generation
-- has all expected chunks, so an interrupted upload cannot destroy its predecessor.
begin;

create or replace function public.write_beboss_desktop_snapshot(
  p_shop_sync_key text,
  p_device_id text,
  p_sync_generation text,
  p_branch_id text,
  p_branch_name text,
  p_shop_name text,
  p_owner_username text,
  p_payload_token text,
  p_records_summary text,
  p_expected_updated_at bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now_ms bigint := floor(extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint;
  v_latest_at bigint := 0;
  v_snapshot_id text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Only the trusted desktop Edge Function may publish signed snapshots.';
  end if;

  if p_shop_sync_key is null or length(p_shop_sync_key) < 3 or length(p_shop_sync_key) > 200
     or p_device_id is null or p_device_id !~ '^DESKTOP:[a-f0-9-]{36}$'
     or p_sync_generation is null or length(p_sync_generation) < 1 or length(p_sync_generation) > 80
     or p_payload_token is null or length(p_payload_token) > 7000000
     or (left(p_payload_token, 9) <> 'BBSHARE1:' and left(p_payload_token, 9) <> 'BBSHARE2:') then
    raise exception 'Invalid desktop snapshot parameters.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_shop_sync_key, 741902)
  );

  if not exists (
    select 1 from public.shop_accounts
    where id = p_shop_sync_key
      and lower(owner_username) = lower(btrim(p_owner_username))
  ) then
    raise exception 'The target BeBoss shop owner could not be confirmed.';
  end if;

  select coalesce(max(updated_at), 0)
    into v_latest_at
  from public.branch_sync_snapshots
  where shop_sync_key = p_shop_sync_key;

  if v_latest_at <> coalesce(p_expected_updated_at, 0) then
    return null;
  end if;

  -- A new immutable generation row is inserted rather than overwriting the last
  -- committed desktop snapshot. The server can therefore recover after an outage.
  v_snapshot_id := p_shop_sync_key || '::' || p_device_id || '::' || p_sync_generation;

  insert into public.branch_sync_snapshots (
    id, shop_sync_key, device_id, sync_generation, chunk_index, chunk_count,
    branch_id, branch_name, shop_name, owner_username, payload_token,
    records_summary, updated_at
  )
  values (
    v_snapshot_id, p_shop_sync_key, p_device_id, p_sync_generation, 0, 1,
    coalesce(nullif(p_branch_id, ''), 'main_branch'),
    coalesce(nullif(p_branch_name, ''), 'Main Store'),
    coalesce(nullif(p_shop_name, ''), 'BeBoss Shop'),
    lower(btrim(p_owner_username)), p_payload_token,
    left(coalesce(p_records_summary, 'Desktop business snapshot'), 500),
    v_now_ms
  )
  on conflict (id) do update set
    shop_sync_key = excluded.shop_sync_key,
    device_id = excluded.device_id,
    sync_generation = excluded.sync_generation,
    chunk_index = 0,
    chunk_count = 1,
    branch_id = excluded.branch_id,
    branch_name = excluded.branch_name,
    shop_name = excluded.shop_name,
    owner_username = excluded.owner_username,
    payload_token = excluded.payload_token,
    records_summary = excluded.records_summary,
    updated_at = excluded.updated_at;

  -- Keep the five newest committed desktop generations for this installation.
  -- This is executed in the same transaction, after the replacement is complete.
  delete from public.branch_sync_snapshots older
  where older.shop_sync_key = p_shop_sync_key
    and older.device_id = p_device_id
    and older.id not in (
      select current_rows.id
      from public.branch_sync_snapshots current_rows
      where current_rows.shop_sync_key = p_shop_sync_key
        and current_rows.device_id = p_device_id
      order by current_rows.updated_at desc, current_rows.id desc
      limit 5
    );

  return v_now_ms;
end;
$function$;

create or replace function public.prune_branch_sync_snapshot_generations(
  p_shop_sync_key text,
  p_device_id text,
  p_sync_generation text,
  p_keep_generations integer default 5
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expected_count integer;
  v_actual_count bigint;
  v_distinct_chunk_count bigint;
  v_distinct_expected_count bigint;
  v_min_chunk integer;
  v_max_chunk integer;
  v_actor_device_id text;
  v_deleted_count integer := 0;
begin
  if p_shop_sync_key is null or length(p_shop_sync_key) < 3 or length(p_shop_sync_key) > 200
     or p_device_id is null or length(p_device_id) < 1 or length(p_device_id) > 200
     or p_sync_generation is null or length(p_sync_generation) < 1 or length(p_sync_generation) > 80 then
    raise exception 'Invalid snapshot retention parameters.';
  end if;

  -- The same per-shop lock serializes pruning with every chunk writer.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_shop_sync_key, 741902)
  );

  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    if coalesce(public.current_shop_sync_key(), '') <> p_shop_sync_key then
      raise exception 'The authenticated BeBoss device cannot prune another shop''s snapshots.';
    end if;
    v_actor_device_id := public.current_shop_device_id();
    if v_actor_device_id is null or v_actor_device_id <> p_device_id then
      raise exception 'A verified device identity is required and a device can only prune its own snapshot generations.';
    end if;
  end if;

  select
    max(chunk_count),
    pg_catalog.count(*),
    pg_catalog.count(distinct chunk_index),
    pg_catalog.count(distinct chunk_count),
    min(chunk_index),
    max(chunk_index)
  into
    v_expected_count,
    v_actual_count,
    v_distinct_chunk_count,
    v_distinct_expected_count,
    v_min_chunk,
    v_max_chunk
  from public.branch_sync_snapshots
  where shop_sync_key = p_shop_sync_key
    and pg_catalog.regexp_replace(device_id, '#c[0-9]+$', '') = p_device_id
    and sync_generation = p_sync_generation;

  if v_expected_count is null
     or v_expected_count < 1
     or v_actual_count <> v_expected_count
     or v_distinct_chunk_count <> v_expected_count
     or v_distinct_expected_count <> 1
     or v_min_chunk <> 0
     or v_max_chunk <> v_expected_count - 1 then
    raise exception 'The requested snapshot generation is incomplete; previous generations were retained.';
  end if;

  with keep_generations as (
    select sync_generation
    from public.branch_sync_snapshots
    where shop_sync_key = p_shop_sync_key
      and pg_catalog.regexp_replace(device_id, '#c[0-9]+$', '') = p_device_id
    group by sync_generation
    order by max(updated_at) desc, sync_generation desc
    limit greatest(2, least(10, coalesce(p_keep_generations, 5)))
  ),
  deleted_rows as (
    delete from public.branch_sync_snapshots older
    where older.shop_sync_key = p_shop_sync_key
      and pg_catalog.regexp_replace(older.device_id, '#c[0-9]+$', '') = p_device_id
      and not exists (
        select 1
        from keep_generations keep
        where keep.sync_generation is not distinct from older.sync_generation
      )
    returning 1
  )
  select pg_catalog.count(*)::integer
    into v_deleted_count
  from deleted_rows;

  return v_deleted_count;
end;
$function$;

-- The desktop Edge Function invokes this RPC with its server-only service role.
-- No public client should be able to call the snapshot writer directly.
revoke all on function public.write_beboss_desktop_snapshot(text, text, text, text, text, text, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.write_beboss_desktop_snapshot(text, text, text, text, text, text, text, text, text, bigint)
  to service_role;

-- Android sync uses signed per-device headers (the PostgREST role may be anon).
-- The function itself validates shop context AND requires the resolved device ID,
-- so legacy shop-key-only requests cannot prune another installation's generations.
revoke all on function public.prune_branch_sync_snapshot_generations(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.prune_branch_sync_snapshot_generations(text, text, text, integer)
  to anon, authenticated, service_role;

comment on function public.write_beboss_desktop_snapshot(text,text,text,text,text,text,text,text,text,bigint)
  is 'Atomically writes immutable, server-signed desktop snapshot generations and retains the last five committed generations per desktop.';
comment on function public.prune_branch_sync_snapshot_generations(text,text,text,integer)
  is 'Prunes old Android snapshot generations only after verifying that the requested generation has all expected chunks and the caller is authenticated for that same shop/device.';

commit;
