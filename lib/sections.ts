import type { createClient } from "@/lib/supabase/server";
import type { Link, Section } from "@/lib/types";

type Client = Awaited<ReturnType<typeof createClient>>;

/** A section with its links attached, ready to render. */
export type PageSection = Pick<
  Section,
  "id" | "kind" | "title" | "position" | "collapsible" | "default_open"
> & { links: PageLink[] };

export type PageLink = Pick<
  Link,
  "id" | "title" | "url" | "is_active" | "platform" | "show_as_icon"
>;

type SectionRow = Omit<PageSection, "links">;
type LinkRow = PageLink & { section_id: string | null };

/** Ids for sections synthesised in memory when the DB has none. They are React
 *  keys and nothing else: never saved, never upserted. */
const SYNTHETIC_LINKS_ID = "synthetic-links";
const SYNTHETIC_PACKAGES_ID = "synthetic-packages";

/**
 * Is this section a render-time invention rather than a row?
 *
 * The editor must drop these before building its form. Motivated: it upserts
 * whatever ids it is given, and a synthetic id is not a uuid — it would fail
 * `id: z.uuid()` and surface as "Check your links." on save, which points the
 * creator at the one thing that isn't wrong. Normally ensurePackagesSection has
 * already written a real row and nothing is synthetic; this matters in the
 * window BEFORE 0003 is applied, when that insert is rejected by the old check
 * constraint.
 */
export function isSyntheticSection(id: string) {
  return id === SYNTHETIC_LINKS_ID || id === SYNTHETIC_PACKAGES_ID;
}

/**
 * Attach links to their sections, in one pass.
 *
 * Both inputs must already be ordered by `position`; this preserves that order
 * rather than re-sorting.
 *
 * Orphans (section_id null) fall into the first LINKS section. Motivated: the
 * onboarding wizard writes links before the creator has ever seen the editor,
 * and a link that exists but renders nowhere is the worst possible outcome. If
 * there is no links section at all, one is synthesised so the links still show.
 *
 * A link pointing at a packages section is treated as an orphan rather than
 * trusted. The app never writes that, but links.section_id's fk is composite on
 * (id, profile_id) and cannot also constrain kind, so nothing at the DB level
 * forbids it — and a packages section has nowhere to render a link.
 */
export function groupSections(
  sections: SectionRow[],
  links: LinkRow[],
): PageSection[] {
  const grouped: PageSection[] = sections.map((s) => ({ ...s, links: [] }));
  const byId = new Map(grouped.map((s) => [s.id, s]));

  for (const l of links) {
    const named = l.section_id ? byId.get(l.section_id) : undefined;
    let target =
      named?.kind === "links" ? named : grouped.find((s) => s.kind === "links");

    if (!target) {
      target = {
        id: SYNTHETIC_LINKS_ID,
        kind: "links",
        title: null,
        position: 0,
        collapsible: false,
        default_open: true,
        links: [],
      };
      // Unshift, not push: links came first for the whole life of the product,
      // and this fallback should not be the thing that reorders someone's page.
      grouped.unshift(target);
      byId.set(target.id, target);
    }
    target.links.push({
      id: l.id,
      title: l.title,
      url: l.url,
      is_active: l.is_active,
      platform: l.platform,
      show_as_icon: l.show_as_icon,
    });
  }

  return grouped;
}

/**
 * Everything the creator page renders, for one profile.
 *
 * Motivated: the public route and both previews used to hand-roll these
 * queries, and they had already drifted (the onboarding preview omitted the
 * is_active filter while promising "exactly what visitors will see", so it
 * showed paused packages that the live page hides). One loader, one truth.
 *
 * `includeHidden` is the editor's flag and nobody else's: it is the one caller
 * that must see a paused link, because it is the only screen that can unpause
 * it. Defaulting to false keeps every OTHER caller — the public route and both
 * previews — honest by omission rather than by remembering to filter.
 *
 * The filter is not the security boundary; 0004's links_public_read is. It
 * matters here because both previews read as the OWNER, whose RLS policy
 * returns paused links — so without it, "exactly what visitors will see" would
 * be a lie again, in the same way and on the same screens as last time.
 */
