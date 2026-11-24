-- Keep the exposed public RPC surface as SECURITY INVOKER wrappers.
-- All registry/role lookups that must bypass tenant RLS live in the non-exposed
-- beboss_private schema, with tightly-scoped EXECUTE grants.

grant usage on schema beboss_private to anon, authenticated, service_role;

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
    where s.id = p_legacy_key and s.legacy_sync_disabled = false
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

create or replace function beboss_private.is_beboss_admin_internal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and public.has_role(auth.uid(), 'admin'::public.app_role);
$function$;

create or replace function beboss_private.is_beboss_staff_internal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'support'::public.app_role)
    );
$function$;

revoke all on function beboss_private.resolve_android_shop_context(text,text,text) from public;
revoke all on function beboss_private.is_beboss_admin_internal() from public;
revoke all on function beboss_private.is_beboss_staff_internal() from public;
grant execute on function beboss_private.resolve_android_shop_context(text,text,text) to anon, authenticated, service_role;
grant execute on function beboss_private.is_beboss_admin_internal() to authenticated, service_role;
grant execute on function beboss_private.is_beboss_staff_internal() to authenticated, service_role;

create or replace function public.current_shop_sync_key()
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select c.shop_id
  from beboss_private.resolve_android_shop_context(
    nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-id')), ''),
    nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-token')), ''),
    nullif(trim((current_setting('request.headers', true)::json ->> 'x-shop-sync-key')), '')
  ) c;
$function$;

create or replace function public.current_shop_actor_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select c.actor_role
  from beboss_private.resolve_android_shop_context(
    nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-id')), ''),
    nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-token')), ''),
    nullif(trim((current_setting('request.headers', true)::json ->> 'x-shop-sync-key')), '')
  ) c;
$function$;

create or replace function public.current_shop_device_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select c.device_id
  from beboss_private.resolve_android_shop_context(
    nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-id')), ''),
    nullif(trim((current_setting('request.headers', true)::json ->> 'x-beboss-device-token')), ''),
    null
  ) c;
$function$;

create or replace function public.is_beboss_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select beboss_private.is_beboss_admin_internal();
$function$;

create or replace function public.is_beboss_staff()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select beboss_private.is_beboss_staff_internal();
$function$;

revoke all on function public.current_shop_sync_key() from public;
revoke all on function public.current_shop_actor_role() from public;
revoke all on function public.current_shop_device_id() from public;
revoke all on function public.is_beboss_admin() from public, anon;
revoke all on function public.is_beboss_staff() from public, anon;
grant execute on function public.current_shop_sync_key() to anon, authenticated, service_role;
grant execute on function public.current_shop_actor_role() to anon, authenticated, service_role;
grant execute on function public.current_shop_device_id() to anon, authenticated, service_role;
grant execute on function public.is_beboss_admin() to authenticated, service_role;
grant execute on function public.is_beboss_staff() to authenticated, service_role;

comment on schema beboss_private is
  'Non-exposed implementation schema. Tenant and platform privilege checks are performed by SECURITY DEFINER helpers here, while public RPC wrappers remain SECURITY INVOKER.';
