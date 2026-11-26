-- This migration may be encountered before the snapshot-generation RPC exists
-- in a clean database assembled from historical schema files. In that case the
-- following generation migration creates the RPC and the later hardening migration
-- applies SECURITY INVOKER after creation.
do $$
begin
  if to_regprocedure('public.prune_branch_sync_snapshot_generations(text,text,text,integer)') is not null then
    execute 'alter function public.prune_branch_sync_snapshot_generations(text, text, text, integer) security invoker';
    execute 'comment on function public.prune_branch_sync_snapshot_generations(text, text, text, integer) is ''Prunes old Android snapshot generations under tenant RLS after verifying the authenticated caller device matches the target device and generation is complete.''';
  end if;
end;
$$;
