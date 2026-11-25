-- BeBoss delegated administration and controlled release publication.
-- Privileged grants remain server-only; browsers never receive the Supabase service key.

create table if not exists public.admin_role_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_key text not null check (role_key in (
    'RELEASE_MANAGER','ANNOUNCEMENT_MANAGER','DEVICE_AUDITOR','SUPPORT',
    'FINANCE_REVIEWER','ANALYST','OPERATIONS_MANAGER'
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

-- A release can remain in the admin archive while being hidden from every public
-- release chooser and public download endpoint. Existing releases stay visible by default.
alter table public.app_releases
  add column if not exists is_public boolean not null default true;
create index if not exists app_releases_public_published_idx
  on public.app_releases (is_public, published_at desc);

drop policy if exists "Anyone reads releases" on public.app_releases;
drop policy if exists "Anyone reads public releases" on public.app_releases;
create policy "Anyone reads public releases"
on public.app_releases for select to anon, authenticated
using (
  is_public
  or public.is_beboss_admin()
  or public.has_admin_permission('releases.manage')
);

comment on column public.app_releases.is_public is
  'Controls whether this archived build is listed/downloadable publicly. Hidden releases remain retained for admin history.';
