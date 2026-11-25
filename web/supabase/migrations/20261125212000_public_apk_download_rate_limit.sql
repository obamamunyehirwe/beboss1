-- Extend the server-only atomic sliding-window limiter to public APK downloads.
-- Only a SHA-256 HMAC-like keyed digest is persisted; raw client IPs are never stored.
alter table beboss_private.rate_limit_events
  drop constraint if exists rate_limit_events_scope_check;

alter table beboss_private.rate_limit_events
  add constraint rate_limit_events_scope_check
  check (scope in ('legacy_bb2', 'public_contact', 'desktop_payment_claim', 'public_apk_download'));

create or replace function public.consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_max_hits integer,
  p_window_seconds integer
)
returns table (allowed boolean, request_count integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
  v_hits integer;
  v_oldest timestamptz;
  v_retry integer := 0;
  v_allowed boolean := true;
begin
  if p_scope not in ('legacy_bb2', 'public_contact', 'desktop_payment_claim', 'public_apk_download')
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_max_hits < 1 or p_max_hits > 100
     or p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'Invalid rate-limit parameters.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_scope || ':' || p_key_hash, 0)
  );

  v_cutoff := v_now - make_interval(secs => p_window_seconds);
  select count(*)::integer, min(e.occurred_at)
    into v_hits, v_oldest
  from beboss_private.rate_limit_events e
  where e.scope = p_scope
    and e.key_hash = p_key_hash
    and e.occurred_at > v_cutoff;

  if v_hits >= p_max_hits then
    v_allowed := false;
    v_retry := greatest(
      1,
      ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - v_now)))::integer
    );
  else
    insert into beboss_private.rate_limit_events (scope, key_hash, occurred_at)
    values (p_scope, p_key_hash, v_now);
    v_hits := v_hits + 1;
  end if;

  with stale as (
    select e.event_id
    from beboss_private.rate_limit_events e
    where e.occurred_at < v_now - interval '24 hours'
    order by e.occurred_at
    limit 250
  )
  delete from beboss_private.rate_limit_events e
  using stale
  where e.event_id = stale.event_id;

  return query select v_allowed, v_hits, v_retry;
end;
$function$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;
