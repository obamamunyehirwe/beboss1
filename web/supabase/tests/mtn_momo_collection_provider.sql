-- MTN MoMo is enabled only in the private provider ledgers and checkout throttle.
begin;

do $test$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_gateway_transactions'::regclass
      and conname = 'payment_gateway_transactions_provider_check'
      and position('MTN_MOMO' in pg_get_constraintdef(oid)) > 0
  ) then raise exception 'Payment gateway transaction provider constraint must allow MTN_MOMO.'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_gateway_events'::regclass
      and conname = 'payment_gateway_events_provider_check'
      and position('MTN_MOMO' in pg_get_constraintdef(oid)) > 0
  ) then raise exception 'Payment gateway event provider constraint must allow MTN_MOMO.'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_gateway_checkout_attempts'::regclass
      and conname = 'payment_gateway_checkout_attempts_provider_check'
      and position('MTN_MOMO' in pg_get_constraintdef(oid)) > 0
  ) then raise exception 'Checkout throttle provider constraint must allow MTN_MOMO.'; end if;

  if has_table_privilege('anon','public.payment_gateway_transactions','SELECT')
     or has_table_privilege('authenticated','public.payment_gateway_transactions','SELECT')
     or has_table_privilege('anon','public.payment_gateway_events','SELECT')
     or has_table_privilege('authenticated','public.payment_gateway_events','SELECT') then
    raise exception 'Client roles must not read the provider transaction or webhook ledger.';
  end if;

  if not has_table_privilege('service_role','public.payment_gateway_transactions','SELECT')
     or not has_table_privilege('service_role','public.payment_gateway_transactions','INSERT')
     or not has_table_privilege('service_role','public.payment_gateway_transactions','UPDATE')
     or not has_table_privilege('service_role','public.payment_gateway_events','INSERT')
     or not has_table_privilege('service_role','public.payment_gateway_checkout_attempts','INSERT') then
    raise exception 'Trusted server functions must retain required gateway-ledger access.';
  end if;

  if has_table_privilege('anon','public.payment_gateway_checkout_attempts','SELECT')
     or has_table_privilege('authenticated','public.payment_gateway_checkout_attempts','SELECT') then
    raise exception 'Client roles must not read checkout throttle attempts.';
  end if;
end
$test$;

rollback;
