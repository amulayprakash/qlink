import { Fragment, type ReactNode } from "react";
import { TokenUSDT, TokenUSDC } from "@web3icons/react";
import { Reveal } from "@/components/motion/Reveal";
import { Avatar } from "@/components/Avatar";
import { LinksSection } from "@/components/page/LinksSection";
import { PackagesSection, type PagePackage } from "@/components/page/PackagesSection";
import { PromoSection } from "@/components/page/PromoSection";
import { PromoProvider } from "@/components/page/promo-context";
import { Logo } from "@/components/Logo";
import { ShareButton } from "@/components/page/ShareButton";
import { PlatformIcon } from "@/components/PlatformIcon";
import { pageTheme, themeOverrideStyle, wallpaperCss } from "@/lib/themes";
import type { PageLink, PageSection } from "@/lib/sections";
import type { Profile } from "@/lib/types";

export type PublicProfile = Pick<
  Profile,
  | "id"
  | "username"
  | "display_name"
  | "bio"
  | "avatar_url"
  | "theme"
  | "theme_config"
  | "evm_wallet_address"
  | "tron_wallet_address"
  | "promo_code"
  | "promo_discount_pct"
>;

/**
 * The creator page. Rendered by the public route, the dashboard preview, the
 * onboarding preview, and the editor's live preview.
 *
 * `sections` is the page: an ordered list the creator arranges in the editor,
 * mixing link sections and (at most) one packages section. Packages arrive as a
 * separate prop rather than nested inside their section because they are a
 * separate table with their own editor; the section only says where they go.
 *
 * This file has no "use client" and no server-only imports ON PURPOSE. A file
 * without the directive is not "always a Server Component": it takes on
 * whichever graph imports it. So the public route renders this on the server
 * (and the `buySlot` function never crosses a boundary, which is the only
 * reason a render prop is legal here), while the editor pulls the exact same
 * component into its client tree and gets a preview that cannot drift from the
 * real page. Do not import the editor or any dnd code from here.
 */
