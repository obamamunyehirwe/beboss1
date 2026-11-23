-- Verified gateway metadata for BeBoss subscription checkouts.
-- Provider secrets and raw card/payment data never enter these tables.
alter table public.payment_requests
  add column if not exists gateway_provider text not null default '',
  add column if not exists gateway_reference text not null default '',
  add column if not exists gateway_session_id text not null default '',
  add column if not exists gateway_checkout_url text not null default '',
  add column if not exists gateway_status text not null default 'NOT_STARTED',
  add column if not exists gateway_transaction_id text not null default '',
  add column if not exists gateway_payment_intent_id text not null default '',
  add column if not exists gateway_verified_at bigint not null default 0,
  add column if not exists gateway_verified_amount_rwf integer not null default 0,
  add column if not exists gateway_verified_currency text not null default '',
  add column if not exists gateway_refunded_amount_rwf integer not null default 0,
  add column if not exists gateway_refund_status text not null default 'NONE';

alter table public.payment_requests
  add constraint payment_requests_gateway_provider_check
    check (gateway_provider in ('', 'FLUTTERWAVE_RW_MOBILE_MONEY', 'STRIPE_CHECKOUT')),
  add constraint payment_requests_gateway_status_check
    check (gateway_status in (
      'NOT_STARTED', 'CREATING', 'PENDING_PROVIDER', 'VERIFIED',
      'FAILED', 'EXPIRED', 'REVERSED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'
    )),
  add constraint payment_requests_gateway_amounts_nonnegative_check
    check (gateway_verified_amount_rwf >= 0 and gateway_refunded_amount_rwf >= 0);

create unique index if not exists payment_requests_gateway_reference_uidx
  on public.payment_requests(gateway_reference)
  where gateway_reference <> '';

create index if not exists payment_requests_gateway_status_idx
  on public.payment_requests(gateway_provider, gateway_status, created_at desc)
  where gateway_provider <> '';

