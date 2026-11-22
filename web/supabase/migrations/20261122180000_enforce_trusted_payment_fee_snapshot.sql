-- Do not trust a device/browser to submit its own fee snapshot or amount.
-- Capture the trusted global fee from app_config and calculate the amount on insert.
create or replace function public.enforce_payment_request_server_fee()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rate integer;
  v_monthly integer;
  v_gross integer;
  v_discount integer;
begin
  new.branch_count := greatest(coalesce(new.branch_count, 1), 1);
  new.worker_count := greatest(coalesce(new.worker_count, 1), 1);
  new.device_count := greatest(coalesce(new.device_count, 1), 1);
  new.duration_months := greatest(coalesce(new.duration_months, 1), 1);

  -- The mobile/web client cannot choose its own device fee. Capture the
  -- trusted global value from app_config at the instant the claim is created.
  select coalesce(nullif(per_device_fee_rwf, 0), 2000)
    into v_rate
    from public.app_config
    where id = 'global';
  v_rate := coalesce(nullif(v_rate, 0), 2000);
  new.fee_per_device_rwf := v_rate;

  v_monthly :=
    (case when new.branch_count <= 1 then 5000 when new.branch_count = 2 then 10000 else 20000 end)
    + (case when new.worker_count <= 1 then 0
            when new.worker_count <= 3 then 2000
            when new.worker_count <= 5 then 4000
            else 4000 + (new.worker_count - 5) * 1000 end)
    + greatest(new.device_count - 1, 0) * v_rate;
  v_gross := v_monthly * new.duration_months;
  v_discount := case when new.duration_months = 12 then 20 when new.duration_months = 3 then 10 else 0 end;
  new.amount_rwf := v_gross - ((v_gross * v_discount) / 100);

  new.payment_time_ms := coalesce(
    nullif(new.payment_time_ms, 0),
    nullif(new.created_at, 0),
    public.now_ms()
  );
  new.payment_note := left(coalesce(new.payment_note, ''), 1000);
  return new;
end;
$function$;

drop trigger if exists trg_recompute_payment_request_fee on public.payment_requests;
create trigger trg_recompute_payment_request_fee
before insert on public.payment_requests
for each row execute function public.enforce_payment_request_server_fee();

comment on function public.enforce_payment_request_server_fee() is
  'Overrides any client-provided pricing snapshot with the trusted global app_config rate, calculates the persisted amount, and timestamps the payment claim.';