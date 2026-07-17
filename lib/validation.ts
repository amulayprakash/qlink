import { z } from "zod";

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

/** Route names + system paths that can't be claimed as usernames. */
export const RESERVED_USERNAMES = new Set([
  "dashboard",
  "login",
  "logout",
  "onboarding",
  "api",
  "auth",
  "admin",
  "settings",
  "account",
  "about",
  "terms",
  "privacy",
  "help",
  "support",
  "pricing",
  "explore",
  "public",
  "static",
  "assets",
  "favicon",
  "robots",
  "sitemap",
  "www",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, "3-30 characters: lowercase letters, numbers, underscore")
  .refine((v) => !RESERVED_USERNAMES.has(v), "That username is reserved");

/** Prepend https:// when the user omits a protocol. */
export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/**
 * links.platform: a slug from lib/platforms.ts.
 *
 * Format only, deliberately NOT membership of the catalogue — and this file
 * does not import it, which keeps that honest. Motivated: a slug retired from
 * the catalogue would make every row still carrying it unsaveable, so the
 * creator could not edit a page they had not touched. The render path falls
 * back to a generic glyph for a slug it does not know, so an unknown value
 * degrades. This regex is the same one 0005 checks in the database.
 */
export const platformSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]{1,32}$/, "Unknown platform");

export const linkSchema = z
  .object({
    title: z.string().trim().min(1, "Required").max(80),
    url: z
      .string()
      .trim()
      .min(1, "Required")
      .transform(normalizeUrl)
      .refine((v) => {
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      }, "Enter a valid URL"),
    /** Defaults visible so a payload that predates the pause toggle still parses:
     *  the onboarding profile form posts {title, url} and nothing else. Mirrors
     *  the column default in 0004. */
    is_active: z.boolean().default(true),
    /** Same reasoning as is_active, for 0005: a payload predating the picker
     *  carries neither field, and both defaults mean "a plain custom pill",
     *  which is what those links have always been. */
    platform: platformSchema.nullable().default(null),
    show_as_icon: z.boolean().default(false),
  })
  // Mirrors links_icon_needs_platform from 0005. An icon with no platform has
  // no glyph to draw and no text to fall back to — it would render as an
  // invisible tap target under the bio.
  .refine(
    (l) => !l.show_as_icon || l.platform !== null,
    "An icon link needs a platform.",
  );
export const linksSchema = z.array(linkSchema).max(50);

/** Total links allowed per page, across every section. Motivated: applying
 *  linksSchema's .max(50) per section would silently permit 20 x 50 = 1000. */
export const MAX_LINKS_PER_PAGE = 50;
export const MAX_SECTIONS_PER_PAGE = 20;

/** One section as the editor serializes it: the section's own fields plus its
 *  links inline, so the whole page arrives as a single payload. */
export const editorSectionSchema = z.object({
  /** Absent on a section the creator just added. Present rows keep their id
   *  so links can be re-pointed without orphaning. */
  id: z.uuid().optional(),
  /** Defaults to 'links' so a payload predating the packages section still
   *  parses. Mirrors the column default in 0002. */
  kind: z.enum(["links", "packages"]).default("links"),
  title: z.string().trim().max(80).nullable().default(null),
  collapsible: z.boolean().default(false),
  default_open: z.boolean().default(true),
  links: z.array(linkSchema).max(MAX_LINKS_PER_PAGE),
});

export const editorPageSchema = z
  .array(editorSectionSchema)
  .max(MAX_SECTIONS_PER_PAGE, `At most ${MAX_SECTIONS_PER_PAGE} sections`)
  .refine(
    (sections) =>
      sections.reduce((n, s) => n + s.links.length, 0) <= MAX_LINKS_PER_PAGE,
    `At most ${MAX_LINKS_PER_PAGE} links in total`,
  )
  .refine(
    (sections) => {
      const ids = sections.map((s) => s.id).filter(Boolean);
      return new Set(ids).size === ids.length;
    },
    // Motivated: a duplicated id would make the save's upsert raise a raw
    // Postgres cardinality error (21000) instead of a readable message.
    "A section was duplicated. Reload and try again.",
  )
  .refine(
    (sections) => sections.filter((s) => s.kind === "packages").length <= 1,
    // The partial unique index from 0003 enforces this too; catching it here
    // turns a duplicate-key error into a sentence.
    "A page can only have one packages section.",
  )
  .refine(
    (sections) =>
      sections.every((s) => s.kind !== "packages" || s.links.length === 0),
    "A packages section cannot contain links.",
  );

/** #rrggbb only. Never interpolated into a <style> tag; this feeds a React
 *  style object, which escapes it. The regex is the injection guard anyway. */
