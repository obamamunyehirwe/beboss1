-- BeBoss licensing policy: one owner terminal is included; every additional
-- active POS terminal costs exactly 2,000 FRw per month.
update public.app_config
set per_device_fee_rwf = 2000,
    updated_at = (extract(epoch from clock_timestamp()) * 1000)::bigint
where id = 'global'
  and per_device_fee_rwf is distinct from 2000;

create or replace function public.compute_expected_subscription_fee(
  p_branch_count integer,
  p_worker_count integer,
  p_duration_months integer,
  p_device_count integer default 1
)
returns integer
language plpgsql
stable
set search_path = public
as $function$
declare
  v_branches integer := greatest(coalesce(p_branch_count, 1), 1);
  v_workers integer := greatest(coalesce(p_worker_count, 1), 1);
  v_devices integer := greatest(coalesce(p_device_count, 1), 1);
  v_months integer := greatest(coalesce(p_duration_months, 1), 1);
  v_monthly integer;
  v_gross integer;
  v_discount integer;
begin
  v_monthly :=
    (case when v_branches <= 1 then 5000 when v_branches = 2 then 10000 else 20000 end)
    + (case when v_workers <= 1 then 0 when v_workers <= 3 then 2000 when v_workers <= 5 then 4000 else 4000 + (v_workers - 5) * 1000 end)
    + greatest(v_devices - 1, 0) * 2000;
  v_gross := v_monthly * v_months;
  v_discount := case when v_months = 12 then 20 when v_months = 3 then 10 else 0 end;
  return v_gross - ((v_gross * v_discount) / 100);
end;
$function$;

-- Retain the older five-argument API for clients that still pass a device rate,
-- but deliberately ignore that client-controlled value.
create or replace function public.compute_expected_subscription_fee_with_rate(
  p_branch_count integer,
  p_worker_count integer,
  p_duration_months integer,
  p_device_count integer,
  p_device_rate integer
)
returns integer
language plpgsql
stable
set search_path = public
as $function$
begin
  return public.compute_expected_subscription_fee(
    p_branch_count,
    p_worker_count,
    p_duration_months,
    p_device_count
  );
end;
$function$;