create table if not exists public.payment_gateway_attempts (
  idempotency_hash text primary key check (idempotency_hash ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payment_request_id text references public.payment_requests(id) on delete restrict,
  provider text not null check (provider in ('FLUTTERWAVE_RW_MOBILE_MONEY', 'STRIPE_CHECKOUT')),
  provider_reference text not null,
  provider_session_id text not null default '',
  checkout_url text not null default '',
  state text not null check (state in ('CREATING', 'CREATED', 'FAILED')),
  error_code text not null default '',
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.payment_gateway_attempts enable row level security;
revoke all on table public.payment_gateway_attempts from public, anon, authenticated;
grant all on table public.payment_gateway_attempts to service_role;
create index if not exists payment_gateway_attempts_payment_request_idx
  on public.payment_gateway_attempts(payment_request_id, created_at desc);

create table if not exists public.payment_gateway_events (
  provider text not null check (provider in ('FLUTTERWAVE_RW_MOBILE_MONEY', 'STRIPE_CHECKOUT')),
  event_id text not null,
  payment_request_id text references public.payment_requests(id) on delete set null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_verified boolean not null,
  processing_state text not null check (processing_state in ('RECEIVED', 'VERIFIED', 'IGNORED', 'FAILED')),
  error_code text not null default '',
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  primary key(provider, event_id)
);

alter table public.payment_gateway_events enable row level security;
revoke all on table public.payment_gateway_events from public, anon, authenticated;
grant all on table public.payment_gateway_events to service_role;
create index if not exists payment_gateway_events_payment_request_idx
  on public.payment_gateway_events(payment_request_id, received_at desc);

create table if not exists public.payment_gateway_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_request_id text not null references public.payment_requests(id) on delete restrict,
  provider text not null check (provider in ('FLUTTERWAVE_RW_MOBILE_MONEY', 'STRIPE_CHECKOUT')),
  idempotency_hash text not null unique check (idempotency_hash ~ '^[0-9a-f]{64}$'),
  provider_refund_id text not null default '',
  amount_rwf integer not null check (amount_rwf > 0),
  reason text not null,
  status text not null check (status in ('REQUESTED', 'PENDING', 'SUCCEEDED', 'FAILED')),
  requested_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.payment_gateway_refunds enable row level security;
revoke all on table public.payment_gateway_refunds from public, anon, authenticated;
grant all on table public.payment_gateway_refunds to service_role;
create index if not exists payment_gateway_refunds_payment_request_idx
  on public.payment_gateway_refunds(payment_request_id, created_at desc);

-- Do not permit browser/mobile tenant-key sessions to forge successful gateway verification.
create or replace function public.guard_payment_gateway_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if v_service_role then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.gateway_provider <> ''
       or new.gateway_reference <> ''
       or new.gateway_session_id <> ''
       or new.gateway_checkout_url <> ''
       or new.gateway_status <> 'NOT_STARTED'
       or new.gateway_transaction_id <> ''
       or new.gateway_payment_intent_id <> ''
       or new.gateway_verified_at <> 0
       or new.gateway_verified_amount_rwf <> 0
       or new.gateway_verified_currency <> ''
       or new.gateway_refunded_amount_rwf <> 0
       or new.gateway_refund_status <> 'NONE' then
      raise exception using errcode = '42501', message = 'Gateway verification fields are server-managed.';
    end if;
    return new;
  end if;

  if new.gateway_provider is distinct from old.gateway_provider
     or new.gateway_reference is distinct from old.gateway_reference
     or new.gateway_session_id is distinct from old.gateway_session_id
     or new.gateway_checkout_url is distinct from old.gateway_checkout_url
     or new.gateway_status is distinct from old.gateway_status
     or new.gateway_transaction_id is distinct from old.gateway_transaction_id
     or new.gateway_payment_intent_id is distinct from old.gateway_payment_intent_id
     or new.gateway_verified_at is distinct from old.gateway_verified_at
     or new.gateway_verified_amount_rwf is distinct from old.gateway_verified_amount_rwf
     or new.gateway_verified_currency is distinct from old.gateway_verified_currency
     or new.gateway_refunded_amount_rwf is distinct from old.gateway_refunded_amount_rwf
     or new.gateway_refund_status is distinct from old.gateway_refund_status then
    raise exception using errcode = '42501', message = 'Gateway verification fields are server-managed.';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_payment_gateway_fields() from public, anon, authenticated;
drop trigger if exists trg_guard_payment_gateway_fields on public.payment_requests;
create trigger trg_guard_payment_gateway_fields
before insert or update on public.payment_requests
for each row execute function public.guard_payment_gateway_fields();

-- Reuse the existing atomic rate limiter for public checkout session creation.
alter table beboss_private.rate_limit_buckets
  drop constraint if exists rate_limit_buckets_scope_check;
alter table beboss_private.rate_limit_buckets
  add constraint rate_limit_buckets_scope_check
  check (scope in ('legacy_bb2', 'public_contact', 'gateway_checkout'));

create or replace function public.consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_max_hits integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  request_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_hits integer;
  v_retry integer;
begin
  if p_scope not in ('legacy_bb2', 'public_contact', 'gateway_checkout')
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_max_hits < 1 or p_max_hits > 100
     or p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'Invalid rate-limit parameters.';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into beboss_private.rate_limit_buckets as bucket (
    scope, key_hash, window_start, hits
  ) values (
    p_scope, p_key_hash, v_window_start, 1
  )
  on conflict (scope, key_hash, window_start)
  do update set hits = bucket.hits + 1
  returning hits into v_hits;

  v_retry := greatest(
    1,
    ceil(extract(epoch from (
      v_window_start + make_interval(secs => p_window_seconds) - clock_timestamp()
    )))::integer
  );

  delete from beboss_private.rate_limit_buckets
   where window_start < v_now - interval '24 hours';

  return query select (v_hits <= p_max_hits), v_hits, v_retry;
end;
$function$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;

comment on column public.payment_requests.gateway_verified_at is
  'Server-only timestamp set after a signed provider webhook and independent provider API verification. It is not a user-submitted payment claim.';
comment on table public.payment_gateway_events is
  'Server-only idempotent audit of signed Flutterwave and Stripe webhook events. Raw payment payloads are not retained.';
