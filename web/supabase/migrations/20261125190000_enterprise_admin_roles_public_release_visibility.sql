-- BeBoss delegated administration and controlled release publication.
-- Privileged grants remain server-only; browsers never receive the Supabase service key.

create table if not exists public.admin_role_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_key text not null check (role_key in (
    'RELEASE_MANAGER','ANNOUNCEMENT_MANAGER','DEVICE_AUDITOR','SUPPORT',
    'FINANCE_REVIEWER','ANALYST','OPERATIONS_MANAGER','STAFF_MANAGER'
  )),
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_role_grants_active_idx
  on public.admin_role_grants (user_id, is_active, expires_at);
alter table public.admin_role_grants enable row level security;
revoke all on table public.admin_role_grants from public, anon, authenticated;
grant all on table public.admin_role_grants to service_role;
comment on table public.admin_role_grants is
  'Server-managed least-privilege role grants. Never expose grant rows to client-side CRUD.';

create or replace function public.current_admin_permissions()
returns text[]
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when auth.uid() is null then array[]::text[]
    when public.is_beboss_admin() then array[
      'releases.manage','announcements.manage','devices.audit','sync.view',
      'inbox.manage','shops.view','payments.review','billing.view',
      'analytics.view','users.manage'
    ]::text[]
    else coalesce((
      select g.permissions
      from public.admin_role_grants g
      where g.user_id = (select auth.uid())
        and g.is_active
        and (g.expires_at is null or g.expires_at > now())
      limit 1
    ), array[]::text[])
  end;
$$;

create or replace function public.has_admin_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    auth.uid() is not null
    and (
      public.is_beboss_admin()
      or exists (
        select 1
        from public.admin_role_grants g
        where g.user_id = (select auth.uid())
          and g.is_active
          and (g.expires_at is null or g.expires_at > now())
          and p_permission = any(g.permissions)
      )
    ),
    false
  );
$$;
revoke execute on function public.current_admin_permissions() from public, anon;
revoke execute on function public.has_admin_permission(text) from public, anon;
grant execute on function public.current_admin_permissions() to authenticated, service_role;
grant execute on function public.has_admin_permission(text) to authenticated, service_role;
alter function public.current_admin_permissions() set search_path = pg_catalog;
alter function public.has_admin_permission(text) set search_path = pg_catalog;

-- Replace broad "any staff" reads with least-privilege permission checks.
-- Tenant/anon policies are separate and remain in force.
drop policy if exists "Staff read audit logs" on public.admin_audit_logs;
create policy "Authorized staff read audit logs" on public.admin_audit_logs
for select to authenticated using (public.has_admin_permission('audit.view'));

drop policy if exists "Staff read announcements" on public.announcements;
create policy "Authorized staff read announcements" on public.announcements
for select to authenticated using (
  public.is_beboss_admin()
  or public.has_admin_permission('announcements.manage')
  or (
    is_active and starts_at <= now() and (ends_at is null or ends_at > now())
    and (target_shop_key = '' or target_shop_key = public.current_shop_sync_key())
    and (
      (public.current_shop_sync_key() = '' and audience = any (array['ALL','WEBSITE']))
      or (public.current_shop_sync_key() <> '' and audience = any (array['ALL','APP']))
    )
  )
);
drop policy if exists "Admin insert announcements" on public.announcements;
drop policy if exists "Admin update announcements" on public.announcements;
drop policy if exists "Admin delete announcements" on public.announcements;
create policy "Announcement managers insert" on public.announcements
for insert to authenticated with check (public.has_admin_permission('announcements.manage'));
create policy "Announcement managers update" on public.announcements
for update to authenticated using (public.has_admin_permission('announcements.manage'))
with check (public.has_admin_permission('announcements.manage'));
create policy "Announcement managers delete" on public.announcements
for delete to authenticated using (public.has_admin_permission('announcements.manage'));

drop policy if exists "Staff read downloads" on public.apk_downloads;
create policy "Release managers read downloads" on public.apk_downloads
for select to authenticated using (public.has_admin_permission('releases.manage') or public.has_admin_permission('analytics.view'));

drop policy if exists "Staff read snapshots" on public.branch_sync_snapshots;
create policy "Sync viewers read snapshots" on public.branch_sync_snapshots
for select to authenticated using (
  public.has_admin_permission('sync.view')
  or shop_sync_key = public.current_shop_sync_key()
);

drop policy if exists "Staff read sync events" on public.cloud_sync_events;
create policy "Sync viewers read sync events" on public.cloud_sync_events
for select to authenticated using (public.has_admin_permission('sync.view'));

