-- Secure, single-use shop-device invitations.
-- Join codes are treated as bearer secrets: only their SHA-256 hashes are stored in
-- Supabase. The mobile app keeps the plaintext code only on the issuing terminal.
create schema if not exists beboss_private;
revoke all on schema beboss_private from public;
grant usage on schema beboss_private to anon, authenticated;

create table if not exists beboss_private.shop_device_invites (
  id uuid primary key default gen_random_uuid(),
  shop_sync_key text not null,
  device_record_id text not null references public.shop_devices(id) on delete cascade,
  code_hash text not null unique,
  created_by_device_id text not null,
  created_by_user_id text not null,
  assigned_user_id text not null,
  branch_id text not null,
  is_legacy boolean not null default false,
  created_at bigint not null default public.now_ms(),
  expires_at bigint not null,
  redeemed_at bigint,
  redeemed_device_id text,
  revoked_at bigint
);

alter table beboss_private.shop_device_invites enable row level security;
revoke all on table beboss_private.shop_device_invites from public, anon, authenticated;
grant all on table beboss_private.shop_device_invites to service_role;

create index if not exists shop_device_invites_device_pending_idx
  on beboss_private.shop_device_invites (shop_sync_key, device_record_id, expires_at desc)
  where redeemed_at is null and revoked_at is null;

-- Move unclaimed legacy invites into the private registry before clearing the
-- old plaintext join_code column. Already paired devices do not need an invite.
insert into beboss_private.shop_device_invites (
  shop_sync_key, device_record_id, code_hash, created_by_device_id,
  created_by_user_id, assigned_user_id, branch_id, is_legacy, created_at, expires_at
)
select
  d.shop_sync_key,
  d.id,
  encode(extensions.digest(upper(trim(d.join_code)), 'sha256'), 'hex'),
  'LEGACY',
  'LEGACY',
  d.assigned_user_id,
  d.branch_id,
  true,
  public.now_ms(),
  public.now_ms() + 2592000000
from public.shop_devices d
where d.join_code <> ''
  and d.device_id = ''
  and d.is_active = true
on conflict (code_hash) do nothing;

-- Never expose new or legacy plaintext join codes through the public Data API.
update public.shop_devices
set join_code = '', updated_at = public.now_ms()
where join_code <> '';

