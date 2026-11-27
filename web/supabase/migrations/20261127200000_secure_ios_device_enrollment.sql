-- Secure iPhone device invitation redemption.
-- A caller receives no tenant credential merely by supplying a shop key. The
-- edge function verifies the fresh SMS-authenticated owner session and active
-- owner membership before calling this service-role-only RPC.
create or replace function public.redeem_ios_shop_device_invite(
  p_shop_sync_key text,
  p_code_hash text,
  p_device_id text,
  p_device_name text,
  p_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now bigint := public.now_ms();
  v_invite beboss_private.shop_device_invites%rowtype;
  v_device public.shop_devices%rowtype;
  v_branch public.shop_branches%rowtype;
  v_kill_switch boolean;
begin
  if coalesce(p_shop_sync_key, '') = ''
     or p_code_hash !~ '^[0-9a-f]{64}$'
     or p_device_id !~ '^IOS:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or length(coalesce(p_device_name, '')) < 1
     or length(coalesce(p_device_name, '')) > 120
     or p_owner_user_id is null then
    raise exception using errcode = '22023', message = 'The iPhone pairing details are invalid.';
  end if;

  if not exists (
    select 1
    from public.shop_owner_memberships m
    where m.shop_id = p_shop_sync_key
      and m.user_id = p_owner_user_id
      and m.status = 'ACTIVE'
      and coalesce(m.revoked_at, 0) = 0
  ) then
    raise exception using errcode = '42501', message = 'The verified account is not an active owner of this shop.';
  end if;

  select coalesce(s.remote_kill_switch, false) into v_kill_switch
  from public.shop_accounts s
  where s.id = p_shop_sync_key
  for update;

  if not found or v_kill_switch then
    raise exception using errcode = '42501', message = 'This shop is unavailable for new device pairing.';
  end if;

  select * into v_invite
  from beboss_private.shop_device_invites i
  where i.shop_sync_key = p_shop_sync_key
    and i.code_hash = p_code_hash
  for update;

  if not found or v_invite.revoked_at is not null or v_invite.expires_at < v_now then
    raise exception using errcode = '22023', message = 'This join code is invalid, expired, or revoked.';
  end if;

  select * into v_device
  from public.shop_devices d
  where d.id = v_invite.device_record_id
    and d.shop_sync_key = p_shop_sync_key
  for update;

  if not found or not v_device.is_active
     or v_device.is_owner_primary
     or v_device.assigned_user_id <> v_invite.assigned_user_id
     or v_device.branch_id <> v_invite.branch_id
     or v_device.role not in ('OWNER', 'MANAGER', 'CASHIER') then
    raise exception using errcode = '22023', message = 'The assigned iPhone device slot is no longer active.';
  end if;

  select * into v_branch
  from public.shop_branches b
  where b.id = v_device.branch_id
    and b.shop_sync_key = p_shop_sync_key
    and b.is_active = true;

  if not found then
    raise exception using errcode = '22023', message = 'The assigned branch is not active in the cloud.';
  end if;

  if v_invite.redeemed_at is not null then
    if v_invite.redeemed_device_id <> p_device_id or v_device.device_id <> p_device_id then
      raise exception using errcode = '22023', message = 'This join code has already been used on another device.';
    end if;
    return jsonb_build_object(
      'deviceRecordId', v_device.id,
      'deviceId', v_device.device_id,
      'deviceName', v_device.device_name,
      'assignedUserId', v_device.assigned_user_id,
      'role', v_device.role,
      'branchId', v_device.branch_id,
      'branchName', v_branch.name
    );
  end if;

  if v_device.device_id <> '' and v_device.device_id <> p_device_id then
    raise exception using errcode = '22023', message = 'This device slot is already paired to another terminal.';
  end if;

  update public.shop_devices
  set device_id = p_device_id,
      device_name = trim(p_device_name),
      join_code = '',
      last_synced_at = v_now,
      updated_at = v_now
  where id = v_device.id
    and shop_sync_key = p_shop_sync_key
  returning * into v_device;

  update beboss_private.shop_device_invites
  set redeemed_at = v_now,
      redeemed_device_id = p_device_id
  where id = v_invite.id;

  return jsonb_build_object(
    'deviceRecordId', v_device.id,
    'deviceId', v_device.device_id,
    'deviceName', v_device.device_name,
    'assignedUserId', v_device.assigned_user_id,
    'role', v_device.role,
    'branchId', v_device.branch_id,
    'branchName', v_branch.name
  );
end;
$function$;

revoke all on function public.redeem_ios_shop_device_invite(text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.redeem_ios_shop_device_invite(text,text,text,text,uuid) to service_role;
