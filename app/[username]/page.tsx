import type { Metadata, Viewport } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { CreatorPageView } from "@/components/CreatorPageView";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { BuyButton } from "@/components/checkout/BuyButton";
import { loadCreatorPage } from "@/lib/sections";
import { pageTheme } from "@/lib/themes";
import { SHARE_IMAGE_H, SHARE_IMAGE_W } from "@/lib/validation";
import type { ThemeConfig } from "@/lib/types";

type Params = { username: string };

/**
 * Serve this page from the full route cache, rebuilding it at most hourly.
 *
 * The page is worth caching because it is the same for everyone who asks: see
 * lib/supabase/public.ts for why nothing here reads the viewer's session. That
 * is what makes ISR legal; this is what turns it on.
 *
 * The hour is a BACKSTOP, not the refresh mechanism. Every mutation that can
 * change this page already calls revalidatePath(`/${username}`) —
 * revalidatePublic() in app/dashboard/actions.ts, and the publish in
 * app/onboarding/actions.ts — so an edit is live on the next request, not in an
 * hour. Those calls have been there all along, quietly doing nothing: you
 * cannot invalidate a cache entry that was never written, and while this route
 * read cookies() there was none. They only start paying now.
 *
 * So the hour exists purely for the paths on-demand revalidation cannot reach:
 * a row changed in the Supabase dashboard, a deploy that clears one node's
 * cache and not another's. A creator watching their own page will never wait
 * on it. Not `false` (cache forever) because that would make those cases
 * permanent rather than briefly wrong.
 */
export const revalidate = 3600;

/**
 * Empty, and NOT vestigial — deleting it silently un-caches this route.
 *
 * `revalidate` above is necessary but not sufficient. A dynamic segment is only
 * eligible for ISR at runtime if it also declares generateStaticParams (or
 * force-static); without it Next never puts /[username] in the prerender
 * manifest and serves every request fresh, `revalidate` or no `revalidate`.
 * Verified rather than assumed: with revalidate alone the build's
 * dynamicRoutes was still {}.
 *
 * Empty because the params are the whole user table. Naming them here would
 * prerender every creator at build time — coupling deploys to a Supabase query,
 * growing build time with signups, and staling every page not touched since the
 * last deploy. With `dynamicParams` left at its default (true), an unlisted
 * username is instead rendered on FIRST request and cached from then on: the
 * first visitor pays the four queries, everyone after them gets the cache, and
 * a creator who signs up after this deploy needs no rebuild to exist.
 */
export function generateStaticParams(): Params[] {
  return [];
}

/** Motivated: generateMetadata, generateViewport and the page each need the
 *  profile. cache() collapses those into one query per request. */
const loadProfile = cache(async (username: string) => {
  const supabase = createPublicClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .eq("is_published", true)
    .maybeSingle();
  return profile;
});

/**
 * What a chat app shows beside the link when it is pasted.
 *
 * Two shapes, and the difference between them is not decoration:
 *
 * A creator's uploaded card is always exactly 1200x630 JPEG, because
 * lib/image.ts crops it to that before it is ever stored. That is what lets the
 * dimensions be declared here without measuring the file — a scraper that knows
 * the aspect up front lays the preview out before the bytes land — and it is
 * what earns summary_large_image.
 *
 * The avatar fallback is a square of unknown size, so it goes out with NO
 * dimensions and as a small card. Asking for summary_large_image and then
 * handing over a 200px square gets a blurry, letterboxed banner: worse than the
 * modest thumbnail it would have replaced. The card type has to describe the
 * image we actually have, not the one we wish we had.
 */
function shareCard(
  profile: {
    theme_config: ThemeConfig | null;
    avatar_url: string | null;
    bio: string | null;
  },
  title: string,
) {
  const custom = profile.theme_config?.shareImage;
  if (custom) {
    return {
      large: true,
      image: {
        url: custom,
        width: SHARE_IMAGE_W,
        height: SHARE_IMAGE_H,
        alt: profile.bio ? `${title} — ${profile.bio}` : title,
      },
    };
  }
  if (profile.avatar_url) {
    return { large: false, image: { url: profile.avatar_url, alt: title } };
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) return { title: "Not found" };
  const title = profile.display_name
    ? `${profile.display_name} (@${profile.username})`
    : `@${profile.username}`;
  const card = shareCard(profile, title);

  // No metadataBase, though its absence is usually a bug: it exists to turn a
  // relative URL absolute, and there is no relative URL here to turn. Both
  // branches of shareCard emit a Supabase public URL, and being absolute is not
  // a coincidence of the current host — it is the bucket prefix that
  // shareImageUrlSchema checks on the way in.
  return {
    title,
    description: profile.bio ?? `Buy ${profile.display_name ?? "my"} packages with crypto.`,
    openGraph: {
      title,
      description: profile.bio ?? undefined,
      // No `username` alongside this, though the type accepts one and Next has
      // an emitter for profile:username: OgTypeFields in Next 16's
      // resolve-opengraph.js has no 'profile' entry, so the resolver drops the
      // field before the emitter ever sees it. Verified against the rendered
      // HTML, not the types — it was silently emitting nothing.
      type: "profile",
      images: card ? [card.image] : undefined,
    },
    twitter: {
      card: card?.large ? "summary_large_image" : "summary",
      title,
      description: profile.bio ?? undefined,
      images: card ? [card.image] : undefined,
    },
  };
}

/** Motivated: the browser UI (iOS status bar, Android toolbar) should match the
 *  creator's canvas. Without this a mocha page gets a near-black bar above it. */
export async function generateViewport({
  params,
}: {
  params: Promise<Params>;
}): Promise<Viewport> {
  const { username } = await params;
  const profile = await loadProfile(username);
  return { themeColor: pageTheme(profile?.theme).bg };
}

export default async function PublicCreatorPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) notFound();

  const supabase = createPublicClient();
  const { sections, packages } = await loadCreatorPage(supabase, profile.id);

  return (
    // Only the real public route mounts the tracker (canvas below is likewise
    // public-only): the previews render the same page without it, so a creator
    // viewing their own draft never records a visit. `username` is the URL
    // param — its case-insensitive match already resolved this profile.
    <AnalyticsProvider username={profile.username ?? username}>
      <CreatorPageView
        profile={profile}
        sections={sections}
        packages={packages}
        canvas
        buySlot={(p) => (
          <BuyButton
            pkg={p}
            creator={{
              name: profile.display_name ?? `@${profile.username}`,
              username: profile.username,
              avatarUrl: profile.avatar_url,
            }}
            // Every chain family is always payable: the recipient is the
            // platform's own wallet, not a per-creator one.
            hasEvm
            hasTron
          />
        )}
      />
    </AnalyticsProvider>
  );
}
