-- Keep the invitation registry inaccessible to all Data API roles even if
-- table grants are accidentally widened later. service_role bypasses RLS.
create policy "No client access to private device invitations"
on beboss_private.shop_device_invites
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create index if not exists shop_device_invites_device_record_id_idx
  on beboss_private.shop_device_invites (device_record_id);
