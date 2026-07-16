import type { ReactNode } from "react";
import { TokenUSDT, TokenUSDC } from "@web3icons/react";
import { Reveal } from "@/components/motion/Reveal";
import { Avatar } from "@/components/Avatar";
import { LinksSection } from "@/components/page/LinksSection";
import { PackagesSection, type PagePackage } from "@/components/page/PackagesSection";
import { Logo } from "@/components/Logo";
import { ShareButton } from "@/components/page/ShareButton";
import { pageTheme, themeOverrideStyle } from "@/lib/themes";
import type { PageSection } from "@/lib/sections";
import type { Package, Profile } from "@/lib/types";

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
  buySlot?: (pkg: Pick<Package, "id" | "name" | "price_usd">) => ReactNode;
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

  return (
    <div
      data-page-theme={theme.id}
      data-page-canvas={canvas ? theme.id : undefined}
      data-page-font={config.font ?? "sans"}
      style={themeOverrideStyle(config)}
      className={[
        "page-surface relative overflow-hidden",
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

      {/* Soft glow behind the avatar, in the page's own accent rather than the
          app's lime, so a page never shows two accent systems. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 w-80 rounded-full opacity-25 blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, var(--page-accent), transparent 70%)",
        }}
      />

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
          </div>
        </Reveal>

        {sections.length > 0 && (
          <div className="mt-8 space-y-3">
            {sections.map((s, i) =>
              s.kind === "packages" ? (
                <PackagesSection
                  key={s.id}
                  section={s}
                  packages={packages}
                  buySlot={buySlot}
                  delay={i * 0.05}
                  preview={preview}
                />
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