export function CreatorPageView({
  profile,
  sections,
  packages,
  buySlot,
  canvas = false,
  preview = false,
}: {
  profile: PublicProfile;
  sections: PageSection[];
  packages: PagePackage[];
  buySlot?: (pkg: PagePackage) => ReactNode;
  /** Only the real public route sets this. It escalates the theme to <html> so
   *  the iOS overscroll gutter and browser UI match. The previews must not, or
   *  opening Preview would repaint the whole dashboard. */
  canvas?: boolean;
  /** Editor preview: no scroll-reveal, since the scroll container is a div. */
  preview?: boolean;
}) {
  const theme = pageTheme(profile.theme);
  const config = profile.theme_config ?? {};
  const name = profile.display_name ?? `@${profile.username}`;

  /**
   * Social icons are hoisted out of their sections and rendered as one row
   * under the bio; everything else stays a pill in the list.
   *
   * The split lives HERE rather than in loadCreatorPage because it is a
   * rendering decision, not a loading one — the editor reads the same rows and
   * must see every link in its section, icon or not. Doing it in the component
   * every surface already shares also means the live preview cannot disagree
   * with the public page about where a link goes.
   *
   * Each link lands in exactly one place: an icon is removed from its section
   * rather than drawn twice. Order is section order, then position, which is
   * the order the editor shows and the creator arranged.
   *
   * One predicate decides both halves, so they are exact complements. Written
   * that way on purpose: `show_as_icon && platform` here and `!show_as_icon`
   * there look equivalent and are not — a row with show_as_icon and no platform
   * would match neither and disappear off the page. The database forbids that
   * combination (links_icon_needs_platform) and this does not depend on it.
   */
  const isIcon = (l: PageLink) => l.show_as_icon && Boolean(l.platform);
  const icons = sections.flatMap((s) => s.links.filter(isIcon));
  const pillSections = icons.length
    ? sections.map((s) => ({ ...s, links: s.links.filter((l) => !isIcon(l)) }))
    : sections;

  /**
   * Null for the overwhelming majority of pages, which is the point: no
   * wallpaper means no layer, no extra paint, and markup byte-identical to what
   * this component rendered before wallpapers existed.
   *
   * A plain CSS background-image, NOT next/image. Not because next/image cannot
   * do it — it documents both `fill` and a getImageProps/image-set() recipe for
   * exactly this — but because either one buys an optimiser we do not need and
   * costs things we would rather not pay: images.remotePatterns naming the
   * Supabase host, a per-request trip through the optimiser on every creator
   * page, and next/image's own DOM inside a component that has to stay
   * renderable from both the server graph and the editor's client graph.
   *
   * The bytes are handled at the other end instead. lib/image.ts downscales to
   * 1600px and re-encodes to WebP in the BROWSER before upload, so what sits
   * behind this url() is ~200-400KB rather than the 8MB that came off the
   * camera. That fixes the size once, for the storage bill and every visitor,
   * rather than optimising a huge original forever.
   */
  const wallpaper = wallpaperCss(config.wallpaper);

  return (
    <div
      data-page-theme={theme.id}
      data-page-canvas={canvas ? theme.id : undefined}
      data-page-font={config.font ?? "sans"}
      data-page-shape={config.buttonShape ?? "pill"}
      data-page-buttons={config.buttonFill ?? "fill"}
      // Drives the translucent surfaces (the package card, the icon buttons) to
      // go opaque over a photograph. Absent for every other kind, so a page with
      // no wallpaper — or with a fill or gradient — keeps its frosted glass.
      data-page-wallpaper={config.wallpaper?.kind}
      style={themeOverrideStyle(config)}
      className={[
        // overflow-clip, not overflow-hidden: both clip the avatar glow the
        // same way, but `hidden` makes this a scroll container, which would
        // capture the sticky wallpaper below and pin it to a box that never
        // scrolls — i.e. straight back to the crop moving with the page.
        "page-surface relative overflow-clip",
        // min-h-dvh is the viewport even when the component is rendered into a
        // 640px phone frame, which would hang ~40% dead space under a short
        // page. In a preview the CONTAINER owns the height.
        preview ? "min-h-full" : "min-h-dvh",
      ].join(" ")}
    >
      {/* Motivated: motion renders `initial` as an inline opacity:0 during SSR,
          so without this the whole page is blank when scripting is off. */}
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      {/* First child, so everything below paints over it. It needs no z-index
          to stay behind: the content wrapper further down is `relative`, and a
          positioned element beats a non-positioned one at equal z-index. Also
          why it must stay first — the layer is sticky, so it is positioned too,
          and moving it after the content would put the photo over the page. */}
      {wallpaper && <div aria-hidden="true" className="page-wallpaper" />}

      {/* Soft glow behind the avatar, in the page's own accent rather than the
          app's lime, so a page never shows two accent systems.

          Suppressed over a photo. Its whole job is to give the flat near-black
          canvas some depth; a photograph already has depth, and laying an
          accent-coloured haze over someone's picture reads as a rendering bug
          rather than as the page's accent. */}
      {config.wallpaper?.kind !== "image" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 w-80 rounded-full opacity-25 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, var(--page-accent), transparent 70%)",
          }}
        />
      )}

      <div className="relative mx-auto w-full max-w-xl px-5 pt-5 pb-14">
        <div className="flex items-center justify-between">
          <Logo tone="page" />
          {!preview && <ShareButton title={name} />}
        </div>

        <Reveal disabled={preview}>
          <div className="mt-8 flex flex-col items-center text-center">
            <div className="h-24 w-24 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
              <Avatar src={profile.avatar_url} name={name} />
            </div>
            <h1 className="mt-4 text-2xl font-semibold">{name}</h1>
            <p className="page-muted text-sm">@{profile.username}</p>
            {profile.bio && (
              <p className="mt-3 max-w-md text-sm opacity-90">{profile.bio}</p>
            )}
            <SocialIcons icons={icons} />
          </div>
        </Reveal>

        {pillSections.length > 0 && (
          /* Wraps the sections rather than the page, per the Next.js guidance
             to render providers as deep as possible: everything above here is
             static server output and stays that way. Both ends of the promo
             value are inside — the input below, and the checkout modal under
             each buySlot. See promo-context for why this cannot be props. */
          <PromoProvider>
            <div className="mt-8 space-y-3">
              {pillSections.map((s, i) =>
                s.kind === "packages" ? (
                  <Fragment key={s.id}>
                    {/* Immediately above the packages, wherever the creator has
                        dragged them, rather than in a fixed slot in this file —
                        section order is data, and a discount that has drifted
                        away from the thing it discounts is just noise.

                        Gated on there being packages because PackagesSection
                        renders null without them, and a promo card floating
                        over nothing to buy would be the only thing left. */}
                    {packages.length > 0 && (
                      <PromoSection
                        code={profile.promo_code}
                        discountPct={profile.promo_discount_pct}
                        delay={i * 0.05}
                        preview={preview}
                      />
                    )}
                    <PackagesSection
                      section={s}
                      packages={packages}
                      buySlot={buySlot}
                      delay={i * 0.05}
                      preview={preview}
                    />
                  </Fragment>
                ) : (
                  <LinksSection
                    key={s.id}
                    section={s}
                    delay={i * 0.05}
                    preview={preview}
                  />
                ),
              )}
            </div>
          </PromoProvider>
        )}

        <div className="page-muted mt-14 flex items-center justify-center gap-2 text-center text-xs">
          <span>Powered by Qlink</span>
          <span className="opacity-40">·</span>
          <TokenUSDT variant="branded" size={15} />
          <TokenUSDC variant="branded" size={15} />
          <span>accepted</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The creator's socials, as a row of icons under the bio.
 *
 * Reuses .page-icon-btn — the same round control the share button in the top
 * bar is built from. Motivated: it already paints from the --page-* tokens, so
 * these icons pick up the creator's theme on every preset instead of needing a
 * second set of colours that would have to be contrast-checked five more times.
 *
 * The accessible name is the link's title, which the picker seeds with the
 * platform's name ("Instagram") and the creator can change. It has to come from
 * here: PlatformIcon is aria-hidden, so without this the link would announce as
 * its own URL.
 *
 * flex-wrap, because there is no cap on how many a creator adds — a tenth icon
 * wraps to a second row rather than pushing the ninth off the page.
 */
function SocialIcons({ icons }: { icons: PageLink[] }) {
  if (icons.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1">
      {icons.map((l) => (
        <a
          key={l.id}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="page-icon-btn"
          title={l.title}
        >
          <span className="sr-only">{l.title}</span>
          <PlatformIcon slug={l.platform} size={19} />
        </a>
      ))}
    </div>
  );
}
