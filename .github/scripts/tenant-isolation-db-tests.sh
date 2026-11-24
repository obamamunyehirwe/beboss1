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
create extension if not exists plpgsql;
create extension pgcrypto with schema extensions;
create publication supabase_realtime;

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

echo "Applying all additive Supabase migrations in chronological order."
for migration in web/supabase/migrations/*.sql; do
  echo "Applying $migration"
  psql -X -v ON_ERROR_STOP=1 -f "$migration"
done

echo "Running Android device credential and cross-tenant isolation regression tests."
psql -X -v ON_ERROR_STOP=1 -f web/supabase/tests/android_device_credentials.sql
echo "Tenant-isolation database regression tests passed."
