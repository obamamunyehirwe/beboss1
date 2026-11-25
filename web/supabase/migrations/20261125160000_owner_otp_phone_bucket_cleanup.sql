-- Owner OTP attempts are bucketed by a one-way hash of the verified phone.
-- Remove expired rows across old shop-key and new phone-key buckets so historic
-- per-shop rows do not accumulate after the caller migration.
create index if not exists shop_owner_otp_attempts_created_idx
  on public.shop_owner_otp_attempts(created_at);

create or replace function public.take_shop_owner_otp_slot(
  p_shop_id text,
  p_now_ms bigint,
  p_window_ms bigint default 600000,
  p_max_attempts integer default 3
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt_count integer;
  v_attempt_id uuid;
begin
  if p_shop_id is null or length(p_shop_id) < 3
     or p_window_ms < 1000
     or p_max_attempts < 1 then
    raise exception 'Invalid owner OTP throttle arguments.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id, 1));

  delete from public.shop_owner_otp_attempts
  where created_at < p_now_ms - p_window_ms;

  select count(*)::integer into v_attempt_count
  from public.shop_owner_otp_attempts
  where shop_id = p_shop_id
    and created_at >= p_now_ms - p_window_ms;

  if v_attempt_count >= p_max_attempts then
    return null;
  end if;

  insert into public.shop_owner_otp_attempts(shop_id, created_at, status)
  values (p_shop_id, p_now_ms, 'REQUESTED')
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$function$;

revoke all on function public.take_shop_owner_otp_slot(text,bigint,bigint,integer) from public, anon, authenticated;
grant execute on function public.take_shop_owner_otp_slot(text,bigint,bigint,integer) to service_role;
comment on function public.take_shop_owner_otp_slot(text,bigint,bigint,integer) is
  'Atomically rate-limits each SHA-256 hashed owner-phone bucket to three OTP delivery attempts in a rolling ten-minute window; expired rows from all buckets are pruned.';
