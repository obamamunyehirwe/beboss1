-- Keep anonymous tenant access and authenticated staff/admin access in separate
-- Postgres roles. This preserves the previous permissive-policy union while avoiding
-- overlapping anon/authenticated policies that force redundant RLS predicate evaluation.
--
-- IMPORTANT: authenticated policies explicitly OR the original tenant predicate with
-- the staff/admin predicate. Anonymous policies contain only tenant rules and never
-- invoke staff-only authorization helpers.

-- ANNOUNCEMENTS
drop policy if exists "Staff read announcements" on public.announcements;
drop policy if exists "Tenant read announcements" on public.announcements;

create policy "Tenant read announcements"
  on public.announcements for select to anon
  using (
    is_active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
    and (target_shop_key = '' or target_shop_key = public.current_shop_sync_key())
    and (
      (public.current_shop_sync_key() = '' and audience = any (array['ALL','WEBSITE']))
      or (public.current_shop_sync_key() <> '' and audience = any (array['ALL','APP']))
    )
  );

create policy "Staff read announcements"
  on public.announcements for select to authenticated
  using (
    public.is_beboss_staff()
    or (
      is_active
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
      and (target_shop_key = '' or target_shop_key = public.current_shop_sync_key())
      and (
        (public.current_shop_sync_key() = '' and audience = any (array['ALL','WEBSITE']))
        or (public.current_shop_sync_key() <> '' and audience = any (array['ALL','APP']))
      )
    )
  );

-- BRANCH SYNC SNAPSHOTS
drop policy if exists "Admin insert snapshots" on public.branch_sync_snapshots;
drop policy if exists "Tenant insert snapshots" on public.branch_sync_snapshots;
drop policy if exists "Staff read snapshots" on public.branch_sync_snapshots;
drop policy if exists "Tenant read snapshots" on public.branch_sync_snapshots;
drop policy if exists "Admin update snapshots" on public.branch_sync_snapshots;
drop policy if exists "Tenant update snapshots" on public.branch_sync_snapshots;

