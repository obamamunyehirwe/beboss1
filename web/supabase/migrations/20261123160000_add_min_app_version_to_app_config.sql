-- The version endpoint and Admin Settings share this minimum supported version.
alter table public.app_config
  add column if not exists min_app_version text not null default '2.3.0';

update public.app_config
set min_app_version = '2.3.0',
    updated_at = (extract(epoch from clock_timestamp()) * 1000)::bigint
where id = 'global'
  and (min_app_version is null or min_app_version = '' or min_app_version = '2.1.0');

comment on column public.app_config.min_app_version is
  'Minimum supported Android app version required for cloud access.';