drop policy if exists "Staff read contact messages" on public.contact_messages;
create policy "Inbox managers read contact messages" on public.contact_messages
for select to authenticated using (public.has_admin_permission('inbox.manage'));
drop policy if exists "Staff update contact messages" on public.contact_messages;
create policy "Inbox managers update contact messages" on public.contact_messages
for update to authenticated using (public.has_admin_permission('inbox.manage'))
with check (public.has_admin_permission('inbox.manage'));

drop policy if exists "Staff read device security telemetry" on public.device_security_telemetry;
create policy "Device auditors read device security telemetry" on public.device_security_telemetry
for select to authenticated using (
  (public.has_admin_permission('devices.audit') or public.has_admin_permission('analytics.view'))
  or shop_sync_key = public.current_shop_sync_key()
);

drop policy if exists "Staff read payment_requests" on public.payment_requests;
create policy "Finance reviewers read payment_requests" on public.payment_requests
for select to authenticated using (
  (public.has_admin_permission('payments.review') or public.has_admin_permission('analytics.view'))
  or public.computed_shop_sync_key(owner_username, owner_phone) = public.current_shop_sync_key()
);

drop policy if exists "Staff read shop_accounts" on public.shop_accounts;
create policy "Shop viewers read shop_accounts" on public.shop_accounts
for select to authenticated using (
  public.has_admin_permission('shops.view')
  or id = public.current_shop_sync_key()
);

drop policy if exists "Staff read shop_branches" on public.shop_branches;
create policy "Shop viewers read shop_branches" on public.shop_branches
for select to authenticated using (
  public.has_admin_permission('shops.view')
  or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
);

drop policy if exists "Staff read shop_devices" on public.shop_devices;
create policy "Device auditors read shop_devices" on public.shop_devices
for select to authenticated using (
  public.has_admin_permission('devices.audit')
  or shop_sync_key = public.current_shop_sync_key()
);

drop policy if exists "Staff read shop_stock_transfers" on public.shop_stock_transfers;
create policy "Shop viewers read shop_stock_transfers" on public.shop_stock_transfers
for select to authenticated using (
  public.has_admin_permission('shops.view')
  or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
);

drop policy if exists "Staff read shop_users" on public.shop_users;
create policy "Operations viewers read shop_users" on public.shop_users
for select to authenticated using (
  public.has_admin_permission('users.manage')
  or public.has_admin_permission('shops.view')
  or shop_sync_key = public.current_shop_sync_key()
);

drop policy if exists "Staff read unlock_codes" on public.unlock_codes;
create policy "Finance reviewers read unlock_codes" on public.unlock_codes
for select to authenticated using (
  public.has_admin_permission('payments.review')
  or public.computed_shop_sync_key(shop_username, shop_phone) = public.current_shop_sync_key()
);

-- Super Admins retain full access independent of the role-specific permission array.


-- A release can remain in the admin archive while being hidden from every public
-- release chooser and public download endpoint. Existing releases stay visible by default.
alter table public.app_releases
  add column if not exists is_public boolean not null default true;
create index if not exists app_releases_public_published_idx
  on public.app_releases (is_public, published_at desc);

drop policy if exists "Anyone reads releases" on public.app_releases;
drop policy if exists "Anyone reads public releases" on public.app_releases;
create policy "Public reads listed releases"
on public.app_releases for select to anon
using (is_public);
create policy "Admins read release archive"
on public.app_releases for select to authenticated
using (
  is_public
  or public.is_beboss_admin()
  or public.has_admin_permission('releases.manage')
);

comment on column public.app_releases.is_public is
  'Controls whether this archived build is listed/downloadable publicly. Hidden releases remain retained for admin history.';


-- Release managers may upload/read private APK objects through the existing
-- authenticated Admin UI. Deletion remains a Super Admin-only destructive action.
drop policy if exists "Admins upload releases" on storage.objects;
drop policy if exists "Admins read releases" on storage.objects;
drop policy if exists "Admins update releases" on storage.objects;
create policy "Authorized release managers upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'releases' and public.has_admin_permission('releases.manage'));
create policy "Authorized release managers read"
on storage.objects for select to authenticated
using (bucket_id = 'releases' and public.has_admin_permission('releases.manage'));
create policy "Authorized release managers update"
on storage.objects for update to authenticated
using (bucket_id = 'releases' and public.has_admin_permission('releases.manage'))
with check (bucket_id = 'releases' and public.has_admin_permission('releases.manage'));
