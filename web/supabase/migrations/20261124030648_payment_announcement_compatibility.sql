-- Compatibility for clients that use either the original payment provider
-- column name or the newer gateway provider projection. Also keep public
-- announcement reads limited to currently published, audience-matched notices.

begin;

alter table public.payment_requests
  add column if not exists gateway_provider text generated always as (provider) stored;

comment on column public.payment_requests.gateway_provider is
  'Backward-compatible, read-only alias of provider for older admin clients. Write to provider.';

alter table public.announcements enable row level security;

drop policy if exists "Read live announcements" on public.announcements;
create policy "Read live announcements"
  on public.announcements
  for select
  using (
    public.is_beboss_staff()
    or (
      is_active
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
      and (
        target_shop_key = ''
        or target_shop_key = public.current_shop_sync_key()
      )
      and (
        (
          public.current_shop_sync_key() = ''
          and audience in ('ALL', 'WEBSITE')
        )
        or (
          public.current_shop_sync_key() <> ''
          and audience in ('ALL', 'APP')
        )
      )
    )
  );

create index if not exists idx_announcements_public_schedule
  on public.announcements (is_active, audience, starts_at desc, ends_at);

revoke all privileges on public.announcements from anon;
grant select on public.announcements to anon;

notify pgrst, 'reload schema';

commit;
