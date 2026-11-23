-- Recompute every payment request with the server-owned fixed extra-terminal fee.
-- A client-provided fee_per_device_rwf and an app_config override are both ignored.
create or replace function public.enforce_payment_request_server_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rate integer := 2000;
  v_monthly integer;
  v_gross integer;
  v_discount integer;
begin
  new.branch_count := greatest(coalesce(new.branch_count, 1), 1);
  new.worker_count := greatest(coalesce(new.worker_count, 1), 1);
  new.device_count := greatest(coalesce(new.device_count, 1), 1);
  new.duration_months := greatest(coalesce(new.duration_months, 1), 1);

  new.fee_per_device_rwf := 2000;
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