create policy "Tenant insert snapshots" on public.branch_sync_snapshots
  for insert to anon
  with check (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');
create policy "Admin insert snapshots" on public.branch_sync_snapshots
  for insert to authenticated
  with check (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
  );

create policy "Tenant read snapshots" on public.branch_sync_snapshots
  for select to anon
  using (shop_sync_key = public.current_shop_sync_key());
create policy "Staff read snapshots" on public.branch_sync_snapshots
  for select to authenticated
  using (public.is_beboss_staff() or shop_sync_key = public.current_shop_sync_key());

create policy "Tenant update snapshots" on public.branch_sync_snapshots
  for update to anon
  using (shop_sync_key = public.current_shop_sync_key())
  with check (shop_sync_key = public.current_shop_sync_key());
create policy "Admin update snapshots" on public.branch_sync_snapshots
  for update to authenticated
  using (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key())
  with check (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key());

-- DEVICE SECURITY TELEMETRY
drop policy if exists "Admin insert device security telemetry" on public.device_security_telemetry;
drop policy if exists "Tenant insert device security telemetry" on public.device_security_telemetry;
drop policy if exists "Staff read device security telemetry" on public.device_security_telemetry;
drop policy if exists "Tenant read device security telemetry" on public.device_security_telemetry;
drop policy if exists "Admin update device security telemetry" on public.device_security_telemetry;
drop policy if exists "Tenant update device security telemetry" on public.device_security_telemetry;

create policy "Tenant insert device security telemetry" on public.device_security_telemetry
  for insert to anon
  with check (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');
create policy "Admin insert device security telemetry" on public.device_security_telemetry
  for insert to authenticated
  with check (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
  );

create policy "Tenant read device security telemetry" on public.device_security_telemetry
  for select to anon
  using (shop_sync_key = public.current_shop_sync_key());
create policy "Staff read device security telemetry" on public.device_security_telemetry
  for select to authenticated
  using (public.is_beboss_staff() or shop_sync_key = public.current_shop_sync_key());

create policy "Tenant update device security telemetry" on public.device_security_telemetry
  for update to anon
  using (shop_sync_key = public.current_shop_sync_key())
  with check (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');
create policy "Admin update device security telemetry" on public.device_security_telemetry
  for update to authenticated
  using (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key())
  with check (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
  );

-- PAYMENT REQUESTS
drop policy if exists "Admin insert payment_requests" on public.payment_requests;
drop policy if exists "Tenant insert payment_requests" on public.payment_requests;
drop policy if exists "Staff read payment_requests" on public.payment_requests;
drop policy if exists "Tenant read payment_requests" on public.payment_requests;
drop policy if exists "Admin update payment_requests" on public.payment_requests;
drop policy if exists "Tenant redeem payment_requests" on public.payment_requests;

create policy "Tenant insert payment_requests" on public.payment_requests
  for insert to anon
  with check (
    public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
    and public.current_shop_sync_key() <> ''
    and status = 'PENDING_VERIFICATION'
  );
create policy "Admin insert payment_requests" on public.payment_requests
  for insert to authenticated
  with check (
    public.is_beboss_admin()
    or (
      public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
      and public.current_shop_sync_key() <> ''
      and status = 'PENDING_VERIFICATION'
    )
  );

create policy "Tenant read payment_requests" on public.payment_requests
  for select to anon
  using (public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key());
create policy "Staff read payment_requests" on public.payment_requests
  for select to authenticated
  using (
    public.is_beboss_staff()
    or public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
  );

create policy "Tenant redeem payment_requests" on public.payment_requests
  for update to anon
  using (
    public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
    and status = any (array['APPROVED','REDEEMED'])
  )
  with check (
    status = 'REDEEMED'
    and public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
  );
create policy "Admin update payment_requests" on public.payment_requests
  for update to authenticated
  using (
    public.is_beboss_admin()
    or (
      public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
      and status = any (array['APPROVED','REDEEMED'])
    )
  )
  with check (
    public.is_beboss_admin()
    or (
      status = 'REDEEMED'
      and public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
    )
  );

-- SHOP ACCOUNTS
drop policy if exists "Admin insert shop_accounts" on public.shop_accounts;
drop policy if exists "Tenant insert shop_accounts" on public.shop_accounts;
drop policy if exists "Staff read shop_accounts" on public.shop_accounts;
drop policy if exists "Tenant read shop_accounts" on public.shop_accounts;
drop policy if exists "Admin update shop_accounts" on public.shop_accounts;
drop policy if exists "Tenant update shop_accounts" on public.shop_accounts;

create policy "Tenant insert shop_accounts" on public.shop_accounts
  for insert to anon
  with check (
    id = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
  );
create policy "Admin insert shop_accounts" on public.shop_accounts
  for insert to authenticated
  with check (
    public.is_beboss_admin()
    or (
      id = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
    )
  );

create policy "Tenant read shop_accounts" on public.shop_accounts
  for select to anon
  using (id = public.current_shop_sync_key());
create policy "Staff read shop_accounts" on public.shop_accounts
  for select to authenticated
  using (public.is_beboss_staff() or id = public.current_shop_sync_key());

create policy "Tenant update shop_accounts" on public.shop_accounts
  for update to anon
  using (
    id = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
  )
  with check (
    id = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
  );
create policy "Admin update shop_accounts" on public.shop_accounts
  for update to authenticated
  using (
    public.is_beboss_admin()
    or (
      id = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
    )
  )
  with check (
    public.is_beboss_admin()
    or (
      id = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
    )
  );

-- SHOP BRANCHES
drop policy if exists "Admin insert shop_branches" on public.shop_branches;
drop policy if exists "Tenant insert shop_branches" on public.shop_branches;
drop policy if exists "Staff read shop_branches" on public.shop_branches;
drop policy if exists "Tenant read shop_branches" on public.shop_branches;
drop policy if exists "Admin update shop_branches" on public.shop_branches;
drop policy if exists "Tenant update shop_branches" on public.shop_branches;

create policy "Tenant insert shop_branches" on public.shop_branches
  for insert to anon
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and shop_sync_key <> ''
    and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
  );
create policy "Admin insert shop_branches" on public.shop_branches
  for insert to authenticated
  with check (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and shop_sync_key <> ''
      and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
    )
  );

create policy "Tenant read shop_branches" on public.shop_branches
  for select to anon
  using (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');
create policy "Staff read shop_branches" on public.shop_branches
  for select to authenticated
  using (
    public.is_beboss_staff()
    or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
  );

create policy "Tenant update shop_branches" on public.shop_branches
  for update to anon
  using (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
  )
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
  );
create policy "Admin update shop_branches" on public.shop_branches
  for update to authenticated
  using (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
    )
  )
  with check (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
    )
  );

-- SHOP DEVICES
drop policy if exists "Admin insert shop_devices" on public.shop_devices;
drop policy if exists "Tenant insert shop_devices" on public.shop_devices;
drop policy if exists "Staff read shop_devices" on public.shop_devices;
drop policy if exists "Tenant read shop_devices" on public.shop_devices;
drop policy if exists "Admin update shop_devices" on public.shop_devices;
drop policy if exists "Tenant update shop_devices" on public.shop_devices;

create policy "Tenant insert shop_devices" on public.shop_devices
  for insert to anon
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
  );
