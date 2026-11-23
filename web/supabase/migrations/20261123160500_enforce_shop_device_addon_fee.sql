-- The owner/primary terminal is included. Every additional active POS device
-- has a server-enforced monthly add-on of exactly 2,000 FRw.
update public.shop_devices
set monthly_fee_addon_rwf = case when is_owner_primary then 0 else 2000 end
where monthly_fee_addon_rwf is distinct from case when is_owner_primary then 0 else 2000 end;

create or replace function public.enforce_shop_device_addon_fee()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.monthly_fee_addon_rwf := case when new.is_owner_primary then 0 else 2000 end;
  return new;
end;
$function$;

drop trigger if exists enforce_shop_device_addon_fee on public.shop_devices;
create trigger enforce_shop_device_addon_fee
before insert or update of is_owner_primary, monthly_fee_addon_rwf on public.shop_devices
for each row execute function public.enforce_shop_device_addon_fee();

comment on column public.shop_devices.monthly_fee_addon_rwf is
  'Server-enforced add-on: primary owner terminal 0 FRw; each additional active terminal 2,000 FRw per month.';
