import { createClient } from "@/lib/supabase/client";
import {
  MAX_SHARE_IMAGE_BYTES,
  MAX_WALLPAPER_BYTES,
  SHARE_IMAGE_H,
  SHARE_IMAGE_MIME,
  SHARE_IMAGE_W,
  WALLPAPER_MIME,
} from "@/lib/validation";

/** Long edge, in CSS pixels, that a stored wallpaper is capped at.
 *
 *  1600 covers a 2x phone (the only place most creator pages are ever opened)
 *  and a 1x laptop. Going to 2560 for the rare desktop visit would roughly
 *  double the bytes for every phone visit, which is the wrong trade for an
 *  image that sits BEHIND the content and is scrimmed on top of that. */
const MAX_DIM = 1600;

/** WebP at 0.82 is visually lossless for a scrimmed, out-of-focus backdrop and
 *  lands a 1600px photo at roughly 200-400KB. */
const QUALITY = 0.82;

/**
 * Downscale and re-encode an image in the browser, before it is uploaded.
 *
 * This is the whole reason the page can use a plain CSS background-image: we do
 * not run an image optimiser over wallpapers (next/image cannot touch a CSS
 * background, and putting one in front of the bucket would mean a route, a
 * cache and a bill), so the only place the size of a wallpaper can be fixed is
 * before it is stored. A photo straight off a phone is ~4000px and 5-8MB, and
 * it would be shipped, in full, to every visitor of the creator's page.
 *
 * Best-effort on purpose: every failure path returns the ORIGINAL file rather
 * than throwing. A creator whose browser cannot decode their HEIC in a canvas
 * should get a slow wallpaper, not a broken uploader — the bucket's own size
 * limit (0006) is what stops the pathological case, and it does not depend on
 * any of this working.
 */
export async function downscaleImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));

    // Re-encode even when the image is already small enough: a 900px PNG
    // screenshot can outweigh a 1600px WebP photo several times over, and the
    // whole point is the bytes, not the pixels.
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    // Keep whichever is actually smaller. Re-encoding a tiny, already-optimal
    // JPEG can make it bigger, and shipping the larger of the two would be a
    // strange way to spend a compression step.
    if (!blob || blob.size >= file.size) return file;
    return blob;
  } catch {
    return file;
  }
}

export type UploadResult = { url: string } | { error: string };

/**
 * Put a wallpaper in storage and return its public URL.
 *
 * Browser -> Supabase Storage with the anon key and no server hop, which is the
 * house pattern (see TitleBioModal). It is safe because the client chooses the
 * PATH and the path is what RLS checks: `wallpapers_owner_write` in 0006
 * requires the first segment to be the caller's own uid, so a forged path lands
 * in someone else's folder and is refused rather than written.
 *
 * The checks here are courtesy, not security — the bucket enforces both limits
 * itself (0006). They exist so a creator on a phone finds out that their 40MB
 * panorama is too big before they spend two minutes of tethered data uploading
 * it, instead of after.
 */
