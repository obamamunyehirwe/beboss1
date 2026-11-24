-- Separate shop-scoped client writes from platform administrator writes.
-- Anonymous tenant clients must not evaluate SECURITY DEFINER admin predicates.
-- Admin write paths remain available to authenticated platform staff.

-- Branch snapshots
drop policy if exists "Tenant or admin insert snapshots" on public.branch_sync_snapshots;
drop policy if exists "Tenant insert snapshots" on public.branch_sync_snapshots;
drop policy if exists "Admin insert snapshots" on public.branch_sync_snapshots;
create policy "Tenant insert snapshots"
  on public.branch_sync_snapshots for insert to anon, authenticated
  with check (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');
create policy "Admin insert snapshots"
  on public.branch_sync_snapshots for insert to authenticated
  with check (public.is_beboss_admin());

drop policy if exists "Tenant or admin update snapshots" on public.branch_sync_snapshots;
drop policy if exists "Tenant update snapshots" on public.branch_sync_snapshots;
drop policy if exists "Admin update snapshots" on public.branch_sync_snapshots;
create policy "Tenant update snapshots"
  on public.branch_sync_snapshots for update to anon, authenticated
  using (shop_sync_key = public.current_shop_sync_key())
  with check (shop_sync_key = public.current_shop_sync_key());
create policy "Admin update snapshots"
  on public.branch_sync_snapshots for update to authenticated
  using (public.is_beboss_admin())
  with check (public.is_beboss_admin());

-- Device security telemetry
drop policy if exists "Tenant or admin insert device security telemetry" on public.device_security_telemetry;
drop policy if exists "Tenant insert device security telemetry" on public.device_security_telemetry;
drop policy if exists "Admin insert device security telemetry" on public.device_security_telemetry;
create policy "Tenant insert device security telemetry"
  on public.device_security_telemetry for insert to anon, authenticated
  with check (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');
create policy "Admin insert device security telemetry"
  on public.device_security_telemetry for insert to authenticated
  with check (public.is_beboss_admin());

drop policy if exists "Tenant or admin update device security telemetry" on public.device_security_telemetry;
drop policy if exists "Tenant update device security telemetry" on public.device_security_telemetry;
drop policy if exists "Admin update device security telemetry" on public.device_security_telemetry;
create policy "Tenant update device security telemetry"
  on public.device_security_telemetry for update to anon, authenticated
  using (shop_sync_key = public.current_shop_sync_key())
  with check (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');
create policy "Admin update device security telemetry"
  on public.device_security_telemetry for update to authenticated
  using (public.is_beboss_admin())
  with check (public.is_beboss_admin());

-- Owner-submitted payment requests; platform approval is authenticated-only.
drop policy if exists "Tenant or admin insert payment_requests" on public.payment_requests;
drop policy if exists "Tenant insert payment_requests" on public.payment_requests;
drop policy if exists "Admin insert payment_requests" on public.payment_requests;
create policy "Tenant insert payment_requests"
  on public.payment_requests for insert to anon, authenticated
  with check (
    public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
    and public.current_shop_sync_key() <> ''
    and status = 'PENDING_VERIFICATION'
  );
create policy "Admin insert payment_requests"
  on public.payment_requests for insert to authenticated
  with check (public.is_beboss_admin());

drop policy if exists "Tenant redeem or admin update payment_requests" on public.payment_requests;
drop policy if exists "Tenant redeem payment_requests" on public.payment_requests;
drop policy if exists "Admin update payment_requests" on public.payment_requests;
create policy "Tenant redeem payment_requests"
  on public.payment_requests for update to anon, authenticated
  using (
    public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
    and status = any(array['APPROVED','REDEEMED']::text[])
  )
  with check (
    status = 'REDEEMED'
    and public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
  );
create policy "Admin update payment_requests"
  on public.payment_requests for update to authenticated
  using (public.is_beboss_admin())
  with check (public.is_beboss_admin());

-- Shop accounts: only the owner (or an unmigrated legacy client) can create/update
-- its own tenant record. Platform admin writes use a separate authenticated policy.
drop policy if exists "Tenant or admin insert shop_accounts" on public.shop_accounts;
drop policy if exists "Tenant insert shop_accounts" on public.shop_accounts;
drop policy if exists "Admin insert shop_accounts" on public.shop_accounts;
create policy "Tenant insert shop_accounts"
  on public.shop_accounts for insert to anon, authenticated
  with check (
    id = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any(array['OWNER','LEGACY']::text[])
  );
create policy "Admin insert shop_accounts"
  on public.shop_accounts for insert to authenticated
  with check (public.is_beboss_admin());

drop policy if exists "Tenant or admin update shop_accounts" on public.shop_accounts;
drop policy if exists "Tenant update shop_accounts" on public.shop_accounts;
drop policy if exists "Admin update shop_accounts" on public.shop_accounts;
create policy "Tenant update shop_accounts"
  on public.shop_accounts for update to anon, authenticated
  using (
    id = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any(array['OWNER','LEGACY']::text[])
  )
  with check (
    id = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any(array['OWNER','LEGACY']::text[])
  );
create policy "Admin update shop_accounts"
  on public.shop_accounts for update to authenticated
  using (public.is_beboss_admin())
  with check (public.is_beboss_admin());

-- Registered devices: owner/manager controls only their own tenant's registry.
drop policy if exists "Tenant or admin insert shop_devices" on public.shop_devices;
drop policy if exists "Tenant insert shop_devices" on public.shop_devices;
drop policy if exists "Admin insert shop_devices" on public.shop_devices;
create policy "Tenant insert shop_devices"
  on public.shop_devices for insert to anon, authenticated
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any(array['OWNER','MANAGER','LEGACY']::text[])
  );
create policy "Admin insert shop_devices"
  on public.shop_devices for insert to authenticated
  with check (public.is_beboss_admin());

drop policy if exists "Tenant or admin update shop_devices" on public.shop_devices;
drop policy if exists "Tenant update shop_devices" on public.shop_devices;
drop policy if exists "Admin update shop_devices" on public.shop_devices;
create policy "Tenant update shop_devices"
  on public.shop_devices for update to anon, authenticated
  using (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any(array['OWNER','MANAGER','LEGACY']::text[])
  )
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any(array['OWNER','MANAGER','LEGACY']::text[])
  );
create policy "Admin update shop_devices"
  on public.shop_devices for update to authenticated
  using (public.is_beboss_admin())
  with check (public.is_beboss_admin());

-- Staff directory changes require shop owner or an unmigrated legacy client.
drop policy if exists "Tenant or admin insert shop_users" on public.shop_users;
drop policy if exists "Tenant insert shop_users" on public.shop_users;
drop policy if exists "Admin insert shop_users" on public.shop_users;
create policy "Tenant insert shop_users"
  on public.shop_users for insert to anon, authenticated
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any(array['OWNER','LEGACY']::text[])
  );
