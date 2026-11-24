-- Separate anonymous tenant reads from authenticated platform-staff access.
-- This avoids granting anon execution on SECURITY DEFINER is_beboss_staff().
-- Authenticated platform staff retain their intended read path.
do $migration$
begin
  if to_regprocedure('public.is_beboss_staff()') is null then
    raise exception 'Expected public.is_beboss_staff() helper is missing.';
  end if;
end
$migration$;

revoke execute on function public.is_beboss_staff() from anon;

-- Announcements: anonymous customers see only active, in-window announcements
-- targeted to their current public/app audience and optional shop.
drop policy if exists "Read live announcements" on public.announcements;
drop policy if exists "Tenant read announcements" on public.announcements;
drop policy if exists "Staff read announcements" on public.announcements;

create policy "Tenant read announcements"
  on public.announcements for select to anon, authenticated
  using (
    is_active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
    and (target_shop_key = '' or target_shop_key = public.current_shop_sync_key())
    and (
      (public.current_shop_sync_key() = '' and audience = any(array['ALL','WEBSITE']::text[]))
      or
      (public.current_shop_sync_key() <> '' and audience = any(array['ALL','APP']::text[]))
    )
  );

create policy "Staff read announcements"
  on public.announcements for select to authenticated
  using (public.is_beboss_staff());

-- Tenant-scoped read policies do not call the privileged staff predicate.
drop policy if exists "Tenant or staff read snapshots" on public.branch_sync_snapshots;
drop policy if exists "Tenant read snapshots" on public.branch_sync_snapshots;
drop policy if exists "Staff read snapshots" on public.branch_sync_snapshots;
create policy "Tenant read snapshots"
  on public.branch_sync_snapshots for select to anon, authenticated
  using (shop_sync_key = public.current_shop_sync_key());
create policy "Staff read snapshots"
  on public.branch_sync_snapshots for select to authenticated
  using (public.is_beboss_staff());

drop policy if exists "Tenant or staff read device security telemetry" on public.device_security_telemetry;
drop policy if exists "Tenant read device security telemetry" on public.device_security_telemetry;
drop policy if exists "Staff read device security telemetry" on public.device_security_telemetry;
create policy "Tenant read device security telemetry"
  on public.device_security_telemetry for select to anon, authenticated
  using (shop_sync_key = public.current_shop_sync_key());
create policy "Staff read device security telemetry"
  on public.device_security_telemetry for select to authenticated
  using (public.is_beboss_staff());

drop policy if exists "Tenant or staff read payment_requests" on public.payment_requests;
drop policy if exists "Tenant read payment_requests" on public.payment_requests;
drop policy if exists "Staff read payment_requests" on public.payment_requests;
create policy "Tenant read payment_requests"
  on public.payment_requests for select to anon, authenticated
  using (
    public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
  );
create policy "Staff read payment_requests"
  on public.payment_requests for select to authenticated
  using (public.is_beboss_staff());

drop policy if exists "Tenant or staff read shop_accounts" on public.shop_accounts;
drop policy if exists "Tenant read shop_accounts" on public.shop_accounts;
drop policy if exists "Staff read shop_accounts" on public.shop_accounts;
create policy "Tenant read shop_accounts"
  on public.shop_accounts for select to anon, authenticated
  using (id = public.current_shop_sync_key());
create policy "Staff read shop_accounts"
  on public.shop_accounts for select to authenticated
  using (public.is_beboss_staff());

drop policy if exists "Tenant or staff read shop_devices" on public.shop_devices;
drop policy if exists "Tenant read shop_devices" on public.shop_devices;
drop policy if exists "Staff read shop_devices" on public.shop_devices;
create policy "Tenant read shop_devices"
  on public.shop_devices for select to anon, authenticated
  using (shop_sync_key = public.current_shop_sync_key());
create policy "Staff read shop_devices"
  on public.shop_devices for select to authenticated
  using (public.is_beboss_staff());

drop policy if exists "Tenant or staff read shop_users" on public.shop_users;
drop policy if exists "Tenant read shop_users" on public.shop_users;
drop policy if exists "Staff read shop_users" on public.shop_users;
create policy "Tenant read shop_users"
  on public.shop_users for select to anon, authenticated
  using (shop_sync_key = public.current_shop_sync_key());
create policy "Staff read shop_users"
  on public.shop_users for select to authenticated
  using (public.is_beboss_staff());

drop policy if exists "Tenant or staff read unlock_codes" on public.unlock_codes;
drop policy if exists "Tenant read unlock_codes" on public.unlock_codes;
drop policy if exists "Staff read unlock_codes" on public.unlock_codes;
create policy "Tenant read unlock_codes"
  on public.unlock_codes for select to anon, authenticated
  using (
    public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key()
  );
create policy "Staff read unlock_codes"
  on public.unlock_codes for select to authenticated
  using (public.is_beboss_staff());

comment on function public.is_beboss_staff() is
  'SECURITY DEFINER platform staff predicate. Executable only by authenticated roles; tenant read policies are separate and do not call this function for anon.';
