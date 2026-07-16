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

export const linkSchema = z.object({
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
});
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
