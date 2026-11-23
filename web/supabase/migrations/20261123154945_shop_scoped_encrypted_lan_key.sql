-- Give each BeBoss shop one random LAN pairing key. Paired terminals download
-- it through their existing tenant-scoped RLS request and wrap it with Android Keystore.
alter table public.shop_accounts
  add column if not exists lan_sync_secret text not null
  default (
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', '')
  );

update public.shop_accounts
set lan_sync_secret =
  replace(gen_random_uuid()::text, '-', '') ||
  replace(gen_random_uuid()::text, '-', '')
where lan_sync_secret is null
   or lan_sync_secret !~ '^[0-9a-f]{64}$';

alter table public.shop_accounts
  alter column lan_sync_secret set not null,
  alter column lan_sync_secret set default (
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', '')
  );

create or replace function public.protect_shop_lan_sync_secret()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then
    -- Always generate the initial key server-side; never accept a client-chosen key.
    new.lan_sync_secret :=
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '');
  elsif not public.is_beboss_admin() then
    -- A tenant may update ordinary shop fields but cannot rotate or replace its key.
    new.lan_sync_secret := old.lan_sync_secret;
  elsif new.lan_sync_secret is null or new.lan_sync_secret !~ '^[0-9a-f]{64}$' then
    new.lan_sync_secret :=
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_shop_lan_sync_secret on public.shop_accounts;
create trigger protect_shop_lan_sync_secret
before insert or update of lan_sync_secret on public.shop_accounts
for each row execute function public.protect_shop_lan_sync_secret();

comment on column public.shop_accounts.lan_sync_secret is
  'Random per-shop LAN peer key. Read only through the tenant-scoped shop row; never log or return to public marketing pages.';