export const hexColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/, "Enter a colour like #6f4a3c");

/** Built from the same env var the storage client uses, so a project that moves
 *  cannot leave the checks below pointing at the old host. */
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
  /\/$/,
  "",
);

/**
 * A public URL that has to have come from one of OUR storage buckets.
 *
 * Two independent guards:
 *   1. The bucket prefix. This is the one that matters: it is what stops a
 *      creator from pointing a field we then publish at a host they control.
 *   2. No quote, paren, backslash or angle bracket. Guard 1 already makes those
 *      impossible, so this is what keeps that true if guard 1 is ever loosened,
 *      and it is why a wallpaper is safe to interpolate into a CSS url().
 *
 * The env check is deliberately separate from the prefix check rather than
 * folded into a length test on the prefix: with the var unset the prefix
 * collapses to a bare path, and "the prefix got suspiciously short" is a
 * fragile way to notice that. An unset env means trust nothing.
 */
function storageUrlSchema(bucket: string, message: string) {
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;
  return z
    .string()
    .trim()
    .max(500)
    .refine((v) => !!SUPABASE_URL && v.startsWith(prefix), message)
    .refine((v) => !/["'()\\<>]/.test(v), "That image URL has invalid characters");
}

/** A wallpaper's public URL. Unlike every other creator-authored string on the
 *  page this one is interpolated into a CSS url() — see wallpaperCss — which is
 *  what makes guard 2 above load-bearing here. */
export const wallpaperUrlSchema = storageUrlSchema(
  "wallpapers",
  "That image did not come from your wallpaper storage",
);

/**
 * A share image's public URL.
 *
 * Same mechanism, different stake. This one is published as og:image, so an
 * off-bucket URL would mean the creator gets to choose what image this product
 * hands to WhatsApp, Slack and X under their own link — content we could
 * neither see nor take down, because it would not be in our storage. Keeping it
 * in the bucket is what keeps `delete the object` a remedy that works.
 */
export const shareImageUrlSchema = storageUrlSchema(
  "share-images",
  "That image did not come from your share image storage",
);

/** Mirrors the Wallpaper union in lib/types.ts. A discriminated union, so each
 *  kind parses exactly its own fields and a stale field from a kind the creator
 *  switched away from is dropped rather than stored forever. */
export const wallpaperSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fill"), color: hexColorSchema }),
  z.object({
    kind: z.literal("gradient"),
    color: hexColorSchema,
    color2: hexColorSchema,
    angle: z.number().int().min(0).max(360).default(160),
  }),
  z.object({
    kind: z.literal("image"),
    url: wallpaperUrlSchema,
    /** Un-floored on purpose: a creator may ship a page we would not call
     *  readable. The editor shows the contrast and suggests the scrim that
     *  earns AA; it does not veto anything. The default here is only for a
     *  payload that omits the field — the Design page always sends it. */
    scrim: z.number().min(0).max(1).default(0.6),
  }),
]);

/** Raw upload cap. The bucket enforces this too (0006) — this is only so the
 *  browser can say so before spending the creator's data on an upload that the
 *  server is going to reject. */
export const MAX_WALLPAPER_BYTES = 6 * 1024 * 1024;
export const WALLPAPER_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * What a creator is allowed to PICK for a share image, which is not what gets
 * stored: the uploader re-encodes everything to 1200x630 JPEG, so the
 * share-images bucket accepts image/jpeg alone (0007) and nothing that reaches
 * it is ever this large.
 *
 * So unlike MAX_WALLPAPER_BYTES this cap is not about the upload — it is about
 * the decode. createImageBitmap on a 100MP camera original is what kills a
 * phone browser, and that happens before a single byte is sent.
 */
export const MAX_SHARE_IMAGE_BYTES = 6 * 1024 * 1024;
export const SHARE_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];

/** The og:image aspect every scraper is built around. Exported because three
 *  places have to agree on it: the crop, the preview box the creator composes
 *  against, and the dimensions generateMetadata declares. */
export const SHARE_IMAGE_W = 1200;
export const SHARE_IMAGE_H = 630;

export const packageSchema = z.object({
  name: z.string().trim().min(1, "Required").max(80),
  description: z.string().trim().max(600).optional().default(""),
  price_usd: z
    .number({ message: "Enter a price" })
    .nonnegative("Must be ≥ 0")
    .max(1_000_000),
  features: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
});
export const packagesSchema = z.array(packageSchema).max(20);

export type LinkInput = z.infer<typeof linkSchema>;
export type PackageInput = z.infer<typeof packageSchema>;
