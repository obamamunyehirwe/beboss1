create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  severity text not null default 'INFO' check (severity in ('INFO','SUCCESS','WARNING','CRITICAL')),
  audience text not null default 'ALL' check (audience in ('ALL','WEBSITE','APP')),
  target_shop_key text not null default '',
  cta_label text not null default '',
  cta_url text not null default '',
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_title_len check (char_length(title) between 2 and 160),
  constraint announcements_body_len check (char_length(body) <= 2000)
);
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;
alter table public.announcements enable row level security;
create index idx_announcements_live on public.announcements (is_active, starts_at desc);

create policy "Read live announcements" on public.announcements for select
  using (
    public.is_beboss_staff()
    or (
      is_active
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
      and (target_shop_key = '' or target_shop_key = public.current_shop_sync_key())
    )
  );
create policy "Admin insert announcements" on public.announcements for insert to authenticated with check (public.is_beboss_admin());
create policy "Admin update announcements" on public.announcements for update to authenticated using (public.is_beboss_admin()) with check (public.is_beboss_admin());
create policy "Admin delete announcements" on public.announcements for delete to authenticated using (public.is_beboss_admin());

alter publication supabase_realtime add table public.announcements;

create or replace function public.public_platform_stats()
returns json language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'shops_total', (select count(*) from public.shop_accounts),
    'shops_active', (select count(*) from public.shop_accounts
                      where subscription_status in ('ACTIVE','TRIAL')
                        and subscription_expires_at > public.now_ms()
                        and not remote_kill_switch),
    'branches_total', (select coalesce(sum(branch_count), 0) from public.shop_accounts),
    'devices_active', (select count(*) from public.shop_devices where is_active),
    'devices_synced_24h', (select count(*) from public.shop_devices where last_synced_at > public.now_ms() - 86400000),
    'sync_events_24h', (select count(*) from public.cloud_sync_events where created_at > now() - interval '24 hours'),
    'codes_redeemed', (select count(*) from public.unlock_codes where status = 'REDEEMED'),
    'last_sync_at', (select max(created_at) from public.cloud_sync_events),
    'activity_14d', (
      select coalesce(json_agg(json_build_object('day', d.day, 'events', d.events) order by d.day), '[]'::json)
      from (
        select g.day::date as day,
               (select count(*) from public.cloud_sync_events e
                 where e.created_at >= g.day and e.created_at < g.day + interval '1 day') as events
        from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as g(day)
      ) d
    ),
    'server_time', now()
  );
$$;
grant execute on function public.public_platform_stats() to anon, authenticated;