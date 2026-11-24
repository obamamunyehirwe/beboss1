create or replace function public.reserve_payment_gateway_refund(
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
  provider_transaction_id text,
  amount_rwf integer,
  status text,
  existing boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment record;
  v_ledger record;
  v_existing record;
  v_already_reserved integer := 0;
  v_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role','') <> 'service_role' then
    raise exception using errcode='42501', message='Service role required.';
  end if;
  if p_payment_request_id is null or length(btrim(p_payment_request_id)) < 3
     or p_amount_rwf is null or p_amount_rwf <= 0
     or p_reason is null or char_length(btrim(p_reason)) not between 5 and 500
     or p_idempotency_hash !~ '^[0-9a-f]{64}$'
     or p_requested_by is null then
    raise exception using errcode='22023', message='Invalid refund request.';
  end if;

  select p.id,p.status,p.gateway_reference,p.gateway_transaction_id,
         p.gateway_amount_rwf,p.gateway_currency,p.gateway_verified_at,
         p.gateway_refunded_amount_rwf
    into v_payment
  from public.payment_requests p
  where p.id = p_payment_request_id
  for update;

  if not found then
    raise exception using errcode='P0002',message='Payment request not found.';
  end if;
  if v_payment.status not in ('APPROVED','REDEEMED')
     or v_payment.gateway_verified_at <= 0
     or v_payment.gateway_currency <> 'RWF'
     or v_payment.gateway_amount_rwf <= 0
     or length(coalesce(v_payment.gateway_transaction_id,'')) = 0
     or length(coalesce(v_payment.gateway_reference,'')) = 0 then
    raise exception using errcode='22023',message='Only an approved and independently verified gateway payment can be refunded.';
  end if;

  -- Match the exact transaction that funded this payment request, not the latest
  -- attempt. A later failed or abandoned retry must never block refunding the
  -- earlier verified settlement referenced by payment_requests.
  select t.provider,t.provider_transaction_id,t.provider_reference,t.amount_rwf,t.currency,t.status
    into v_ledger
  from public.payment_gateway_transactions t
  where t.payment_request_id = p_payment_request_id
    and t.provider_reference = v_payment.gateway_reference
    and t.provider_transaction_id = v_payment.gateway_transaction_id
    and t.status = 'VERIFIED'
  limit 1
  for update;

  if not found
     or v_ledger.currency <> 'RWF'
     or v_ledger.amount_rwf <> v_payment.gateway_amount_rwf
     or v_ledger.provider not in ('FLUTTERWAVE','STRIPE') then
    raise exception using errcode='22023',message='The provider ledger does not match the verified payment evidence.';
  end if;

  select r.id,r.provider,r.payment_request_id,r.provider_transaction_id,
         r.amount_rwf,r.status
    into v_existing
  from public.payment_gateway_refunds r
  where r.idempotency_hash = p_idempotency_hash;

  if found then
    if v_existing.payment_request_id <> p_payment_request_id
       or v_existing.amount_rwf <> p_amount_rwf then
      raise exception using errcode='22023',message='The idempotency key was already used for a different refund.';
    end if;
    return query select v_existing.id,v_existing.provider,v_existing.payment_request_id,
      v_existing.provider_transaction_id,v_existing.amount_rwf,v_existing.status,true;
    return;
  end if;

  select coalesce(sum(r.amount_rwf),0)::integer into v_already_reserved
  from public.payment_gateway_refunds r
  where r.payment_request_id = p_payment_request_id
    and r.status in ('REQUESTED','PENDING','SUCCEEDED');

  if p_amount_rwf > v_payment.gateway_amount_rwf - v_already_reserved then
    raise exception using errcode='22023',message='Refund exceeds the remaining verified payment balance.';
  end if;

  insert into public.payment_gateway_refunds(
    payment_request_id,provider,provider_transaction_id,idempotency_hash,
    amount_rwf,currency,reason,status,requested_by
  ) values (
    p_payment_request_id,v_ledger.provider,v_ledger.provider_transaction_id,
    p_idempotency_hash,p_amount_rwf,'RWF',btrim(p_reason),'REQUESTED',p_requested_by
  ) returning id into v_id;

  update public.payment_requests
  set gateway_refund_status='PENDING',
      updated_at=(extract(epoch from clock_timestamp())*1000)::bigint
  where id=p_payment_request_id;

  return query select v_id,v_ledger.provider,p_payment_request_id,
    v_ledger.provider_transaction_id,p_amount_rwf,'REQUESTED'::text,false;
end;
$function$;
