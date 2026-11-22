-- Prevent the same mobile-money transaction reference from entering
-- BeBoss more than once, regardless of letter casing or surrounding spaces.
-- Android, the public owner portal, and the admin WhatsApp intake all share
-- this database constraint as the final deduplication boundary.
create unique index if not exists payment_requests_provider_reference_uidx
  on public.payment_requests (lower(provider), upper(btrim(telco_reference)))
  where btrim(telco_reference) <> '';
