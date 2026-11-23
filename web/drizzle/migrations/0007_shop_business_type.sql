-- Persist the shop vertical selected during the Android registration wizard.
-- Existing shops retain the retail default until the owner edits their shop setup.
alter table public.shop_accounts
  add column if not exists business_type text not null default 'sector_retail';

update public.shop_accounts
set business_type = 'sector_retail'
where business_type is null or trim(business_type) = '';

comment on column public.shop_accounts.business_type is
  'Stable business vertical key used to tailor inventory category and unit catalogs.';