export async function loadCreatorPage(
  supabase: Client,
  profileId: string,
  { includeHidden = false }: { includeHidden?: boolean } = {},
) {
  const linksQuery = supabase
    .from("links")
    .select("id, title, url, section_id, is_active, platform, show_as_icon")
    .eq("profile_id", profileId);

  const [{ data: sections }, { data: links }, { data: packages }] =
    await Promise.all([
      supabase
        .from("sections")
        .select("id, kind, title, position, collapsible, default_open")
        .eq("profile_id", profileId)
        .order("position"),
      (includeHidden ? linksQuery : linksQuery.eq("is_active", true)).order(
        "position",
      ),
      supabase
        .from("packages")
        .select("id, name, description, price_usd, features")
        .eq("profile_id", profileId)
        .eq("is_active", true)
        .order("position"),
    ]);

  const grouped = groupSections(sections ?? [], links ?? []);
  const pkgs = packages ?? [];

  // Same guarantee as the orphan-links branch above, for packages: 0003 gives
  // every profile a packages section and the editor self-heals via
  // ensurePackagesSection, so this only fires if the row was deleted out from
  // under us. Packages that exist but render nowhere would be the worst
  // outcome — they are the thing the creator gets paid for.
  //
  // Appended last, reproducing the pre-0003 layout. Read-only on purpose: this
  // runs on the public route for anonymous visitors, where RLS grants select
  // and nothing else.
  if (pkgs.length && !grouped.some((s) => s.kind === "packages")) {
    grouped.push({
      id: SYNTHETIC_PACKAGES_ID,
      kind: "packages",
      title: null,
      position: grouped.length,
      collapsible: false,
      default_open: true,
      links: [],
    });
  }

  return { sections: grouped, packages: pkgs };
}

/**
 * Make sure the creator has a packages section, and return nothing.
 *
 * Called by the editor route only — it is the one place with both a writable
 * RLS context and a reason to care that the id is REAL. The editor round-trips
 * section ids through a form and upserts them, so it cannot be handed
 * SYNTHETIC_PACKAGES_ID: that would fail `id: z.uuid()` on save.
 *
 * Best-effort. A failure here (or a race between two tabs, which the partial
 * unique index turns into a duplicate-key error) leaves the creator with the
 * synthesised fallback for this render and a real row on the next one, which
 * is strictly better than blocking the editor from loading.
 */
export async function ensurePackagesSection(
  supabase: Client,
  profileId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("sections")
    .select("id")
    .eq("profile_id", profileId)
    .eq("kind", "packages")
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const { data: last } = await supabase
    .from("sections")
    .select("position")
    .eq("profile_id", profileId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("sections").insert({
    profile_id: profileId,
    kind: "packages",
    position: (last?.position ?? -1) + 1,
  });
}

/**
 * The section that links land in when the writer has no section context.
 *
 * Motivated: the onboarding wizard and the profile form write links long
 * before the creator has ever opened the editor. `handle_new_user()` creates
 * this section on signup and 0002_sections.sql backfills it for existing
 * profiles, so the fetch almost always hits. The insert is the fallback for
 * rows that predate the trigger.
 *
 * Returns null only if the insert fails, in which case the caller writes the
 * link with a null section_id and the page renders it in the default section
 * anyway. Losing the grouping is better than losing the link.
 */
export async function defaultSectionId(
  supabase: Client,
  profileId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("sections")
    .select("id")
    .eq("profile_id", profileId)
    .eq("kind", "links")
    .order("position")
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id;

  const { data: created } = await supabase
    .from("sections")
    .insert({ profile_id: profileId, kind: "links", position: 0 })
    .select("id")
    .single();
  return created?.id ?? null;
}
