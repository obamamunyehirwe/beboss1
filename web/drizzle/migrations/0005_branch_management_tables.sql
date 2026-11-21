-- ============================================================================
-- BeBoss: Branch Management — normalized cloud tables
-- Mirrors the tenant-scoped pattern used by shop_users / shop_devices / shop_accounts
-- (shop_sync_key = public.current_shop_sync_key(), anon read/insert/update,
--  admin-only delete). Purely additive; does not touch branch_sync_snapshots.
-- ============================================================================

-- ============ SHOP BRANCHES ============
create table if not exists public.shop_branches (
  id text primary key,
  shop_sync_key text not null,
  shop_name text not null default '',
  name text not null default 'Main Branch',
  code text not null default 'BR-01',
  address text not null default '',
  phone text not null default '',
  manager_user_id text not null default '',
  manager_name text not null default '',
  is_main_branch boolean not null default false,
  is_active boolean not null default true,
  color_hex text not null default '#FF6B1A',
  daily_sales_target_rwf bigint not null default 0,
  monthly_target_rwf bigint not null default 0,
  opening_cash_float bigint not null default 0,
  stock_value_rwf bigint not null default 0,
  product_count integer not null default 0,
  operational_status text not null default 'OPEN',
  email text not null default '',
  notes text not null default '',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  sync_version bigint not null default 1,
  hlc_timestamp bigint not null default 0,
  last_modified_device_id text not null default ''
);
grant select, insert, update on public.shop_branches to anon;
grant select, insert, update, delete on public.shop_branches to authenticated;
grant all on public.shop_branches to service_role;
alter table public.shop_branches enable row level security;
create index if not exists idx_shop_branches_shop_key on public.shop_branches(shop_sync_key);
create index if not exists idx_shop_branches_active on public.shop_branches(is_active);
create index if not exists idx_shop_branches_updated on public.shop_branches(updated_at desc);
create policy "Tenant or staff read shop_branches" on public.shop_branches for select
  using (public.is_beboss_staff() or shop_sync_key = public.current_shop_sync_key());
create policy "Tenant or admin insert shop_branches" on public.shop_branches for insert
  with check (public.is_beboss_admin() or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> ''));
create policy "Tenant or admin update shop_branches" on public.shop_branches for update
  using (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key())
  with check (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key());
create policy "Admin delete shop_branches" on public.shop_branches for delete to authenticated
  using (public.is_beboss_admin());

-- ============ SHOP STOCK TRANSFERS ============
create table if not exists public.shop_stock_transfers (
  id text primary key,
  shop_sync_key text not null,
  shop_name text not null default '',
  transfer_number text not null default '',
  product_id text not null default '',
  product_name text not null default '',
  from_branch_id text not null default '',
  from_branch_name text not null default '',
  to_branch_id text not null default '',
  to_branch_name text not null default '',
  quantity real not null default 0,
  unit text not null default 'pcs',
  cost_value_rwf bigint not null default 0,
  transfer_date bigint not null default 0,
  status text not null default 'IN_TRANSIT',
  notes text not null default '',
  transferred_by text not null default '',
  received_by text not null default '',
  received_at bigint not null default 0,
  synced boolean not null default true,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  hlc_timestamp bigint not null default 0,
  last_modified_device_id text not null default ''
);
grant select, insert, update on public.shop_stock_transfers to anon;
grant select, insert, update, delete on public.shop_stock_transfers to authenticated;
grant all on public.shop_stock_transfers to service_role;
alter table public.shop_stock_transfers enable row level security;
create index if not exists idx_shop_transfers_shop_key on public.shop_stock_transfers(shop_sync_key);
create index if not exists idx_shop_transfers_branches on public.shop_stock_transfers(from_branch_id, to_branch_id);
create index if not exists idx_shop_transfers_updated on public.shop_stock_transfers(updated_at desc);
create policy "Tenant or staff read shop_stock_transfers" on public.shop_stock_transfers for select
  using (public.is_beboss_staff() or shop_sync_key = public.current_shop_sync_key());
create policy "Tenant or admin insert shop_stock_transfers" on public.shop_stock_transfers for insert
  with check (public.is_beboss_admin() or (shop_sync_key = public.current_shop_sync_key() and shop_sync_key <> ''));
create policy "Tenant or admin update shop_stock_transfers" on public.shop_stock_transfers for update
  using (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key())
  with check (public.is_beboss_admin() or shop_sync_key = public.current_shop_sync_key());
create policy "Admin delete shop_stock_transfers" on public.shop_stock_transfers for delete to authenticated
  using (public.is_beboss_admin());