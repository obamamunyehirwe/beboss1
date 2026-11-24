-- Look up an existing Supabase Auth account by a known registered shop phone.
-- The function returns only a user UUID and is executable by service_role only.
create or replace function public.find_auth_user_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select u.id
  from auth.users u
  where u.phone = p_phone
  limit 1;
$function$;

revoke all on function public.find_auth_user_by_phone(text) from public, anon, authenticated;
grant execute on function public.find_auth_user_by_phone(text) to service_role;
comment on function public.find_auth_user_by_phone(text) is
  'Server-only auth lookup for OTP enrollment. Returns only the Auth UUID for an exact verified phone; no PII or user list is exposed.';
