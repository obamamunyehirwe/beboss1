-- Prevent any old or alternate approval path from marking a payment as paid
-- unless an administrator has recorded the independent provider transaction check.
create or replace function public.require_manual_provider_verification()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if new.status = 'APPROVED'
     and (tg_op = 'INSERT' or old.status is distinct from 'APPROVED')
     and length(btrim(coalesce(new.admin_verification_note, ''))) < 5 then
    raise exception 'Manual MTN MoMo / Airtel Money provider verification is required before approving a payment.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_require_manual_provider_verification on public.payment_requests;
create trigger trg_require_manual_provider_verification
before insert or update of status on public.payment_requests
for each row execute function public.require_manual_provider_verification();

comment on function public.require_manual_provider_verification() is
  'Prevents any payment claim from entering APPROVED unless an administrator records the independent provider transaction check.';
