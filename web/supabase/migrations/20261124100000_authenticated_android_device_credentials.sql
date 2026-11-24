-- Authenticated, revocable per-device credentials for Android/PostgREST sync.
-- This is an additive dual-stack migration: legacy clients remain supported until
-- an owner explicitly retires the deterministic header after every active device
-- has enrolled a random credential.
alter table public.shop_accounts
  add column if not exists legacy_sync_disabled boolean not null default false;

create table if not exists beboss_private.android_device_credentials (
  shop_id text not null references public.shop_accounts(id) on delete cascade,
  device_id text not null,
  device_record_id text not null references public.shop_devices(id) on delete cascade,
  assigned_user_id text not null,
  actor_role text not null check (actor_role in ('OWNER','MANAGER','CASHIER')),
  access_token_hash text not null unique check (access_token_hash ~ '^[0-9a-f]{64}$'),
  refresh_token_hash text not null unique check (refresh_token_hash ~ '^[0-9a-f]{64}$'),
  access_expires_at bigint not null,
  refresh_expires_at bigint not null,
  created_at bigint not null default public.now_ms(),
  updated_at bigint not null default public.now_ms(),
  last_used_at bigint not null default public.now_ms(),
  revoked_at bigint not null default 0,
  primary key (shop_id, device_id)
);

alter table beboss_private.android_device_credentials enable row level security;
revoke all on table beboss_private.android_device_credentials from public, anon, authenticated;
grant all on table beboss_private.android_device_credentials to service_role;

create index if not exists android_device_credentials_refresh_idx
  on beboss_private.android_device_credentials(refresh_token_hash)
  where revoked_at = 0;

comment on table beboss_private.android_device_credentials is
  'Service-only SHA-256 digests of opaque per-installation Android access and single-use refresh credentials. Plain tokens are returned once at enrollment/rotation and wrapped with Android Keystore on-device.';

create or replace function beboss_private.lookup_android_device_context(
  p_device_id text,
  p_access_token text
)
returns table(shop_id text, actor_role text, assigned_user_id text, device_record_id text)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.shop_id, d.role, d.assigned_user_id, d.id
  from beboss_private.android_device_credentials c
  join public.shop_devices d
    on d.id = c.device_record_id
   and d.shop_sync_key = c.shop_id
   and d.device_id = c.device_id
   and d.assigned_user_id = c.assigned_user_id
   and d.role = c.actor_role
   and d.is_active = true
  join public.shop_accounts s on s.id = c.shop_id
  where c.device_id = p_device_id
    and length(coalesce(p_access_token, '')) = 64
    and c.access_token_hash = encode(
      extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256'),
      'hex'
    )
    and c.access_expires_at > public.now_ms()
    and c.revoked_at = 0
    and s.remote_kill_switch = false
  limit 1;
$function$;

revoke all on function beboss_private.lookup_android_device_context(text,text) from public, anon, authenticated;
grant execute on function beboss_private.lookup_android_device_context(text,text) to postgres, service_role;

