-- Atomically rate-limit owner OTP sends per registered shop.
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

  perform pg_advisory_xact_lock(hashtextextended(p_shop_id, 1));

  delete from public.shop_owner_otp_attempts
  where shop_id = p_shop_id
    and created_at < p_now_ms - p_window_ms;

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
  'Atomically limits a registered shop to three OTP delivery attempts in a rolling ten-minute window.';
