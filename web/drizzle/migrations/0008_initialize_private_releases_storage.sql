-- Ensure the Admin → App releases uploader has a private production bucket.
-- Public downloads are served only through the server-side signed-URL endpoint.
insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values
  ('releases', 'releases', false, 104857600, array['application/vnd.android.package-archive'])
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins upload releases'
  ) then
    create policy "Admins upload releases"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'releases' and public.is_beboss_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins read releases'
  ) then
    create policy "Admins read releases"
      on storage.objects for select to authenticated
      using (bucket_id = 'releases' and public.is_beboss_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins update releases'
  ) then
    create policy "Admins update releases"
      on storage.objects for update to authenticated
      using (bucket_id = 'releases' and public.is_beboss_admin())
      with check (bucket_id = 'releases' and public.is_beboss_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins delete releases'
  ) then
    create policy "Admins delete releases"
      on storage.objects for delete to authenticated
      using (bucket_id = 'releases' and public.is_beboss_admin());
  end if;
end
$policies$;
