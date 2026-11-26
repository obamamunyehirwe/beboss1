-- Run snapshot pruning as the authenticated device's role so table RLS is
-- enforced instead of bypassed by SECURITY DEFINER. The function still verifies
-- shop and exact device identity before deleting any prior generations.
alter function public.prune_branch_sync_snapshot_generations(text, text, text, integer)
  security invoker;

comment on function public.prune_branch_sync_snapshot_generations(text, text, text, integer)
  is 'Prunes old Android snapshot generations under tenant RLS only after verifying that the signed caller device matches the target device and the generation is complete.';
