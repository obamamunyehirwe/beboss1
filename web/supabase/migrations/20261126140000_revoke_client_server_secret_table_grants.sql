-- Remove direct client grants from tables that contain bootstrap allow-lists and
-- server-side application secrets. RLS remains enabled and no client policies are
-- created; only trusted Edge Functions using service_role may access these rows.
revoke all on table public.admin_bootstrap_emails from public, anon, authenticated;
revoke all on table public.app_secrets from public, anon, authenticated;

grant all on table public.admin_bootstrap_emails to service_role;
grant all on table public.app_secrets to service_role;

comment on table public.admin_bootstrap_emails is
  'Server-only bootstrap allow-list. Direct anon/authenticated grants are revoked; first-admin bootstrap resolves access in a trusted Edge Function.';
comment on table public.app_secrets is
  'Server-only configuration and secret storage. Direct anon/authenticated grants are revoked; access is restricted to trusted server functions.';
