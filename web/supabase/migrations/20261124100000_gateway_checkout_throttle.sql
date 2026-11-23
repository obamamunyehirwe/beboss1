-- Atomic per-shop throttle for online checkout session creation.
create table if not exists public.payment_gateway_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shop_accounts(id) on delete cascade,
  provider text not null check (provider in ('FLUTTERWAVE', 'STRIPE')),
  attempted_at bigint not null
);

create index if not exists payment_gateway_checkout_attempts_shop_time_idx
  on public.payment_gateway_checkout_attempts(shop_id, attempted_at desc);

alter table public.payment_gateway_checkout_attempts enable row level security;
revoke all on table public.payment_gateway_checkout_attempts from public, anon, authenticated;
grant all on table public.payment_gateway_checkout_attempts to service_role;

create or replace function public.take_payment_gateway_checkout_slot(
  p_shop_id text,
  p_provider text,
  p_now_ms bigint,
  p_window_ms bigint default 600000,
  p_max_attempts integer default 5
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt_count integer;
begin
  if p_shop_id is null or length(p_shop_id) < 3
     or p_provider not in ('FLUTTERWAVE', 'STRIPE')
     or p_window_ms < 1000
     or p_max_attempts < 1 then
    raise exception 'Invalid checkout throttle arguments.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_shop_id, 0));

  delete from public.payment_gateway_checkout_attempts
  where shop_id = p_shop_id
    and attempted_at < p_now_ms - p_window_ms;

  select count(*)::integer into v_attempt_count
  from public.payment_gateway_checkout_attempts
  where shop_id = p_shop_id
    and attempted_at >= p_now_ms - p_window_ms;

  if v_attempt_count >= p_max_attempts then
    return false;
  end if;

  insert into public.payment_gateway_checkout_attempts(shop_id, provider, attempted_at)
  values (p_shop_id, p_provider, p_now_ms);

  return true;
end;
$function$;

revoke all on function public.take_payment_gateway_checkout_slot(text,text,bigint,bigint,integer) from public, anon, authenticated;
grant execute on function public.take_payment_gateway_checkout_slot(text,text,bigint,bigint,integer) to service_role;
comment on function public.take_payment_gateway_checkout_slot(text,text,bigint,bigint,integer) is
  'Atomically limits each registered shop to five online checkout attempts in a rolling ten-minute window.';
