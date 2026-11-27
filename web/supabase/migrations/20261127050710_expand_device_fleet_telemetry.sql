-- Extend the existing privacy-safe terminal report with stable hardware/software context.
-- No user IP collection or background location tracking is introduced.
alter table public.device_security_telemetry
  add column if not exists device_platform text not null default 'ANDROID'
    check (device_platform in ('ANDROID', 'DESKTOP', 'IOS', 'OTHER')),
  add column if not exists manufacturer text not null default '',
  add column if not exists model text not null default '',
  add column if not exists os_release text not null default '',
  add column if not exists sdk_int integer not null default 0 check (sdk_int >= 0),
  add column if not exists app_version text not null default '',
  add column if not exists app_build integer not null default 0 check (app_build >= 0),
  add column if not exists locale_tag text not null default '',
  add column if not exists timezone_id text not null default '';

create index if not exists idx_device_security_telemetry_platform_updated
  on public.device_security_telemetry (device_platform, updated_at desc);
