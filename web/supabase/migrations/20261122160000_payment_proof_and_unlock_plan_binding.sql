-- BeBoss payment proof without transaction-reference capture, plus a per-payment BB3 ledger.
-- The legacy telco_reference column remains for backwards compatibility with older APKs.
alter table public.payment_requests
  add column if not exists payment_time_ms bigint not null default 0,
  add column if not exists payment_note text not null default '',
  add column if not exists fee_per_device_rwf integer not null default 2000;

alter table public.unlock_codes
  add column if not exists payment_request_id text,
  add column if not exists duration_months integer not null default 1,
  add column if not exists branch_count integer not null default 1,
  add column if not exists worker_count integer not null default 1,
  add column if not exists device_count integer not null default 1,
  add column if not exists payment_time_ms bigint not null default 0,
  add column if not exists payment_provider text not null default '',
  add column if not exists payer_phone text not null default '',
  add column if not exists payer_full_name text not null default '',
  add column if not exists payment_note text not null default '',
  add column if not exists plan_digest text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'unlock_codes_payment_request_id_fkey'
      and conrelid = 'public.unlock_codes'::regclass
  ) then
    alter table public.unlock_codes
      add constraint unlock_codes_payment_request_id_fkey
      foreign key (payment_request_id)
      references public.payment_requests(id)
      on delete set null;
  end if;
end $$;

-- A payment request can mint exactly one unlock-code ledger record.
create unique index if not exists unlock_codes_one_per_payment_request_uidx
  on public.unlock_codes(payment_request_id)
  where payment_request_id is not null;

-- Transaction IDs are no longer collected or used for duplicate detection.
drop index if exists public.payment_requests_provider_reference_uidx;

comment on column public.payment_requests.telco_reference is
  'Deprecated legacy field. Kept only so older installed app versions remain compatible. New BeBoss clients must not collect, require, or write a transaction reference.';
comment on column public.payment_requests.payment_time_ms is
  'Timestamp supplied with the mobile-money proof; defaults to submission time for legacy clients.';
comment on column public.unlock_codes.payment_request_id is
  'Payment request this unique, signed BB3 code was issued for.';
comment on column public.unlock_codes.plan_digest is
  'SHA-256 commitment to the exact payment request, owner, payer, amount and plan used to issue this BB3 code.';

comment on column public.payment_requests.fee_per_device_rwf is 'Pricing snapshot used for display and audit only; server approval always recalculates against current trusted app_config pricing.';
