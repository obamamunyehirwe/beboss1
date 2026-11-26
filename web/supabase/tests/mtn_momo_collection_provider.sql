-- MTN MoMo is enabled only in the private provider ledgers and checkout throttle.
begin;

do $test$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_gateway_transactions'::regclass
      and conname = 'payment_gateway_transactions_provider_check'
  ) then raise exception 'Payment gateway provider constraint is missing.'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_gateway_events'::regclass
      and conname = 'payment_gateway_events_provider_check'
  ) then raise exception 'Payment gateway event provider constraint is missing.'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_gateway_checkout_attempts'::regclass
      and conname = 'payment_gateway_checkout_attempts_provider_check'
  ) then raise exception 'Checkout throttle provider constraint is missing.'; end if;

  if has_table_privilege('anon','public.payment_gateway_transactions','SELECT')
     or has_table_privilege('authenticated','public.payment_gateway_transactions','SELECT')
     or has_table_privilege('anon','public.payment_gateway_events','SELECT')
     or has_table_privilege('authenticated','public.payment_gateway_events','SELECT') then
    raise exception 'Client roles must not read the provider transaction or webhook ledger.';
  end if;
end
$test$;

rollback;
