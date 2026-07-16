import { normalizeUrl } from "@/lib/validation";

/**
 * The well-known sites the "Add" picker offers.
 *
 * Metadata only — no JSX and no icon imports, so this is safe to pull into
 * either graph. The glyphs live in components/PlatformIcon.tsx, which is the
 * one file that has to care that Phosphor ships CSR and SSR entry points.
 *
 * `slug` is what lands in links.platform, and it is the contract: it is stored
 * on the row, matched by PlatformIcon, and format-checked by 0005. Renaming one
 * silently downgrades every stored row using it to the generic link glyph, so
 * add slugs, never rewrite them.
 */
export type Platform = {
  slug: string;
  label: string;
  /**
   * What the picker asks for, as a placeholder. It is the whole prompt — the
   * field has no other label — so it has to say which of "@handle", "a phone
   * number" and "a full URL" this particular site wants.
   */
  hint: string;
  /**
   * Turn a bare handle into a profile URL.
   *
   * Absent where a handle cannot produce one: Spotify's URLs carry opaque ids,
   * a LinkedIn page is /in/ or /company/ and only the creator knows which, and
   * a Discord invite is a code that is not a username. Those platforms require
   * a pasted URL instead — see resolveUrl.
   */
  urlFor?: (handle: string) => string;
  /**
   * Hostnames that identify a pasted URL as this platform. Matched exactly or
   * as a suffix, so "m.youtube.com" resolves but "notyoutube.com" does not.
   *
   * Old hostnames stay listed forever: people paste links they saved years ago,
   * and twitter.com/ada is still an X profile.
   */
  hosts: string[];
};

/** Display order in the picker, roughly by how often creators reach for them. */
export const PLATFORMS: Platform[] = [
  {
    slug: "instagram",
    label: "Instagram",
    hint: "@username",
    urlFor: (h) => `https://instagram.com/${h}`,
    hosts: ["instagram.com"],
  },
  {
    slug: "tiktok",
    label: "TikTok",
    hint: "@username",
    urlFor: (h) => `https://tiktok.com/@${h}`,
    hosts: ["tiktok.com"],
  },
  {
    slug: "youtube",
    label: "YouTube",
    hint: "@channel",
    urlFor: (h) => `https://youtube.com/@${h}`,
    hosts: ["youtube.com", "youtu.be"],
  },
  {
    slug: "x",
    label: "X",
    hint: "@username",
    urlFor: (h) => `https://x.com/${h}`,
    hosts: ["x.com", "twitter.com"],
  },
  {
    slug: "linkedin",
    label: "LinkedIn",
    // No urlFor: /in/ada and /company/acme are both LinkedIn pages, and asking
    // for "@username" would build the wrong one half the time.
    hint: "Paste your profile URL",
    hosts: ["linkedin.com"],
  },
  {
    slug: "github",
    label: "GitHub",
    hint: "username",
    urlFor: (h) => `https://github.com/${h}`,
    hosts: ["github.com"],
  },
  {
    slug: "spotify",
    label: "Spotify",
    hint: "Paste your artist or profile URL",
    hosts: ["spotify.com", "spotify.link"],
  },
  {
    slug: "whatsapp",
    label: "WhatsApp",
    hint: "Phone number with country code",
    // wa.me wants digits only — no +, spaces or dashes, all of which people
    // type. Stripping them here beats a chat link that 404s.
    urlFor: (h) => `https://wa.me/${h.replace(/\D/g, "")}`,
    hosts: ["wa.me", "whatsapp.com"],
  },
  {
    slug: "telegram",
    label: "Telegram",
    hint: "@username",
    urlFor: (h) => `https://t.me/${h}`,
    hosts: ["t.me", "telegram.me"],
  },
  {
    slug: "discord",
    label: "Discord",
    hint: "Paste your invite link",
    hosts: ["discord.gg", "discord.com"],
  },
  {
    slug: "facebook",
    label: "Facebook",
    hint: "username",
    urlFor: (h) => `https://facebook.com/${h}`,
    hosts: ["facebook.com", "fb.com"],
  },
  {
    slug: "threads",
    label: "Threads",
    hint: "@username",
    urlFor: (h) => `https://threads.com/@${h}`,
    hosts: ["threads.net", "threads.com"],
  },
];

const BY_SLUG = new Map(PLATFORMS.map((p) => [p.slug, p]));

export function platformBySlug(slug: string | null | undefined) {
  return slug ? BY_SLUG.get(slug) : undefined;
}

/**
 * Which platform does this URL belong to, if any?
 *
 * Used to turn a paste into a choice: someone who drops their Instagram URL
 * into the search box has already told us what they are adding.
 */
export function platformForUrl(raw: string): Platform | undefined {
  let host: string;
  try {
    host = new URL(normalizeUrl(raw)).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  host = host.replace(/^www\./, "");
  return PLATFORMS.find((p) =>
    p.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
  );
}

/**
 * Is this a URL rather than a handle?
 *
 * A protocol or a slash, and nothing cleverer. Motivated: the obvious test —
 * "does it contain a dot followed by a TLD" — reads the perfectly ordinary
 * Instagram handle `ada.lovelace` as a hostname and turns it into
 * https://ada.lovelace. No handle on any platform here can contain a slash, so
 * a slash is the one signal that cannot be a false positive.
 */
export function looksLikeUrl(s: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || s.includes("/");
}

/** Handles are written "@ada" and stored "ada". */
export function stripHandle(s: string) {
  return s.trim().replace(/^@+/, "");
}

/**
 * The URL to store, from whatever the creator typed.
 *
 * A pasted URL always wins over the handle template, even on a platform that
 * has one. Motivated: someone pasting their full profile link means THAT link,
 * and feeding it to urlFor yields https://instagram.com/https://instagram.com/ada.
 *
 * Returns "" for empty input; the caller validates the result with linkSchema
 * rather than trusting this to have produced something reachable.
 */
export function resolveUrl(platform: Platform | undefined, input: string) {
  const s = input.trim();
  if (!s) return "";
  if (!platform?.urlFor || looksLikeUrl(s)) return normalizeUrl(s);
  return platform.urlFor(stripHandle(s));
}
