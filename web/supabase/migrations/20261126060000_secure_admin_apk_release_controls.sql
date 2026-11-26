-- Securely manage archived APK visibility and edit release metadata using
-- the caller's authenticated session. This avoids relying on a server secret
-- key header for routine release-management operations.
begin;

-- Android requires monotonically managed, unique versionCode values.
-- The existing production archive was checked before adding this constraint.
create unique index if not exists app_releases_version_code_unique
  on public.app_releases (version_code);

create or replace function public.admin_set_app_release_visibility(
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
  from public.app_releases
  where id = p_release_id
  for update;

  if not found then
    raise exception 'Release not found.' using errcode = 'P0002';
  end if;

  if v_is_current and not p_is_public then
    raise exception 'The current release must remain public. Select another current release first.'
      using errcode = '22023';
  end if;

  update public.app_releases
  set is_public = p_is_public
  where id = p_release_id;
end;
$$;

create or replace function public.admin_set_archived_release_visibility(
  p_is_public boolean
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_updated integer;
begin
  if not public.has_admin_permission('releases.manage') then
    raise exception 'Forbidden: releases.manage permission is required.'
      using errcode = '42501';
  end if;

  update public.app_releases
  set is_public = p_is_public
  where is_current = false
    and is_public is distinct from p_is_public;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.admin_update_app_release(
  p_release_id uuid,
  p_version_name text,
  p_version_code integer,
  p_min_android text,
  p_release_notes text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_is_current boolean;
  v_version_name text := btrim(coalesce(p_version_name, ''));
  v_min_android text := btrim(coalesce(p_min_android, ''));
  v_release_notes text := coalesce(p_release_notes, '');
begin
  if not public.has_admin_permission('releases.manage') then
    raise exception 'Forbidden: releases.manage permission is required.'
      using errcode = '42501';
  end if;

  if v_version_name !~ '^[0-9]+([.][0-9]+){0,3}$' then
    raise exception 'Enter a valid numeric version name such as 2.3.2.'
      using errcode = '22023';
  end if;
  if p_version_code is null or p_version_code < 1 or p_version_code > 1000000 then
    raise exception 'Version code must be between 1 and 1,000,000.'
      using errcode = '22023';
  end if;
  if length(v_min_android) < 1 or length(v_min_android) > 40 then
    raise exception 'Minimum Android version must contain 1 to 40 characters.'
      using errcode = '22023';
  end if;
  if length(v_release_notes) > 5000 then
    raise exception 'Release notes cannot exceed 5,000 characters.'
      using errcode = '22023';
  end if;

  select is_current
    into v_is_current
  from public.app_releases
  where id = p_release_id
  for update;

  if not found then
    raise exception 'Release not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.app_releases
    where version_code = p_version_code
      and id <> p_release_id
  ) then
    raise exception 'Another APK release already uses version code %.', p_version_code
      using errcode = '23505';
  end if;

  update public.app_releases
  set version_name = v_version_name,
      version_code = p_version_code,
      min_android = v_min_android,
      release_notes = v_release_notes
  where id = p_release_id;

  -- Keep the global app update metadata in the same transaction when editing
  -- the current APK, so apps never observe mismatched current version details.
  if v_is_current then
    update public.app_config
    set apk_version = v_version_name,
        updated_at = ((extract(epoch from now()) * 1000)::bigint)
    where id = 'global';

    if not found then
      raise exception 'The global app configuration row is missing.'
        using errcode = 'P0002';
    end if;
  end if;
end;
$$;

revoke all on function public.admin_set_app_release_visibility(uuid, boolean)
  from public, anon;
revoke all on function public.admin_set_archived_release_visibility(boolean)
  from public, anon;
revoke all on function public.admin_update_app_release(uuid, text, integer, text, text)
  from public, anon;

grant execute on function public.admin_set_app_release_visibility(uuid, boolean)
  to authenticated, service_role;
grant execute on function public.admin_set_archived_release_visibility(boolean)
  to authenticated, service_role;
grant execute on function public.admin_update_app_release(uuid, text, integer, text, text)
  to authenticated, service_role;

alter function public.admin_set_app_release_visibility(uuid, boolean)
  set search_path = pg_catalog;
alter function public.admin_set_archived_release_visibility(boolean)
  set search_path = pg_catalog;
alter function public.admin_update_app_release(uuid, text, integer, text, text)
  set search_path = pg_catalog;

commit;
