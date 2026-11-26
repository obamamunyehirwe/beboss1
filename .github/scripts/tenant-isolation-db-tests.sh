#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
export PGHOST PGPORT PGUSER PGDATABASE

for attempt in $(seq 1 60); do
  if pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "PostgreSQL did not become ready."
    exit 1
  fi
  sleep 2
done

echo "Preparing the minimal Supabase Auth/Postgres roles used by the production schema."
psql -X -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema extensions;
create schema beboss_private;
create schema storage;
create extension if not exists plpgsql;
create extension pgcrypto with schema extensions;
create publication supabase_realtime;

-- Minimal Supabase Storage surface used by the repository's real migrations.
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner_id text,
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant all on storage.objects, storage.buckets to service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text,
  phone_confirmed_at timestamptz,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    jsonb_build_object('role', nullif(current_setting('request.jwt.claim.role', true), ''))
  )
$function$;

grant usage on schema auth, extensions, beboss_private to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
SQL

echo "Applying the repository's canonical Drizzle base schema."
psql -X -v ON_ERROR_STOP=1 -f web/drizzle/migrations/0000_beboss_core_schema.sql

echo "Applying the additive Drizzle migrations in lexical version order."
for migration in web/drizzle/migrations/000[1-9]_*.sql; do
  echo "Applying $migration"
  psql -X -v ON_ERROR_STOP=1 -f "$migration"
done

echo "Applying all additive Supabase migrations in chronological order."
for migration in web/supabase/migrations/*.sql; do
  echo "Applying $migration"
  psql -X -v ON_ERROR_STOP=1 -f "$migration"
done

echo "Running Android device credential and cross-tenant isolation regression tests."
psql -X -v ON_ERROR_STOP=1 -f web/supabase/tests/android_device_credentials.sql
echo "Running admin device-credential rollout regression tests."
psql -X -v ON_ERROR_STOP=1 -f web/supabase/tests/android_device_credential_rollout_admin.sql
echo "Running role-separated RLS policy regression tests."
psql -X -v ON_ERROR_STOP=1 -f web/supabase/tests/rls_role_policy_consolidation.sql
echo "Running authenticated admin SECURITY DEFINER permission regression tests."
psql -X -v ON_ERROR_STOP=1 -f web/supabase/tests/admin_release_definer_permissions.sql
echo "Running server-only app secret and bootstrap grant regression tests."
psql -X -v ON_ERROR_STOP=1 -f web/supabase/tests/server_secret_table_grants.sql
echo "Running owner OTP destination-throttle regression tests."
psql -X -v ON_ERROR_STOP=1 -f web/supabase/tests/owner_otp_phone_throttle.sql
echo "Running payment gateway state-transition regression tests."
psql -X -v ON_ERROR_STOP=1 -f web/supabase/tests/payment_gateway_state_transitions.sql
echo "Running MTN MoMo server-only provider ledger regression tests."
psql -X -v ON_ERROR_STOP=1 -f web/supabase/tests/mtn_momo_collection_provider.sql
echo "Tenant-isolation database regression tests passed."
