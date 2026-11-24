-- Keep the admin payment projection aligned with the columns selected by
-- web/src/lib/admin-queries.ts. Earlier compatibility migrations provide
-- gateway_provider (generated from provider) and gateway_reference/telco_reference.
-- This migration adds the remaining server-owned verification projection fields.

begin;

alter table public.payment_requests
  add column if not exists gateway_transaction_id text not null default '',
  add column if not exists gateway_amount_rwf integer not null default 0,
  add column if not exists gateway_currency text not null default '',
  add column if not exists gateway_verified_at bigint not null default 0;

comment on column public.payment_requests.gateway_transaction_id is
  'Provider transaction identifier returned by an independently verified server-side gateway lookup. Server managed.';
comment on column public.payment_requests.gateway_amount_rwf is
  'Amount in RWF independently verified with the payment provider. Server managed.';
comment on column public.payment_requests.gateway_currency is
  'Currency independently verified with the payment provider. Server managed.';
comment on column public.payment_requests.gateway_verified_at is
  'Unix epoch milliseconds when the provider transaction was independently verified. Zero means not verified. Server managed.';

create or replace function public.protect_payment_gateway_projection_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      if coalesce(new.gateway_transaction_id, '') <> ''
         or coalesce(new.gateway_amount_rwf, 0) <> 0
         or coalesce(new.gateway_currency, '') <> ''
         or coalesce(new.gateway_verified_at, 0) <> 0 then
        raise exception 'Payment gateway verification fields are server managed.'
          using errcode = '42501';
      end if;
    elsif new.gateway_transaction_id is distinct from old.gateway_transaction_id
       or new.gateway_amount_rwf is distinct from old.gateway_amount_rwf
       or new.gateway_currency is distinct from old.gateway_currency
       or new.gateway_verified_at is distinct from old.gateway_verified_at then
      raise exception 'Payment gateway verification fields are server managed.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.protect_payment_gateway_projection_fields() from public, anon, authenticated;

drop trigger if exists trg_protect_payment_gateway_projection_fields on public.payment_requests;
create trigger trg_protect_payment_gateway_projection_fields
before insert or update of gateway_transaction_id, gateway_amount_rwf, gateway_currency, gateway_verified_at
on public.payment_requests
for each row
execute function public.protect_payment_gateway_projection_fields();

notify pgrst, 'reload schema';

commit;
