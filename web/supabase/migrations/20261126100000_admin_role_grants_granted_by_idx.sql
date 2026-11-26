-- The grantor column is a nullable FK/audit attribute. The partial index
-- covers every real grantor reference without indexing service-created NULL rows.
CREATE INDEX IF NOT EXISTS admin_role_grants_granted_by_idx
  ON public.admin_role_grants (granted_by)
  WHERE granted_by IS NOT NULL;

COMMENT ON INDEX public.admin_role_grants_granted_by_idx IS
  'Supports grantor foreign-key checks and admin audit lookups.';
