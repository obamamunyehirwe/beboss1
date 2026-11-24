-- Provider-confirmed gateway transactions extend the existing payment_requests
-- and BB3 unlock ledger. Client-submitted fields can never mark a payment verified.

alter table public.payment_requests
  add column if not exists gateway_provider text not null default '',
  add column if not exists gateway_reference text not null default '',
  add column if not exists gateway_transaction_id text not null default '',
  add column if not exists gateway_amount_rwf integer not null default 0,
  add column if not exists gateway_currency text not null default '',
  add column if not exists gateway_verified_at bigint not null default 0;

create table if not exists public.payment_gateway_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_request_id text not null references public.payment_requests(id) on delete cascade,
  provider text not null check (provider in ('FLUTTERWAVE', 'STRIPE')),
  provider_reference text not null unique,
  provider_checkout_id text,
  provider_transaction_id text,
  amount_rwf integer not null check (amount_rwf > 0),
  currency text not null check (currency = 'RWF'),
  status text not null check (status in ('INITIATED', 'PENDING', 'VERIFIED', 'FAILED', 'REVIEW_REQUIRED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  checkout_url text,
  failure_reason text not null default '',
  provider_event_id text not null default '',
  verified_at bigint not null default 0,
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  updated_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  constraint payment_gateway_transactions_one_attempt_per_request unique (payment_request_id, provider_reference)
);

create unique index if not exists payment_gateway_transactions_checkout_id_uidx
  on public.payment_gateway_transactions(provider, provider_checkout_id)
  where provider_checkout_id is not null and provider_checkout_id <> '';

create index if not exists payment_gateway_transactions_request_status_idx
  on public.payment_gateway_transactions(payment_request_id, status);

create table if not exists public.payment_gateway_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('FLUTTERWAVE', 'STRIPE')),
  event_id text not null,
  payment_request_id text not null references public.payment_requests(id) on delete cascade,
  event_type text not null,
  payload_sha256 text not null,
  received_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  unique (provider, event_id)
);

alter table public.payment_gateway_transactions enable row level security;
alter table public.payment_gateway_events enable row level security;
revoke all on table public.payment_gateway_transactions from public, anon, authenticated;
revoke all on table public.payment_gateway_events from public, anon, authenticated;
grant all on table public.payment_gateway_transactions to service_role;
grant all on table public.payment_gateway_events to service_role;

-- Only the server-side webhook (service_role) can write provider verification
-- evidence onto payment_requests. Admin/staff sessions can read this evidence
-- but cannot forge a successful provider callback.
create or replace function public.protect_gateway_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and (
       new.gateway_provider is distinct from old.gateway_provider
       or new.gateway_reference is distinct from old.gateway_reference
       or new.gateway_transaction_id is distinct from old.gateway_transaction_id
       or new.gateway_amount_rwf is distinct from old.gateway_amount_rwf
       or new.gateway_currency is distinct from old.gateway_currency
       or new.gateway_verified_at is distinct from old.gateway_verified_at
     ) then
    raise exception 'Gateway verification fields are server managed.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_protect_gateway_verification_fields on public.payment_requests;
create trigger trg_protect_gateway_verification_fields
before update of gateway_provider, gateway_reference, gateway_transaction_id,
  gateway_amount_rwf, gateway_currency, gateway_verified_at
on public.payment_requests
for each row execute function public.protect_gateway_verification_fields();

-- A verified provider transaction is independently sufficient payment evidence.
-- All legacy/manual approvals still require a non-empty administrator verification note.
create or replace function public.require_manual_provider_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_gateway_verified boolean := false;
begin
  if new.status = 'APPROVED'
     and (tg_op = 'INSERT' or old.status is distinct from 'APPROVED')
     and length(btrim(coalesce(new.admin_verification_note, ''))) < 5 then
    select exists (
      select 1
      from public.payment_gateway_transactions gateway
      where gateway.payment_request_id = new.id
        and gateway.status = 'VERIFIED'
        and gateway.currency = 'RWF'
        and gateway.amount_rwf = new.amount_rwf
        and gateway.verified_at > 0
    ) into v_gateway_verified;

    if not v_gateway_verified
       or new.gateway_verified_at <= 0
       or new.gateway_amount_rwf <> new.amount_rwf
       or new.gateway_currency <> 'RWF'
       or new.gateway_reference = ''
       or new.gateway_transaction_id = '' then
      raise exception 'An independently verified provider transaction or administrator verification note is required before approval.';
    end if;
  end if;
  return new;
end;
$function$;

comment on table public.payment_gateway_transactions is
  'Server-only gateway attempts. No anon/authenticated access; webhook signature and live provider API verification are required before status becomes VERIFIED.';
comment on table public.payment_gateway_events is
  'Idempotency and audit ledger for verified Stripe and Flutterwave webhook deliveries.';
comment on column public.payment_requests.gateway_verified_at is
  'Server-set timestamp of independent provider verification; never accepted from client input.';
