import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVENT_TYPES, SECTION_NAMES } from "@/lib/analytics/events";

/**
 * Analytics ingest for public creator pages.
 *
 * Written by the anonymous visitor's browser (a sendBeacon / keepalive fetch),
 * so it is deliberately forgiving: a malformed or unknown-creator beacon is
 * ANSWERED 204, never 4xx. A tracking pixel that logs errors into the console
 * of the page it measures is worse than one that quietly drops a bad hit.
 *
 * It resolves the username to a published profile server-side and writes the
 * row with the service role — the same trust boundary as orders, and the reason
 * page_events has no anon insert policy (see supabase/migrations/0008).
 *
 * The body is intentionally terse (single-letter keys) because it rides in a
 * beacon on every page view; see components/analytics/AnalyticsProvider.
 */
const bodySchema = z.object({
  u: z.string().trim().min(1).max(30), // creator username
  t: z.enum(EVENT_TYPES), // event type
  s: z.enum(SECTION_NAMES).optional(), // section (section_view only)
  p: z.string().uuid().optional(), // package id (package_open / checkout_start)
  v: z.string().trim().min(1).max(64).optional(), // anonymous visitor id
});

const ok204 = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return ok204();

  const { u, t, s, p, v } = parsed.data;
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", u)
    .eq("is_published", true)
    .maybeSingle();

  // Unknown or unpublished creator — nothing to attribute the event to.
  if (!profile) return ok204();

  // Keep the columns tied to the event they belong to, so a section that
  // arrives on a page_view (or a stray package id) never lands in the table.
  const isSection = t === "section_view";
  const isPackage = t === "package_open" || t === "checkout_start";

  await admin.from("page_events").insert({
    profile_id: profile.id,
    type: t,
    section: isSection ? (s ?? null) : null,
    package_id: isPackage ? (p ?? null) : null,
    visitor_id: v ?? null,
  });

  return ok204();
}
