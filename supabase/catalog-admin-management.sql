alter table public.catalog_products
  add column if not exists category text not null default 'Ready-made human-hair wigs',
  add column if not exists texture text,
  add column if not exists product_length text,
  add column if not exists image_path text;

update public.catalog_products
set category = case
  when product_type ilike '%frontal%' then 'Frontals'
  when product_type ilike '%closure%' then 'Closures'
  when product_type ilike '%bundle%' then 'Raw human-hair bundles'
  when product_type ilike '%extension%' then 'Hair extensions and attachments'
  when product_type ilike '%synthetic%' then 'Synthetic wigs'
  when product_type ilike '%haircare%' or product_type ilike '%maintenance%' then 'Haircare and maintenance products'
  else category
end;

grant select on public.catalog_products to anon, authenticated;
grant insert, update, delete on public.catalog_products to authenticated;
grant usage, select on sequence public.catalog_products_id_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload catalog images" on storage.objects;
create policy "Admins upload catalog images"
on storage.objects for insert to authenticated
with check (bucket_id = 'catalog-images' and public.is_admin());

drop policy if exists "Admins update catalog images" on storage.objects;
create policy "Admins update catalog images"
on storage.objects for update to authenticated
using (bucket_id = 'catalog-images' and public.is_admin())
with check (bucket_id = 'catalog-images' and public.is_admin());

drop policy if exists "Admins delete catalog images" on storage.objects;
create policy "Admins delete catalog images"
on storage.objects for delete to authenticated
using (bucket_id = 'catalog-images' and public.is_admin());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'catalog_products'
  ) then
    alter publication supabase_realtime add table public.catalog_products;
  end if;
end;
$$;
