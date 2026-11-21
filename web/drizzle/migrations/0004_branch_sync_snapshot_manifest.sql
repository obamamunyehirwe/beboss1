alter table public.branch_sync_snapshots
  add column sync_generation text not null default '',
  add column chunk_index integer not null default 0,
  add column chunk_count integer not null default 0;

create index idx_branch_sync_generation
  on public.branch_sync_snapshots (shop_sync_key, device_id, sync_generation);
