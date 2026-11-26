-- Local-build desktop release management.
-- Administrators build installers on their own machines, upload the finished
-- artifacts to the private releases bucket, and publish verified metadata here.
begin;

create table if not exists public.desktop_app_releases (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('windows', 'macos', 'linux')),
  version_name text not null check (version_name ~ '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$'),
  file_path text not null unique,
  file_name text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 536870912),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  release_notes text not null default '' check (length(release_notes) <= 5000),
  is_current boolean not null default false,
  is_public boolean not null default false,
  download_count bigint not null default 0 check (download_count >= 0),
  created_by text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint desktop_app_releases_platform_version_unique unique (platform, version_name)
);

create unique index if not exists desktop_app_releases_one_current_per_platform
  on public.desktop_app_releases (platform)
  where is_current = true;
create index if not exists desktop_app_releases_public_current_idx
  on public.desktop_app_releases (platform, is_current, is_public, published_at desc);

alter table public.desktop_app_releases enable row level security;
revoke all on table public.desktop_app_releases from public, anon, authenticated;
grant all on table public.desktop_app_releases to service_role;

comment on table public.desktop_app_releases is
  'Private metadata for locally built Windows, macOS and Linux installers. Only server functions with release permissions can publish or expose downloads.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'releases',
  'releases',
  false,
  536870912,
  array[
    'application/vnd.android.package-archive',
    'application/octet-stream',
    'application/x-apple-diskimage',
    'application/x-msdownload',
    'application/vnd.microsoft.portable-executable'
  ]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.admin_set_current_desktop_release(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_platform text;
begin
  if not public.has_admin_permission('releases.manage') then
    raise exception 'Forbidden: releases.manage permission is required.'
      using errcode = '42501';
  end if;

  select platform
    into v_platform
  from public.desktop_app_releases
  where id = p_release_id
  for update;

  if not found then
    raise exception 'Desktop release not found.' using errcode = 'P0002';
  end if;

  update public.desktop_app_releases
  set is_current = false
  where platform = v_platform
    and is_current = true
    and id <> p_release_id;

  update public.desktop_app_releases
  set is_current = true,
      is_public = true,
      published_at = now()
  where id = p_release_id;
end;
$$;

create or replace function public.admin_set_desktop_release_visibility(
  p_release_id uuid,
  p_is_public boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_is_current boolean;
begin
  if not public.has_admin_permission('releases.manage') then
    raise exception 'Forbidden: releases.manage permission is required.'
      using errcode = '42501';
  end if;

  select is_current
    into v_is_current
  from public.desktop_app_releases
  where id = p_release_id
  for update;

  if not found then
    raise exception 'Desktop release not found.' using errcode = 'P0002';
  end if;

  if v_is_current and not p_is_public then
    raise exception 'The current desktop installer must remain public. Publish another version first.'
      using errcode = '22023';
  end if;

  update public.desktop_app_releases
  set is_public = p_is_public
  where id = p_release_id;
end;
$$;

create or replace function public.record_desktop_release_download(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.desktop_app_releases
  set download_count = download_count + 1
  where id = p_release_id
    and is_current = true
    and is_public = true;

  if not found then
    raise exception 'This desktop installer is not currently available.'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_current_desktop_release(uuid) from public, anon;
revoke all on function public.admin_set_desktop_release_visibility(uuid, boolean) from public, anon;
revoke all on function public.record_desktop_release_download(uuid) from public, anon, authenticated;
grant execute on function public.admin_set_current_desktop_release(uuid) to authenticated, service_role;
grant execute on function public.admin_set_desktop_release_visibility(uuid, boolean) to authenticated, service_role;
grant execute on function public.record_desktop_release_download(uuid) to service_role;

alter function public.admin_set_current_desktop_release(uuid) set search_path = pg_catalog;
alter function public.admin_set_desktop_release_visibility(uuid, boolean) set search_path = pg_catalog;
alter function public.record_desktop_release_download(uuid) set search_path = pg_catalog;

commit;
