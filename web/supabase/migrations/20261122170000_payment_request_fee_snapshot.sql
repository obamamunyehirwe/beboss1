alter table public.payment_requests
  add column if not exists fee_per_device_rwf integer not null default 0;

comment on column public.payment_requests.fee_per_device_rwf is
  'Per-extra-device fee captured when a payment claim is submitted, so later plan verification uses the submitted pricing snapshot.';
