-- Add btree indexes to support device revocation lookups, payment-event
-- history, refund auditing and owner membership validation. These indexes do
-- not grant access and do not change tenant RLS behavior.
create index if not exists android_device_credentials_device_record_id_idx
  on beboss_private.android_device_credentials (device_record_id);

create index if not exists payment_gateway_events_payment_request_id_idx
  on public.payment_gateway_events (payment_request_id);

create index if not exists payment_gateway_refunds_requested_by_idx
  on public.payment_gateway_refunds (requested_by);

create index if not exists shop_owner_memberships_shop_id_idx
  on public.shop_owner_memberships (shop_id);
