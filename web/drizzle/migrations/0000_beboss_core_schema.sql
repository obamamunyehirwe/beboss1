-- ============ ROLES ============
create type public.app_role as enum ('admin', 'support');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create or replace function public.is_beboss_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and public.has_role(auth.uid(), 'admin') $$;

create or replace function public.is_beboss_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'support')) $$;

create policy "Users read own roles; admins read all" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.is_beboss_admin());

-- ============ ADMIN PROFILES ============
create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default 'BeBoss Master Admin',
  role text not null default 'SUPER_ADMIN',
  is_active boolean not null default true,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
grant select, insert, update on public.admin_profiles to authenticated;
grant all on public.admin_profiles to service_role;
alter table public.admin_profiles enable row level security;
create policy "Staff read own profile; admins all" on public.admin_profiles
  for select to authenticated using (user_id = auth.uid() or public.is_beboss_admin());
create policy "Staff insert own profile" on public.admin_profiles
  for insert to authenticated with check (user_id = auth.uid() and public.is_beboss_staff());
create policy "Own or admin update profile" on public.admin_profiles
  for update to authenticated using (user_id = auth.uid() or public.is_beboss_admin())
  with check (user_id = auth.uid() or public.is_beboss_admin());

create table public.admin_bootstrap_emails (
  email text primary key
);
grant all on public.admin_bootstrap_emails to service_role;
alter table public.admin_bootstrap_emails enable row level security;
insert into public.admin_bootstrap_emails (email) values ('obamamunyehirwe@gmail.com');

create or replace function public.handle_admin_bootstrap()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and exists (select 1 from public.admin_bootstrap_emails b where lower(b.email) = lower(new.email)) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin') on conflict do nothing;
    insert into public.admin_profiles (user_id, email, full_name)
      values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', 'BeBoss Master Admin'))
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_admin_bootstrap_insert
  after insert on auth.users for each row execute function public.handle_admin_bootstrap();
create trigger on_auth_user_admin_bootstrap_confirm
  after update of email_confirmed_at on auth.users for each row execute function public.handle_admin_bootstrap();

-- ============ TENANT HELPERS ============
create or replace function public.current_shop_sync_key()
returns text language sql stable
as $$
  select coalesce(nullif(trim((current_setting('request.headers', true)::json ->> 'x-shop-sync-key')), ''), '');
$$;

create or replace function public.computed_shop_sync_key(p_username text, p_phone text)
returns text language sql immutable
as $$
  select lower(coalesce(nullif(trim(p_username), ''), 'owner'))
    || '_'
    || coalesce(nullif(right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 9), ''), '000000000');
$$;

create or replace function public.now_ms()
returns bigint language sql stable as $$ select (extract(epoch from now()) * 1000)::bigint $$;

