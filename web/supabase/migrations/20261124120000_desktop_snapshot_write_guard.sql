-- Guarded desktop snapshot publishing. The desktop never receives the BBSHARE HMAC key.
-- Serialize all writers for a shop and reject a stale desktop base version.
begin;

create or replace function public.lock_branch_snapshot_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if new.shop_sync_key is null or btrim(new.shop_sync_key) = '' then
    raise exception 'A shop tenant key is required for snapshot writes.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.shop_sync_key, 741902)
  );
  return new;
end;
$function$;

drop trigger if exists trg_lock_branch_snapshot_write on public.branch_sync_snapshots;
create trigger trg_lock_branch_snapshot_write
before insert or update on public.branch_sync_snapshots
for each row execute function public.lock_branch_snapshot_write();

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
     or p_sync_generation is null or length(p_sync_generation) > 80
     or p_payload_token is null or length(p_payload_token) > 7000000
     or left(p_payload_token, 9) <> 'BBSHARE1:' then
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

  v_snapshot_id := p_shop_sync_key || '::' || p_device_id;

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

  return v_now_ms;
end;
$function$;

revoke all on function public.write_beboss_desktop_snapshot(text,text,text,text,text,text,text,text,text,bigint)
  from public, anon, authenticated;
grant execute on function public.write_beboss_desktop_snapshot(text,text,text,text,text,text,text,text,text,bigint)
  to service_role;

comment on function public.write_beboss_desktop_snapshot(text,text,text,text,text,text,text,text,text,bigint)
  is 'Atomically writes one server-signed desktop BBSHARE1 snapshot only when the shop snapshot version has not changed. Service-role Edge Function only.';

commit;
