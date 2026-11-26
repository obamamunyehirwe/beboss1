-- The direct MTN MoMo Collection rail is an asynchronous Request-to-Pay
-- provider. Expand the server-only ledger and throttle allow-list without
-- granting any new client access or enabling direct Airtel API calls.

-- Normalize only historical hosted-checkout requests that have a corresponding
-- server ledger. Manual proof submissions (including legacy MTN/Airtel claims)
-- have no gateway ledger and remain untouched.
update public.payment_requests p
set provider = case lower(trim(p.provider))
  when 'flutterwave' then 'FLUTTERWAVE'
  when 'stripe' then 'STRIPE'
  else p.provider
end
where lower(trim(p.provider)) in ('flutterwave', 'stripe')
  and exists (
    select 1
    from public.payment_gateway_transactions t
    where t.payment_request_id = p.id
      and t.provider = case lower(trim(p.provider))
        when 'flutterwave' then 'FLUTTERWAVE'
        when 'stripe' then 'STRIPE'
        else ''
      end
  );

alter table public.payment_gateway_transactions
  drop constraint if exists payment_gateway_transactions_provider_check;
alter table public.payment_gateway_transactions
  add constraint payment_gateway_transactions_provider_check
  check (provider in ('FLUTTERWAVE','STRIPE','MTN_MOMO'));

alter table public.payment_gateway_events
  drop constraint if exists payment_gateway_events_provider_check;
alter table public.payment_gateway_events
  add constraint payment_gateway_events_provider_check
  check (provider in ('FLUTTERWAVE','STRIPE','MTN_MOMO'));

alter table public.payment_gateway_checkout_attempts
  drop constraint if exists payment_gateway_checkout_attempts_provider_check;
alter table public.payment_gateway_checkout_attempts
  add constraint payment_gateway_checkout_attempts_provider_check
  check (provider in ('FLUTTERWAVE','STRIPE','MTN_MOMO'));

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
     or p_provider not in ('FLUTTERWAVE', 'STRIPE', 'MTN_MOMO')
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

comment on table public.payment_gateway_transactions is
  'Server-only ledger for Flutterwave, Stripe and MTN MoMo. MTN Request-to-Pay remains pending until the server independently confirms SUCCESSFUL status through the Collections status API.';
