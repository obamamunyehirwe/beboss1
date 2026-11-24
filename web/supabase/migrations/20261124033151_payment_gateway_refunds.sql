begin;

alter table public.payment_requests
  add column if not exists gateway_refunded_amount_rwf integer not null default 0,
  add column if not exists gateway_refund_status text not null default 'NONE';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_requests_gateway_refund_status_check'
      and conrelid = 'public.payment_requests'::regclass
  ) then
    alter table public.payment_requests
      add constraint payment_requests_gateway_refund_status_check
      check (gateway_refund_status in ('NONE','PENDING','PARTIALLY_REFUNDED','REFUNDED'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_requests_gateway_refund_amount_check'
      and conrelid = 'public.payment_requests'::regclass
  ) then
    alter table public.payment_requests
      add constraint payment_requests_gateway_refund_amount_check
      check (gateway_refunded_amount_rwf >= 0);
  end if;
end
$$;

create table if not exists public.payment_gateway_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_request_id text not null references public.payment_requests(id) on delete restrict,
  provider text not null check (provider in ('FLUTTERWAVE','STRIPE')),
  provider_transaction_id text not null,
  provider_refund_id text not null default '',
  idempotency_hash text not null unique check (idempotency_hash ~ '^[0-9a-f]{64}$'),
  amount_rwf integer not null check (amount_rwf > 0),
  currency text not null default 'RWF' check (currency = 'RWF'),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  status text not null default 'REQUESTED' check (status in ('REQUESTED','PENDING','SUCCEEDED','FAILED')),
  provider_status text not null default '',
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists payment_gateway_refunds_request_status_idx
  on public.payment_gateway_refunds(payment_request_id,status,created_at desc);
create index if not exists payment_gateway_refunds_provider_status_idx
  on public.payment_gateway_refunds(provider,status,updated_at desc);

alter table public.payment_gateway_refunds enable row level security;
revoke all on table public.payment_gateway_refunds from public, anon, authenticated;
grant all on table public.payment_gateway_refunds to service_role;

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

  select t.provider,t.provider_transaction_id,t.provider_reference,t.amount_rwf,t.currency,t.status
    into v_ledger
  from public.payment_gateway_transactions t
  where t.payment_request_id = p_payment_request_id
  order by t.created_at desc
  limit 1
  for update;

  if not found
     or v_ledger.status <> 'VERIFIED'
     or v_ledger.currency <> 'RWF'
     or v_ledger.amount_rwf <> v_payment.gateway_amount_rwf
     or v_ledger.provider_transaction_id <> v_payment.gateway_transaction_id
     or v_ledger.provider_reference <> v_payment.gateway_reference
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

create or replace function public.finalize_payment_gateway_refund(
  p_refund_id uuid,
  p_status text,
  p_provider_refund_id text default '',
  p_provider_status text default ''
)
returns table (
  refund_id uuid,
  payment_request_id text,
  refund_status text,
  total_refunded_rwf integer,
  aggregate_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_refund record;
  v_payment record;
  v_refunded integer;
  v_pending integer;
  v_aggregate text;
begin
  if coalesce(auth.jwt() ->> 'role','') <> 'service_role' then
    raise exception using errcode='42501',message='Service role required.';
  end if;
  if p_refund_id is null or p_status not in ('PENDING','SUCCEEDED','FAILED') then
    raise exception using errcode='22023',message='Invalid provider refund status.';
  end if;

  select * into v_refund
  from public.payment_gateway_refunds
  where id=p_refund_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='Refund record not found.';
  end if;

  select p.id,p.gateway_amount_rwf,p.gateway_refunded_amount_rwf
    into v_payment
  from public.payment_requests p
  where p.id=v_refund.payment_request_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='Original payment request not found.';
  end if;

  if v_refund.status='SUCCEEDED' then
    return query select v_refund.id,v_refund.payment_request_id,'SUCCEEDED'::text,
      v_payment.gateway_refunded_amount_rwf,
      (select p.gateway_refund_status from public.payment_requests p where p.id=v_payment.id);
    return;
  end if;
  if v_refund.status='FAILED' then
    return query select v_refund.id,v_refund.payment_request_id,'FAILED'::text,
      v_payment.gateway_refunded_amount_rwf,
      (select p.gateway_refund_status from public.payment_requests p where p.id=v_payment.id);
    return;
  end if;

  if p_status='SUCCEEDED' then
    v_refunded := v_payment.gateway_refunded_amount_rwf + v_refund.amount_rwf;
    if v_refunded > v_payment.gateway_amount_rwf then
      raise exception using errcode='23514',message='Completed refunds exceed the original verified payment.';
    end if;
  else
    v_refunded := v_payment.gateway_refunded_amount_rwf;
  end if;

  update public.payment_gateway_refunds
  set status=p_status,
      provider_refund_id=coalesce(nullif(p_provider_refund_id,''),provider_refund_id),
      provider_status=left(coalesce(p_provider_status,''),120),
      updated_at=clock_timestamp()
  where id=p_refund_id;

  select coalesce(sum(r.amount_rwf),0)::integer into v_pending
  from public.payment_gateway_refunds r
  where r.payment_request_id=v_refund.payment_request_id
    and r.status in ('REQUESTED','PENDING');

  v_aggregate := case
    when v_refunded >= v_payment.gateway_amount_rwf then 'REFUNDED'
    when v_pending > 0 then 'PENDING'
    when v_refunded > 0 then 'PARTIALLY_REFUNDED'
    else 'NONE'
  end;

  update public.payment_requests
  set gateway_refunded_amount_rwf=v_refunded,
      gateway_refund_status=v_aggregate,
      updated_at=(extract(epoch from clock_timestamp())*1000)::bigint
  where id=v_payment.id;

  return query select p_refund_id,v_refund.payment_request_id,p_status,v_refunded,v_aggregate;
end;
$function$;

revoke all on function public.reserve_payment_gateway_refund(text,integer,text,text,uuid) from public,anon,authenticated;
revoke all on function public.finalize_payment_gateway_refund(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_payment_gateway_refund(text,integer,text,text,uuid) to service_role;
grant execute on function public.finalize_payment_gateway_refund(uuid,text,text,text) to service_role;

comment on table public.payment_gateway_refunds is
  'Service-role-only, idempotent partial/full refund ledger. Only provider-confirmed terminal success increases the refunded amount.';

commit;
