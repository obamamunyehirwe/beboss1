-- OTP limit buckets are service-role only, shared by the phone destination,
-- and independent across distinct phone digests. All fixtures are rolled back.
begin;

do $test$
declare
  bucket_one text := 'owner-phone:' || repeat('a', 64);
  bucket_two text := 'owner-phone:' || repeat('b', 64);
  first_attempt uuid;
  second_attempt uuid;
  third_attempt uuid;
  other_phone_attempt uuid;
begin
  first_attempt := public.take_shop_owner_otp_slot(bucket_one, 1900000000000, 600000, 2);
  second_attempt := public.take_shop_owner_otp_slot(bucket_one, 1900000000001, 600000, 2);
  third_attempt := public.take_shop_owner_otp_slot(bucket_one, 1900000000002, 600000, 2);
  other_phone_attempt := public.take_shop_owner_otp_slot(bucket_two, 1900000000002, 600000, 2);

  if first_attempt is null or second_attempt is null then
    raise exception 'The first two phone OTP attempts must be accepted.';
  end if;
  if third_attempt is not null then
    raise exception 'The third request for the same phone bucket must be throttled.';
  end if;
  if other_phone_attempt is null then
    raise exception 'A different phone destination must have an independent throttle bucket.';
  end if;
end
$test$;

insert into public.shop_owner_otp_attempts(shop_id, created_at, status)
values ('legacy-shop-key-expired', 1000, 'FAILED');

select public.take_shop_owner_otp_slot(
  'owner-phone:' || repeat('c', 64),
  1900000000000,
  600000,
  3
);

do $test$
begin
  if exists (select 1 from public.shop_owner_otp_attempts where shop_id = 'legacy-shop-key-expired') then
    raise exception 'Expired legacy throttle rows must be pruned across all buckets.';
  end if;
end
$test$;

rollback;