export async function uploadWallpaper(
  file: File,
  userId: string,
): Promise<UploadResult> {
  if (!WALLPAPER_MIME.includes(file.type)) {
    return { error: "Use a JPEG, PNG or WebP image." };
  }
  if (file.size > MAX_WALLPAPER_BYTES) {
    return { error: "That image is over 6MB. Try a smaller one." };
  }

  const blob = await downscaleImage(file);
  // The extension has to describe what downscaleImage actually returned, not
  // what the creator picked: a .png that came back as WebP would be stored with
  // a mime the bucket's allowlist accepts but a name that lies about it.
  const ext = blob.type === "image/webp" ? "webp" : file.name.split(".").pop() || "jpg";

  const supabase = createClient();
  const path = `${userId}/wallpaper-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("wallpapers")
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from("wallpapers").getPublicUrl(path);

  // Prune the creator's previous wallpapers, now that the new one is safely
  // stored. Avatars never did this and the orphans just accumulate; a wallpaper
  // is an order of magnitude larger, and a creator trying six photos would
  // otherwise leave five full-size strangers in the bucket forever.
  //
  // After the upload and deliberately unawaited-on-failure: losing the new
  // wallpaper because a cleanup failed would be a much worse bug than leaving a
  // stale file behind.
  void pruneOldWallpapers(userId, path);

  return { url: data.publicUrl };
}

async function pruneOldWallpapers(userId: string, keepPath: string) {
  try {
    const supabase = createClient();
    const { data } = await supabase.storage.from("wallpapers").list(userId);
    if (!data) return;
    const stale = data
      .map((f) => `${userId}/${f.name}`)
      .filter((p) => p !== keepPath);
    if (stale.length) await supabase.storage.from("wallpapers").remove(stale);
  } catch {
    // Storage housekeeping is never worth surfacing to a creator who just
    // succeeded at the thing they were actually trying to do.
  }
}

// ---------------------------------------------------------------------------
// Share images (og:image)
// ---------------------------------------------------------------------------

/** JPEG, not WebP, and that is the whole reason this does not reuse
 *  downscaleImage. WhatsApp's crawler — the one creators actually paste links
 *  into — is unreliable with a WebP og:image, and a preview that silently shows
 *  no picture is a far worse outcome than one that costs 80KB more. Every other
 *  scraper reads JPEG too, so it is also the only format that needs no
 *  per-platform reasoning. */
const SHARE_QUALITY = 0.85;

/**
 * Crop and re-encode an image to exactly 1200x630 JPEG, in the browser.
 *
 * Cover-fit and centred: scaled until it fills the frame, then the overflowing
 * edge is cut. Every scraper crops a mismatched og:image to its own aspect
 * anyway, so the choice is not whether the image gets cropped but whether the
 * creator can SEE the crop before they publish it. Doing it here means the
 * preview in the Design panel is the real thing, and the stored file is what
 * every platform shows rather than the input to nine different croppers.
 *
 * Deliberately NOT best-effort, which is the other way this parts company with
 * downscaleImage. That one returns the original on any failure because a
 * wallpaper that skipped the resize is merely slow — still correct, still the
 * right picture. A share image that skipped the crop is a different picture:
 * the wrong aspect, and a file whose dimensions no longer match the
 * og:image:width we publish for it. Null here means the caller must refuse,
 * because there is no degraded version of this that is still honest.
 */
export async function cropToShareCard(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);

    const canvas = document.createElement("canvas");
    canvas.width = SHARE_IMAGE_W;
    canvas.height = SHARE_IMAGE_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // max() rather than min() is what makes this cover instead of contain: the
    // frame is filled and the excess spills past an edge, rather than the image
    // fitting inside it and leaving bars.
    const scale = Math.max(
      SHARE_IMAGE_W / bitmap.width,
      SHARE_IMAGE_H / bitmap.height,
    );
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (SHARE_IMAGE_W - w) / 2, (SHARE_IMAGE_H - h) / 2, w, h);
    bitmap.close();

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", SHARE_QUALITY),
    );
  } catch {
    return null;
  }
}

/**
 * Put a share image in storage and return its public URL.
 *
 * Browser -> Supabase Storage with the anon key and no server hop, safe for the
 * same reason uploadWallpaper is: the client picks the path, and the path is
 * what RLS checks — `share_images_owner_write` in 0007 requires the first
 * segment to be the caller's own uid.
 *
 * The mime and size checks here are courtesy (the bucket enforces its own, and
 * they are stricter). The size one is not about the upload — what reaches
 * storage is always a ~200KB JPEG — it is about not handing a 100MP camera
 * original to createImageBitmap on a phone.
 */
export async function uploadShareImage(
  file: File,
  userId: string,
): Promise<UploadResult> {
  if (!SHARE_IMAGE_MIME.includes(file.type)) {
    return { error: "Use a JPEG, PNG or WebP image." };
  }
  if (file.size > MAX_SHARE_IMAGE_BYTES) {
    return { error: "That image is over 6MB. Try a smaller one." };
  }

  const blob = await cropToShareCard(file);
  if (!blob) return { error: "Could not read that image. Try a JPEG or PNG." };

  const supabase = createClient();
  // Always .jpg: cropToShareCard either returns JPEG or returns null, so unlike
  // the wallpaper path there is no branch where the extension has to describe
  // something else.
  const path = `${userId}/share-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("share-images")
    .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from("share-images").getPublicUrl(path);

  // Same reasoning as the wallpaper prune, and the same deliberate ordering:
  // after the upload, unawaited, failures swallowed. Losing the new image to a
  // failed cleanup would be a much worse bug than leaving a stale file behind.
  void pruneOldShareImages(userId, path);

  return { url: data.publicUrl };
}

async function pruneOldShareImages(userId: string, keepPath: string) {
  try {
    const supabase = createClient();
    const { data } = await supabase.storage.from("share-images").list(userId);
    if (!data) return;
    const stale = data
      .map((f) => `${userId}/${f.name}`)
      .filter((p) => p !== keepPath);
    if (stale.length) await supabase.storage.from("share-images").remove(stale);
  } catch {
    // Housekeeping, same as above.
  }
}
