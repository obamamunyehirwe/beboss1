-- Atomic refund reservations prevent concurrent admins from refunding more than the
-- provider-verified payment. Only service_role may reserve/finalize a provider refund.
create or replace function public.reserve_gateway_refund(
  p_payment_request_id text,
  p_amount_rwf integer,
  p_reason text,
  p_idempotency_hash text,
  p_requested_by uuid
)
returns table (
  refund_id uuid,
  provider text,
  payment_request_id text,
  amount_rwf integer,
  provider_transaction_id text,
  provider_payment_intent_id text,
  existing boolean,
  state text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment record;
  v_existing record;
  v_pending integer := 0;
  v_refunded integer := 0;
  v_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;
  if p_payment_request_id is null or length(btrim(p_payment_request_id)) = 0
     or p_amount_rwf is null or p_amount_rwf <= 0
     or p_reason is null or length(btrim(p_reason)) < 5 or length(p_reason) > 500
     or p_idempotency_hash !~ '^[0-9a-f]{64}$'
     or p_requested_by is null then
    raise exception using errcode = '22023', message = 'Invalid refund request.';
  end if;

  select
    id, gateway_provider, gateway_status, gateway_verified_amount_rwf,
    gateway_refunded_amount_rwf, gateway_transaction_id, gateway_payment_intent_id
  into v_payment
  from public.payment_requests
  where id = p_payment_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Payment request not found.';
  end if;
  if v_payment.gateway_status <> 'VERIFIED'
     or v_payment.gateway_provider not in ('FLUTTERWAVE_RW_MOBILE_MONEY', 'STRIPE_CHECKOUT')
     or v_payment.gateway_verified_amount_rwf <= 0 then
    raise exception using errcode = '22023', message = 'Only independently verified gateway payments can be refunded.';
  end if;
  if v_payment.gateway_provider = 'FLUTTERWAVE_RW_MOBILE_MONEY'
     and length(coalesce(v_payment.gateway_transaction_id, '')) = 0 then
    raise exception using errcode = '22023', message = 'Flutterwave transaction ID is missing.';
  end if;
  if v_payment.gateway_provider = 'STRIPE_CHECKOUT'
     and length(coalesce(v_payment.gateway_payment_intent_id, '')) = 0 then
    raise exception using errcode = '22023', message = 'Stripe PaymentIntent ID is missing.';
  end if;

  select r.id, r.provider, r.payment_request_id, r.amount_rwf, r.status
  into v_existing
  from public.payment_gateway_refunds r
  where r.idempotency_hash = p_idempotency_hash;

  if found then
    return query select
      v_existing.id, v_payment.gateway_provider, v_existing.payment_request_id,
      v_existing.amount_rwf, v_payment.gateway_transaction_id,
      v_payment.gateway_payment_intent_id, true, v_existing.status;
    return;
  end if;

  select coalesce(sum(r.amount_rwf), 0)::integer
  into v_pending
  from public.payment_gateway_refunds r
  where r.payment_request_id = p_payment_request_id
    and r.status in ('REQUESTED', 'PENDING');

  v_refunded := coalesce(v_payment.gateway_refunded_amount_rwf, 0);
  if p_amount_rwf > (v_payment.gateway_verified_amount_rwf - v_refunded - v_pending) then
    raise exception using errcode = '22023', message = 'Refund exceeds the remaining verified payment amount.';
  end if;

  insert into public.payment_gateway_refunds (
    payment_request_id, provider, idempotency_hash, amount_rwf,
    reason, status, requested_by
  ) values (
    p_payment_request_id, v_payment.gateway_provider, p_idempotency_hash,
    p_amount_rwf, btrim(p_reason), 'REQUESTED', p_requested_by
  )
  returning id into v_id;

  update public.payment_requests
  set gateway_refund_status = 'PENDING',
      updated_at = (extract(epoch from clock_timestamp()) * 1000)::bigint
  where id = p_payment_request_id;

  return query select
    v_id, v_payment.gateway_provider, p_payment_request_id, p_amount_rwf,
    v_payment.gateway_transaction_id, v_payment.gateway_payment_intent_id,
    false, 'REQUESTED'::text;
end;
$function$;

create or replace function public.finalize_gateway_refund(
  p_refund_id uuid,
  p_provider_status text,
  p_provider_refund_id text default ''
)
returns table (
  refund_id uuid,
  payment_request_id text,
  refund_status text,
  gateway_refunded_amount_rwf integer,
  gateway_refund_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_refund record;
  v_payment record;
  v_new_refunded integer;
  v_pending integer;
  v_status text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;
  if p_refund_id is null or p_provider_status is null then
    raise exception using errcode = '22023', message = 'Invalid provider refund status.';
  end if;

  select r.*
  into v_refund
  from public.payment_gateway_refunds r
  where r.id = p_refund_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Refund record not found.';
  end if;

  select p.id, p.gateway_verified_amount_rwf, p.gateway_refunded_amount_rwf
  into v_payment
  from public.payment_requests p
  where p.id = v_refund.payment_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Original payment record not found.';
  end if;

  if v_refund.status = 'SUCCEEDED' then
    return query select
      v_refund.id, v_refund.payment_request_id, v_refund.status,
      coalesce(v_payment.gateway_refunded_amount_rwf, 0),
      (select p.gateway_refund_status from public.payment_requests p where p.id = v_payment.id);
    return;
  end if;

  if v_refund.status = 'FAILED' then
    raise exception using errcode = '22023', message = 'A failed refund cannot be changed; create a new refund attempt.';
  end if;

  if lower(p_provider_status) in (
    'succeeded', 'completed-momo', 'completed-mpgs',
    'completed-bank-transfer', 'completed-offline', 'completed-preauth'
  ) then
    v_new_refunded := coalesce(v_payment.gateway_refunded_amount_rwf, 0) + v_refund.amount_rwf;
    if v_new_refunded > v_payment.gateway_verified_amount_rwf then
      raise exception using errcode = '23514', message = 'Completed refunds exceed original verified payment.';
    end if;

    update public.payment_gateway_refunds
    set status = 'SUCCEEDED',
        provider_refund_id = coalesce(nullif(p_provider_refund_id, ''), provider_refund_id),
        updated_at = clock_timestamp()
    where id = p_refund_id;

    v_status := case
      when v_new_refunded = v_payment.gateway_verified_amount_rwf then 'REFUNDED'
      else 'PARTIALLY_REFUNDED'
    end;

    update public.payment_requests
    set gateway_refunded_amount_rwf = v_new_refunded,
        gateway_refund_status = v_status,
        updated_at = (extract(epoch from clock_timestamp()) * 1000)::bigint
    where id = v_payment.id;

    return query select p_refund_id, v_refund.payment_request_id, 'SUCCEEDED'::text,
      v_new_refunded, v_status;
    return;
  end if;

  if lower(p_provider_status) in ('failed', 'canceled', 'cancelled', 'rejected') then
    update public.payment_gateway_refunds
    set status = 'FAILED',
        provider_refund_id = coalesce(nullif(p_provider_refund_id, ''), provider_refund_id),
        updated_at = clock_timestamp()
    where id = p_refund_id;

    select coalesce(sum(r.amount_rwf), 0)::integer
    into v_pending
    from public.payment_gateway_refunds r
    where r.payment_request_id = v_refund.payment_request_id
      and r.status in ('REQUESTED', 'PENDING');

    v_status := case
      when coalesce(v_payment.gateway_refunded_amount_rwf, 0) >= v_payment.gateway_verified_amount_rwf then 'REFUNDED'
      when v_pending > 0 then 'PENDING'
      when coalesce(v_payment.gateway_refunded_amount_rwf, 0) > 0 then 'PARTIALLY_REFUNDED'
      else 'NONE'
    end;

    update public.payment_requests
    set gateway_refund_status = v_status,
        updated_at = (extract(epoch from clock_timestamp()) * 1000)::bigint
    where id = v_payment.id;

    return query select p_refund_id, v_refund.payment_request_id, 'FAILED'::text,
      coalesce(v_payment.gateway_refunded_amount_rwf, 0), v_status;
    return;
  end if;

  update public.payment_gateway_refunds
  set status = 'PENDING',
      provider_refund_id = coalesce(nullif(p_provider_refund_id, ''), provider_refund_id),
      updated_at = clock_timestamp()
  where id = p_refund_id;

  update public.payment_requests
  set gateway_refund_status = 'PENDING',
      updated_at = (extract(epoch from clock_timestamp()) * 1000)::bigint
  where id = v_payment.id;

  return query select p_refund_id, v_refund.payment_request_id, 'PENDING'::text,
    coalesce(v_payment.gateway_refunded_amount_rwf, 0), 'PENDING'::text;
end;
$function$;

revoke all on function public.reserve_gateway_refund(text, integer, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_gateway_refund(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_gateway_refund(text, integer, text, text, uuid)
  to service_role;
grant execute on function public.finalize_gateway_refund(uuid, text, text)
  to service_role;

comment on function public.reserve_gateway_refund(text, integer, text, text, uuid) is
  'Atomically reserve a partial/full refund against a verified provider payment; serializes concurrent refund attempts.';
comment on function public.finalize_gateway_refund(uuid, text, text) is
  'Apply a provider-reported final refund state exactly once; pending is not treated as cash returned.';
