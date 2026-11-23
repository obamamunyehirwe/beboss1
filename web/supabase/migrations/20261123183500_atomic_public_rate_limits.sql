-- Atomic, server-enforced sliding-window buckets for public abuse controls.
-- Only service_role may call the RPC; clients never supply a trusted tenant or actor identity.
create table if not exists beboss_private.rate_limit_buckets (
  scope text not null check (scope in ('legacy_bb2', 'public_contact')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits integer not null check (hits > 0),
  created_at timestamptz not null default clock_timestamp(),
  primary key (scope, key_hash, window_start)
);

alter table beboss_private.rate_limit_buckets enable row level security;
revoke all on table beboss_private.rate_limit_buckets from public, anon, authenticated;
grant all on table beboss_private.rate_limit_buckets to service_role;

create index if not exists rate_limit_buckets_window_start_idx
  on beboss_private.rate_limit_buckets (window_start);

create or replace function public.consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_max_hits integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  request_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_hits integer;
  v_retry integer;
begin
  if p_scope not in ('legacy_bb2', 'public_contact')
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_max_hits < 1 or p_max_hits > 100
     or p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'Invalid rate-limit parameters.';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into beboss_private.rate_limit_buckets as bucket (
    scope, key_hash, window_start, hits
  ) values (
    p_scope, p_key_hash, v_window_start, 1
  )
  on conflict (scope, key_hash, window_start)
  do update set hits = bucket.hits + 1
  returning hits into v_hits;

  v_retry := greatest(
    1,
    ceil(extract(epoch from (
      v_window_start + make_interval(secs => p_window_seconds) - clock_timestamp()
    )))::integer
  );

  -- Bounded retention: discard buckets older than 24 hours during ordinary traffic.
  delete from beboss_private.rate_limit_buckets
   where window_start < v_now - interval '24 hours';

  return query select (v_hits <= p_max_hits), v_hits, v_retry;
end;
$function$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;

comment on function public.consume_rate_limit(text, text, integer, integer) is
  'Atomic fixed-window abuse limiter. Caller must be a trusted server using service_role; keys are SHA-256 hashes, never raw IP addresses or user identifiers.';