create policy "Admin insert shop_users"
  on public.shop_users for insert to authenticated
  with check (public.is_beboss_admin());

drop policy if exists "Tenant or admin update shop_users" on public.shop_users;
drop policy if exists "Tenant update shop_users" on public.shop_users;
drop policy if exists "Admin update shop_users" on public.shop_users;
create policy "Tenant update shop_users"
  on public.shop_users for update to anon, authenticated
  using (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any(array['OWNER','LEGACY']::text[])
  )
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any(array['OWNER','LEGACY']::text[])
  );
create policy "Admin update shop_users"
  on public.shop_users for update to authenticated
  using (public.is_beboss_admin())
  with check (public.is_beboss_admin());

-- Unlock-code redemption is tenant-bound; code issuance/admin mutations remain
-- restricted to authenticated platform administrators.
drop policy if exists "Tenant redeem or admin update unlock_codes" on public.unlock_codes;
drop policy if exists "Tenant redeem unlock_codes" on public.unlock_codes;
drop policy if exists "Admin update unlock_codes" on public.unlock_codes;
create policy "Tenant redeem unlock_codes"
  on public.unlock_codes for update to anon, authenticated
  using (
    public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key()
    and status = any(array['ISSUED','REDEEMED']::text[])
  )
  with check (
    status = 'REDEEMED'
    and public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key()
  );
create policy "Admin update unlock_codes"
  on public.unlock_codes for update to authenticated
  using (public.is_beboss_admin())
  with check (public.is_beboss_admin());

-- No anonymous policy may invoke a platform administrator/staff predicate.
do $migration$
begin
  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and ('anon' = any(p.roles) or 'public' = any(p.roles))
      and (
        coalesce(p.qual, '') ilike '%is_beboss_admin%'
        or coalesce(p.with_check, '') ilike '%is_beboss_admin%'
        or coalesce(p.qual, '') ilike '%is_beboss_staff%'
        or coalesce(p.with_check, '') ilike '%is_beboss_staff%'
      )
  ) then
    raise exception 'A public/anonymous RLS policy still invokes a platform admin/staff predicate.';
  end if;
end
$migration$;
