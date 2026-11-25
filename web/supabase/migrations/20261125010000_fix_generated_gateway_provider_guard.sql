-- gateway_provider is a GENERATED ALWAYS AS projection of provider.
-- PostgreSQL does not expose its recomputed value to BEFORE UPDATE triggers.
-- Protecting it here therefore makes ordinary status/rejection/approval updates
-- appear to modify a server-managed value. It is not settlement evidence and is
-- not directly writable; protect the actual gateway evidence columns instead.

create or replace function public.protect_gateway_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and (
       new.gateway_reference is distinct from old.gateway_reference
       or new.gateway_transaction_id is distinct from old.gateway_transaction_id
       or new.gateway_amount_rwf is distinct from old.gateway_amount_rwf
       or new.gateway_currency is distinct from old.gateway_currency
       or new.gateway_verified_at is distinct from old.gateway_verified_at
     ) then
    raise exception 'Gateway verification fields are server managed.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_protect_gateway_verification_fields on public.payment_requests;
create trigger trg_protect_gateway_verification_fields
before update of gateway_reference, gateway_transaction_id,
  gateway_amount_rwf, gateway_currency, gateway_verified_at
on public.payment_requests
for each row execute function public.protect_gateway_verification_fields();

notify pgrst, 'reload schema';