create policy "Admin insert shop_devices" on public.shop_devices
  for insert to authenticated
  with check (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
    )
  );

create policy "Tenant read shop_devices" on public.shop_devices
  for select to anon
  using (shop_sync_key = public.current_shop_sync_key());
create policy "Staff read shop_devices" on public.shop_devices
  for select to authenticated
  using (public.is_beboss_staff() or shop_sync_key = public.current_shop_sync_key());

create policy "Tenant update shop_devices" on public.shop_devices
  for update to anon
  using (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
  )
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
  );
create policy "Admin update shop_devices" on public.shop_devices
  for update to authenticated
  using (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
    )
  )
  with check (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
    )
  );

-- SHOP STOCK TRANSFERS
drop policy if exists "Admin insert shop_stock_transfers" on public.shop_stock_transfers;
drop policy if exists "Tenant insert shop_stock_transfers" on public.shop_stock_transfers;
drop policy if exists "Staff read shop_stock_transfers" on public.shop_stock_transfers;
drop policy if exists "Tenant read shop_stock_transfers" on public.shop_stock_transfers;
drop policy if exists "Admin update shop_stock_transfers" on public.shop_stock_transfers;
drop policy if exists "Tenant update shop_stock_transfers" on public.shop_stock_transfers;

create policy "Tenant insert shop_stock_transfers" on public.shop_stock_transfers
  for insert to anon
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and shop_sync_key <> ''
    and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
  );
create policy "Admin insert shop_stock_transfers" on public.shop_stock_transfers
  for insert to authenticated
  with check (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and shop_sync_key <> ''
      and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
    )
  );

create policy "Tenant read shop_stock_transfers" on public.shop_stock_transfers
  for select to anon
  using (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');
create policy "Staff read shop_stock_transfers" on public.shop_stock_transfers
  for select to authenticated
  using (
    public.is_beboss_staff()
    or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
  );

create policy "Tenant update shop_stock_transfers" on public.shop_stock_transfers
  for update to anon
  using (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
  )
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
  );
create policy "Admin update shop_stock_transfers" on public.shop_stock_transfers
  for update to authenticated
  using (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
    )
  )
  with check (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','MANAGER','LEGACY'])
    )
  );

-- SHOP USERS
drop policy if exists "Admin insert shop_users" on public.shop_users;
drop policy if exists "Tenant insert shop_users" on public.shop_users;
drop policy if exists "Staff read shop_users" on public.shop_users;
drop policy if exists "Tenant read shop_users" on public.shop_users;
drop policy if exists "Admin update shop_users" on public.shop_users;
drop policy if exists "Tenant update shop_users" on public.shop_users;

create policy "Tenant insert shop_users" on public.shop_users
  for insert to anon
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
  );
create policy "Admin insert shop_users" on public.shop_users
  for insert to authenticated
  with check (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
    )
  );

create policy "Tenant read shop_users" on public.shop_users
  for select to anon
  using (shop_sync_key = public.current_shop_sync_key());
create policy "Staff read shop_users" on public.shop_users
  for select to authenticated
  using (public.is_beboss_staff() or shop_sync_key = public.current_shop_sync_key());

create policy "Tenant update shop_users" on public.shop_users
  for update to anon
  using (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
  )
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
  );
create policy "Admin update shop_users" on public.shop_users
  for update to authenticated
  using (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
    )
  )
  with check (
    public.is_beboss_admin()
    or (
      shop_sync_key = public.current_shop_sync_key()
      and public.current_shop_actor_role() = any (array['OWNER','LEGACY'])
    )
  );

-- UNLOCK CODES
drop policy if exists "Staff read unlock_codes" on public.unlock_codes;
drop policy if exists "Tenant read unlock_codes" on public.unlock_codes;
drop policy if exists "Admin update unlock_codes" on public.unlock_codes;
drop policy if exists "Tenant redeem unlock_codes" on public.unlock_codes;

create policy "Tenant read unlock_codes" on public.unlock_codes
  for select to anon
  using (public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key());
create policy "Staff read unlock_codes" on public.unlock_codes
  for select to authenticated
  using (
    public.is_beboss_staff()
    or public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key()
  );

create policy "Tenant redeem unlock_codes" on public.unlock_codes
  for update to anon
  using (
    public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key()
    and status = any (array['ISSUED','REDEEMED'])
  )
  with check (
    status = 'REDEEMED'
    and public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key()
  );
create policy "Admin update unlock_codes" on public.unlock_codes
  for update to authenticated
  using (
    public.is_beboss_admin()
    or (
      public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key()
      and status = any (array['ISSUED','REDEEMED'])
    )
  )
  with check (
    public.is_beboss_admin()
    or (
      status = 'REDEEMED'
      and public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key()
    )
  );
