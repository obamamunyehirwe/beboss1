-- Regression: ordinary admin payment state changes are not gateway edits.
-- The same JWT role used by the admin UI is simulated without touching live data.
begin;

do $test$
declare
  v_request_id text := 'TEST-GATEWAY-GUARD-' || gen_random_uuid()::text;
  v_rows integer := 0;
  v_blocked boolean := false;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.payment_requests (
    id, shop_name, owner_username, owner_phone, provider, status,
    branch_count, worker_count, device_count, duration_months
  ) values (
    v_request_id, 'Gateway guard regression', 'gateway_guard_test',
    '0780000000', 'MTN MoMo', 'PENDING_VERIFICATION', 1, 1, 1, 1
  );

  -- Exact class of update used by admin Reject.
  update public.payment_requests
     set status = 'REJECTED',
         rejection_reason = 'The payment could not be confirmed with the provider.',
         verified_by_admin = 'BeBoss regression test',
         updated_at = 1795559999000
   where id = v_request_id
     and status = 'PENDING_VERIFICATION';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Payment rejection update did not affect exactly one row.';
  end if;

  -- A manually verified admin approval remains a supported path.
  update public.payment_requests
     set status = 'APPROVED',
         admin_verification_note = 'Regression test manually verified the provider transaction.',
         verified_by_admin = 'BeBoss regression test',
         updated_at = 1795560000000
   where id = v_request_id
     and status = 'REJECTED';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Payment approval update did not affect exactly one row.';
  end if;

  -- But client/admin JWTs still cannot write gateway evidence.
  begin
    update public.payment_requests
       set gateway_reference = 'CLIENT-FORGED-REFERENCE'
     where id = v_request_id;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'A non-service role modified gateway verification evidence.';
  end if;

  delete from public.payment_requests where id = v_request_id;
end;
$test$;

rollback;
