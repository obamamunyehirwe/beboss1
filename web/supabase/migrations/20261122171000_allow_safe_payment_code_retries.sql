-- A payment may have a revoked code when an approval race is lost.
-- Keep only one active/non-revoked code per submitted payment request, while
-- allowing a corrected or retried approval to issue a new active code.
drop index if exists public.unlock_codes_one_per_payment_request_uidx;

create unique index if not exists unlock_codes_one_active_per_payment_request_uidx
  on public.unlock_codes(payment_request_id)
  where payment_request_id is not null and status <> 'REVOKED';

comment on index public.unlock_codes_one_active_per_payment_request_uidx is
  'Enforces at most one non-revoked unlock code for each payment request; revoked losing-race attempts may be retried safely.';