-- ============ APP CONFIG ============
create table public.app_config (
  id text primary key default 'global',
  admin_whatsapp_number text not null default '',
  mtn_momo_code text not null default '054321',
  mtn_momo_phone text not null default '0788765432',
  mtn_recipient_name text not null default 'BeBoss Pay',
  airtel_money_phone text not null default '0738765432',
  airtel_recipient_name text not null default 'BeBoss Pay',
  per_device_fee_rwf integer not null default 2000,
  apk_download_url text not null default '',
  apk_version text not null default '2.3.0',
  support_email text not null default '',
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
grant select on public.app_config to anon, authenticated;
grant insert, update on public.app_config to authenticated;
grant all on public.app_config to service_role;
alter table public.app_config enable row level security;
insert into public.app_config (id) values ('global') on conflict (id) do nothing;
create policy "Anyone reads app_config" on public.app_config for select using (true);
create policy "Admin inserts app_config" on public.app_config for insert to authenticated with check (public.is_beboss_admin());
create policy "Admin updates app_config" on public.app_config for update to authenticated using (public.is_beboss_admin()) with check (public.is_beboss_admin());

-- ============ PRICING ============
create or replace function public.compute_expected_subscription_fee(
  p_branch_count integer, p_worker_count integer, p_duration_months integer, p_device_count integer default 1
) returns integer language plpgsql stable set search_path = public
as $$
declare
  v_branches integer := greatest(coalesce(p_branch_count, 1), 1);
  v_workers integer := greatest(coalesce(p_worker_count, 1), 1);
  v_devices integer := greatest(coalesce(p_device_count, 1), 1);
  v_months integer := greatest(coalesce(p_duration_months, 1), 1);
  v_monthly integer;
  v_gross integer;
  v_discount integer;
begin
  v_monthly := (case when v_branches <= 1 then 5000 when v_branches = 2 then 10000 else 20000 end)
    + (case when v_workers <= 1 then 0 when v_workers <= 3 then 2000 when v_workers <= 5 then 4000 else 4000 + (v_workers - 5) * 1000 end)
    + greatest(v_devices - 1, 0) * 2000;
  v_gross := v_monthly * v_months;
  v_discount := case when v_months = 12 then 20 when v_months = 3 then 10 else 0 end;
  return v_gross - ((v_gross * v_discount) / 100);
end;
$;

-- Every additional POS device has a fixed 2,000 FRw monthly rate.
-- The four-argument helper above remains for existing shop pricing screens.
create or replace function public.compute_expected_subscription_fee_with_rate(
  p_branch_count integer,
  p_worker_count integer,
  p_duration_months integer,
  p_device_count integer,
  p_device_rate integer
) returns integer language plpgsql stable set search_path = public
as $
declare
  v_branches integer := greatest(coalesce(p_branch_count, 1), 1);
  v_workers integer := greatest(coalesce(p_worker_count, 1), 1);
  v_devices integer := greatest(coalesce(p_device_count, 1), 1);
  v_months integer := greatest(coalesce(p_duration_months, 1), 1);
  v_rate integer := 2000;
  v_monthly integer;
  v_gross integer;
  v_discount integer;
begin
  v_monthly := (case when v_branches <= 1 then 5000 when v_branches = 2 then 10000 else 20000 end)
    + (case when v_workers <= 1 then 0 when v_workers <= 3 then 2000 when v_workers <= 5 then 4000 else 4000 + (v_workers - 5) * 1000 end)
    + greatest(v_devices - 1, 0) * v_rate;
  v_gross := v_monthly * v_months;
  v_discount := case when v_months = 12 then 20 when v_months = 3 then 10 else 0 end;
  return v_gross - ((v_gross * v_discount) / 100);
end;
$;

-- ============ SHOP ACCOUNTS ============
create table public.shop_accounts (
  id text primary key,
  shop_name text not null,
  owner_name text not null default '',
  owner_username text not null,
  owner_phone text not null,
  device_challenge text not null default '',
  lan_sync_secret text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  branch_count integer not null default 1,
  worker_count integer not null default 1,
  device_count integer not null default 1,
  device_limit integer not null default 1,
  admin_whatsapp text not null default '',
  auto_unlocked_at bigint not null default 0,
  monthly_fee_rwf integer not null default 5000,
  subscription_status text not null default 'TRIAL',
  subscription_expires_at bigint not null default ((extract(epoch from now()) + 345600) * 1000)::bigint,
  remote_kill_switch boolean not null default false,
  min_app_version text not null default '2.1.0',
  server_failed_pin_attempts integer not null default 0,
  admin_notes text not null default '',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
grant select, insert, update on public.shop_accounts to anon;
grant select, insert, update, delete on public.shop_accounts to authenticated;
grant all on public.shop_accounts to service_role;
alter table public.shop_accounts enable row level security;
create index idx_shop_accounts_username on public.shop_accounts(owner_username);
create index idx_shop_accounts_updated on public.shop_accounts(updated_at desc);

create policy "Tenant or staff read shop_accounts" on public.shop_accounts for select
  using (public.is_beboss_staff() or id = public.current_shop_sync_key());
create policy "Tenant or admin insert shop_accounts" on public.shop_accounts for insert
  with check (public.is_beboss_admin() or (id = public.current_shop_sync_key() and id <> ''));
create policy "Tenant or admin update shop_accounts" on public.shop_accounts for update
  using (public.is_beboss_admin() or id = public.current_shop_sync_key())
  with check (public.is_beboss_admin() or id = public.current_shop_sync_key());
create policy "Admin delete shop_accounts" on public.shop_accounts for delete to authenticated
  using (public.is_beboss_admin());

create or replace function public.guard_shop_account_admin_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if public.is_beboss_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.remote_kill_switch := false;
    new.auto_unlocked_at := 0;
    new.admin_notes := '';
    new.created_at := public.now_ms();
    if new.subscription_status not in ('TRIAL', 'ACTIVE', 'EXPIRED') then
      new.subscription_status := 'TRIAL';
    end if;
    return new;
  end if;
  new.remote_kill_switch := old.remote_kill_switch;
  new.min_app_version := old.min_app_version;
  new.auto_unlocked_at := old.auto_unlocked_at;
  new.admin_notes := old.admin_notes;
  new.created_at := old.created_at;
  new.device_limit := greatest(old.device_limit, 1);
  if old.subscription_status = 'SUSPENDED' then
    new.subscription_status := 'SUSPENDED';
  end if;
  return new;
end;
$$;
create trigger trg_guard_shop_account before insert or update on public.shop_accounts
  for each row execute function public.guard_shop_account_admin_fields();

-- ============ SHOP USERS ============
create table public.shop_users (
  id text primary key,
  shop_sync_key text not null,
  shop_name text not null default '',
  user_id text not null,
  full_name text not null default '',
  username text not null,
  phone text not null default '',
  role text not null default 'CASHIER',
  assigned_branch_id text not null default '',
  assigned_branch_name text not null default 'All Branches',
  is_active boolean not null default true,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
grant select, insert, update on public.shop_users to anon;
grant select, insert, update, delete on public.shop_users to authenticated;
grant all on public.shop_users to service_role;
alter table public.shop_users enable row level security;
create index idx_shop_users_shop_key on public.shop_users(shop_sync_key);
create index idx_shop_users_username on public.shop_users(username);
create index idx_shop_users_updated on public.shop_users(updated_at desc);
create policy "Tenant or staff read shop_users" on public.shop_users for select
  using (public.is_beboss_staff() or shop_sync_key = public.current_shop_sync_key());
create policy "Tenant or admin insert shop_users" on public.shop_users for insert
  with check (public.is_beboss_admin() or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> ''));
create policy "Tenant or admin update shop_users" on public.shop_users for update
  using (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key())
  with check (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key());
create policy "Admin delete shop_users" on public.shop_users for delete to authenticated
  using (public.is_beboss_admin());

-- ============ SHOP DEVICES ============
create table public.shop_devices (
  id text primary key,
  shop_sync_key text not null,
  shop_name text not null default '',
  device_id text not null default '',
  device_name text not null default '',
  join_code text not null default '',
  assigned_user_id text not null default '',
  assigned_username text not null default '',
  assigned_user_name text not null default '',
  role text not null default 'CASHIER',
  branch_id text not null default 'main_branch',
  branch_name text not null default 'Main Store',
  is_owner_primary boolean not null default false,
  is_active boolean not null default true,
  monthly_fee_addon_rwf integer not null default 2000,
  last_synced_at bigint not null default 0,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
grant select, insert, update, delete on public.shop_devices to anon, authenticated;
grant all on public.shop_devices to service_role;
alter table public.shop_devices enable row level security;
create index idx_shop_devices_shop_key on public.shop_devices(shop_sync_key);
create index idx_shop_devices_join_code on public.shop_devices(join_code);
create policy "Tenant or staff read shop_devices" on public.shop_devices for select
  using (public.is_beboss_staff() or shop_sync_key = public.current_shop_sync_key());
create policy "Tenant or admin insert shop_devices" on public.shop_devices for insert
  with check (public.is_beboss_admin() or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> ''));
create policy "Tenant or admin update shop_devices" on public.shop_devices for update
  using (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key())
  with check (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key());
create policy "Tenant or admin delete shop_devices" on public.shop_devices for delete
  using (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key());

-- ============ PAYMENT REQUESTS ============
create table public.payment_requests (
  id text primary key,
  shop_name text not null,
  owner_username text not null,
  owner_phone text not null,
  device_challenge text not null default '',
  provider text not null default 'MTN MoMo',
  ussd_code text not null default '',
  payer_phone text not null default '',
  payer_full_name text not null default '',
  amount_rwf integer not null default 5000,
  duration_months integer not null default 1,
  branch_count integer not null default 1,
  worker_count integer not null default 1,
  device_count integer not null default 1,
  fee_per_device_rwf integer not null default 0,
  payment_time_ms bigint not null default 0,
  payment_note text not null default '',
  status text not null default 'PENDING_VERIFICATION',
  approval_mode text not null default '',
  generated_unlock_code text not null default '',
  verified_by_admin text not null default '',
  rejection_reason text not null default '',
  source text not null default 'APP',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
grant select, insert, update on public.payment_requests to anon;
grant select, insert, update, delete on public.payment_requests to authenticated;
grant all on public.payment_requests to service_role;
alter table public.payment_requests enable row level security;
create index idx_payment_requests_status on public.payment_requests(status);
create index idx_payment_requests_username on public.payment_requests(owner_username);
create index idx_payment_requests_created on public.payment_requests(created_at desc);

create or replace function public.enforce_payment_request_server_fee()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.branch_count := greatest(coalesce(new.branch_count, 1), 1);
  new.worker_count := greatest(coalesce(new.worker_count, 1), 1);
  new.device_count := greatest(coalesce(new.device_count, 1), 1);
  new.duration_months := greatest(coalesce(new.duration_months, 1), 1);
  -- Always overwrite a client-provided rate with the trusted database config.
  select coalesce(nullif(per_device_fee_rwf, 0), 2000)
    into new.fee_per_device_rwf
    from public.app_config where id = 'global';
  new.fee_per_device_rwf := coalesce(nullif(new.fee_per_device_rwf, 0), 2000);
  new.payment_time_ms := coalesce(nullif(new.payment_time_ms, 0), nullif(new.created_at, 0), public.now_ms());
  new.payment_note := coalesce(new.payment_note, '');
  new.amount_rwf := public.compute_expected_subscription_fee_with_rate(
    new.branch_count, new.worker_count, new.duration_months, new.device_count, new.fee_per_device_rwf
  );
  return new;
end;
$$;
create trigger trg_recompute_payment_request_fee before insert on public.payment_requests
  for each row execute function public.enforce_payment_request_server_fee();

create policy "Tenant or staff read payment_requests" on public.payment_requests for select
  using (public.is_beboss_staff() or public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key());
create policy "Tenant or admin insert payment_requests" on public.payment_requests for insert
  with check (public.is_beboss_admin() or (
    public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
    and public.current_shop_sync_key() <> '' and status = 'PENDING_VERIFICATION'));
create policy "Tenant redeem or admin update payment_requests" on public.payment_requests for update
  using (public.is_beboss_admin() or ((public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()) and status in ('APPROVED', 'REDEEMED')))
  with check (public.is_beboss_admin() or ((status = 'REDEEMED') and (public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key())));
create policy "Admin delete payment_requests" on public.payment_requests for delete to authenticated
  using (public.is_beboss_admin());

-- ============ UNLOCK CODES ============
create table public.unlock_codes (
  id text primary key,
  unlock_code text not null unique,
  shop_username text not null,
  shop_phone text not null,
  device_challenge text not null default '',
  tier_code text not null default 'SINGLE',
  plan_days integer not null default 30,
  amount_rwf integer not null default 5000,
  payment_request_id text references public.payment_requests(id) on delete set null,
  duration_months integer not null default 1,
  branch_count integer not null default 1,
  worker_count integer not null default 1,
  device_count integer not null default 1,
  payment_time_ms bigint not null default 0,
  payment_provider text not null default '',
  payer_phone text not null default '',
  payer_full_name text not null default '',
  payment_note text not null default '',
  plan_digest text not null default '',
  status text not null default 'ISSUED',
  issued_by_admin text not null default 'BeBoss Master Admin',
  issued_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  redeemed_at bigint
);
grant select, update on public.unlock_codes to anon;
grant select, insert, update, delete on public.unlock_codes to authenticated;
grant all on public.unlock_codes to service_role;
alter table public.unlock_codes enable row level security;
create index idx_unlock_codes_username on public.unlock_codes(shop_username);
create index idx_unlock_codes_issued on public.unlock_codes(issued_at desc);
create unique index unlock_codes_one_active_per_payment_request_uidx
  on public.unlock_codes(payment_request_id)
  where payment_request_id is not null and status <> 'REVOKED';
create policy "Tenant or staff read unlock_codes" on public.unlock_codes for select
  using (public.is_beboss_staff() or public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key());
create policy "Admin insert unlock_codes" on public.unlock_codes for insert to authenticated
  with check (public.is_beboss_admin());
create policy "Tenant redeem or admin update unlock_codes" on public.unlock_codes for update
  using (public.is_beboss_admin() or ((public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key()) and status in ('ISSUED', 'REDEEMED')))
  with check (public.is_beboss_admin() or ((status = 'REDEEMED') and (public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key())));
create policy "Admin delete unlock_codes" on public.unlock_codes for delete to authenticated
  using (public.is_beboss_admin());

create or replace function public.guard_tenant_redeem_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if public.is_beboss_admin()
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_setting('request.headers', true) is null then
    return new;
  end if;
  if tg_table_name = 'unlock_codes' then
    return jsonb_populate_record(old, jsonb_build_object('status', new.status, 'redeemed_at', coalesce(new.redeemed_at, public.now_ms())));
  end if;
  return jsonb_populate_record(old, jsonb_build_object('status', new.status, 'updated_at', public.now_ms()));
end;
$$;
create trigger zz_guard_tenant_redeem_codes before update on public.unlock_codes for each row execute function public.guard_tenant_redeem_fields();
create trigger zz_guard_tenant_redeem_payments before update on public.payment_requests for each row execute function public.guard_tenant_redeem_fields();

-- ============ BRANCH SYNC SNAPSHOTS ============
create table public.branch_sync_snapshots (
  id text primary key,
  shop_sync_key text not null,
  device_id text not null,
  branch_id text not null default 'main_branch',
  branch_name text not null default 'Main Store',
  shop_name text not null default '',
  owner_username text not null default '',
  payload_token text not null,
  records_summary text not null default '',
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
grant select, insert, update on public.branch_sync_snapshots to anon;
grant select, insert, update, delete on public.branch_sync_snapshots to authenticated;
grant all on public.branch_sync_snapshots to service_role;
alter table public.branch_sync_snapshots enable row level security;
create index idx_branch_sync_shop_key on public.branch_sync_snapshots(shop_sync_key);
create index idx_branch_sync_updated on public.branch_sync_snapshots(updated_at desc);
create policy "Tenant or staff read snapshots" on public.branch_sync_snapshots for select
  using (public.is_beboss_staff() or shop_sync_key = public.current_shop_sync_key());
create policy "Tenant or admin insert snapshots" on public.branch_sync_snapshots for insert
  with check (public.is_beboss_admin() or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> ''));
create policy "Tenant or admin update snapshots" on public.branch_sync_snapshots for update
  using (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key())
  with check (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key());
create policy "Admin delete snapshots" on public.branch_sync_snapshots for delete to authenticated
  using (public.is_beboss_admin());

-- ============ ADMIN AUDIT LOGS ============
create table public.admin_audit_logs (
  id text primary key default gen_random_uuid()::text,
  admin_email text not null,
  action text not null,
  target_id text not null default '',
  details text not null default '',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
grant select, insert on public.admin_audit_logs to authenticated;
grant all on public.admin_audit_logs to service_role;
alter table public.admin_audit_logs enable row level security;
create index idx_admin_audit_created on public.admin_audit_logs(created_at desc);
create policy "Staff read audit logs" on public.admin_audit_logs for select to authenticated using (public.is_beboss_staff());
create policy "Admin insert audit logs" on public.admin_audit_logs for insert to authenticated with check (public.is_beboss_admin());

-- ============ APP RELEASES ============
create table public.app_releases (
  id uuid primary key default gen_random_uuid(),
  version_name text not null,
  version_code integer not null default 1,
  file_path text not null,
  file_url text not null,
  file_name text not null,
  size_bytes bigint not null default 0,
  sha256 text not null default '',
  min_android text not null default 'Android 7.0+',
  release_notes text not null default '',
  is_current boolean not null default false,
  download_count integer not null default 0,
  created_by text not null default '',
  published_at timestamptz not null default now()
);
grant select on public.app_releases to anon;
grant select, insert, update, delete on public.app_releases to authenticated;
grant all on public.app_releases to service_role;
alter table public.app_releases enable row level security;
create unique index idx_app_releases_one_current on public.app_releases(is_current) where is_current;
create policy "Anyone reads releases" on public.app_releases for select using (true);
create policy "Admin insert releases" on public.app_releases for insert to authenticated with check (public.is_beboss_admin());
create policy "Admin update releases" on public.app_releases for update to authenticated using (public.is_beboss_admin()) with check (public.is_beboss_admin());
create policy "Admin delete releases" on public.app_releases for delete to authenticated using (public.is_beboss_admin());

create table public.apk_downloads (
  id uuid primary key default gen_random_uuid(),
  release_id uuid references public.app_releases(id) on delete cascade,
  channel text not null default 'web',
  created_at timestamptz not null default now()
);
grant select on public.apk_downloads to authenticated;
grant all on public.apk_downloads to service_role;
alter table public.apk_downloads enable row level security;
create index idx_apk_downloads_created on public.apk_downloads(created_at desc);
create policy "Staff read downloads" on public.apk_downloads for select to authenticated using (public.is_beboss_staff());

create or replace function public.record_apk_download(p_release_id uuid, p_channel text default 'web')
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.app_releases where id = p_release_id) then
    return;
  end if;
  insert into public.apk_downloads (release_id, channel)
    values (p_release_id, left(coalesce(nullif(p_channel, ''), 'web'), 20));
  update public.app_releases set download_count = download_count + 1 where id = p_release_id;
end;
$$;
grant execute on function public.record_apk_download(uuid, text) to anon, authenticated;

-- ============ CONTACT / SUPPORT INBOX ============
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null default '',
  email text not null default '',
  shop_name text not null default '',
  topic text not null default 'GENERAL',
  message text not null,
  status text not null default 'NEW',
  admin_reply_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;
grant all on public.contact_messages to service_role;
alter table public.contact_messages enable row level security;
create index idx_contact_messages_created on public.contact_messages(created_at desc);
create policy "Anyone submits a contact message" on public.contact_messages for insert
  with check (
    status = 'NEW' and admin_reply_note = ''
    and char_length(full_name) between 2 and 120
    and char_length(message) between 5 and 4000
    and char_length(phone) <= 30 and char_length(email) <= 200 and char_length(shop_name) <= 160
    and topic in ('GENERAL','SALES','SUPPORT','PAYMENT','PARTNERSHIP')
  );
create policy "Staff read contact messages" on public.contact_messages for select to authenticated using (public.is_beboss_staff());
create policy "Staff update contact messages" on public.contact_messages for update to authenticated using (public.is_beboss_staff()) with check (public.is_beboss_staff());
create policy "Admin delete contact messages" on public.contact_messages for delete to authenticated using (public.is_beboss_admin());

-- ============ RELEASES STORAGE POLICIES ============
create policy "Admins upload releases" on storage.objects for insert to authenticated
  with check (bucket_id = 'releases' and public.is_beboss_admin());
create policy "Admins read releases" on storage.objects for select to authenticated
  using (bucket_id = 'releases' and public.is_beboss_admin());
create policy "Admins update releases" on storage.objects for update to authenticated
  using (bucket_id = 'releases' and public.is_beboss_admin());
create policy "Admins delete releases" on storage.objects for delete to authenticated
  using (bucket_id = 'releases' and public.is_beboss_admin());

-- ============ SERVER-ONLY SECRETS ============
create table public.app_secrets (
  name text primary key,
  value text not null,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);
grant all on public.app_secrets to service_role;
alter table public.app_secrets enable row level security;

-- ============ LIVE CLOUD SYNC ACTIVITY ============
create table public.cloud_sync_events (
  id bigint generated always as identity primary key,
  shop_sync_key text not null default '',
  shop_name text not null default '',
  entity text not null,
  action text not null,
  actor text not null default 'APP',
  device_id text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index cloud_sync_events_created_idx on public.cloud_sync_events (created_at desc);
create index cloud_sync_events_shop_idx on public.cloud_sync_events (shop_sync_key, created_at desc);
grant select on public.cloud_sync_events to authenticated;
grant all on public.cloud_sync_events to service_role;
alter table public.cloud_sync_events enable row level security;
create policy "Staff read sync events" on public.cloud_sync_events
  for select to authenticated using (public.is_beboss_staff());

create or replace function public.log_cloud_sync_event()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_key text := '';
  v_shop text := '';
  v_entity text := '';
  v_action text := '';
  v_device text := '';
  v_detail text := '';
  v_material boolean := true;
  v_actor text;
  r record;
begin
  begin
    if tg_op = 'DELETE' then r := old; else r := new; end if;
    v_actor := case
      when public.is_beboss_admin() then 'ADMIN'
      when public.current_shop_sync_key() <> '' then 'APP'
      else 'SYSTEM' end;

    if tg_table_name = 'shop_accounts' then
      v_key := r.id; v_shop := r.shop_name; v_entity := 'SHOP';
      if tg_op = 'INSERT' then v_action := 'REGISTERED'; v_detail := r.subscription_status || ' • ' || r.branch_count || ' branch(es)';
      elsif tg_op = 'DELETE' then v_action := 'DELETED';
      else
        v_material := (old.subscription_status is distinct from new.subscription_status)
          or (old.subscription_expires_at is distinct from new.subscription_expires_at)
          or (old.branch_count is distinct from new.branch_count)
          or (old.worker_count is distinct from new.worker_count)
          or (old.device_count is distinct from new.device_count)
          or (old.remote_kill_switch is distinct from new.remote_kill_switch);
        if old.subscription_status is distinct from new.subscription_status then
          v_action := 'STATUS_CHANGED'; v_detail := old.subscription_status || ' → ' || new.subscription_status;
        elsif old.subscription_expires_at is distinct from new.subscription_expires_at then
          v_action := 'LICENSE_EXTENDED'; v_detail := 'Expiry moved to ' || to_char(to_timestamp(new.subscription_expires_at / 1000.0), 'YYYY-MM-DD HH24:MI');
        elsif old.remote_kill_switch is distinct from new.remote_kill_switch then
          v_action := case when new.remote_kill_switch then 'KILL_SWITCH_ON' else 'KILL_SWITCH_OFF' end;
        elsif v_material then
          v_action := 'LIMITS_CHANGED'; v_detail := new.branch_count || ' branches • ' || new.worker_count || ' staff • ' || new.device_count || ' devices';
        else
          v_action := 'HEARTBEAT';
        end if;
      end if;

    elsif tg_table_name = 'shop_devices' then
      v_key := r.shop_sync_key; v_shop := r.shop_name; v_entity := 'DEVICE'; v_device := r.device_id;
      if tg_op = 'INSERT' then v_action := 'PAIRED'; v_detail := r.device_name || ' • ' || r.role || ' • ' || r.branch_name;
      elsif tg_op = 'DELETE' then v_action := 'REMOVED'; v_detail := r.device_name;
      else
        v_material := (old.is_active is distinct from new.is_active) or (old.branch_id is distinct from new.branch_id) or (old.assigned_username is distinct from new.assigned_username);
        if old.is_active is distinct from new.is_active then
          v_action := case when new.is_active then 'ACTIVATED' else 'DEACTIVATED' end; v_detail := new.device_name;
        elsif v_material then
          v_action := 'REASSIGNED'; v_detail := new.device_name || ' → @' || new.assigned_username || ' • ' || new.branch_name;
        else
          v_action := 'SYNCED'; v_detail := new.device_name;
        end if;
      end if;

    elsif tg_table_name = 'shop_users' then
      v_key := r.shop_sync_key; v_shop := r.shop_name; v_entity := 'STAFF';
      if tg_op = 'INSERT' then v_action := 'ADDED'; v_detail := r.full_name || ' (@' || r.username || ') • ' || r.role;
      elsif tg_op = 'DELETE' then v_action := 'REMOVED'; v_detail := r.full_name;
      else
        if (old.is_active is not distinct from new.is_active) and (old.role is not distinct from new.role) and (old.assigned_branch_id is not distinct from new.assigned_branch_id) then
          return null;
        end if;
        v_action := 'CHANGED'; v_detail := new.full_name || ' • ' || new.role || case when new.is_active then '' else ' • disabled' end;
      end if;

    elsif tg_table_name = 'branch_sync_snapshots' then
      v_key := r.shop_sync_key; v_shop := r.shop_name; v_entity := 'SNAPSHOT'; v_device := r.device_id;
      if tg_op = 'DELETE' then v_action := 'PRUNED'; v_detail := r.branch_name;
      else
        v_action := 'UPLOADED'; v_detail := r.branch_name || case when r.records_summary <> '' then ' • ' || r.records_summary else '' end;
        v_material := tg_op = 'INSERT' or (old.records_summary is distinct from new.records_summary);
      end if;

    elsif tg_table_name = 'payment_requests' then
      v_key := public.computed_shop_sync_key(r.owner_username, r.owner_phone); v_shop := r.shop_name; v_entity := 'PAYMENT';
      if tg_op = 'INSERT' then
        v_action := 'SUBMITTED'; v_detail := r.provider || ' • ' || r.amount_rwf || ' FRw';
        if r.source = 'WEB' and v_actor = 'APP' then v_actor := 'WEB'; end if;
      elsif tg_op = 'DELETE' then v_action := 'DELETED';
      else
        if old.status is not distinct from new.status then return null; end if;
        v_action := new.status; v_detail := new.amount_rwf || ' FRw' || case when new.rejection_reason <> '' then ' • ' || new.rejection_reason else '' end;
      end if;

    elsif tg_table_name = 'unlock_codes' then
      v_key := public.computed_shop_sync_key(r.shop_username, r.shop_phone); v_entity := 'UNLOCK_CODE';
      select shop_name into v_shop from public.shop_accounts where id = v_key;
      v_shop := coalesce(v_shop, '');
      if tg_op = 'INSERT' then v_action := 'ISSUED'; v_detail := r.tier_code || ' • +' || r.plan_days || ' days';
      elsif tg_op = 'DELETE' then v_action := 'DELETED';
      else
        if old.status is not distinct from new.status then return null; end if;
        v_action := new.status; v_detail := new.tier_code || ' • +' || new.plan_days || ' days';
      end if;
    else
      return null;
    end if;

    if not v_material and exists (
      select 1 from public.cloud_sync_events e
      where e.shop_sync_key = v_key and e.entity = v_entity and e.device_id = v_device
        and e.created_at > now() - interval '10 minutes'
    ) then
      return null;
    end if;

    insert into public.cloud_sync_events (shop_sync_key, shop_name, entity, action, actor, device_id, detail)
    values (coalesce(v_key, ''), coalesce(v_shop, ''), v_entity, v_action, v_actor, coalesce(v_device, ''), left(coalesce(v_detail, ''), 500));

    if random() < 0.005 then
      delete from public.cloud_sync_events where created_at < now() - interval '90 days';
    end if;
  exception when others then
    return null;
  end;
  return null;
end;
$$;

create trigger zz_log_sync_shop_accounts after insert or update or delete on public.shop_accounts for each row execute function public.log_cloud_sync_event();
create trigger zz_log_sync_shop_devices after insert or update or delete on public.shop_devices for each row execute function public.log_cloud_sync_event();
create trigger zz_log_sync_shop_users after insert or update or delete on public.shop_users for each row execute function public.log_cloud_sync_event();
create trigger zz_log_sync_snapshots after insert or update or delete on public.branch_sync_snapshots for each row execute function public.log_cloud_sync_event();
create trigger zz_log_sync_payments after insert or update or delete on public.payment_requests for each row execute function public.log_cloud_sync_event();
create trigger zz_log_sync_codes after insert or update or delete on public.unlock_codes for each row execute function public.log_cloud_sync_event();

-- ============ REALTIME ============
alter publication supabase_realtime add table public.payment_requests;
alter publication supabase_realtime add table public.shop_accounts;
alter publication supabase_realtime add table public.contact_messages;
alter publication supabase_realtime add table public.cloud_sync_events;
alter publication supabase_realtime add table public.shop_devices;
alter publication supabase_realtime add table public.shop_users;
alter publication supabase_realtime add table public.branch_sync_snapshots;
alter publication supabase_realtime add table public.unlock_codes;