create or replace function beboss_private.issue_shop_device_invite(
  p_shop_sync_key text,
  p_device_record_id text,
  p_code_hash text,
  p_created_by_device_id text,
  p_created_by_user_id text,
  p_branch_id text,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now bigint := public.now_ms();
  v_device public.shop_devices%rowtype;
  v_branch public.shop_branches%rowtype;
  v_creator public.shop_users%rowtype;
  v_assignee public.shop_users%rowtype;
begin
  if coalesce(public.current_shop_sync_key(), '') <> coalesce(p_shop_sync_key, '')
     or coalesce(p_shop_sync_key, '') = '' then
    raise exception using errcode = '42501', message = 'Shop context is invalid.';
  end if;

  if p_code_hash !~ '^[0-9a-f]{64}$'
     or p_device_record_id = ''
     or p_created_by_device_id = ''
     or p_created_by_user_id = ''
     or p_branch_id = ''
     or p_expires_at < v_now + 60000
     or p_expires_at > v_now + 3600000 then
    raise exception using errcode = '22023', message = 'The device invitation details are invalid.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = p_device_record_id
    and d.shop_sync_key = p_shop_sync_key
  for update;

  if not found or not v_device.is_active or v_device.is_owner_primary
     or v_device.device_id <> '' or v_device.branch_id <> p_branch_id
     or v_device.assigned_user_id = '' then
    raise exception using errcode = '22023', message = 'The device slot is not available for pairing.';
  end if;

  select * into v_branch
  from public.shop_branches b
  where b.id = v_device.branch_id
    and b.shop_sync_key = p_shop_sync_key
    and b.is_active = true;

  if not found then
    raise exception using errcode = '22023', message = 'The assigned branch is not active in the cloud.';
  end if;

  select * into v_creator
  from public.shop_users u
  where u.shop_sync_key = p_shop_sync_key
    and u.user_id = p_created_by_user_id
    and u.is_active = true;

  if not found then
    raise exception using errcode = '42501', message = 'The person issuing this invitation is not an active shop user.';
  end if;

  if not exists (
    select 1 from public.shop_devices d
    where d.shop_sync_key = p_shop_sync_key
      and d.device_id = p_created_by_device_id
      and d.assigned_user_id = p_created_by_user_id
      and d.is_active = true
  ) then
    raise exception using errcode = '42501', message = 'This terminal is not registered to the signed-in shop user.';
  end if;

  if v_creator.role <> 'OWNER' and not (
    v_creator.role = 'MANAGER'
    and (
      v_creator.assigned_branch_id = v_device.branch_id
      or v_branch.manager_user_id = p_created_by_user_id
    )
  ) then
    raise exception using errcode = '42501', message = 'Only the shop owner or this branch manager can issue a device invitation.';
  end if;

  select * into v_assignee
  from public.shop_users u
  where u.shop_sync_key = p_shop_sync_key
    and u.user_id = v_device.assigned_user_id
    and u.is_active = true;

  if not found or v_assignee.role <> v_device.role or v_assignee.role = 'OWNER' then
    raise exception using errcode = '22023', message = 'The assigned staff account is missing, inactive, or has a different role.';
  end if;

  if v_creator.role = 'MANAGER'
     and v_assignee.assigned_branch_id <> v_device.branch_id then
    raise exception using errcode = '42501', message = 'A branch manager may only assign staff belonging to their branch.';
  end if;

  update beboss_private.shop_device_invites
  set revoked_at = v_now
  where shop_sync_key = p_shop_sync_key
    and device_record_id = p_device_record_id
    and redeemed_at is null
    and revoked_at is null;

  insert into beboss_private.shop_device_invites (
    shop_sync_key, device_record_id, code_hash, created_by_device_id,
    created_by_user_id, assigned_user_id, branch_id, created_at, expires_at
  ) values (
    p_shop_sync_key, p_device_record_id, p_code_hash, p_created_by_device_id,
    p_created_by_user_id, v_device.assigned_user_id, v_device.branch_id, v_now, p_expires_at
  );

  return jsonb_build_object('issued', true, 'expires_at', p_expires_at);
end;
$$;

create or replace function beboss_private.redeem_shop_device_invite(
  p_shop_sync_key text,
  p_code_hash text,
  p_device_id text,
  p_device_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now bigint := public.now_ms();
  v_invite beboss_private.shop_device_invites%rowtype;
  v_device public.shop_devices%rowtype;
  v_kill_switch boolean;
begin
  if coalesce(public.current_shop_sync_key(), '') <> coalesce(p_shop_sync_key, '')
     or coalesce(p_shop_sync_key, '') = '' then
    raise exception using errcode = '42501', message = 'Shop context is invalid.';
  end if;

  if p_code_hash !~ '^[0-9a-f]{64}$'
     or p_device_id = ''
     or length(coalesce(p_device_name, '')) > 120 then
    raise exception using errcode = '22023', message = 'The device pairing details are invalid.';
  end if;

  select * into v_invite
  from beboss_private.shop_device_invites i
  where i.shop_sync_key = p_shop_sync_key
    and i.code_hash = p_code_hash
  for update;

  if not found or v_invite.revoked_at is not null or v_invite.expires_at < v_now then
    raise exception using errcode = '22023', message = 'This join code is invalid, expired, or revoked.';
  end if;

  select coalesce(s.remote_kill_switch, false) into v_kill_switch
  from public.shop_accounts s
  where s.id = p_shop_sync_key;

  if not found or v_kill_switch then
    raise exception using errcode = '42501', message = 'This shop is unavailable for new device pairing.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = v_invite.device_record_id
    and d.shop_sync_key = p_shop_sync_key
  for update;

  if not found or not v_device.is_active
     or v_device.assigned_user_id <> v_invite.assigned_user_id
     or v_device.branch_id <> v_invite.branch_id then
    raise exception using errcode = '22023', message = 'The assigned device slot is no longer active.';
  end if;

  if v_invite.redeemed_at is not null then
    if v_invite.redeemed_device_id <> p_device_id or v_device.device_id <> p_device_id then
      raise exception using errcode = '22023', message = 'This join code has already been used on another device.';
    end if;
    return to_jsonb(v_device);
  end if;

  if v_device.device_id <> '' and v_device.device_id <> p_device_id then
    raise exception using errcode = '22023', message = 'This device slot is already paired to another terminal.';
  end if;

  update public.shop_devices
  set device_id = p_device_id,
      device_name = coalesce(nullif(trim(p_device_name), ''), device_name),
      join_code = '',
      last_synced_at = v_now,
      updated_at = v_now
  where id = v_device.id
  returning * into v_device;

  update beboss_private.shop_device_invites
  set redeemed_at = v_now,
      redeemed_device_id = p_device_id
  where id = v_invite.id;

  return to_jsonb(v_device);
end;
$$;

create or replace function beboss_private.revoke_shop_device_invites(
  p_shop_sync_key text,
  p_device_record_id text,
  p_actor_device_id text,
  p_actor_user_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.shop_devices%rowtype;
  v_branch public.shop_branches%rowtype;
  v_actor public.shop_users%rowtype;
begin
  if coalesce(public.current_shop_sync_key(), '') <> coalesce(p_shop_sync_key, '')
     or coalesce(p_shop_sync_key, '') = '' then
    raise exception using errcode = '42501', message = 'Shop context is invalid.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = p_device_record_id
    and d.shop_sync_key = p_shop_sync_key
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Device record was not found.';
  end if;

  select * into v_actor
  from public.shop_users u
  where u.shop_sync_key = p_shop_sync_key
    and u.user_id = p_actor_user_id
    and u.is_active = true;

  if not found then
    raise exception using errcode = '42501', message = 'The person revoking this invitation is not an active shop user.';
  end if;

  if v_actor.role <> 'OWNER' and not exists (
    select 1 from public.shop_devices d
    where d.shop_sync_key = p_shop_sync_key
      and d.device_id = p_actor_device_id
      and d.assigned_user_id = p_actor_user_id
      and d.is_active = true
  ) then
    raise exception using errcode = '42501', message = 'The active terminal does not belong to this shop user.';
  end if;

  select * into v_branch
  from public.shop_branches b
  where b.id = v_device.branch_id and b.shop_sync_key = p_shop_sync_key;

  if v_actor.role <> 'OWNER' and not (
    v_actor.role = 'MANAGER'
    and (
      v_actor.assigned_branch_id = v_device.branch_id
      or (found and v_branch.manager_user_id = p_actor_user_id)
    )
  ) then
    raise exception using errcode = '42501', message = 'Only the owner or this branch manager can revoke this device invitation.';
  end if;

  update beboss_private.shop_device_invites
  set revoked_at = public.now_ms()
  where shop_sync_key = p_shop_sync_key
    and device_record_id = p_device_record_id
    and redeemed_at is null
    and revoked_at is null;

  return true;
end;
$$;


create or replace function beboss_private.set_shop_device_active(
  p_shop_sync_key text,
  p_device_record_id text,
  p_actor_device_id text,
  p_actor_user_id text,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $
declare
  v_device public.shop_devices%rowtype;
  v_branch public.shop_branches%rowtype;
  v_actor public.shop_users%rowtype;
begin
  if coalesce(public.current_shop_sync_key(), '') <> coalesce(p_shop_sync_key, '')
     or coalesce(p_shop_sync_key, '') = '' then
    raise exception using errcode = '42501', message = 'Shop context is invalid.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = p_device_record_id and d.shop_sync_key = p_shop_sync_key
  for update;
  if not found or v_device.is_owner_primary then
    raise exception using errcode = '22023', message = 'This terminal cannot be changed.';
  end if;

  select * into v_actor
  from public.shop_users u
  where u.shop_sync_key = p_shop_sync_key
    and u.user_id = p_actor_user_id
    and u.is_active = true;
  if not found then
    raise exception using errcode = '42501', message = 'The signed-in shop user is not active.';
  end if;

  if not exists (
    select 1 from public.shop_devices d
    where d.shop_sync_key = p_shop_sync_key
      and d.device_id = p_actor_device_id
      and d.assigned_user_id = p_actor_user_id
      and d.is_active = true
  ) then
    raise exception using errcode = '42501', message = 'The current terminal is not registered to this shop user.';
  end if;

  select * into v_branch
  from public.shop_branches b
  where b.id = v_device.branch_id and b.shop_sync_key = p_shop_sync_key;
  if not found then
    raise exception using errcode = '22023', message = 'The terminal branch does not exist.';
  end if;

  if v_actor.role <> 'OWNER' and not (
    v_actor.role = 'MANAGER'
    and (
      v_actor.assigned_branch_id = v_device.branch_id
      or v_branch.manager_user_id = p_actor_user_id
    )
  ) then
    raise exception using errcode = '42501', message = 'A branch manager may only manage terminals assigned to their branch.';
  end if;

  if v_actor.role = 'MANAGER' and v_device.device_id = p_actor_device_id and not p_is_active then
    raise exception using errcode = '42501', message = 'A branch manager cannot pause the terminal they are currently using.';
  end if;

  update public.shop_devices
  set is_active = p_is_active,
      updated_at = public.now_ms(),
      join_code = ''
  where id = p_device_record_id and shop_sync_key = p_shop_sync_key;

  if not p_is_active then
    update beboss_private.shop_device_invites
    set revoked_at = public.now_ms()
    where shop_sync_key = p_shop_sync_key
      and device_record_id = p_device_record_id
      and redeemed_at is null
      and revoked_at is null;
  end if;

  return true;
end;
$;

create or replace function beboss_private.delete_shop_device(
  p_shop_sync_key text,
  p_device_record_id text,
  p_actor_device_id text,
  p_actor_user_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $
declare
  v_device public.shop_devices%rowtype;
  v_branch public.shop_branches%rowtype;
  v_actor public.shop_users%rowtype;
begin
  if coalesce(public.current_shop_sync_key(), '') <> coalesce(p_shop_sync_key, '')
     or coalesce(p_shop_sync_key, '') = '' then
    raise exception using errcode = '42501', message = 'Shop context is invalid.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = p_device_record_id and d.shop_sync_key = p_shop_sync_key
  for update;
  if not found or v_device.is_owner_primary then
    raise exception using errcode = '22023', message = 'This terminal cannot be removed.';
  end if;

  select * into v_actor
  from public.shop_users u
  where u.shop_sync_key = p_shop_sync_key
    and u.user_id = p_actor_user_id
    and u.is_active = true;
  if not found then
    raise exception using errcode = '42501', message = 'The signed-in shop user is not active.';
  end if;

  if not exists (
    select 1 from public.shop_devices d
    where d.shop_sync_key = p_shop_sync_key
      and d.device_id = p_actor_device_id
      and d.assigned_user_id = p_actor_user_id
      and d.is_active = true
  ) then
    raise exception using errcode = '42501', message = 'The current terminal is not registered to this shop user.';
  end if;

  select * into v_branch
  from public.shop_branches b
  where b.id = v_device.branch_id and b.shop_sync_key = p_shop_sync_key;
  if not found then
    raise exception using errcode = '22023', message = 'The terminal branch does not exist.';
  end if;

  if v_actor.role <> 'OWNER' and not (
    v_actor.role = 'MANAGER'
    and (
      v_actor.assigned_branch_id = v_device.branch_id
      or v_branch.manager_user_id = p_actor_user_id
    )
  ) then
    raise exception using errcode = '42501', message = 'A branch manager may only remove terminals assigned to their branch.';
  end if;

  if v_device.device_id = p_actor_device_id then
    raise exception using errcode = '42501', message = 'A user cannot remove the terminal they are currently using.';
  end if;

  delete from public.shop_devices
  where id = p_device_record_id and shop_sync_key = p_shop_sync_key;

  return true;
end;
$;

-- Exposed RPC wrappers are invoker-rights only. The privileged implementation
-- stays in an unexposed schema with a pinned empty search_path.
create or replace function public.issue_shop_device_invite(
  p_shop_sync_key text,
  p_device_record_id text,
  p_code_hash text,
  p_created_by_device_id text,
  p_created_by_user_id text,
  p_branch_id text,
  p_expires_at bigint
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select beboss_private.issue_shop_device_invite(
    p_shop_sync_key, p_device_record_id, p_code_hash, p_created_by_device_id,
    p_created_by_user_id, p_branch_id, p_expires_at
  );
$$;

create or replace function public.redeem_shop_device_invite(
  p_shop_sync_key text,
  p_code_hash text,
  p_device_id text,
  p_device_name text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select beboss_private.redeem_shop_device_invite(
    p_shop_sync_key, p_code_hash, p_device_id, p_device_name
  );
$$;

create or replace function public.revoke_shop_device_invites(
  p_shop_sync_key text,
  p_device_record_id text,
  p_actor_device_id text,
  p_actor_user_id text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select beboss_private.revoke_shop_device_invites(
    p_shop_sync_key, p_device_record_id, p_actor_device_id, p_actor_user_id
  );
$$;

revoke all on function beboss_private.issue_shop_device_invite(text, text, text, text, text, text, bigint) from public;
revoke all on function beboss_private.redeem_shop_device_invite(text, text, text, text) from public;
revoke all on function beboss_private.revoke_shop_device_invites(text, text, text, text) from public;
grant execute on function beboss_private.issue_shop_device_invite(text, text, text, text, text, text, bigint) to anon, authenticated;
grant execute on function beboss_private.redeem_shop_device_invite(text, text, text, text) to anon, authenticated;
grant execute on function beboss_private.revoke_shop_device_invites(text, text, text, text) to anon, authenticated;

revoke all on function public.issue_shop_device_invite(text, text, text, text, text, text, bigint) from public;
revoke all on function public.redeem_shop_device_invite(text, text, text, text) from public;
revoke all on function public.revoke_shop_device_invites(text, text, text, text) from public;
grant execute on function public.issue_shop_device_invite(text, text, text, text, text, text, bigint) to anon, authenticated;
grant execute on function public.redeem_shop_device_invite(text, text, text, text) to anon, authenticated;
grant execute on function public.revoke_shop_device_invites(text, text, text, text) to anon, authenticated;

create or replace function public.set_shop_device_active(
  p_shop_sync_key text,
  p_device_record_id text,
  p_actor_device_id text,
  p_actor_user_id text,
  p_is_active boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $
  select beboss_private.set_shop_device_active(
    p_shop_sync_key, p_device_record_id, p_actor_device_id, p_actor_user_id, p_is_active
  );
$;

create or replace function public.delete_shop_device(
  p_shop_sync_key text,
  p_device_record_id text,
  p_actor_device_id text,
  p_actor_user_id text
)
returns boolean
language sql
security invoker
set search_path = ''
as $
  select beboss_private.delete_shop_device(
    p_shop_sync_key, p_device_record_id, p_actor_device_id, p_actor_user_id
  );
$;

revoke all on function beboss_private.set_shop_device_active(text, text, text, text, boolean) from public;
revoke all on function beboss_private.delete_shop_device(text, text, text, text) from public;
grant execute on function beboss_private.set_shop_device_active(text, text, text, text, boolean) to anon, authenticated;
grant execute on function beboss_private.delete_shop_device(text, text, text, text) to anon, authenticated;

revoke all on function public.set_shop_device_active(text, text, text, text, boolean) from public;
revoke all on function public.delete_shop_device(text, text, text, text) from public;
grant execute on function public.set_shop_device_active(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.delete_shop_device(text, text, text, text) to anon, authenticated;

comment on table beboss_private.shop_device_invites is
  'Private hashed single-use device pairing invitations. Not exposed through the Supabase Data API.';
