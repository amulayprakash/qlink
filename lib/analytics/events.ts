/**
 * The analytics event vocabulary — one source of truth for the three places
 * that must agree on it: the client tracker (components/analytics), the ingest
 * route (app/api/events) and the admin dashboard (app/v1/admin). Keeping the
 * literals here is what stops those three from silently drifting apart.
 *
 * `payment` is intentionally NOT here: a completed payment already lives in the
 * `orders` table (status = 'paid'), which is authoritative and server-verified,
 * so the funnel reads its final stage from there rather than from a client
 * beacon that a closed tab could drop.
 */

export const EVENT_TYPES = [
  "page_view",
  "section_view",
  "package_open",
  "checkout_start",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** The sections a section_view can name — the three blocks a creator page has. */
export const SECTION_NAMES = ["links", "packages", "promo"] as const;
export type SectionName = (typeof SECTION_NAMES)[number];

/** localStorage key holding the anonymous, per-browser visitor id. */
export const VISITOR_KEY = "qlink_vid";
