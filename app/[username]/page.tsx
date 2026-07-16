import type { Metadata, Viewport } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreatorPageView } from "@/components/CreatorPageView";
import { BuyButton } from "@/components/checkout/BuyButton";
import { loadCreatorPage } from "@/lib/sections";
import { pageTheme } from "@/lib/themes";

type Params = { username: string };

/** Motivated: generateMetadata, generateViewport and the page each need the
 *  profile. cache() collapses those into one query per request. */
const loadProfile = cache(async (username: string) => {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .eq("is_published", true)
    .maybeSingle();
  return profile;
});

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
  return {
    title,
    description: profile.bio ?? `Buy ${profile.display_name ?? "my"} packages with crypto.`,
    openGraph: {
      title,
      description: profile.bio ?? undefined,
      images: profile.avatar_url ? [{ url: profile.avatar_url }] : undefined,
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

  const supabase = await createClient();
  const { sections, packages } = await loadCreatorPage(supabase, profile.id);

  const hasEvm = !!profile.evm_wallet_address;
  const hasTron = !!profile.tron_wallet_address;

  return (
    <CreatorPageView
      profile={profile}
      sections={sections}
      packages={packages}
      canvas
      buySlot={(p) => (
        <BuyButton
          pkg={{ id: p.id, name: p.name, price_usd: p.price_usd }}
          hasEvm={hasEvm}
          hasTron={hasTron}
        />
      )}
    />
  );
}
