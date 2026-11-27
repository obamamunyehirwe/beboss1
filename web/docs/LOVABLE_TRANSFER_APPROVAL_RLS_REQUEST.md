# Lovable-managed RLS change: enforce server-side stock-transfer approvals

## Why this change is required

Android transfer uploads now use the device-authenticated `beboss-desktop` Edge Function. That function loads the current shop approval policy, validates source/destination branches and current product cost, verifies owner approval signatures for threshold-crossing transfers, and writes through the Supabase service role.

The live database still has tenant INSERT/UPDATE policies on `public.shop_stock_transfers`. Those policies let a tenant bypass the approval-verification Edge Function by writing directly through PostgREST. Client-side routing alone is not a security boundary.

**This database change must be made by Lovable** because this project manages its migrations there. Do not run the SQL below as an ad-hoc production edit or commit a hand-written migration from this repository.

## Required migration

Have Lovable create and apply a versioned migration that:

1. Removes tenant-scoped direct INSERT and UPDATE policies for `anon` and `authenticated`.
2. Retains administrative INSERT/UPDATE only for authenticated BeBoss administrators.
3. Keeps tenant SELECT access unchanged.
4. Keeps the `service_role` Edge Function write path operational.
5. Verifies that no other permissive policy or grant still gives a tenant direct INSERT/UPDATE access.

The live policy names observed at review time were:

- `Tenant insert shop_stock_transfers` — `anon`
- `Tenant update shop_stock_transfers` — `anon`
- `Admin insert shop_stock_transfers` — `authenticated`, currently includes tenant OWNER/MANAGER/LEGACY access
- `Admin update shop_stock_transfers` — `authenticated`, currently includes tenant OWNER/MANAGER access

A suitable target policy shape is:

```sql
DROP POLICY IF EXISTS "Tenant insert shop_stock_transfers"
  ON public.shop_stock_transfers;
DROP POLICY IF EXISTS "Tenant update shop_stock_transfers"
  ON public.shop_stock_transfers;

DROP POLICY IF EXISTS "Admin insert shop_stock_transfers"
  ON public.shop_stock_transfers;
CREATE POLICY "Admin insert shop_stock_transfers"
  ON public.shop_stock_transfers
  FOR INSERT TO authenticated
  WITH CHECK (is_beboss_admin());

DROP POLICY IF EXISTS "Admin update shop_stock_transfers"
  ON public.shop_stock_transfers;
CREATE POLICY "Admin update shop_stock_transfers"
  ON public.shop_stock_transfers
  FOR UPDATE TO authenticated
  USING (is_beboss_admin())
  WITH CHECK (is_beboss_admin());

REVOKE INSERT, UPDATE, DELETE
  ON public.shop_stock_transfers FROM anon;
```

Lovable must inspect any additional grants/policies before applying this shape. If administrative workflows write through server actions instead of PostgREST, revoke tenant DML from `authenticated` as well and route those writes through the trusted server path. Preserve the existing SELECT policies and the service-role write path.

## Required verification after migration

Run these checks against the production schema after Lovable applies the migration:

```sql
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'shop_stock_transfers'
ORDER BY policyname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'shop_stock_transfers'
ORDER BY grantee, privilege_type;
```

Then perform negative and positive tests:

- An ordinary tenant device cannot POST or PATCH `shop_stock_transfers` through PostgREST, even when it sends the shop sync identity headers.
- An active owner/manager Android terminal can sync a valid transfer through `beboss-desktop`.
- A threshold-crossing transfer without owner proof is rejected and does not create a remote transfer.
- A transfer with a modified quantity, cost, branch, transfer ID, owner, device, policy version, reason or signature is rejected.
- A previously accepted approval is reusable only for the exact same transfer facts and exact current policy version.
- A revoked/inactive owner device or owner account cannot approve new transfers.
- Authenticated BeBoss administrators retain their intended administrative workflow.
- Tenant reads remain available under the existing tenant read policy.

## Release gate

Do not declare Android transfer approval parity complete until this migration is applied and the direct-REST negative test proves that the Edge Function cannot be bypassed.
