-- Keep lease mutations in the unexposed private schema. These functions
-- deliberately enforce the tenant header themselves because the owner role bypasses RLS.
create or replace function beboss_private.claim_shop_stock_transfer(
  p_transfer_id text,
  p_device_id text,
  p_lease_ms bigint default 180000
)
returns boolean
language plpgsql
security definer
set search_path = ''
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
      processing_lease_until = v_now_ms + v_lease_ms
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

create or replace function beboss_private.release_shop_stock_transfer_claim(
  p_transfer_id text,
  p_device_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
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
      processing_lease_until = 0
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

revoke all on function beboss_private.claim_shop_stock_transfer(text, text, bigint) from public;
revoke all on function beboss_private.release_shop_stock_transfer_claim(text, text) from public;
grant execute on function beboss_private.claim_shop_stock_transfer(text, text, bigint) to anon, authenticated;
grant execute on function beboss_private.release_shop_stock_transfer_claim(text, text) to anon, authenticated;

create or replace function public.claim_shop_stock_transfer(
  p_transfer_id text,
  p_device_id text,
  p_lease_ms bigint default 180000
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select beboss_private.claim_shop_stock_transfer(p_transfer_id, p_device_id, p_lease_ms);
$function$;

create or replace function public.release_shop_stock_transfer_claim(
  p_transfer_id text,
  p_device_id text
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select beboss_private.release_shop_stock_transfer_claim(p_transfer_id, p_device_id);
$function$;

revoke all on function public.claim_shop_stock_transfer(text, text, bigint) from public;
revoke all on function public.release_shop_stock_transfer_claim(text, text) from public;
grant execute on function public.claim_shop_stock_transfer(text, text, bigint) to anon, authenticated;
grant execute on function public.release_shop_stock_transfer_claim(text, text) to anon, authenticated;
