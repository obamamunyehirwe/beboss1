begin;
-- These SECURITY DEFINER trigger functions are internal implementation details.
-- PostgreSQL grants EXECUTE to PUBLIC by default on functions; only the trigger
-- engine needs to call them, never anon or authenticated API clients.
revoke all on function public.protect_gateway_verification_fields() from public, anon, authenticated;
revoke all on function public.protect_payment_gateway_projection_fields() from public, anon, authenticated;
commit;
