-- Store the administrator's manual verification record separately from the
-- customer-submitted Mobile Money confirmation SMS in payment_note.
alter table public.payment_requests
  add column if not exists admin_verification_note text not null default '';

comment on column public.payment_requests.payment_note is
  'Customer-submitted MTN MoMo / Airtel Money confirmation SMS text or payment note. Screenshots are not required.';
comment on column public.payment_requests.admin_verification_note is
  'Administrator record of the independent provider merchant-account verification performed before issuing the payment-linked BB3 code.';
