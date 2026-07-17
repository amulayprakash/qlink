-- ===========================================================================
-- 0007 :: share images
--
-- The picture a chat app shows beside a creator's link when it is pasted —
-- og:image, and everything that reads it: WhatsApp, iMessage, Slack, Discord,
-- X, Facebook, LinkedIn.
--
-- No column is added, for the same reason as 0006: it lives in
-- profiles.theme_config, which is jsonb with every field optional (see 0002 and
-- lib/types.ts#ThemeConfig), so it layers on like the wallpaper did. Only the
-- BUCKET is new.
--
-- A third bucket rather than a folder inside 'wallpapers'. Both reasons are
-- correctness, not tidiness:
--
--   1. allowed_mime_types genuinely differs, and here it is a real guard rather
--      than a formality. A wallpaper is stored as whatever the browser managed
--      to encode. A share image is ALWAYS re-encoded to exactly 1200x630 JPEG
--      before it is uploaded (lib/image.ts#uploadShareImage), because the
--      scrapers that read og:image — WhatsApp's above all — are unreliable with
--      WebP, and a share image that silently fails to render is worse than one
--      that is a few KB larger. So this bucket accepts image/jpeg and nothing
--      else.
--
--   2. lib/image.ts#pruneOldWallpapers lists the creator's ENTIRE folder in
--      'wallpapers' and removes every object that is not the file it just
--      wrote. A share image sharing that folder would be deleted the next time
--      the creator changed their wallpaper — silently, and long after the
--      change that caused it.
-- ===========================================================================

-- file_size_limit and allowed_mime_types are the REAL guard: the crop and the
-- re-encode both run in the browser, and the browser is not a trust boundary.
--
-- 2MB is a backstop, not the expected size — a 1200x630 JPEG at q0.85 lands at
-- 150-300KB and cannot plausibly reach this cap. It exists so that a client
-- which bypasses lib/image.ts entirely still cannot park an arbitrarily large
-- object in the bucket.
--
-- Note what this does NOT enforce: the 1200x630 DIMENSIONS. Storage checks mime
-- and bytes, not pixels, so an authenticated creator could put a 100x100 JPEG
-- in their own folder and the og:image:width we emit for it would be a lie. The
-- only page that renders wrong is their own, so this is left as self-inflicted
-- rather than paid for with a server-side decode on every upload.
--
-- `do update` rather than `do nothing`: this migration is the only definition
-- of these limits, so re-running it after a limit changes has to actually move
-- the limit. Re-running it unchanged is a no-op either way.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'share-images',
  'share-images',
  true,
  2097152,
  array['image/jpeg']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read, and here that is load-bearing rather than incidental: the whole
-- job of this image is to be fetched by an anonymous crawler that has no
-- session and will not follow a redirect to one. Same shape as
-- wallpapers_public_read.
drop policy if exists "share_images_public_read" on storage.objects;
create policy "share_images_public_read" on storage.objects
  for select using (bucket_id = 'share-images');

-- The first path segment must be the uploader's own id. This is what makes the
-- anon-key upload in the browser safe: the client picks the path, so the path is
-- what has to be checked. Mirrors 0006 exactly — lib/image.ts#uploadShareImage
-- depends on this shape.
drop policy if exists "share_images_owner_write" on storage.objects;
create policy "share_images_owner_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'share-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "share_images_owner_update" on storage.objects;
create policy "share_images_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'share-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- On the live path, not reserved for a future cleanup: the uploader prunes the
-- creator's previous share images after a successful upload, same as 0006.
drop policy if exists "share_images_owner_delete" on storage.objects;
create policy "share_images_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'share-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===========================================================================
-- Rollback
-- ===========================================================================
-- drop policy if exists "share_images_public_read" on storage.objects;
-- drop policy if exists "share_images_owner_write" on storage.objects;
-- drop policy if exists "share_images_owner_update" on storage.objects;
-- drop policy if exists "share_images_owner_delete" on storage.objects;
-- delete from storage.objects where bucket_id = 'share-images';
-- delete from storage.buckets where id = 'share-images';
-- update public.profiles set theme_config = theme_config - 'shareImage';
