-- Regression coverage for tables containing server-only identity and secret material.
begin;

do $test$
begin
  if has_table_privilege('anon', 'public.admin_bootstrap_emails', 'SELECT')
     or has_table_privilege('authenticated', 'public.admin_bootstrap_emails', 'SELECT') then
    raise exception 'Client roles must not select the admin bootstrap allow-list.';
  end if;
  if has_table_privilege('anon', 'public.app_secrets', 'SELECT')
     or has_table_privilege('authenticated', 'public.app_secrets', 'SELECT') then
    raise exception 'Client roles must not select server-side application secrets.';
  end if;
  if has_table_privilege('anon', 'public.app_secrets', 'INSERT')
     or has_table_privilege('authenticated', 'public.app_secrets', 'INSERT')
     or has_table_privilege('anon', 'public.app_secrets', 'UPDATE')
     or has_table_privilege('authenticated', 'public.app_secrets', 'UPDATE')
     or has_table_privilege('anon', 'public.app_secrets', 'DELETE')
     or has_table_privilege('authenticated', 'public.app_secrets', 'DELETE') then
    raise exception 'Client roles must not mutate server-side application secrets.';
  end if;
  if not has_table_privilege('service_role', 'public.app_secrets', 'SELECT')
     or not has_table_privilege('service_role', 'public.app_secrets', 'INSERT')
     or not has_table_privilege('service_role', 'public.app_secrets', 'UPDATE') then
    raise exception 'Trusted server functions must retain access to app_secrets.';
  end if;
  if not has_table_privilege('service_role', 'public.admin_bootstrap_emails', 'SELECT') then
    raise exception 'Trusted bootstrap function must retain read access to the allow-list.';
  end if;
end
$test$;

rollback;
