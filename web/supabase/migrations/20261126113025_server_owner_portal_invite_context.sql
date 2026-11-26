-- Allow only server-role owner-portal RPCs to resolve a shop tenant after
-- legacy Android access has been retired. This does NOT re-enable deterministic
-- tenant access for anon/authenticated clients. The service-role path is safe only
-- because its key remains server-side and the invitation RPC independently checks
-- the active shop owner, assigned user, device, and branch records.
create or replace function beboss_private.resolve_android_shop_context(
  p_device_id text,
  p_device_token text,
  p_legacy_key text
)
returns table(shop_id text, actor_role text, device_id text)
language sql
stable
security definer
set search_path = ''
as $function$
  with device_context as (
    select d.shop_id, d.actor_role
    from beboss_private.lookup_android_device_context(p_device_id, p_device_token) d
    limit 1
  ),
  legacy_context as (
    select s.id as shop_id
    from public.shop_accounts s
    where s.id = p_legacy_key
      and (
        s.legacy_sync_disabled = false
        or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      )
    limit 1
  )
  select
    case
      when p_device_id is not null or p_device_token is not null
        then coalesce((select d.shop_id from device_context d), '')
      else coalesce((select l.shop_id from legacy_context l), '')
    end,
    case
      when p_device_id is not null or p_device_token is not null
        then coalesce((select d.actor_role from device_context d), '')
      else case when exists (select 1 from legacy_context) then 'LEGACY' else '' end
    end,
    case
      when p_device_id is not null or p_device_token is not null
        then case when exists (select 1 from device_context) then p_device_id else '' end
      else ''
    end;
$function$;

revoke all on function beboss_private.resolve_android_shop_context(text,text,text) from public;
grant execute on function beboss_private.resolve_android_shop_context(text,text,text) to anon, authenticated, service_role;

-- The two owner-portal device invitation calls execute from trusted server code.
-- Their inner SECURITY DEFINER functions still validate the device slot, active
-- OWNER user, registered primary device, branch, assignee and one-hour expiry.
grant execute on function public.issue_shop_device_invite(text,text,text,text,text,text,bigint) to service_role;
grant execute on function public.revoke_shop_device_invites(text,text,text,text) to service_role;
grant execute on function beboss_private.issue_shop_device_invite(text,text,text,text,text,text,bigint) to service_role;
grant execute on function beboss_private.revoke_shop_device_invites(text,text,text,text) to service_role;

comment on function beboss_private.resolve_android_shop_context(text,text,text) is
  'Resolves Android device tokens for all clients. A deterministic legacy key is honored only before owner-approved cutover, except inside trusted service_role requests that invoke independently validating server-side RPCs.';
