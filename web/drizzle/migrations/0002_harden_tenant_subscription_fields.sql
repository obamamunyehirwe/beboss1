CREATE OR REPLACE FUNCTION public.guard_shop_account_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_day constant bigint := 86400000;
  v_now bigint := public.now_ms();
  v_code_allow bigint := 0;
  v_has_code boolean := false;
  v_allow bigint;
begin
  if public.is_beboss_admin()
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  -- Licence time a phone can justify: redeemed unlock codes for this shop (+2 days clock slack).
  select coalesce(max(coalesce(u.redeemed_at, u.issued_at) + u.plan_days::bigint * v_day + 2 * v_day), 0),
         count(*) > 0
    into v_code_allow, v_has_code
    from public.unlock_codes u
   where u.status = 'REDEEMED'
     and public.computed_shop_sync_key(u.shop_username, u.shop_phone) = new.id;

  if tg_op = 'INSERT' then
    new.remote_kill_switch := false;
    new.auto_unlocked_at := 0;
    new.admin_notes := '';
    new.created_at := v_now;
    if new.subscription_status not in ('TRIAL', 'ACTIVE', 'EXPIRED') then
      new.subscription_status := 'TRIAL';
    end if;
    if new.subscription_status = 'ACTIVE' and not v_has_code then
      new.subscription_status := 'TRIAL';
    end if;
    v_allow := greatest(v_now + 5 * v_day, v_code_allow);
    new.subscription_expires_at := least(coalesce(new.subscription_expires_at, 0), v_allow);
    return new;
  end if;

  new.remote_kill_switch := old.remote_kill_switch;
  new.min_app_version := old.min_app_version;
  new.auto_unlocked_at := old.auto_unlocked_at;
  new.admin_notes := old.admin_notes;
  new.created_at := old.created_at;
  new.device_limit := greatest(old.device_limit, 1);

  -- Expiry stays between what the team already granted and what redeemed codes justify.
  v_allow := greatest(old.subscription_expires_at, v_code_allow);
  new.subscription_expires_at := least(greatest(coalesce(new.subscription_expires_at, 0), old.subscription_expires_at), v_allow);

  if old.subscription_status = 'SUSPENDED' then
    new.subscription_status := 'SUSPENDED';
  elsif new.subscription_status = 'ACTIVE' and old.subscription_status <> 'ACTIVE'
        and not (v_has_code and v_code_allow > v_now) then
    new.subscription_status := old.subscription_status;
  elsif new.subscription_status = 'TRIAL' and old.subscription_status <> 'TRIAL' then
    new.subscription_status := old.subscription_status;
  elsif new.subscription_status not in ('TRIAL', 'ACTIVE', 'EXPIRED') then
    new.subscription_status := old.subscription_status;
  end if;
  return new;
end;
$$;