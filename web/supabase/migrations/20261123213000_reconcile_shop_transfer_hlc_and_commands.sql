-- Canonicalize HLC values across Android and web, and add lease-based processing
-- for owner-portal stock-transfer commands. This migration is additive and preserves
-- all existing branch, transfer, payment and inventory records.

alter table public.shop_stock_transfers
  add column if not exists claimed_by_device_id text not null default '',
  add column if not exists processing_lease_until bigint not null default 0;

create index if not exists idx_shop_stock_transfers_command_lease
  on public.shop_stock_transfers (shop_sync_key, status, processing_lease_until)
  where status in ('REQUESTED', 'RECEIPT_REQUESTED', 'CANCEL_REQUESTED');

-- Android HLC is a packed 64-bit value: (epoch milliseconds << 16) | logical counter.
-- Older web deployments wrote Date.now() directly. Normalize these values server-side
-- and reject stale packed versions on update.
create or replace function public.normalize_shop_sync_hlc()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_now_hlc bigint;
  v_incoming_hlc bigint;
  v_old_hlc bigint;
begin
  v_now_hlc := v_now_ms << 16;
  v_incoming_hlc := coalesce(new.hlc_timestamp, 0);

  if tg_op = 'INSERT' then
    if v_incoming_hlc > 0 and v_incoming_hlc < 281474976710656 then
      if coalesce(new.last_modified_device_id, '') = 'WEB' then
        v_incoming_hlc := v_now_hlc;
      else
        v_incoming_hlc := v_incoming_hlc << 16;
      end if;
    end if;
    new.hlc_timestamp := greatest(v_incoming_hlc, v_now_hlc);
    new.updated_at := greatest(coalesce(new.updated_at, 0), v_now_ms);
    new.last_modified_device_id := coalesce(nullif(btrim(new.last_modified_device_id), ''), 'SERVER');
    return new;
  end if;

  v_old_hlc := coalesce(old.hlc_timestamp, 0);

  -- A browser still sends an epoch-millisecond number. Treat it as a new server-
  -- ordered mutation, never compare it directly with a packed Android HLC.
  if v_incoming_hlc > 0
     and v_incoming_hlc < 281474976710656
     and coalesce(new.last_modified_device_id, '') = 'WEB' then
    v_incoming_hlc := greatest(v_now_hlc, v_old_hlc + 1);
  elsif v_incoming_hlc > 0 and v_incoming_hlc < 281474976710656 then
    v_incoming_hlc := v_incoming_hlc << 16;
  elsif v_incoming_hlc <= 0 then
    -- Compatibility for older clients that did not send causal metadata.
    if coalesce(new.updated_at, 0) <= coalesce(old.updated_at, 0)
       and coalesce(new.last_modified_device_id, '') = coalesce(old.last_modified_device_id, '') then
      return old;
    end if;
    v_incoming_hlc := greatest(v_now_hlc, v_old_hlc + 1);
  end if;

  if v_incoming_hlc < v_old_hlc then
    return old;
  end if;

  if v_incoming_hlc = v_old_hlc then
    if coalesce(new.updated_at, 0) <= coalesce(old.updated_at, 0)
       and coalesce(new.last_modified_device_id, '') <= coalesce(old.last_modified_device_id, '') then
      return old;
    end if;
    v_incoming_hlc := greatest(v_now_hlc, v_old_hlc + 1);
  end if;

  new.hlc_timestamp := greatest(v_incoming_hlc, v_old_hlc + 1, v_now_hlc);
  new.updated_at := greatest(coalesce(new.updated_at, 0), coalesce(old.updated_at, 0) + 1, v_now_ms);
  new.last_modified_device_id := coalesce(nullif(btrim(new.last_modified_device_id), ''), 'SERVER');
  return new;
end;
$function$;

drop trigger if exists trg_shop_branches_normalize_hlc on public.shop_branches;
create trigger trg_shop_branches_normalize_hlc
before insert or update on public.shop_branches
for each row execute function public.normalize_shop_sync_hlc();

drop trigger if exists trg_shop_stock_transfers_normalize_hlc on public.shop_stock_transfers;
create trigger trg_shop_stock_transfers_normalize_hlc
before insert or update on public.shop_stock_transfers
for each row execute function public.normalize_shop_sync_hlc();

-- Claiming is an authenticated-by-tenant-header operation under the existing RLS
-- boundary. The lease is short and renewable by the same device. It supports new
-- request statuses and the previous WEB-written statuses during rollout.
create or replace function public.claim_shop_stock_transfer(
  p_transfer_id text,
  p_device_id text,
  p_lease_ms bigint default 180000
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_lease_ms bigint := greatest(30000, least(coalesce(p_lease_ms, 180000), 600000));
  v_tenant_key text := public.current_shop_sync_key();
  v_rows integer;
begin
  if v_tenant_key is null or btrim(v_tenant_key) = ''
     or p_transfer_id is null or btrim(p_transfer_id) = ''
     or p_device_id is null or btrim(p_device_id) = ''
     or length(p_device_id) > 120 then
    return false;
  end if;

  update public.shop_stock_transfers
  set claimed_by_device_id = p_device_id,
      processing_lease_until = v_now_ms + v_lease_ms,
      updated_at = greatest(updated_at + 1, v_now_ms),
      hlc_timestamp = greatest(hlc_timestamp + 1, v_now_ms << 16),
      last_modified_device_id = p_device_id
  where id = p_transfer_id
    and shop_sync_key = v_tenant_key
    and (
      status in ('REQUESTED', 'RECEIPT_REQUESTED', 'CANCEL_REQUESTED')
      or (last_modified_device_id = 'WEB' and status in ('IN_TRANSIT', 'COMPLETED', 'CANCELLED'))
    )
    and (processing_lease_until <= v_now_ms or claimed_by_device_id = p_device_id);

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$function$;

create or replace function public.release_shop_stock_transfer_claim(
  p_transfer_id text,
  p_device_id text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_tenant_key text := public.current_shop_sync_key();
  v_rows integer;
begin
  if v_tenant_key is null or btrim(v_tenant_key) = ''
     or p_transfer_id is null or btrim(p_transfer_id) = ''
     or p_device_id is null or btrim(p_device_id) = '' then
    return false;
  end if;

  update public.shop_stock_transfers
  set claimed_by_device_id = '',
      processing_lease_until = 0,
      updated_at = greatest(updated_at + 1, v_now_ms),
      hlc_timestamp = greatest(hlc_timestamp + 1, v_now_ms << 16),
      last_modified_device_id = p_device_id
  where id = p_transfer_id
    and shop_sync_key = v_tenant_key
    and claimed_by_device_id = p_device_id
    and (
      status in ('REQUESTED', 'RECEIPT_REQUESTED', 'CANCEL_REQUESTED')
      or (last_modified_device_id = 'WEB' and status in ('IN_TRANSIT', 'COMPLETED', 'CANCELLED'))
    );

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$function$;

revoke all on function public.claim_shop_stock_transfer(text, text, bigint) from public;
revoke all on function public.release_shop_stock_transfer_claim(text, text) from public;
grant execute on function public.claim_shop_stock_transfer(text, text, bigint) to anon, authenticated;
grant execute on function public.release_shop_stock_transfer_claim(text, text) to anon, authenticated;
