-- Device security posture and privacy-safe operational telemetry.
-- Tenant writes are scoped by current_shop_sync_key(); BeBoss staff may inspect fleet-wide posture.
create table if not exists public.device_security_telemetry (
  id text primary key,
  shop_sync_key text not null,
  shop_name text not null default '',
  device_id text not null,
  device_name text not null default '',
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  posture_label text not null default '',
  is_rooted boolean not null default false,
  has_hooking boolean not null default false,
  is_emulator boolean not null default false,
  clock_rollback_detected boolean not null default false,
  tamper_incident_count integer not null default 0,
  clock_skew_ms bigint not null default 0,
  tamper_reason text not null default '',
  keystore_backing text not null default '',
  signals_json text not null default '[]',
  latitude double precision not null default 0 check (latitude between -90 and 90),
  longitude double precision not null default 0 check (longitude between -180 and 180),
  accuracy_meters real not null default 0 check (accuracy_meters >= 0),
  location_captured_at bigint not null default 0,
  location_label text not null default 'Unavailable',
  unsynced_messages_count integer not null default 0 check (unsynced_messages_count >= 0),
  message_summary_json jsonb not null default '{}'::jsonb,
  permissions_summary text not null default '',
  inspected_at bigint not null default 0,
  updated_at bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  constraint device_security_telemetry_shop_device_unique unique (shop_sync_key, device_id)
);

create index if not exists idx_device_security_telemetry_shop_updated
  on public.device_security_telemetry (shop_sync_key, updated_at desc);
create index if not exists idx_device_security_telemetry_risk_updated
  on public.device_security_telemetry (risk_score desc, updated_at desc);
create index if not exists idx_device_security_telemetry_tamper_updated
  on public.device_security_telemetry (clock_rollback_detected, updated_at desc);

-- New public tables require explicit Data API grants; row access remains RLS-constrained.
grant select, insert, update, delete on public.device_security_telemetry to anon, authenticated;
grant all on public.device_security_telemetry to service_role;

alter table public.device_security_telemetry enable row level security;

drop policy if exists "Tenant or staff read device security telemetry" on public.device_security_telemetry;
create policy "Tenant or staff read device security telemetry"
  on public.device_security_telemetry for select
  using (public.is_beboss_staff() or shop_sync_key = public.current_shop_sync_key());

drop policy if exists "Tenant or admin insert device security telemetry" on public.device_security_telemetry;
create policy "Tenant or admin insert device security telemetry"
  on public.device_security_telemetry for insert
  with check (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
  );

drop policy if exists "Tenant or admin update device security telemetry" on public.device_security_telemetry;
create policy "Tenant or admin update device security telemetry"
  on public.device_security_telemetry for update
  using (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key())
  with check (
    public.is_beboss_admin()
    or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
  );

drop policy if exists "Admin delete device security telemetry" on public.device_security_telemetry;
create policy "Admin delete device security telemetry" on public.device_security_telemetry for delete to authenticated
  using (public.is_beboss_admin());
