-- The snapshot pruning RPC is created by the 20261126093000 generation
-- migration. Re-apply SECURITY INVOKER after creation so authenticated Android
-- calls execute under tenant RLS instead of bypassing it.
alter function public.prune_branch_sync_snapshot_generations(text, text, text, integer)
  security invoker;

comment on function public.prune_branch_sync_snapshot_generations(text, text, text, integer)
  is 'Prunes old Android snapshot generations under tenant RLS after verifying the authenticated caller device matches the target device and generation is complete.';