create or replace function public.current_shop_sync_key()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  with request_context as (
    select
      nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-id')), '') as device_id,
      nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-token')), '') as device_token,
      nullif(trim((current_setting('request.headers', true)::json ->> 'x-shop-sync-key')), '') as legacy_key
  )
  select coalesce(
    (select d.shop_id
     from request_context r
     cross join lateral beboss_private.lookup_android_device_context(r.device_id, r.device_token) d
     limit 1),
    (select s.id
     from request_context r
     join public.shop_accounts s on s.id = r.legacy_key and s.legacy_sync_disabled = false
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_actor_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  with request_context as (
    select
      nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-id')), '') as device_id,
      nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-token')), '') as device_token,
      nullif(trim((current_setting('request.headers', true)::json ->> 'x-shop-sync-key')), '') as legacy_key
  )
  select coalesce(
    (select d.actor_role
     from request_context r
     cross join lateral beboss_private.lookup_android_device_context(r.device_id, r.device_token) d
     limit 1),
    (select 'LEGACY'
     from request_context r
     join public.shop_accounts s on s.id = r.legacy_key and s.legacy_sync_disabled = false
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_device_id()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  with request_context as (
    select
      nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-id')), '') as device_id,
      nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-token')), '') as device_token
  )
  select coalesce(
    (select r.device_id
     from request_context r
     cross join lateral beboss_private.lookup_android_device_context(r.device_id, r.device_token) d
     limit 1),
    ''
  );
$function$;

revoke all on function public.current_shop_sync_key() from public;
grant execute on function public.current_shop_sync_key() to anon, authenticated, service_role;
revoke all on function public.current_shop_actor_role() from public;
grant execute on function public.current_shop_actor_role() to anon, authenticated, service_role;
revoke all on function public.current_shop_device_id() from public;
grant execute on function public.current_shop_device_id() to anon, authenticated, service_role;

create or replace function beboss_private.issue_android_device_credential(
  p_shop_id text,
  p_device_id text,
  p_device_record_id text,
  p_access_token_hash text,
  p_refresh_token_hash text,
  p_access_expires_at bigint,
  p_refresh_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_device public.shop_devices%rowtype;
begin
  if coalesce(p_shop_id,'') = '' or length(coalesce(p_device_id,'')) not between 4 and 120
     or p_access_token_hash !~ '^[0-9a-f]{64}$'
     or p_refresh_token_hash !~ '^[0-9a-f]{64}$'
     or p_access_expires_at <= v_now
     or p_access_expires_at > v_now + 86400000
     or p_refresh_expires_at <= p_access_expires_at
     or p_refresh_expires_at > v_now + 7776000000 then
    raise exception using errcode='22023', message='Invalid Android device credential parameters.';
  end if;

  select d.* into v_device
  from public.shop_devices d
  where d.id = p_device_record_id and d.shop_sync_key = p_shop_id
  for update;

  if not found or not v_device.is_active
     or (v_device.device_id <> '' and v_device.device_id <> p_device_id)
     or v_device.role not in ('OWNER','MANAGER','CASHIER')
     or v_device.assigned_user_id = '' then
    raise exception using errcode='42501', message='The active shop device is not eligible for credential enrollment.';
  end if;

  if v_device.device_id = '' then
    if not v_device.is_owner_primary then
      raise exception using errcode='42501', message='An unpaired staff device cannot enroll without its owner-issued invitation.';
    end if;
    update public.shop_devices
    set device_id = p_device_id,
        device_name = coalesce(nullif(trim(device_name), ''), 'Android owner terminal'),
        updated_at = v_now
    where id = p_device_record_id and shop_sync_key = p_shop_id;
    v_device.device_id := p_device_id;
  end if;

  if not exists (
    select 1 from public.shop_accounts s
    where s.id = p_shop_id and s.remote_kill_switch = false
  ) then
    raise exception using errcode='42501', message='This shop is disabled or unavailable.';
  end if;

  insert into beboss_private.android_device_credentials (
    shop_id, device_id, device_record_id, assigned_user_id, actor_role,
    access_token_hash, refresh_token_hash, access_expires_at, refresh_expires_at,
    created_at, updated_at, last_used_at, revoked_at
  ) values (
    p_shop_id, p_device_id, p_device_record_id, v_device.assigned_user_id, v_device.role,
    p_access_token_hash, p_refresh_token_hash, p_access_expires_at, p_refresh_expires_at,
    v_now, v_now, v_now, 0
  )
  on conflict (shop_id, device_id) do update set
    device_record_id = excluded.device_record_id,
    assigned_user_id = excluded.assigned_user_id,
    actor_role = excluded.actor_role,
    access_token_hash = excluded.access_token_hash,
    refresh_token_hash = excluded.refresh_token_hash,
    access_expires_at = excluded.access_expires_at,
    refresh_expires_at = excluded.refresh_expires_at,
    updated_at = excluded.updated_at,
    last_used_at = excluded.last_used_at,
    revoked_at = 0;

  return jsonb_build_object(
    'issued', true,
    'deviceId', p_device_id,
    'role', v_device.role,
    'assignedUserId', v_device.assigned_user_id,
    'recordId', v_device.id
  );
end;
$function$;

create or replace function beboss_private.rotate_android_device_credential(
  p_shop_id text,
  p_device_id text,
  p_old_refresh_hash text,
  p_new_access_token_hash text,
  p_new_refresh_token_hash text,
  p_access_expires_at bigint,
  p_refresh_expires_at bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_rows integer;
begin
  if coalesce(p_shop_id,'') = '' or length(coalesce(p_device_id,'')) not between 4 and 120
     or p_old_refresh_hash !~ '^[0-9a-f]{64}$'
     or p_new_access_token_hash !~ '^[0-9a-f]{64}$'
     or p_new_refresh_token_hash !~ '^[0-9a-f]{64}$'
     or p_access_expires_at <= v_now or p_access_expires_at > v_now + 86400000
     or p_refresh_expires_at <= p_access_expires_at
     or p_refresh_expires_at > v_now + 7776000000 then
    return false;
  end if;

  update beboss_private.android_device_credentials c
  set access_token_hash = p_new_access_token_hash,
      refresh_token_hash = p_new_refresh_token_hash,
      access_expires_at = p_access_expires_at,
      refresh_expires_at = p_refresh_expires_at,
      updated_at = v_now,
      last_used_at = v_now
  from public.shop_devices d, public.shop_accounts s
  where c.shop_id = p_shop_id
    and c.device_id = p_device_id
    and c.refresh_token_hash = p_old_refresh_hash
    and c.refresh_expires_at > v_now
    and c.revoked_at = 0
    and d.id = c.device_record_id
    and d.shop_sync_key = c.shop_id
    and d.device_id = c.device_id
    and d.assigned_user_id = c.assigned_user_id
    and d.role = c.actor_role
    and d.is_active = true
    and s.id = c.shop_id
    and s.remote_kill_switch = false;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$function$;

create or replace function beboss_private.retire_legacy_android_sync(p_shop_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_active integer;
  v_covered integer;
begin
  select count(*)::integer into v_active
  from public.shop_devices d
  where d.shop_sync_key = p_shop_id and d.is_active = true;

  select count(*)::integer into v_covered
  from public.shop_devices d
  join beboss_private.android_device_credentials c
    on c.shop_id = d.shop_sync_key
   and c.device_id = d.device_id
   and c.device_record_id = d.id
   and c.assigned_user_id = d.assigned_user_id
   and c.actor_role = d.role
   and c.revoked_at = 0
   and c.refresh_expires_at > public.now_ms()
  where d.shop_sync_key = p_shop_id
    and d.is_active = true
    and d.device_id <> '';

  if v_active = 0 or v_covered <> v_active or exists (
    select 1 from public.shop_devices d
    where d.shop_sync_key = p_shop_id and d.is_active = true and d.device_id = ''
  ) then
    return false;
  end if;

  update public.shop_accounts
  set legacy_sync_disabled = true, updated_at = public.now_ms()
  where id = p_shop_id and remote_kill_switch = false;

  return found;
end;
$function$;

create or replace function public.issue_android_device_credential(
  p_shop_id text,
  p_device_id text,
  p_device_record_id text,
  p_access_token_hash text,
  p_refresh_token_hash text,
  p_access_expires_at bigint,
  p_refresh_expires_at bigint
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select beboss_private.issue_android_device_credential(
    p_shop_id,p_device_id,p_device_record_id,p_access_token_hash,p_refresh_token_hash,
    p_access_expires_at,p_refresh_expires_at
  );
$function$;

create or replace function public.rotate_android_device_credential(
  p_shop_id text,
  p_device_id text,
  p_old_refresh_hash text,
  p_new_access_token_hash text,
  p_new_refresh_token_hash text,
  p_access_expires_at bigint,
  p_refresh_expires_at bigint
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select beboss_private.rotate_android_device_credential(
    p_shop_id,p_device_id,p_old_refresh_hash,p_new_access_token_hash,p_new_refresh_token_hash,
    p_access_expires_at,p_refresh_expires_at
  );
$function$;

create or replace function public.retire_legacy_android_sync(p_shop_id text)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select beboss_private.retire_legacy_android_sync(p_shop_id);
$function$;

revoke all on function beboss_private.issue_android_device_credential(text,text,text,text,text,bigint,bigint) from public, anon, authenticated;
revoke all on function beboss_private.rotate_android_device_credential(text,text,text,text,text,bigint,bigint) from public, anon, authenticated;
revoke all on function beboss_private.retire_legacy_android_sync(text) from public, anon, authenticated;
grant execute on function beboss_private.issue_android_device_credential(text,text,text,text,text,bigint,bigint) to service_role;
grant execute on function beboss_private.rotate_android_device_credential(text,text,text,text,text,bigint,bigint) to service_role;
grant execute on function beboss_private.retire_legacy_android_sync(text) to service_role;

revoke all on function public.issue_android_device_credential(text,text,text,text,text,bigint,bigint) from public, anon, authenticated;
revoke all on function public.rotate_android_device_credential(text,text,text,text,text,bigint,bigint) from public, anon, authenticated;
revoke all on function public.retire_legacy_android_sync(text) from public, anon, authenticated;
grant execute on function public.issue_android_device_credential(text,text,text,text,text,bigint,bigint) to service_role;
grant execute on function public.rotate_android_device_credential(text,text,text,text,text,bigint,bigint) to service_role;
grant execute on function public.retire_legacy_android_sync(text) to service_role;

-- Role-sensitive controls. During the dual-stack window, legacy sessions retain their
-- existing behaviour; after owner retirement the only accepted path is a per-device
-- credential whose role is read from the server-owned device registry.
drop policy if exists "Tenant or admin insert shop_devices" on public.shop_devices;
create policy "Tenant or admin insert shop_devices"
  on public.shop_devices for insert to anon, authenticated
  with check (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key()
        and public.current_shop_actor_role() in ('OWNER','MANAGER','LEGACY'))
  );

drop policy if exists "Tenant or admin update shop_devices" on public.shop_devices;
create policy "Tenant or admin update shop_devices"
  on public.shop_devices for update to anon, authenticated
  using (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key()
        and public.current_shop_actor_role() in ('OWNER','MANAGER','LEGACY'))
  )
  with check (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key()
        and public.current_shop_actor_role() in ('OWNER','MANAGER','LEGACY'))
  );

drop policy if exists "Tenant or admin insert shop_users" on public.shop_users;
create policy "Tenant or admin insert shop_users"
  on public.shop_users for insert to anon, authenticated
  with check (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key()
        and public.current_shop_actor_role() in ('OWNER','LEGACY'))
  );

drop policy if exists "Tenant or admin update shop_users" on public.shop_users;
create policy "Tenant or admin update shop_users"
  on public.shop_users for update to anon, authenticated
  using (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key()
        and public.current_shop_actor_role() in ('OWNER','LEGACY'))
  )
  with check (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key()
        and public.current_shop_actor_role() in ('OWNER','LEGACY'))
  );

drop policy if exists "Tenant or admin insert shop_accounts" on public.shop_accounts;
create policy "Tenant or admin insert shop_accounts"
  on public.shop_accounts for insert to anon, authenticated
  with check (
    public.is_beboss_admin()
    or (id = public.current_shop_sync_key()
        and public.current_shop_actor_role() in ('OWNER','LEGACY'))
  );

drop policy if exists "Tenant or admin update shop_accounts" on public.shop_accounts;
create policy "Tenant or admin update shop_accounts"
  on public.shop_accounts for update to anon, authenticated
  using (
    public.is_beboss_admin()
    or (id = public.current_shop_sync_key()
        and public.current_shop_actor_role() in ('OWNER','LEGACY'))
  )
  with check (
    public.is_beboss_admin()
    or (id = public.current_shop_sync_key()
        and public.current_shop_actor_role() in ('OWNER','LEGACY'))
  );

drop policy if exists "Tenant insert shop_branches" on public.shop_branches;
create policy "Tenant insert shop_branches"
  on public.shop_branches for insert to anon, authenticated
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and shop_sync_key <> ''
    and public.current_shop_actor_role() in ('OWNER','MANAGER','LEGACY')
  );

drop policy if exists "Tenant update shop_branches" on public.shop_branches;
create policy "Tenant update shop_branches"
  on public.shop_branches for update to anon, authenticated
  using (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() in ('OWNER','MANAGER','LEGACY')
  )
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() in ('OWNER','MANAGER','LEGACY')
  );

drop policy if exists "Tenant insert shop_stock_transfers" on public.shop_stock_transfers;
create policy "Tenant insert shop_stock_transfers"
  on public.shop_stock_transfers for insert to anon, authenticated
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and shop_sync_key <> ''
    and public.current_shop_actor_role() in ('OWNER','MANAGER','LEGACY')
  );

drop policy if exists "Tenant update shop_stock_transfers" on public.shop_stock_transfers;
create policy "Tenant update shop_stock_transfers"
  on public.shop_stock_transfers for update to anon, authenticated
  using (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() in ('OWNER','MANAGER','LEGACY')
  )
  with check (
    shop_sync_key = public.current_shop_sync_key()
    and public.current_shop_actor_role() in ('OWNER','MANAGER','LEGACY')
  );

create index if not exists android_device_credentials_shop_device_idx
  on beboss_private.android_device_credentials(shop_id, device_id, access_expires_at)
  where revoked_at = 0;

comment on column public.shop_accounts.legacy_sync_disabled is
  'One-way migration gate. Once owner-approved device credential coverage is complete, deterministic X-Shop-Sync-Key access is rejected for this tenant.';
