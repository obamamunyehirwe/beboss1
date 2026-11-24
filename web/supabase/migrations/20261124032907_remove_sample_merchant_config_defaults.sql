-- New installations must not inherit demonstration/sample merchant payment numbers.
-- Existing merchant configuration values are deliberately preserved.
alter table public.app_config
  alter column mtn_momo_code set default '',
  alter column mtn_momo_phone set default '',
  alter column mtn_recipient_name set default '',
  alter column airtel_money_phone set default '',
  alter column airtel_recipient_name set default '';

comment on column public.app_config.mtn_momo_code is
  'Merchant-configured MTN Rwanda merchant code. Blank means no direct USSD merchant collection is configured.';
comment on column public.app_config.mtn_momo_phone is
  'Merchant-configured MTN Rwanda phone. Blank means no direct USSD merchant collection is configured.';
comment on column public.app_config.airtel_money_phone is
  'Merchant-configured Airtel Rwanda merchant phone. Blank means no direct USSD merchant collection is configured.';
