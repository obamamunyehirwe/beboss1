-- Live Supabase migration 20261121230422_secure_bb3_unlock_verification.
-- Legacy BB2 verification is rate-limited and performed only against issued rows.
create table if not exists public.unlock_code_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_unlock_code_attempts_ip_created
  on public.unlock_code_verification_attempts (ip_hash, created_at desc);

alter table public.unlock_code_verification_attempts enable row level security;
revoke all on public.unlock_code_verification_attempts from anon, authenticated, public;
grant all on public.unlock_code_verification_attempts to service_role;
