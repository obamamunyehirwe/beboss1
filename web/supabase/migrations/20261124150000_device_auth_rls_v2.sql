-- Device-bound Supabase Auth sessions. The tenant key is now a selector, never a credential.
-- A device must present a valid Supabase Auth JWT whose auth.uid() maps to an active
-- device session. Owners retain portal access through OTP-created memberships.

create schema if not exists beboss_private;
revoke all on schema beboss_private from public, anon, authenticated;

create table if not exists public.shop_device_auth_sessions (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  shop_sync_key text not null references public.shop_accounts(id) on delete cascade,
  device_record_id text not null references public.shop_devices(id) on delete cascade,
  device_id text not null,
  assigned_user_id text not null,
  role text not null,
  branch_id text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  issued_at bigint not null default public.now_ms(),
  expires_at bigint not null,
  last_seen_at bigint not null default public.now_ms(),
  revoked_at bigint not null default 0
);

create unique index if not exists shop_device_auth_sessions_active_device_idx
  on public.shop_device_auth_sessions(shop_sync_key, device_id)
  where status = 'ACTIVE' and revoked_at = 0;
create index if not exists shop_device_auth_sessions_user_status_idx
  on public.shop_device_auth_sessions(auth_user_id, status, expires_at);
create index if not exists shop_device_auth_sessions_shop_device_idx
  on public.shop_device_auth_sessions(shop_sync_key, device_record_id, status);

alter table public.shop_device_auth_sessions enable row level security;
revoke all on public.shop_device_auth_sessions from public, anon, authenticated;
grant all on public.shop_device_auth_sessions to service_role;

create table if not exists beboss_private.shop_device_auth_invites (
  id uuid primary key default gen_random_uuid(),
  shop_sync_key text not null references public.shop_accounts(id) on delete cascade,
  device_record_id text not null references public.shop_devices(id) on delete cascade,
  expected_device_id text not null default '',
  code_hash text not null unique,
  issued_by_auth_user_id uuid not null references auth.users(id) on delete cascade,
  created_at bigint not null default public.now_ms(),
  expires_at bigint not null,
  redeemed_at bigint,
  redeemed_device_id text,
  redeemed_auth_user_id uuid references auth.users(id) on delete set null,
  revoked_at bigint
);
alter table beboss_private.shop_device_auth_invites enable row level security;
revoke all on beboss_private.shop_device_auth_invites from public, anon, authenticated;
grant all on beboss_private.shop_device_auth_invites to service_role;
create index if not exists shop_device_auth_invites_pending_idx
  on beboss_private.shop_device_auth_invites(shop_sync_key, device_record_id, expires_at desc)
  where redeemed_at is null and revoked_at is null;

