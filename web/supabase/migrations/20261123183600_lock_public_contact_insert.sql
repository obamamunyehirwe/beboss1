-- The public contact form now submits through submit-public-contact, which validates
-- the payload and applies a server-side atomic rate limit before inserting.
-- Retire direct Data API inserts only after the updated web client and Edge Function
-- have been deployed together.
drop policy if exists "Anyone submits a contact message" on public.contact_messages;
revoke insert on table public.contact_messages from public, anon, authenticated;
grant insert on table public.contact_messages to service_role;
