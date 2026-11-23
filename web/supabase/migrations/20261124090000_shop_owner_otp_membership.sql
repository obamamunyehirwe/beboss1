-- Authenticated owner enrollment for the My Shop portal.
-- Phone ownership is proven by Supabase Auth SMS OTP; memberships are created
-- only by the server after checking the verified Auth user against shop_accounts.

create table if not exists public.shop_owner_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id text not null references public.shop_accounts(id) on delete cascade,
  owner_username text not null,
  owner_phone text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  last_verified_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  revoked_at bigint not null default 0,
  unique (user_id, shop_id)
);

create index if not exists shop_owner_memberships_user_status_idx
  on public.shop_owner_memberships(user_id, status);

alter table public.shop_owner_memberships enable row level security;
revoke all on table public.shop_owner_memberships from public, anon;
grant select on table public.shop_owner_memberships to authenticated;
grant all on table public.shop_owner_memberships to service_role;

drop policy if exists "Owners can read their active memberships" on public.shop_owner_memberships;
create policy "Owners can read their active memberships"
  on public.shop_owner_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) and status = 'ACTIVE' and revoked_at = 0);

-- OTP issuance throttling. Only the server service role can read or write it.
create table if not exists public.shop_owner_otp_attempts (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null,
  created_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'SENT', 'FAILED', 'THROTTLED'))
);

create index if not exists shop_owner_otp_attempts_shop_created_idx
  on public.shop_owner_otp_attempts(shop_id, created_at desc);

alter table public.shop_owner_otp_attempts enable row level security;
revoke all on table public.shop_owner_otp_attempts from public, anon, authenticated;
grant all on table public.shop_owner_otp_attempts to service_role;

comment on table public.shop_owner_memberships is
  'My Shop owner access mapping created only after Supabase Auth confirms the registered owner phone by SMS OTP. Revocation blocks future portal requests.';
comment on table public.shop_owner_otp_attempts is
  'Service-role-only owner OTP issuance throttle. Does not store OTP values or plaintext phone numbers.';
