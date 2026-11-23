-- Keep tenant-key access independent from admin/staff role helpers.
-- Anonymous mobile/web clients must not need EXECUTE on restricted admin functions.
-- Authenticated staff/admin retain their additional global privileges.

-- SHOP BRANCHES
drop policy if exists "Tenant or admin insert shop_branches" on public.shop_branches;
drop policy if exists "Tenant or admin update shop_branches" on public.shop_branches;
drop policy if exists "Tenant or staff read shop_branches" on public.shop_branches;
drop policy if exists "Admin delete shop_branches" on public.shop_branches;

create policy "Tenant insert shop_branches"
on public.shop_branches
for insert
to anon, authenticated
with check (
  shop_sync_key = public.current_shop_sync_key()
  and shop_sync_key <> ''
);

create policy "Admin insert shop_branches"
on public.shop_branches
for insert
to authenticated
with check (public.is_beboss_admin());

create policy "Tenant update shop_branches"
on public.shop_branches
for update
to anon, authenticated
using (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
with check (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');

create policy "Admin update shop_branches"
on public.shop_branches
for update
to authenticated
using (public.is_beboss_admin())
with check (public.is_beboss_admin());

create policy "Tenant read shop_branches"
on public.shop_branches
for select
to anon, authenticated
using (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');

create policy "Staff read shop_branches"
on public.shop_branches
for select
to authenticated
using (public.is_beboss_staff());

create policy "Admin delete shop_branches"
on public.shop_branches
for delete
to authenticated
using (public.is_beboss_admin());

-- STOCK TRANSFERS
drop policy if exists "Tenant or admin insert shop_stock_transfers" on public.shop_stock_transfers;
drop policy if exists "Tenant or admin update shop_stock_transfers" on public.shop_stock_transfers;
drop policy if exists "Tenant or staff read shop_stock_transfers" on public.shop_stock_transfers;
drop policy if exists "Admin delete shop_stock_transfers" on public.shop_stock_transfers;

create policy "Tenant insert shop_stock_transfers"
on public.shop_stock_transfers
for insert
to anon, authenticated
with check (
  shop_sync_key = public.current_shop_sync_key()
  and shop_sync_key <> ''
);

create policy "Admin insert shop_stock_transfers"
on public.shop_stock_transfers
for insert
to authenticated
with check (public.is_beboss_admin());

create policy "Tenant update shop_stock_transfers"
on public.shop_stock_transfers
for update
to anon, authenticated
using (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '')
with check (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');

create policy "Admin update shop_stock_transfers"
on public.shop_stock_transfers
for update
to authenticated
using (public.is_beboss_admin())
with check (public.is_beboss_admin());

create policy "Tenant read shop_stock_transfers"
on public.shop_stock_transfers
for select
to anon, authenticated
using (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> '');

create policy "Staff read shop_stock_transfers"
on public.shop_stock_transfers
for select
to authenticated
using (public.is_beboss_staff());

create policy "Admin delete shop_stock_transfers"
on public.shop_stock_transfers
for delete
to authenticated
using (public.is_beboss_admin());
