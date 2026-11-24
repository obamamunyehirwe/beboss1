-- Keep payment references readable across the Android and admin clients.
-- Newer admin clients use gateway_reference; existing Android clients still
-- submit telco_reference. This trigger keeps the two values synchronized.

begin;

alter table public.payment_requests
  add column if not exists gateway_reference text not null default '',
  add column if not exists telco_reference text not null default '';

comment on column public.payment_requests.gateway_reference is
  'Canonical external Mobile Money / payment gateway transaction reference. Mirrored to telco_reference for older BeBoss Android clients.';
comment on column public.payment_requests.telco_reference is
  'Backward-compatible alias of gateway_reference for existing Android clients. Keep both columns synchronized by trg_sync_payment_request_references.';

create or replace function public.sync_payment_request_references()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  gateway_changed boolean;
  telco_changed boolean;
begin
  if tg_op = 'INSERT' then
    if nullif(btrim(new.gateway_reference), '') is null then
      new.gateway_reference := coalesce(new.telco_reference, '');
    elsif nullif(btrim(new.telco_reference), '') is null then
      new.telco_reference := new.gateway_reference;
    elsif new.gateway_reference is distinct from new.telco_reference then
      raise exception 'gateway_reference and telco_reference must contain the same payment reference'
        using errcode = '22023';
    end if;
  else
    gateway_changed := new.gateway_reference is distinct from old.gateway_reference;
    telco_changed := new.telco_reference is distinct from old.telco_reference;

    if gateway_changed and telco_changed then
      if new.gateway_reference is distinct from new.telco_reference then
        raise exception 'gateway_reference and telco_reference must contain the same payment reference'
          using errcode = '22023';
      end if;
    elsif gateway_changed then
      new.telco_reference := coalesce(new.gateway_reference, '');
    elsif telco_changed then
      new.gateway_reference := coalesce(new.telco_reference, '');
    elsif new.gateway_reference is distinct from new.telco_reference then
      new.telco_reference := coalesce(new.gateway_reference, '');
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_sync_payment_request_references on public.payment_requests;
create trigger trg_sync_payment_request_references
before insert or update of gateway_reference, telco_reference
on public.payment_requests
for each row
execute function public.sync_payment_request_references();

create index if not exists idx_payment_requests_gateway_reference
  on public.payment_requests (provider, gateway_reference)
  where gateway_reference <> '';

notify pgrst, 'reload schema';

commit;
