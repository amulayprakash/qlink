-- ===========================================================================
-- 0006 :: wallpapers
--
-- Storage for the creator page's background photo.
--
-- No column is added: the wallpaper lives in profiles.theme_config, which is
-- jsonb with every field optional (see 0002 and lib/types.ts#ThemeConfig), so
-- it layers on like the accent and the font did. Only the BUCKET is new.
--
-- A separate bucket from 'avatars' rather than a second folder inside it,
-- because the two now differ in the only two things a bucket configures: an
-- avatar is a small square and a wallpaper is a full-bleed photo off a phone
-- camera, so they cannot share a size limit.
-- ===========================================================================

-- file_size_limit and allowed_mime_types are the REAL guard. The uploader
-- downscales and re-encodes to WebP first (lib/image.ts), which puts a typical
-- wallpaper at 200-400KB — but that runs in the browser, and the browser is not
-- a trust boundary. 6MB is the raw cap on anything that reaches storage; it is
-- generous because it is a backstop for a pathological camera original, not the
-- expected size.
--
-- `do update` rather than `do nothing`: unlike 0001's insert, this migration is
-- the only definition of these limits, so re-running it after a limit changes
-- has to actually move the limit. Re-running it unchanged is a no-op either way.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wallpapers',
  'wallpapers',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read: a wallpaper is painted by a visitor's browser on a public page,
-- so it is as public as the page is. Same shape as avatars_public_read.
drop policy if exists "wallpapers_public_read" on storage.objects;
create policy "wallpapers_public_read" on storage.objects
  for select using (bucket_id = 'wallpapers');

-- The first path segment must be the uploader's own id. This is what makes the
-- anon-key upload in the browser safe: the client picks the path, so the path
-- is what has to be checked. Mirrors the avatars policies in 0001 exactly —
-- lib/image.ts#uploadWallpaper depends on this shape.
drop policy if exists "wallpapers_owner_write" on storage.objects;
create policy "wallpapers_owner_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wallpapers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "wallpapers_owner_update" on storage.objects;
create policy "wallpapers_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'wallpapers' and (storage.foldername(name))[1] = auth.uid()::text);

-- Delete matters more here than it did for avatars: the uploader prunes the
-- creator's previous wallpapers after a successful upload, so this policy is on
-- the live path rather than reserved for a future cleanup.
drop policy if exists "wallpapers_owner_delete" on storage.objects;
create policy "wallpapers_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wallpapers' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===========================================================================
-- Rollback
-- ===========================================================================
-- drop policy if exists "wallpapers_public_read" on storage.objects;
-- drop policy if exists "wallpapers_owner_write" on storage.objects;
-- drop policy if exists "wallpapers_owner_update" on storage.objects;
-- drop policy if exists "wallpapers_owner_delete" on storage.objects;
-- delete from storage.objects where bucket_id = 'wallpapers';
-- delete from storage.buckets where id = 'wallpapers';
-- update public.profiles set theme_config = theme_config - 'wallpaper';