create table if not exists beboss_private.shop_device_enrollment_rate_limits (
  bucket_hash text primary key check (bucket_hash ~ '^[0-9a-f]{64}-- Authenticated owner portal users and enrolled device accounts are the only
-- identities allowed to select a tenant. X-Shop-Sync-Key is accepted only as
-- a requested tenant selector after auth.uid() is proven to belong to it.
create or replace function public.current_shop_sync_key()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_requested_shop text;
  v_shop_id text;
begin
  if v_user_id is null then
    return '';
  end if;

  begin
    v_requested_shop := nullif(
      trim(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-shop-sync-key', '')),
      ''
    );
  exception when others then
    v_requested_shop := null;
  end;

  select m.shop_id
    into v_shop_id
  from public.shop_owner_memberships m
  where m.user_id = v_user_id
    and m.status = 'ACTIVE'
    and m.revoked_at = 0
    and (v_requested_shop is null or m.shop_id = v_requested_shop)
  order by m.created_at asc
  limit 1;

  if v_shop_id is not null then
    return v_shop_id;
  end if;

  select s.shop_sync_key
    into v_shop_id
  from public.shop_device_auth_sessions s
  join public.shop_devices d
    on d.id = s.device_record_id
   and d.shop_sync_key = s.shop_sync_key
   and d.device_id = s.device_id
   and d.assigned_user_id = s.assigned_user_id
   and d.branch_id = s.branch_id
   and d.role = s.role
   and d.is_active = true
  join public.shop_users u
    on u.shop_sync_key = s.shop_sync_key
   and u.user_id = s.assigned_user_id
   and u.is_active = true
   and u.role = s.role
   and u.assigned_branch_id = s.branch_id
  join public.shop_accounts a
    on a.id = s.shop_sync_key
   and a.remote_kill_switch = false
  where s.auth_user_id = v_user_id
    and s.status = 'ACTIVE'
    and s.revoked_at = 0
    and s.expires_at > public.now_ms()
    and (v_requested_shop is null or s.shop_sync_key = v_requested_shop)
  limit 1;

  return coalesce(v_shop_id, '');
end;
$function$;

create or replace function public.current_shop_device_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.device_id
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select d.device_id
     from public.shop_devices d
     where d.shop_sync_key = public.current_shop_sync_key()
       and d.is_owner_primary = true
       and d.is_active = true
     order by d.updated_at desc
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_user_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.assigned_user_id
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select u.user_id
     from public.shop_users u
     where u.shop_sync_key = public.current_shop_sync_key()
       and u.role = 'OWNER'
       and u.is_active = true
     order by u.user_id
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.role
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select 'OWNER'
     from public.shop_owner_memberships m
     where m.user_id = auth.uid()
       and m.status = 'ACTIVE'
       and m.revoked_at = 0
       and m.shop_id = public.current_shop_sync_key()
     limit 1),
    ''
  );
$function$;

-- Owner-only invitation issuance. The owner portal has already proved the
-- phone by OTP; only its Auth UUID may create or rotate a device invitation.
create or replace function public.issue_shop_device_auth_invite(
  p_shop_id text,
  p_device_record_id text,
  p_expected_device_id text,
  p_code_hash text,
  p_owner_auth_user_id uuid,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_device public.shop_devices%rowtype;
  v_id uuid;
  v_actor_role text := '';
  v_actor_branch_id text := '';
  v_has_owner_membership boolean := false;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_record_id, '')) = 0
     or length(coalesce(p_shop_id, '')) = 0
     or p_expires_at < v_now + 60000
     or p_expires_at > v_now + 3600000 then
    raise exception using errcode = '22023', message = 'Invalid device invitation details.';
  end if;

  select exists (
    select 1 from public.shop_owner_memberships m
    where m.user_id = p_owner_auth_user_id
      and m.shop_id = p_shop_id
      and m.status = 'ACTIVE'
      and m.revoked_at = 0
  ) into v_has_owner_membership;

  if not v_has_owner_membership then
    select s.role, s.branch_id
      into v_actor_role, v_actor_branch_id
    from public.shop_device_auth_sessions s
    join public.shop_devices actor_device
      on actor_device.id = s.device_record_id
     and actor_device.shop_sync_key = s.shop_sync_key
     and actor_device.device_id = s.device_id
     and actor_device.is_active = true
    join public.shop_users actor_user
      on actor_user.shop_sync_key = s.shop_sync_key
     and actor_user.user_id = s.assigned_user_id
     and actor_user.is_active = true
     and actor_user.role = s.role
     and actor_user.assigned_branch_id = s.branch_id
    where s.auth_user_id = p_owner_auth_user_id
      and s.shop_sync_key = p_shop_id
      and s.status = 'ACTIVE'
      and s.revoked_at = 0
      and s.expires_at > v_now
    limit 1;

    if v_actor_role not in ('OWNER', 'MANAGER') then
      raise exception using errcode = '42501', message = 'A verified owner or branch-manager terminal session is required.';
    end if;
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = p_device_record_id
    and d.shop_sync_key = p_shop_id
  for update;

  if not found or not v_device.is_active or v_device.assigned_user_id = '' then
    raise exception using errcode = '22023', message = 'The device slot is missing or inactive.';
  end if;

  if coalesce(v_device.device_id, '') <> coalesce(p_expected_device_id, '') then
    raise exception using errcode = '22023', message = 'The expected terminal identity no longer matches this device slot.';
  end if;

  if not v_has_owner_membership and v_actor_role = 'MANAGER'
     and v_actor_branch_id <> v_device.branch_id then
    raise exception using errcode = '42501', message = 'A branch manager may only issue a device code for their assigned branch.';
  end if;

  if exists (
    select 1 from public.shop_accounts a
    where a.id = p_shop_id and a.remote_kill_switch = true
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled.';
  end if;

  update beboss_private.shop_device_auth_invites
  set revoked_at = v_now
  where shop_sync_key = p_shop_id
    and device_record_id = p_device_record_id
    and redeemed_at is null
    and revoked_at is null;

  insert into beboss_private.shop_device_auth_invites(
    shop_sync_key, device_record_id, expected_device_id, code_hash,
    issued_by_auth_user_id, created_at, expires_at
  ) values (
    p_shop_id, p_device_record_id, coalesce(p_expected_device_id, ''),
    p_code_hash, p_owner_auth_user_id, v_now, p_expires_at
  ) returning id into v_id;

  return jsonb_build_object('issued', true, 'invite_id', v_id, 'expires_at', p_expires_at);
end;
$function$;

-- Called only by the signed server-side redemption Edge Function after it has
-- provisioned a random Supabase Auth identity for this terminal.
create or replace function public.redeem_shop_device_auth_invite(
  p_code_hash text,
  p_device_id text,
  p_device_name text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_invite beboss_private.shop_device_auth_invites%rowtype;
  v_device public.shop_devices%rowtype;
  v_owner_shop_name text;
  v_replaced_auth_user_id uuid;
  v_expiry bigint := v_now + 7776000000;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_id, '')) < 8
     or length(coalesce(p_device_name, '')) > 120
     or p_auth_user_id is null
     or not exists (select 1 from auth.users u where u.id = p_auth_user_id) then
    raise exception using errcode = '22023', message = 'Invalid secure device enrollment.';
  end if;

  select * into v_invite
  from beboss_private.shop_device_auth_invites i
  where i.code_hash = p_code_hash
    and i.redeemed_at is null
    and i.revoked_at is null
    and i.expires_at >= v_now
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'The device code is invalid, expired, revoked, or already used.';
  end if;

  if v_invite.expected_device_id <> '' and v_invite.expected_device_id <> p_device_id then
    raise exception using errcode = '42501', message = 'This secure code was issued for another physical terminal.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = v_invite.device_record_id
    and d.shop_sync_key = v_invite.shop_sync_key
  for update;

  if not found or not v_device.is_active
     or v_device.assigned_user_id = ''
     or (v_device.device_id <> '' and v_device.device_id <> p_device_id)
     or (v_device.device_id <> '' and v_invite.expected_device_id = '') then
    raise exception using errcode = '42501', message = 'The assigned device slot is no longer eligible for pairing.';
  end if;

  if exists (
    select 1 from public.shop_accounts a
    where a.id = v_invite.shop_sync_key and a.remote_kill_switch = true
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled.';
  end if;

  update beboss_private.shop_device_auth_invites
  set redeemed_at = v_now,
      redeemed_device_id = p_device_id,
      redeemed_auth_user_id = p_auth_user_id
  where id = v_invite.id;

  update public.shop_devices
  set device_id = p_device_id,
      device_name = coalesce(nullif(trim(p_device_name), ''), device_name),
      join_code = '',
      last_synced_at = v_now,
      updated_at = v_now
  where id = v_device.id
  returning * into v_device;

  select s.auth_user_id into v_replaced_auth_user_id
  from public.shop_device_auth_sessions s
  where s.shop_sync_key = v_invite.shop_sync_key
    and s.device_record_id = v_device.id
    and s.status = 'ACTIVE'
    and s.revoked_at = 0
  order by s.issued_at desc
  limit 1;

  update public.shop_device_auth_sessions
  set status = 'REVOKED', revoked_at = v_now
  where shop_sync_key = v_invite.shop_sync_key
    and device_record_id = v_device.id
    and status = 'ACTIVE'
    and revoked_at = 0;

  insert into public.shop_device_auth_sessions(
    auth_user_id, shop_sync_key, device_record_id, device_id,
    assigned_user_id, role, branch_id, status, issued_at, expires_at, last_seen_at, revoked_at
  ) values (
    p_auth_user_id, v_invite.shop_sync_key, v_device.id, p_device_id,
    v_device.assigned_user_id, v_device.role, v_device.branch_id,
    'ACTIVE', v_now, v_expiry, v_now, 0
  );

  select a.shop_name into v_owner_shop_name
  from public.shop_accounts a
  where a.id = v_invite.shop_sync_key;

  return jsonb_build_object(
    'device', to_jsonb(v_device),
    'shop_name', coalesce(v_owner_shop_name, ''),
    'auth_user_id', p_auth_user_id,
    'replaced_auth_user_id', v_replaced_auth_user_id,
    'session_expires_at', v_expiry
  );
end;
$function$;

revoke all on function public.issue_shop_device_auth_invite(text,text,text,text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.issue_shop_device_auth_invite(text,text,text,text,uuid,bigint) to service_role;
revoke all on function public.redeem_shop_device_auth_invite(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.redeem_shop_device_auth_invite(text,text,text,uuid) to service_role;

-- Make forged anonymous tenant headers useless across every table carrying the
-- tenant key. Existing authenticated staff/admin access remains behind RLS.
do $block$
declare
  v_row record;
begin
  for v_row in
    select distinct c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = n.nspname
     and col.table_name = c.relname
     and col.column_name = 'shop_sync_key'
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', v_row.relname);
    execute format('revoke all on table public.%I from public, anon', v_row.relname);
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', v_row.relname);
  end loop;
end;
$block$;

-- Authentication-session state is never directly queryable by an app client.
revoke all on table public.shop_device_auth_sessions from public, anon, authenticated;
grant all on table public.shop_device_auth_sessions to service_role;

alter table public.shop_accounts enable row level security;
revoke all on table public.shop_accounts from public, anon;
grant select, insert, update, delete on table public.shop_accounts to authenticated, service_role;

-- Legacy device invitation RPCs are no longer public bootstrap paths.
revoke all on function public.issue_shop_device_invite(text,text,text,text,text,text,bigint) from public, anon, authenticated;
revoke all on function public.redeem_shop_device_invite(text,text,text,text) from public, anon, authenticated;
revoke all on function public.revoke_shop_device_invites(text,text,text,text) from public, anon;
revoke all on function public.set_shop_device_active(text,text,text,text,boolean) from public, anon;
revoke all on function public.delete_shop_device(text,text,text,text) from public, anon;


-- Native POS owner/manager terminal can issue a new-slot invitation without
-- exposing service_role. The private implementation validates its JWT-bound
-- device session, staff identity, role and branch scope.
create or replace function public.issue_current_device_auth_invite(
  p_device_record_id text,
  p_code_hash text,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id text := public.current_shop_sync_key();
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null or coalesce(v_shop_id, '') = '' then
    raise exception using errcode = '42501', message = 'An authenticated shop terminal is required.';
  end if;

  return public.issue_shop_device_auth_invite(
    v_shop_id,
    p_device_record_id,
    '',
    p_code_hash,
    v_auth_user_id,
    p_expires_at
  );
end;
$function$;

revoke all on function public.issue_current_device_auth_invite(text,text,bigint) from public, anon;
grant execute on function public.issue_current_device_auth_invite(text,text,bigint) to authenticated;

revoke all on function public.current_shop_sync_key() from public, anon;
revoke all on function public.current_shop_device_id() from public, anon;
revoke all on function public.current_shop_user_id() from public, anon;
revoke all on function public.current_shop_role() from public, anon;
grant execute on function public.current_shop_sync_key() to authenticated, service_role;
grant execute on function public.current_shop_device_id() to authenticated, service_role;
grant execute on function public.current_shop_user_id() to authenticated, service_role;
grant execute on function public.current_shop_role() to authenticated, service_role;

comment on table public.shop_device_auth_sessions is
  'One active Supabase Auth identity per registered terminal. RLS resolves the tenant from auth.uid(), current device row and active assigned staff row; shop keys are not secrets.';
comment on table beboss_private.shop_device_auth_invites is
  'Short-lived, one-time, hashed device enrollment and re-enrollment codes issued only after owner OTP authentication.';
comment on function public.current_shop_sync_key() is
  'Resolves tenant context only from an authenticated active owner membership or device-auth session. The legacy X-Shop-Sync-Key header is only a selector, never an authenticator.';
),
  window_started_at bigint not null,
  attempt_count integer not null check (attempt_count >= 0),
  updated_at bigint not null
);
alter table beboss_private.shop_device_enrollment_rate_limits enable row level security;
revoke all on beboss_private.shop_device_enrollment_rate_limits from public, anon, authenticated;
grant all on beboss_private.shop_device_enrollment_rate_limits to service_role;

create or replace function public.take_shop_device_enrollment_attempt(
  p_bucket_hash text,
  p_now_ms bigint,
  p_window_ms bigint default 600000,
  p_max_attempts integer default 10
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempts integer;
begin
  if p_bucket_hash !~ '^[0-9a-f]{64}-- Authenticated owner portal users and enrolled device accounts are the only
-- identities allowed to select a tenant. X-Shop-Sync-Key is accepted only as
-- a requested tenant selector after auth.uid() is proven to belong to it.
create or replace function public.current_shop_sync_key()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_requested_shop text;
  v_shop_id text;
begin
  if v_user_id is null then
    return '';
  end if;

  begin
    v_requested_shop := nullif(
      trim(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-shop-sync-key', '')),
      ''
    );
  exception when others then
    v_requested_shop := null;
  end;

  select m.shop_id
    into v_shop_id
  from public.shop_owner_memberships m
  where m.user_id = v_user_id
    and m.status = 'ACTIVE'
    and m.revoked_at = 0
    and (v_requested_shop is null or m.shop_id = v_requested_shop)
  order by m.created_at asc
  limit 1;

  if v_shop_id is not null then
    return v_shop_id;
  end if;

  select s.shop_sync_key
    into v_shop_id
  from public.shop_device_auth_sessions s
  join public.shop_devices d
    on d.id = s.device_record_id
   and d.shop_sync_key = s.shop_sync_key
   and d.device_id = s.device_id
   and d.assigned_user_id = s.assigned_user_id
   and d.branch_id = s.branch_id
   and d.role = s.role
   and d.is_active = true
  join public.shop_users u
    on u.shop_sync_key = s.shop_sync_key
   and u.user_id = s.assigned_user_id
   and u.is_active = true
   and u.role = s.role
   and u.assigned_branch_id = s.branch_id
  join public.shop_accounts a
    on a.id = s.shop_sync_key
   and a.remote_kill_switch = false
  where s.auth_user_id = v_user_id
    and s.status = 'ACTIVE'
    and s.revoked_at = 0
    and s.expires_at > public.now_ms()
    and (v_requested_shop is null or s.shop_sync_key = v_requested_shop)
  limit 1;

  return coalesce(v_shop_id, '');
end;
$function$;

create or replace function public.current_shop_device_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.device_id
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select d.device_id
     from public.shop_devices d
     where d.shop_sync_key = public.current_shop_sync_key()
       and d.is_owner_primary = true
       and d.is_active = true
     order by d.updated_at desc
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_user_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.assigned_user_id
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select u.user_id
     from public.shop_users u
     where u.shop_sync_key = public.current_shop_sync_key()
       and u.role = 'OWNER'
       and u.is_active = true
     order by u.user_id
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.role
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select 'OWNER'
     from public.shop_owner_memberships m
     where m.user_id = auth.uid()
       and m.status = 'ACTIVE'
       and m.revoked_at = 0
       and m.shop_id = public.current_shop_sync_key()
     limit 1),
    ''
  );
$function$;

-- Owner-only invitation issuance. The owner portal has already proved the
-- phone by OTP; only its Auth UUID may create or rotate a device invitation.
create or replace function public.issue_shop_device_auth_invite(
  p_shop_id text,
  p_device_record_id text,
  p_expected_device_id text,
  p_code_hash text,
  p_owner_auth_user_id uuid,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_device public.shop_devices%rowtype;
  v_id uuid;
  v_actor_role text := '';
  v_actor_branch_id text := '';
  v_has_owner_membership boolean := false;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_record_id, '')) = 0
     or length(coalesce(p_shop_id, '')) = 0
     or p_expires_at < v_now + 60000
     or p_expires_at > v_now + 3600000 then
    raise exception using errcode = '22023', message = 'Invalid device invitation details.';
  end if;

  select exists (
    select 1 from public.shop_owner_memberships m
    where m.user_id = p_owner_auth_user_id
      and m.shop_id = p_shop_id
      and m.status = 'ACTIVE'
      and m.revoked_at = 0
  ) into v_has_owner_membership;

  if not v_has_owner_membership then
    select s.role, s.branch_id
      into v_actor_role, v_actor_branch_id
    from public.shop_device_auth_sessions s
    join public.shop_devices actor_device
      on actor_device.id = s.device_record_id
     and actor_device.shop_sync_key = s.shop_sync_key
     and actor_device.device_id = s.device_id
     and actor_device.is_active = true
    join public.shop_users actor_user
      on actor_user.shop_sync_key = s.shop_sync_key
     and actor_user.user_id = s.assigned_user_id
     and actor_user.is_active = true
     and actor_user.role = s.role
     and actor_user.assigned_branch_id = s.branch_id
    where s.auth_user_id = p_owner_auth_user_id
      and s.shop_sync_key = p_shop_id
      and s.status = 'ACTIVE'
      and s.revoked_at = 0
      and s.expires_at > v_now
    limit 1;

    if v_actor_role not in ('OWNER', 'MANAGER') then
      raise exception using errcode = '42501', message = 'A verified owner or branch-manager terminal session is required.';
    end if;
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = p_device_record_id
    and d.shop_sync_key = p_shop_id
  for update;

  if not found or not v_device.is_active or v_device.assigned_user_id = '' then
    raise exception using errcode = '22023', message = 'The device slot is missing or inactive.';
  end if;

  if coalesce(v_device.device_id, '') <> coalesce(p_expected_device_id, '') then
    raise exception using errcode = '22023', message = 'The expected terminal identity no longer matches this device slot.';
  end if;

  if not v_has_owner_membership and v_actor_role = 'MANAGER'
     and v_actor_branch_id <> v_device.branch_id then
    raise exception using errcode = '42501', message = 'A branch manager may only issue a device code for their assigned branch.';
  end if;

  if exists (
    select 1 from public.shop_accounts a
    where a.id = p_shop_id and a.remote_kill_switch = true
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled.';
  end if;

  update beboss_private.shop_device_auth_invites
  set revoked_at = v_now
  where shop_sync_key = p_shop_id
    and device_record_id = p_device_record_id
    and redeemed_at is null
    and revoked_at is null;

  insert into beboss_private.shop_device_auth_invites(
    shop_sync_key, device_record_id, expected_device_id, code_hash,
    issued_by_auth_user_id, created_at, expires_at
  ) values (
    p_shop_id, p_device_record_id, coalesce(p_expected_device_id, ''),
    p_code_hash, p_owner_auth_user_id, v_now, p_expires_at
  ) returning id into v_id;

  return jsonb_build_object('issued', true, 'invite_id', v_id, 'expires_at', p_expires_at);
end;
$function$;

-- Called only by the signed server-side redemption Edge Function after it has
-- provisioned a random Supabase Auth identity for this terminal.
create or replace function public.redeem_shop_device_auth_invite(
  p_code_hash text,
  p_device_id text,
  p_device_name text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_invite beboss_private.shop_device_auth_invites%rowtype;
  v_device public.shop_devices%rowtype;
  v_owner_shop_name text;
  v_expiry bigint := v_now + 7776000000;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_id, '')) < 8
     or length(coalesce(p_device_name, '')) > 120
     or p_auth_user_id is null
     or not exists (select 1 from auth.users u where u.id = p_auth_user_id) then
    raise exception using errcode = '22023', message = 'Invalid secure device enrollment.';
  end if;

  select * into v_invite
  from beboss_private.shop_device_auth_invites i
  where i.code_hash = p_code_hash
    and i.redeemed_at is null
    and i.revoked_at is null
    and i.expires_at >= v_now
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'The device code is invalid, expired, revoked, or already used.';
  end if;

  if v_invite.expected_device_id <> '' and v_invite.expected_device_id <> p_device_id then
    raise exception using errcode = '42501', message = 'This secure code was issued for another physical terminal.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = v_invite.device_record_id
    and d.shop_sync_key = v_invite.shop_sync_key
  for update;

  if not found or not v_device.is_active
     or v_device.assigned_user_id = ''
     or (v_device.device_id <> '' and v_device.device_id <> p_device_id)
     or (v_device.device_id <> '' and v_invite.expected_device_id = '') then
    raise exception using errcode = '42501', message = 'The assigned device slot is no longer eligible for pairing.';
  end if;

  if exists (
    select 1 from public.shop_accounts a
    where a.id = v_invite.shop_sync_key and a.remote_kill_switch = true
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled.';
  end if;

  update beboss_private.shop_device_auth_invites
  set redeemed_at = v_now,
      redeemed_device_id = p_device_id,
      redeemed_auth_user_id = p_auth_user_id
  where id = v_invite.id;

  update public.shop_devices
  set device_id = p_device_id,
      device_name = coalesce(nullif(trim(p_device_name), ''), device_name),
      join_code = '',
      last_synced_at = v_now,
      updated_at = v_now
  where id = v_device.id
  returning * into v_device;

  update public.shop_device_auth_sessions
  set status = 'REVOKED', revoked_at = v_now
  where shop_sync_key = v_invite.shop_sync_key
    and device_record_id = v_device.id
    and status = 'ACTIVE'
    and revoked_at = 0;

  insert into public.shop_device_auth_sessions(
    auth_user_id, shop_sync_key, device_record_id, device_id,
    assigned_user_id, role, branch_id, status, issued_at, expires_at, last_seen_at, revoked_at
  ) values (
    p_auth_user_id, v_invite.shop_sync_key, v_device.id, p_device_id,
    v_device.assigned_user_id, v_device.role, v_device.branch_id,
    'ACTIVE', v_now, v_expiry, v_now, 0
  );

  select a.shop_name into v_owner_shop_name
  from public.shop_accounts a
  where a.id = v_invite.shop_sync_key;

  return jsonb_build_object(
    'device', to_jsonb(v_device),
    'shop_name', coalesce(v_owner_shop_name, ''),
    'auth_user_id', p_auth_user_id,
    'session_expires_at', v_expiry
  );
end;
$function$;

revoke all on function public.issue_shop_device_auth_invite(text,text,text,text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.issue_shop_device_auth_invite(text,text,text,text,uuid,bigint) to service_role;
revoke all on function public.redeem_shop_device_auth_invite(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.redeem_shop_device_auth_invite(text,text,text,uuid) to service_role;

-- Make forged anonymous tenant headers useless across every table carrying the
-- tenant key. Existing authenticated staff/admin access remains behind RLS.
do $block$
declare
  v_row record;
begin
  for v_row in
    select distinct c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = n.nspname
     and col.table_name = c.relname
     and col.column_name = 'shop_sync_key'
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', v_row.relname);
    execute format('revoke all on table public.%I from public, anon', v_row.relname);
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', v_row.relname);
  end loop;
end;
$block$;

-- Authentication-session state is never directly queryable by an app client.
revoke all on table public.shop_device_auth_sessions from public, anon, authenticated;
grant all on table public.shop_device_auth_sessions to service_role;

alter table public.shop_accounts enable row level security;
revoke all on table public.shop_accounts from public, anon;
grant select, insert, update, delete on table public.shop_accounts to authenticated, service_role;

-- Legacy device invitation RPCs are no longer public bootstrap paths.
revoke all on function public.issue_shop_device_invite(text,text,text,text,text,text,bigint) from public, anon;
revoke all on function public.redeem_shop_device_invite(text,text,text,text) from public, anon;
revoke all on function public.revoke_shop_device_invites(text,text,text,text) from public, anon;
revoke all on function public.set_shop_device_active(text,text,text,text,boolean) from public, anon;
revoke all on function public.delete_shop_device(text,text,text,text) from public, anon;


-- Native POS owner/manager terminal can issue a new-slot invitation without
-- exposing service_role. The private implementation validates its JWT-bound
-- device session, staff identity, role and branch scope.
create or replace function public.issue_current_device_auth_invite(
  p_device_record_id text,
  p_code_hash text,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id text := public.current_shop_sync_key();
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null or coalesce(v_shop_id, '') = '' then
    raise exception using errcode = '42501', message = 'An authenticated shop terminal is required.';
  end if;

  return public.issue_shop_device_auth_invite(
    v_shop_id,
    p_device_record_id,
    '',
    p_code_hash,
    v_auth_user_id,
    p_expires_at
  );
end;
$function$;

revoke all on function public.issue_current_device_auth_invite(text,text,bigint) from public, anon;
grant execute on function public.issue_current_device_auth_invite(text,text,bigint) to authenticated;

revoke all on function public.current_shop_sync_key() from public, anon;
revoke all on function public.current_shop_device_id() from public, anon;
revoke all on function public.current_shop_user_id() from public, anon;
revoke all on function public.current_shop_role() from public, anon;
grant execute on function public.current_shop_sync_key() to authenticated, service_role;
grant execute on function public.current_shop_device_id() to authenticated, service_role;
grant execute on function public.current_shop_user_id() to authenticated, service_role;
grant execute on function public.current_shop_role() to authenticated, service_role;

comment on table public.shop_device_auth_sessions is
  'One active Supabase Auth identity per registered terminal. RLS resolves the tenant from auth.uid(), current device row and active assigned staff row; shop keys are not secrets.';
comment on table beboss_private.shop_device_auth_invites is
  'Short-lived, one-time, hashed device enrollment and re-enrollment codes issued only after owner OTP authentication.';
comment on function public.current_shop_sync_key() is
  'Resolves tenant context only from an authenticated active owner membership or device-auth session. The legacy X-Shop-Sync-Key header is only a selector, never an authenticator.';

     or p_window_ms < 60000 or p_window_ms > 3600000
     or p_max_attempts < 1 or p_max_attempts > 100 then
    raise exception using errcode = '22023', message = 'Invalid enrollment rate-limit request.';
  end if;

  insert into beboss_private.shop_device_enrollment_rate_limits(
    bucket_hash, window_started_at, attempt_count, updated_at
  ) values (
    p_bucket_hash, p_now_ms, 1, p_now_ms
  )
  on conflict (bucket_hash) do update
  set window_started_at = case
        when p_now_ms - beboss_private.shop_device_enrollment_rate_limits.window_started_at >= p_window_ms
          then p_now_ms
        else beboss_private.shop_device_enrollment_rate_limits.window_started_at
      end,
      attempt_count = case
        when p_now_ms - beboss_private.shop_device_enrollment_rate_limits.window_started_at >= p_window_ms
          then 1
        else beboss_private.shop_device_enrollment_rate_limits.attempt_count + 1
      end,
      updated_at = p_now_ms
  returning attempt_count into v_attempts;

  return v_attempts <= p_max_attempts;
end;
$function$;

revoke all on function public.take_shop_device_enrollment_attempt(text,bigint,bigint,integer) from public, anon, authenticated;
grant execute on function public.take_shop_device_enrollment_attempt(text,bigint,bigint,integer) to service_role;

-- New shops enter the tenant boundary only after a confirmed SMS phone
-- session. Account + owner membership are created in one DB transaction.
create or replace function public.bootstrap_shop_owner(
  p_shop_id text,
  p_shop_name text,
  p_owner_name text,
  p_owner_username text,
  p_owner_phone text,
  p_owner_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_auth_user auth.users%rowtype;
begin
  if length(coalesce(p_shop_name, '')) < 2 or length(p_shop_name) > 120
     or length(coalesce(p_owner_name, '')) < 2 or length(p_owner_name) > 120
     or p_owner_username !~ '^[a-z0-9._-]{2,80}-- Authenticated owner portal users and enrolled device accounts are the only
-- identities allowed to select a tenant. X-Shop-Sync-Key is accepted only as
-- a requested tenant selector after auth.uid() is proven to belong to it.
create or replace function public.current_shop_sync_key()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_requested_shop text;
  v_shop_id text;
begin
  if v_user_id is null then
    return '';
  end if;

  begin
    v_requested_shop := nullif(
      trim(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-shop-sync-key', '')),
      ''
    );
  exception when others then
    v_requested_shop := null;
  end;

  select m.shop_id
    into v_shop_id
  from public.shop_owner_memberships m
  where m.user_id = v_user_id
    and m.status = 'ACTIVE'
    and m.revoked_at = 0
    and (v_requested_shop is null or m.shop_id = v_requested_shop)
  order by m.created_at asc
  limit 1;

  if v_shop_id is not null then
    return v_shop_id;
  end if;

  select s.shop_sync_key
    into v_shop_id
  from public.shop_device_auth_sessions s
  join public.shop_devices d
    on d.id = s.device_record_id
   and d.shop_sync_key = s.shop_sync_key
   and d.device_id = s.device_id
   and d.assigned_user_id = s.assigned_user_id
   and d.branch_id = s.branch_id
   and d.role = s.role
   and d.is_active = true
  join public.shop_users u
    on u.shop_sync_key = s.shop_sync_key
   and u.user_id = s.assigned_user_id
   and u.is_active = true
   and u.role = s.role
   and u.assigned_branch_id = s.branch_id
  join public.shop_accounts a
    on a.id = s.shop_sync_key
   and a.remote_kill_switch = false
  where s.auth_user_id = v_user_id
    and s.status = 'ACTIVE'
    and s.revoked_at = 0
    and s.expires_at > public.now_ms()
    and (v_requested_shop is null or s.shop_sync_key = v_requested_shop)
  limit 1;

  return coalesce(v_shop_id, '');
end;
$function$;

create or replace function public.current_shop_device_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.device_id
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select d.device_id
     from public.shop_devices d
     where d.shop_sync_key = public.current_shop_sync_key()
       and d.is_owner_primary = true
       and d.is_active = true
     order by d.updated_at desc
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_user_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.assigned_user_id
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select u.user_id
     from public.shop_users u
     where u.shop_sync_key = public.current_shop_sync_key()
       and u.role = 'OWNER'
       and u.is_active = true
     order by u.user_id
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.role
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select 'OWNER'
     from public.shop_owner_memberships m
     where m.user_id = auth.uid()
       and m.status = 'ACTIVE'
       and m.revoked_at = 0
       and m.shop_id = public.current_shop_sync_key()
     limit 1),
    ''
  );
$function$;

-- Owner-only invitation issuance. The owner portal has already proved the
-- phone by OTP; only its Auth UUID may create or rotate a device invitation.
create or replace function public.issue_shop_device_auth_invite(
  p_shop_id text,
  p_device_record_id text,
  p_expected_device_id text,
  p_code_hash text,
  p_owner_auth_user_id uuid,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_device public.shop_devices%rowtype;
  v_id uuid;
  v_actor_role text := '';
  v_actor_branch_id text := '';
  v_has_owner_membership boolean := false;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_record_id, '')) = 0
     or length(coalesce(p_shop_id, '')) = 0
     or p_expires_at < v_now + 60000
     or p_expires_at > v_now + 3600000 then
    raise exception using errcode = '22023', message = 'Invalid device invitation details.';
  end if;

  select exists (
    select 1 from public.shop_owner_memberships m
    where m.user_id = p_owner_auth_user_id
      and m.shop_id = p_shop_id
      and m.status = 'ACTIVE'
      and m.revoked_at = 0
  ) into v_has_owner_membership;

  if not v_has_owner_membership then
    select s.role, s.branch_id
      into v_actor_role, v_actor_branch_id
    from public.shop_device_auth_sessions s
    join public.shop_devices actor_device
      on actor_device.id = s.device_record_id
     and actor_device.shop_sync_key = s.shop_sync_key
     and actor_device.device_id = s.device_id
     and actor_device.is_active = true
    join public.shop_users actor_user
      on actor_user.shop_sync_key = s.shop_sync_key
     and actor_user.user_id = s.assigned_user_id
     and actor_user.is_active = true
     and actor_user.role = s.role
     and actor_user.assigned_branch_id = s.branch_id
    where s.auth_user_id = p_owner_auth_user_id
      and s.shop_sync_key = p_shop_id
      and s.status = 'ACTIVE'
      and s.revoked_at = 0
      and s.expires_at > v_now
    limit 1;

    if v_actor_role not in ('OWNER', 'MANAGER') then
      raise exception using errcode = '42501', message = 'A verified owner or branch-manager terminal session is required.';
    end if;
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = p_device_record_id
    and d.shop_sync_key = p_shop_id
  for update;

  if not found or not v_device.is_active or v_device.assigned_user_id = '' then
    raise exception using errcode = '22023', message = 'The device slot is missing or inactive.';
  end if;

  if coalesce(v_device.device_id, '') <> coalesce(p_expected_device_id, '') then
    raise exception using errcode = '22023', message = 'The expected terminal identity no longer matches this device slot.';
  end if;

  if not v_has_owner_membership and v_actor_role = 'MANAGER'
     and v_actor_branch_id <> v_device.branch_id then
    raise exception using errcode = '42501', message = 'A branch manager may only issue a device code for their assigned branch.';
  end if;

  if exists (
    select 1 from public.shop_accounts a
    where a.id = p_shop_id and a.remote_kill_switch = true
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled.';
  end if;

  update beboss_private.shop_device_auth_invites
  set revoked_at = v_now
  where shop_sync_key = p_shop_id
    and device_record_id = p_device_record_id
    and redeemed_at is null
    and revoked_at is null;

  insert into beboss_private.shop_device_auth_invites(
    shop_sync_key, device_record_id, expected_device_id, code_hash,
    issued_by_auth_user_id, created_at, expires_at
  ) values (
    p_shop_id, p_device_record_id, coalesce(p_expected_device_id, ''),
    p_code_hash, p_owner_auth_user_id, v_now, p_expires_at
  ) returning id into v_id;

  return jsonb_build_object('issued', true, 'invite_id', v_id, 'expires_at', p_expires_at);
end;
$function$;

-- Called only by the signed server-side redemption Edge Function after it has
-- provisioned a random Supabase Auth identity for this terminal.
create or replace function public.redeem_shop_device_auth_invite(
  p_code_hash text,
  p_device_id text,
  p_device_name text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_invite beboss_private.shop_device_auth_invites%rowtype;
  v_device public.shop_devices%rowtype;
  v_owner_shop_name text;
  v_expiry bigint := v_now + 7776000000;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_id, '')) < 8
     or length(coalesce(p_device_name, '')) > 120
     or p_auth_user_id is null
     or not exists (select 1 from auth.users u where u.id = p_auth_user_id) then
    raise exception using errcode = '22023', message = 'Invalid secure device enrollment.';
  end if;

  select * into v_invite
  from beboss_private.shop_device_auth_invites i
  where i.code_hash = p_code_hash
    and i.redeemed_at is null
    and i.revoked_at is null
    and i.expires_at >= v_now
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'The device code is invalid, expired, revoked, or already used.';
  end if;

  if v_invite.expected_device_id <> '' and v_invite.expected_device_id <> p_device_id then
    raise exception using errcode = '42501', message = 'This secure code was issued for another physical terminal.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = v_invite.device_record_id
    and d.shop_sync_key = v_invite.shop_sync_key
  for update;

  if not found or not v_device.is_active
     or v_device.assigned_user_id = ''
     or (v_device.device_id <> '' and v_device.device_id <> p_device_id)
     or (v_device.device_id <> '' and v_invite.expected_device_id = '') then
    raise exception using errcode = '42501', message = 'The assigned device slot is no longer eligible for pairing.';
  end if;

  if exists (
    select 1 from public.shop_accounts a
    where a.id = v_invite.shop_sync_key and a.remote_kill_switch = true
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled.';
  end if;

  update beboss_private.shop_device_auth_invites
  set redeemed_at = v_now,
      redeemed_device_id = p_device_id,
      redeemed_auth_user_id = p_auth_user_id
  where id = v_invite.id;

  update public.shop_devices
  set device_id = p_device_id,
      device_name = coalesce(nullif(trim(p_device_name), ''), device_name),
      join_code = '',
      last_synced_at = v_now,
      updated_at = v_now
  where id = v_device.id
  returning * into v_device;

  update public.shop_device_auth_sessions
  set status = 'REVOKED', revoked_at = v_now
  where shop_sync_key = v_invite.shop_sync_key
    and device_record_id = v_device.id
    and status = 'ACTIVE'
    and revoked_at = 0;

  insert into public.shop_device_auth_sessions(
    auth_user_id, shop_sync_key, device_record_id, device_id,
    assigned_user_id, role, branch_id, status, issued_at, expires_at, last_seen_at, revoked_at
  ) values (
    p_auth_user_id, v_invite.shop_sync_key, v_device.id, p_device_id,
    v_device.assigned_user_id, v_device.role, v_device.branch_id,
    'ACTIVE', v_now, v_expiry, v_now, 0
  );

  select a.shop_name into v_owner_shop_name
  from public.shop_accounts a
  where a.id = v_invite.shop_sync_key;

  return jsonb_build_object(
    'device', to_jsonb(v_device),
    'shop_name', coalesce(v_owner_shop_name, ''),
    'auth_user_id', p_auth_user_id,
    'session_expires_at', v_expiry
  );
end;
$function$;

revoke all on function public.issue_shop_device_auth_invite(text,text,text,text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.issue_shop_device_auth_invite(text,text,text,text,uuid,bigint) to service_role;
revoke all on function public.redeem_shop_device_auth_invite(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.redeem_shop_device_auth_invite(text,text,text,uuid) to service_role;

-- Make forged anonymous tenant headers useless across every table carrying the
-- tenant key. Existing authenticated staff/admin access remains behind RLS.
do $block$
declare
  v_row record;
begin
  for v_row in
    select distinct c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = n.nspname
     and col.table_name = c.relname
     and col.column_name = 'shop_sync_key'
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', v_row.relname);
    execute format('revoke all on table public.%I from public, anon', v_row.relname);
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', v_row.relname);
  end loop;
end;
$block$;

-- Authentication-session state is never directly queryable by an app client.
revoke all on table public.shop_device_auth_sessions from public, anon, authenticated;
grant all on table public.shop_device_auth_sessions to service_role;

alter table public.shop_accounts enable row level security;
revoke all on table public.shop_accounts from public, anon;
grant select, insert, update, delete on table public.shop_accounts to authenticated, service_role;

-- Legacy device invitation RPCs are no longer public bootstrap paths.
revoke all on function public.issue_shop_device_invite(text,text,text,text,text,text,bigint) from public, anon;
revoke all on function public.redeem_shop_device_invite(text,text,text,text) from public, anon;
revoke all on function public.revoke_shop_device_invites(text,text,text,text) from public, anon;
revoke all on function public.set_shop_device_active(text,text,text,text,boolean) from public, anon;
revoke all on function public.delete_shop_device(text,text,text,text) from public, anon;


-- Native POS owner/manager terminal can issue a new-slot invitation without
-- exposing service_role. The private implementation validates its JWT-bound
-- device session, staff identity, role and branch scope.
create or replace function public.issue_current_device_auth_invite(
  p_device_record_id text,
  p_code_hash text,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id text := public.current_shop_sync_key();
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null or coalesce(v_shop_id, '') = '' then
    raise exception using errcode = '42501', message = 'An authenticated shop terminal is required.';
  end if;

  return public.issue_shop_device_auth_invite(
    v_shop_id,
    p_device_record_id,
    '',
    p_code_hash,
    v_auth_user_id,
    p_expires_at
  );
end;
$function$;

revoke all on function public.issue_current_device_auth_invite(text,text,bigint) from public, anon;
grant execute on function public.issue_current_device_auth_invite(text,text,bigint) to authenticated;

revoke all on function public.current_shop_sync_key() from public, anon;
revoke all on function public.current_shop_device_id() from public, anon;
revoke all on function public.current_shop_user_id() from public, anon;
revoke all on function public.current_shop_role() from public, anon;
grant execute on function public.current_shop_sync_key() to authenticated, service_role;
grant execute on function public.current_shop_device_id() to authenticated, service_role;
grant execute on function public.current_shop_user_id() to authenticated, service_role;
grant execute on function public.current_shop_role() to authenticated, service_role;

comment on table public.shop_device_auth_sessions is
  'One active Supabase Auth identity per registered terminal. RLS resolves the tenant from auth.uid(), current device row and active assigned staff row; shop keys are not secrets.';
comment on table beboss_private.shop_device_auth_invites is
  'Short-lived, one-time, hashed device enrollment and re-enrollment codes issued only after owner OTP authentication.';
comment on function public.current_shop_sync_key() is
  'Resolves tenant context only from an authenticated active owner membership or device-auth session. The legacy X-Shop-Sync-Key header is only a selector, never an authenticator.';

     or p_owner_phone !~ '^\+[1-9][0-9]{7,14}-- Authenticated owner portal users and enrolled device accounts are the only
-- identities allowed to select a tenant. X-Shop-Sync-Key is accepted only as
-- a requested tenant selector after auth.uid() is proven to belong to it.
create or replace function public.current_shop_sync_key()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_requested_shop text;
  v_shop_id text;
begin
  if v_user_id is null then
    return '';
  end if;

  begin
    v_requested_shop := nullif(
      trim(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-shop-sync-key', '')),
      ''
    );
  exception when others then
    v_requested_shop := null;
  end;

  select m.shop_id
    into v_shop_id
  from public.shop_owner_memberships m
  where m.user_id = v_user_id
    and m.status = 'ACTIVE'
    and m.revoked_at = 0
    and (v_requested_shop is null or m.shop_id = v_requested_shop)
  order by m.created_at asc
  limit 1;

  if v_shop_id is not null then
    return v_shop_id;
  end if;

  select s.shop_sync_key
    into v_shop_id
  from public.shop_device_auth_sessions s
  join public.shop_devices d
    on d.id = s.device_record_id
   and d.shop_sync_key = s.shop_sync_key
   and d.device_id = s.device_id
   and d.assigned_user_id = s.assigned_user_id
   and d.branch_id = s.branch_id
   and d.role = s.role
   and d.is_active = true
  join public.shop_users u
    on u.shop_sync_key = s.shop_sync_key
   and u.user_id = s.assigned_user_id
   and u.is_active = true
   and u.role = s.role
   and u.assigned_branch_id = s.branch_id
  join public.shop_accounts a
    on a.id = s.shop_sync_key
   and a.remote_kill_switch = false
  where s.auth_user_id = v_user_id
    and s.status = 'ACTIVE'
    and s.revoked_at = 0
    and s.expires_at > public.now_ms()
    and (v_requested_shop is null or s.shop_sync_key = v_requested_shop)
  limit 1;

  return coalesce(v_shop_id, '');
end;
$function$;

create or replace function public.current_shop_device_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.device_id
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select d.device_id
     from public.shop_devices d
     where d.shop_sync_key = public.current_shop_sync_key()
       and d.is_owner_primary = true
       and d.is_active = true
     order by d.updated_at desc
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_user_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.assigned_user_id
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select u.user_id
     from public.shop_users u
     where u.shop_sync_key = public.current_shop_sync_key()
       and u.role = 'OWNER'
       and u.is_active = true
     order by u.user_id
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.role
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select 'OWNER'
     from public.shop_owner_memberships m
     where m.user_id = auth.uid()
       and m.status = 'ACTIVE'
       and m.revoked_at = 0
       and m.shop_id = public.current_shop_sync_key()
     limit 1),
    ''
  );
$function$;

-- Owner-only invitation issuance. The owner portal has already proved the
-- phone by OTP; only its Auth UUID may create or rotate a device invitation.
create or replace function public.issue_shop_device_auth_invite(
  p_shop_id text,
  p_device_record_id text,
  p_expected_device_id text,
  p_code_hash text,
  p_owner_auth_user_id uuid,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_device public.shop_devices%rowtype;
  v_id uuid;
  v_actor_role text := '';
  v_actor_branch_id text := '';
  v_has_owner_membership boolean := false;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_record_id, '')) = 0
     or length(coalesce(p_shop_id, '')) = 0
     or p_expires_at < v_now + 60000
     or p_expires_at > v_now + 3600000 then
    raise exception using errcode = '22023', message = 'Invalid device invitation details.';
  end if;

  select exists (
    select 1 from public.shop_owner_memberships m
    where m.user_id = p_owner_auth_user_id
      and m.shop_id = p_shop_id
      and m.status = 'ACTIVE'
      and m.revoked_at = 0
  ) into v_has_owner_membership;

  if not v_has_owner_membership then
    select s.role, s.branch_id
      into v_actor_role, v_actor_branch_id
    from public.shop_device_auth_sessions s
    join public.shop_devices actor_device
      on actor_device.id = s.device_record_id
     and actor_device.shop_sync_key = s.shop_sync_key
     and actor_device.device_id = s.device_id
     and actor_device.is_active = true
    join public.shop_users actor_user
      on actor_user.shop_sync_key = s.shop_sync_key
     and actor_user.user_id = s.assigned_user_id
     and actor_user.is_active = true
     and actor_user.role = s.role
     and actor_user.assigned_branch_id = s.branch_id
    where s.auth_user_id = p_owner_auth_user_id
      and s.shop_sync_key = p_shop_id
      and s.status = 'ACTIVE'
      and s.revoked_at = 0
      and s.expires_at > v_now
    limit 1;

    if v_actor_role not in ('OWNER', 'MANAGER') then
      raise exception using errcode = '42501', message = 'A verified owner or branch-manager terminal session is required.';
    end if;
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = p_device_record_id
    and d.shop_sync_key = p_shop_id
  for update;

  if not found or not v_device.is_active or v_device.assigned_user_id = '' then
    raise exception using errcode = '22023', message = 'The device slot is missing or inactive.';
  end if;

  if coalesce(v_device.device_id, '') <> coalesce(p_expected_device_id, '') then
    raise exception using errcode = '22023', message = 'The expected terminal identity no longer matches this device slot.';
  end if;

  if not v_has_owner_membership and v_actor_role = 'MANAGER'
     and v_actor_branch_id <> v_device.branch_id then
    raise exception using errcode = '42501', message = 'A branch manager may only issue a device code for their assigned branch.';
  end if;

  if exists (
    select 1 from public.shop_accounts a
    where a.id = p_shop_id and a.remote_kill_switch = true
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled.';
  end if;

  update beboss_private.shop_device_auth_invites
  set revoked_at = v_now
  where shop_sync_key = p_shop_id
    and device_record_id = p_device_record_id
    and redeemed_at is null
    and revoked_at is null;

  insert into beboss_private.shop_device_auth_invites(
    shop_sync_key, device_record_id, expected_device_id, code_hash,
    issued_by_auth_user_id, created_at, expires_at
  ) values (
    p_shop_id, p_device_record_id, coalesce(p_expected_device_id, ''),
    p_code_hash, p_owner_auth_user_id, v_now, p_expires_at
  ) returning id into v_id;

  return jsonb_build_object('issued', true, 'invite_id', v_id, 'expires_at', p_expires_at);
end;
$function$;

-- Called only by the signed server-side redemption Edge Function after it has
-- provisioned a random Supabase Auth identity for this terminal.
create or replace function public.redeem_shop_device_auth_invite(
  p_code_hash text,
  p_device_id text,
  p_device_name text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_invite beboss_private.shop_device_auth_invites%rowtype;
  v_device public.shop_devices%rowtype;
  v_owner_shop_name text;
  v_expiry bigint := v_now + 7776000000;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_id, '')) < 8
     or length(coalesce(p_device_name, '')) > 120
     or p_auth_user_id is null
     or not exists (select 1 from auth.users u where u.id = p_auth_user_id) then
    raise exception using errcode = '22023', message = 'Invalid secure device enrollment.';
  end if;

  select * into v_invite
  from beboss_private.shop_device_auth_invites i
  where i.code_hash = p_code_hash
    and i.redeemed_at is null
    and i.revoked_at is null
    and i.expires_at >= v_now
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'The device code is invalid, expired, revoked, or already used.';
  end if;

  if v_invite.expected_device_id <> '' and v_invite.expected_device_id <> p_device_id then
    raise exception using errcode = '42501', message = 'This secure code was issued for another physical terminal.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = v_invite.device_record_id
    and d.shop_sync_key = v_invite.shop_sync_key
  for update;

  if not found or not v_device.is_active
     or v_device.assigned_user_id = ''
     or (v_device.device_id <> '' and v_device.device_id <> p_device_id)
     or (v_device.device_id <> '' and v_invite.expected_device_id = '') then
    raise exception using errcode = '42501', message = 'The assigned device slot is no longer eligible for pairing.';
  end if;

  if exists (
    select 1 from public.shop_accounts a
    where a.id = v_invite.shop_sync_key and a.remote_kill_switch = true
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled.';
  end if;

  update beboss_private.shop_device_auth_invites
  set redeemed_at = v_now,
      redeemed_device_id = p_device_id,
      redeemed_auth_user_id = p_auth_user_id
  where id = v_invite.id;

  update public.shop_devices
  set device_id = p_device_id,
      device_name = coalesce(nullif(trim(p_device_name), ''), device_name),
      join_code = '',
      last_synced_at = v_now,
      updated_at = v_now
  where id = v_device.id
  returning * into v_device;

  update public.shop_device_auth_sessions
  set status = 'REVOKED', revoked_at = v_now
  where shop_sync_key = v_invite.shop_sync_key
    and device_record_id = v_device.id
    and status = 'ACTIVE'
    and revoked_at = 0;

  insert into public.shop_device_auth_sessions(
    auth_user_id, shop_sync_key, device_record_id, device_id,
    assigned_user_id, role, branch_id, status, issued_at, expires_at, last_seen_at, revoked_at
  ) values (
    p_auth_user_id, v_invite.shop_sync_key, v_device.id, p_device_id,
    v_device.assigned_user_id, v_device.role, v_device.branch_id,
    'ACTIVE', v_now, v_expiry, v_now, 0
  );

  select a.shop_name into v_owner_shop_name
  from public.shop_accounts a
  where a.id = v_invite.shop_sync_key;

  return jsonb_build_object(
    'device', to_jsonb(v_device),
    'shop_name', coalesce(v_owner_shop_name, ''),
    'auth_user_id', p_auth_user_id,
    'session_expires_at', v_expiry
  );
end;
$function$;

revoke all on function public.issue_shop_device_auth_invite(text,text,text,text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.issue_shop_device_auth_invite(text,text,text,text,uuid,bigint) to service_role;
revoke all on function public.redeem_shop_device_auth_invite(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.redeem_shop_device_auth_invite(text,text,text,uuid) to service_role;

-- Make forged anonymous tenant headers useless across every table carrying the
-- tenant key. Existing authenticated staff/admin access remains behind RLS.
do $block$
declare
  v_row record;
begin
  for v_row in
    select distinct c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = n.nspname
     and col.table_name = c.relname
     and col.column_name = 'shop_sync_key'
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', v_row.relname);
    execute format('revoke all on table public.%I from public, anon', v_row.relname);
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', v_row.relname);
  end loop;
end;
$block$;

-- Authentication-session state is never directly queryable by an app client.
revoke all on table public.shop_device_auth_sessions from public, anon, authenticated;
grant all on table public.shop_device_auth_sessions to service_role;

alter table public.shop_accounts enable row level security;
revoke all on table public.shop_accounts from public, anon;
grant select, insert, update, delete on table public.shop_accounts to authenticated, service_role;

-- Legacy device invitation RPCs are no longer public bootstrap paths.
revoke all on function public.issue_shop_device_invite(text,text,text,text,text,text,bigint) from public, anon;
revoke all on function public.redeem_shop_device_invite(text,text,text,text) from public, anon;
revoke all on function public.revoke_shop_device_invites(text,text,text,text) from public, anon;
revoke all on function public.set_shop_device_active(text,text,text,text,boolean) from public, anon;
revoke all on function public.delete_shop_device(text,text,text,text) from public, anon;


-- Native POS owner/manager terminal can issue a new-slot invitation without
-- exposing service_role. The private implementation validates its JWT-bound
-- device session, staff identity, role and branch scope.
create or replace function public.issue_current_device_auth_invite(
  p_device_record_id text,
  p_code_hash text,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id text := public.current_shop_sync_key();
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null or coalesce(v_shop_id, '') = '' then
    raise exception using errcode = '42501', message = 'An authenticated shop terminal is required.';
  end if;

  return public.issue_shop_device_auth_invite(
    v_shop_id,
    p_device_record_id,
    '',
    p_code_hash,
    v_auth_user_id,
    p_expires_at
  );
end;
$function$;

revoke all on function public.issue_current_device_auth_invite(text,text,bigint) from public, anon;
grant execute on function public.issue_current_device_auth_invite(text,text,bigint) to authenticated;

revoke all on function public.current_shop_sync_key() from public, anon;
revoke all on function public.current_shop_device_id() from public, anon;
revoke all on function public.current_shop_user_id() from public, anon;
revoke all on function public.current_shop_role() from public, anon;
grant execute on function public.current_shop_sync_key() to authenticated, service_role;
grant execute on function public.current_shop_device_id() to authenticated, service_role;
grant execute on function public.current_shop_user_id() to authenticated, service_role;
grant execute on function public.current_shop_role() to authenticated, service_role;

comment on table public.shop_device_auth_sessions is
  'One active Supabase Auth identity per registered terminal. RLS resolves the tenant from auth.uid(), current device row and active assigned staff row; shop keys are not secrets.';
comment on table beboss_private.shop_device_auth_invites is
  'Short-lived, one-time, hashed device enrollment and re-enrollment codes issued only after owner OTP authentication.';
comment on function public.current_shop_sync_key() is
  'Resolves tenant context only from an authenticated active owner membership or device-auth session. The legacy X-Shop-Sync-Key header is only a selector, never an authenticator.';

     or p_shop_id <> public.computed_shop_sync_key(p_owner_username, p_owner_phone)
     or p_owner_auth_user_id is null then
    raise exception using errcode = '22023', message = 'Invalid shop owner bootstrap details.';
  end if;

  select * into v_auth_user
  from auth.users u
  where u.id = p_owner_auth_user_id
  for update;

  if not found
     or v_auth_user.phone_confirmed_at is null
     or v_auth_user.phone <> p_owner_phone then
    raise exception using errcode = '42501', message = 'The registered owner phone must be verified by SMS first.';
  end if;

  if exists (select 1 from public.shop_accounts a where a.id = p_shop_id) then
    raise exception using errcode = '23505', message = 'A BeBoss shop account already exists for this owner identity.';
  end if;

  insert into public.shop_accounts(
    id, shop_name, owner_name, owner_username, owner_phone,
    branch_count, worker_count, device_count, device_limit,
    monthly_fee_rwf, subscription_status, subscription_expires_at,
    updated_at
  ) values (
    p_shop_id, trim(p_shop_name), trim(p_owner_name), p_owner_username,
    p_owner_phone, 1, 1, 1, 1, 5000, 'TRIAL',
    v_now + 345600000, v_now
  );

  insert into public.shop_owner_memberships(
    user_id, shop_id, owner_username, owner_phone, status,
    created_at, last_verified_at, revoked_at
  ) values (
    p_owner_auth_user_id, p_shop_id, p_owner_username, p_owner_phone,
    'ACTIVE', v_now, v_now, 0
  );

  return jsonb_build_object(
    'created', true,
    'shop_id', p_shop_id,
    'owner_user_id', p_owner_auth_user_id,
    'trial_expires_at', v_now + 345600000
  );
end;
$function$;

revoke all on function public.bootstrap_shop_owner(text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_shop_owner(text,text,text,text,text,uuid) to service_role;

-- Authenticated owner portal users and enrolled device accounts are the only
-- identities allowed to select a tenant. X-Shop-Sync-Key is accepted only as
-- a requested tenant selector after auth.uid() is proven to belong to it.
create or replace function public.current_shop_sync_key()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_requested_shop text;
  v_shop_id text;
begin
  if v_user_id is null then
    return '';
  end if;

  begin
    v_requested_shop := nullif(
      trim(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-shop-sync-key', '')),
      ''
    );
  exception when others then
    v_requested_shop := null;
  end;

  select m.shop_id
    into v_shop_id
  from public.shop_owner_memberships m
  where m.user_id = v_user_id
    and m.status = 'ACTIVE'
    and m.revoked_at = 0
    and (v_requested_shop is null or m.shop_id = v_requested_shop)
  order by m.created_at asc
  limit 1;

  if v_shop_id is not null then
    return v_shop_id;
  end if;

  select s.shop_sync_key
    into v_shop_id
  from public.shop_device_auth_sessions s
  join public.shop_devices d
    on d.id = s.device_record_id
   and d.shop_sync_key = s.shop_sync_key
   and d.device_id = s.device_id
   and d.assigned_user_id = s.assigned_user_id
   and d.branch_id = s.branch_id
   and d.role = s.role
   and d.is_active = true
  join public.shop_users u
    on u.shop_sync_key = s.shop_sync_key
   and u.user_id = s.assigned_user_id
   and u.is_active = true
   and u.role = s.role
   and u.assigned_branch_id = s.branch_id
  join public.shop_accounts a
    on a.id = s.shop_sync_key
   and a.remote_kill_switch = false
  where s.auth_user_id = v_user_id
    and s.status = 'ACTIVE'
    and s.revoked_at = 0
    and s.expires_at > public.now_ms()
    and (v_requested_shop is null or s.shop_sync_key = v_requested_shop)
  limit 1;

  return coalesce(v_shop_id, '');
end;
$function$;

create or replace function public.current_shop_device_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.device_id
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select d.device_id
     from public.shop_devices d
     where d.shop_sync_key = public.current_shop_sync_key()
       and d.is_owner_primary = true
       and d.is_active = true
     order by d.updated_at desc
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_user_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.assigned_user_id
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select u.user_id
     from public.shop_users u
     where u.shop_sync_key = public.current_shop_sync_key()
       and u.role = 'OWNER'
       and u.is_active = true
     order by u.user_id
     limit 1),
    ''
  );
$function$;

create or replace function public.current_shop_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    (select s.role
     from public.shop_device_auth_sessions s
     where s.auth_user_id = auth.uid()
       and s.status = 'ACTIVE'
       and s.revoked_at = 0
       and s.expires_at > public.now_ms()
       and s.shop_sync_key = public.current_shop_sync_key()
     limit 1),
    (select 'OWNER'
     from public.shop_owner_memberships m
     where m.user_id = auth.uid()
       and m.status = 'ACTIVE'
       and m.revoked_at = 0
       and m.shop_id = public.current_shop_sync_key()
     limit 1),
    ''
  );
$function$;

-- Owner-only invitation issuance. The owner portal has already proved the
-- phone by OTP; only its Auth UUID may create or rotate a device invitation.
create or replace function public.issue_shop_device_auth_invite(
  p_shop_id text,
  p_device_record_id text,
  p_expected_device_id text,
  p_code_hash text,
  p_owner_auth_user_id uuid,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_device public.shop_devices%rowtype;
  v_id uuid;
  v_actor_role text := '';
  v_actor_branch_id text := '';
  v_has_owner_membership boolean := false;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_record_id, '')) = 0
     or length(coalesce(p_shop_id, '')) = 0
     or p_expires_at < v_now + 60000
     or p_expires_at > v_now + 3600000 then
    raise exception using errcode = '22023', message = 'Invalid device invitation details.';
  end if;

  select exists (
    select 1 from public.shop_owner_memberships m
    where m.user_id = p_owner_auth_user_id
      and m.shop_id = p_shop_id
      and m.status = 'ACTIVE'
      and m.revoked_at = 0
  ) into v_has_owner_membership;

  if not v_has_owner_membership then
    select s.role, s.branch_id
      into v_actor_role, v_actor_branch_id
    from public.shop_device_auth_sessions s
    join public.shop_devices actor_device
      on actor_device.id = s.device_record_id
     and actor_device.shop_sync_key = s.shop_sync_key
     and actor_device.device_id = s.device_id
     and actor_device.is_active = true
    join public.shop_users actor_user
      on actor_user.shop_sync_key = s.shop_sync_key
     and actor_user.user_id = s.assigned_user_id
     and actor_user.is_active = true
     and actor_user.role = s.role
     and actor_user.assigned_branch_id = s.branch_id
    where s.auth_user_id = p_owner_auth_user_id
      and s.shop_sync_key = p_shop_id
      and s.status = 'ACTIVE'
      and s.revoked_at = 0
      and s.expires_at > v_now
    limit 1;

    if v_actor_role not in ('OWNER', 'MANAGER') then
      raise exception using errcode = '42501', message = 'A verified owner or branch-manager terminal session is required.';
    end if;
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = p_device_record_id
    and d.shop_sync_key = p_shop_id
  for update;

  if not found or not v_device.is_active or v_device.assigned_user_id = '' then
    raise exception using errcode = '22023', message = 'The device slot is missing or inactive.';
  end if;

  if coalesce(v_device.device_id, '') <> coalesce(p_expected_device_id, '') then
    raise exception using errcode = '22023', message = 'The expected terminal identity no longer matches this device slot.';
  end if;

  if not v_has_owner_membership and v_actor_role = 'MANAGER'
     and v_actor_branch_id <> v_device.branch_id then
    raise exception using errcode = '42501', message = 'A branch manager may only issue a device code for their assigned branch.';
  end if;

  if exists (
    select 1 from public.shop_accounts a
    where a.id = p_shop_id and a.remote_kill_switch = true
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled.';
  end if;

  update beboss_private.shop_device_auth_invites
  set revoked_at = v_now
  where shop_sync_key = p_shop_id
    and device_record_id = p_device_record_id
    and redeemed_at is null
    and revoked_at is null;

  insert into beboss_private.shop_device_auth_invites(
    shop_sync_key, device_record_id, expected_device_id, code_hash,
    issued_by_auth_user_id, created_at, expires_at
  ) values (
    p_shop_id, p_device_record_id, coalesce(p_expected_device_id, ''),
    p_code_hash, p_owner_auth_user_id, v_now, p_expires_at
  ) returning id into v_id;

  return jsonb_build_object('issued', true, 'invite_id', v_id, 'expires_at', p_expires_at);
end;
$function$;

-- Called only by the signed server-side redemption Edge Function after it has
-- provisioned a random Supabase Auth identity for this terminal.
create or replace function public.redeem_shop_device_auth_invite(
  p_code_hash text,
  p_device_id text,
  p_device_name text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_invite beboss_private.shop_device_auth_invites%rowtype;
  v_device public.shop_devices%rowtype;
  v_owner_shop_name text;
  v_expiry bigint := v_now + 7776000000;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_id, '')) < 8
     or length(coalesce(p_device_name, '')) > 120
     or p_auth_user_id is null
     or not exists (select 1 from auth.users u where u.id = p_auth_user_id) then
    raise exception using errcode = '22023', message = 'Invalid secure device enrollment.';
  end if;

  select * into v_invite
  from beboss_private.shop_device_auth_invites i
  where i.code_hash = p_code_hash
    and i.redeemed_at is null
    and i.revoked_at is null
    and i.expires_at >= v_now
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'The device code is invalid, expired, revoked, or already used.';
  end if;

  if v_invite.expected_device_id <> '' and v_invite.expected_device_id <> p_device_id then
    raise exception using errcode = '42501', message = 'This secure code was issued for another physical terminal.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = v_invite.device_record_id
    and d.shop_sync_key = v_invite.shop_sync_key
  for update;

  if not found or not v_device.is_active
     or v_device.assigned_user_id = ''
     or (v_device.device_id <> '' and v_device.device_id <> p_device_id)
     or (v_device.device_id <> '' and v_invite.expected_device_id = '') then
    raise exception using errcode = '42501', message = 'The assigned device slot is no longer eligible for pairing.';
  end if;

  if exists (
    select 1 from public.shop_accounts a
    where a.id = v_invite.shop_sync_key and a.remote_kill_switch = true
  ) then
    raise exception using errcode = '42501', message = 'This shop is disabled.';
  end if;

  update beboss_private.shop_device_auth_invites
  set redeemed_at = v_now,
      redeemed_device_id = p_device_id,
      redeemed_auth_user_id = p_auth_user_id
  where id = v_invite.id;

  update public.shop_devices
  set device_id = p_device_id,
      device_name = coalesce(nullif(trim(p_device_name), ''), device_name),
      join_code = '',
      last_synced_at = v_now,
      updated_at = v_now
  where id = v_device.id
  returning * into v_device;

  update public.shop_device_auth_sessions
  set status = 'REVOKED', revoked_at = v_now
  where shop_sync_key = v_invite.shop_sync_key
    and device_record_id = v_device.id
    and status = 'ACTIVE'
    and revoked_at = 0;

  insert into public.shop_device_auth_sessions(
    auth_user_id, shop_sync_key, device_record_id, device_id,
    assigned_user_id, role, branch_id, status, issued_at, expires_at, last_seen_at, revoked_at
  ) values (
    p_auth_user_id, v_invite.shop_sync_key, v_device.id, p_device_id,
    v_device.assigned_user_id, v_device.role, v_device.branch_id,
    'ACTIVE', v_now, v_expiry, v_now, 0
  );

  select a.shop_name into v_owner_shop_name
  from public.shop_accounts a
  where a.id = v_invite.shop_sync_key;

  return jsonb_build_object(
    'device', to_jsonb(v_device),
    'shop_name', coalesce(v_owner_shop_name, ''),
    'auth_user_id', p_auth_user_id,
    'session_expires_at', v_expiry
  );
end;
$function$;

revoke all on function public.issue_shop_device_auth_invite(text,text,text,text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.issue_shop_device_auth_invite(text,text,text,text,uuid,bigint) to service_role;
revoke all on function public.redeem_shop_device_auth_invite(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.redeem_shop_device_auth_invite(text,text,text,uuid) to service_role;

-- Make forged anonymous tenant headers useless across every table carrying the
-- tenant key. Existing authenticated staff/admin access remains behind RLS.
do $block$
declare
  v_row record;
begin
  for v_row in
    select distinct c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = n.nspname
     and col.table_name = c.relname
     and col.column_name = 'shop_sync_key'
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', v_row.relname);
    execute format('revoke all on table public.%I from public, anon', v_row.relname);
    execute format('grant select, insert, update, delete on table public.%I to authenticated, service_role', v_row.relname);
  end loop;
end;
$block$;

-- Authentication-session state is never directly queryable by an app client.
revoke all on table public.shop_device_auth_sessions from public, anon, authenticated;
grant all on table public.shop_device_auth_sessions to service_role;

alter table public.shop_accounts enable row level security;
revoke all on table public.shop_accounts from public, anon;
grant select, insert, update, delete on table public.shop_accounts to authenticated, service_role;

-- Legacy device invitation RPCs are no longer public bootstrap paths.
revoke all on function public.issue_shop_device_invite(text,text,text,text,text,text,bigint) from public, anon;
revoke all on function public.redeem_shop_device_invite(text,text,text,text) from public, anon;
revoke all on function public.revoke_shop_device_invites(text,text,text,text) from public, anon;
revoke all on function public.set_shop_device_active(text,text,text,text,boolean) from public, anon;
revoke all on function public.delete_shop_device(text,text,text,text) from public, anon;


-- Native POS owner/manager terminal can issue a new-slot invitation without
-- exposing service_role. The private implementation validates its JWT-bound
-- device session, staff identity, role and branch scope.
create or replace function public.issue_current_device_auth_invite(
  p_device_record_id text,
  p_code_hash text,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id text := public.current_shop_sync_key();
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null or coalesce(v_shop_id, '') = '' then
    raise exception using errcode = '42501', message = 'An authenticated shop terminal is required.';
  end if;

  return public.issue_shop_device_auth_invite(
    v_shop_id,
    p_device_record_id,
    '',
    p_code_hash,
    v_auth_user_id,
    p_expires_at
  );
end;
$function$;

revoke all on function public.issue_current_device_auth_invite(text,text,bigint) from public, anon;
grant execute on function public.issue_current_device_auth_invite(text,text,bigint) to authenticated;

revoke all on function public.current_shop_sync_key() from public, anon;
revoke all on function public.current_shop_device_id() from public, anon;
revoke all on function public.current_shop_user_id() from public, anon;
revoke all on function public.current_shop_role() from public, anon;
grant execute on function public.current_shop_sync_key() to authenticated, service_role;
grant execute on function public.current_shop_device_id() to authenticated, service_role;
grant execute on function public.current_shop_user_id() to authenticated, service_role;
grant execute on function public.current_shop_role() to authenticated, service_role;

comment on table public.shop_device_auth_sessions is
  'One active Supabase Auth identity per registered terminal. RLS resolves the tenant from auth.uid(), current device row and active assigned staff row; shop keys are not secrets.';
comment on table beboss_private.shop_device_auth_invites is
  'Short-lived, one-time, hashed device enrollment and re-enrollment codes issued only after owner OTP authentication.';
comment on function public.current_shop_sync_key() is
  'Resolves tenant context only from an authenticated active owner membership or device-auth session. The legacy X-Shop-Sync-Key header is only a selector, never an authenticator.';
