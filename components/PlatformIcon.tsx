import {
  DiscordLogoIcon,
  FacebookLogoIcon,
  GithubLogoIcon,
  InstagramLogoIcon,
  LinkSimpleIcon,
  LinkedinLogoIcon,
  SpotifyLogoIcon,
  TelegramLogoIcon,
  ThreadsLogoIcon,
  TiktokLogoIcon,
  WhatsappLogoIcon,
  XLogoIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon, IconWeight } from "@phosphor-icons/react";

/**
 * The glyph for a links.platform slug.
 *
 * Imported from `@phosphor-icons/react/ssr`, NOT the root entry, and that is
 * what makes this one component usable from both graphs: the SSR icons carry no
 * "use client" and read no IconContext, so the public route renders them on the
 * server while the editor and its live preview pull the same file into their
 * client tree. The root entry would throw on the public route. Follow
 * LinksSection, which does the same for the same reason.
 *
 * The type-only import from the root entry is erased at compile time and never
 * reaches either bundle.
 *
 * Keys are the slugs from lib/platforms.ts. An unrecognised slug falls back to
 * a generic link glyph rather than rendering nothing: 0005 stores `platform` as
 * free text precisely so the catalogue can change without stranding rows, and a
 * missing glyph would leave a social icon as an invisible tap target.
 */
const GLYPHS: Record<string, Icon> = {
  instagram: InstagramLogoIcon,
  tiktok: TiktokLogoIcon,
  youtube: YoutubeLogoIcon,
  x: XLogoIcon,
  linkedin: LinkedinLogoIcon,
  github: GithubLogoIcon,
  spotify: SpotifyLogoIcon,
  whatsapp: WhatsappLogoIcon,
  telegram: TelegramLogoIcon,
  discord: DiscordLogoIcon,
  facebook: FacebookLogoIcon,
  threads: ThreadsLogoIcon,
};

export function PlatformIcon({
  slug,
  size = 20,
  weight = "fill",
  className,
}: {
  slug: string | null | undefined;
  size?: number;
  weight?: IconWeight;
  className?: string;
}) {
  const Glyph = (slug && GLYPHS[slug]) || LinkSimpleIcon;
  // aria-hidden unconditionally: every caller is a link or a button that
  // already carries the accessible name. An icon that named itself here would
  // double-announce.
  return (
    <Glyph size={size} weight={weight} className={className} aria-hidden="true" />
  );
}
