/** Shared row types mirroring the Supabase schema (supabase/migrations). */

export type OnboardingStep =
  | "username"
  | "profile"
  | "wallets"
  | "packages"
  | "preview"
  | "done";

export type OrderStatus = "pending" | "paid" | "failed";

/**
 * Section discriminant.
 *
 * 'links' owns a list of links. 'packages' owns none: it is a positioned,
 * collapsible placeholder marking WHERE the profile's packages render, so the
 * creator can drag the packages block among their link sections. The packages
 * themselves stay in their own table (see Package) and are edited separately.
 * At most one 'packages' section per profile (0003 enforces it with a partial
 * unique index).
 */
export type SectionKind = "links" | "packages";

/** Shape of profiles.theme_config (jsonb). Every field is optional: it layers
 *  on top of the preset named by profiles.theme. Optionality is not politeness
 *  — it is what lets this column gain fields with no migration, and what makes
 *  every profile written before a field existed still render. */
export interface ThemeConfig {
  /** #rrggbb. Validated and contrast-gated server-side before it is stored. */
  accent?: string;
  font?: PageFontKey;
  /** Absent means the preset's flat --page-bg, which is what every page was
   *  before wallpapers existed. */
  wallpaper?: Wallpaper;
  buttonShape?: ButtonShapeKey;
  buttonFill?: ButtonFillKey;
  /**
   * Public URL in the `share-images` bucket: the og:image a chat app shows when
   * the creator's link is pasted into it. Absent falls back to avatar_url, which
   * is what every page sent before this existed.
   *
   * Guaranteed 1200x630 JPEG by the uploader (lib/image.ts#uploadShareImage),
   * which is what lets generateMetadata declare those dimensions without
   * measuring the file. Prefix-checked server-side, same as a wallpaper's url.
   *
   * Living in theme_config is a slight stretch — this is how the page looks
   * somewhere ELSE, not how the page looks — and it buys two things worth the
   * stretch: no migration, and the write-whole ownership that updateDesign
   * already enforces on this column. The cost is that the Design form must post
   * it on every save or the next save deletes it; see the note on updateDesign.
   */
  shareImage?: string;
}

export type PageFontKey = "sans" | "serif";

/** Maps to --page-radius, which .pill/.page-cta/.page-icon-btn already read —
 *  so the shape of every control on the page is this one token. */
export type ButtonShapeKey = "pill" | "rounded" | "sharp";

/** 'fill' is the painted pill the page has always had. 'outline' drops the fill
 *  and keeps the border. */
export type ButtonFillKey = "fill" | "outline";

/**
 * What sits behind the page.
 *
 * A discriminated union rather than a bag of optional fields, because the three
 * kinds share no meaning: a gradient's second stop is nonsense for a photo, and
 * a photo's scrim is nonsense for a solid fill. The union is what lets the
 * server parse exactly the fields the kind actually has and drop the rest,
 * rather than storing a half-filled record that the renderer then has to guess
 * about.
 */
export type Wallpaper =
  | { kind: "fill"; color: string }
  | { kind: "gradient"; color: string; color2: string; angle: number }
  | {
      kind: "image";
      /** Public URL in the `wallpapers` bucket. Prefix-checked server-side:
       *  this string ends up inside a CSS url(). */
      url: string;
      /** How much of the theme's --page-bg is laid over the photo, 0..1.
       *  Deliberately un-floored — see the note in lib/themes.ts. */
      scrim: number;
    };

export type WallpaperKind = Wallpaper["kind"];

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  theme: string;
  theme_config: ThemeConfig;
  evm_wallet_address: string | null;
  tron_wallet_address: string | null;
  promo_code: string | null;
  promo_discount_pct: number;
  is_published: boolean;
  onboarding_step: OnboardingStep;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  profile_id: string;
  kind: SectionKind;
  title: string | null;
  position: number;
  collapsible: boolean;
  /** Render-time default for <details open>. Visitor toggles are not persisted. */
  default_open: boolean;
  created_at: string;
}

export interface Link {
  id: string;
  profile_id: string;
  /** Null means "the default section". The onboarding wizard writes links
   *  before the creator has ever opened the editor. */
  section_id: string | null;
  title: string;
  url: string;
  position: number;
  /** False hides the link from the public page without deleting it. The row
   *  keeps its position, so unpausing puts it back where it was. */
  is_active: boolean;
  /** Which well-known site this points at — a slug from lib/platforms.ts. Null
   *  for a custom link, which is not "unknown": there IS no platform. Free text
   *  by design (see 0005), so treat an unrecognised value as a custom link
   *  rather than an error. */
  platform: string | null;
  /** Render under the bio as a small icon instead of in the list as a pill.
   *  Orthogonal to is_active — that one decides WHETHER a link renders, this
   *  decides WHERE. Requires a platform: an icon needs a glyph to draw. */
  show_as_icon: boolean;
  created_at: string;
}

export interface Package {
  id: string;
  profile_id: string;
  name: string;
  description: string | null;
  price_usd: number;
  features: string[];
  position: number;
  is_active: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  profile_id: string;
  package_id: string | null;
  buyer_wallet: string | null;
  network: string;
  token_symbol: string;
  token_contract: string;
  /** Base units (smallest denomination) stored as a numeric string. */
  amount_expected: string;
  amount_paid: string | null;
  price_usd: number;
  promo_applied: boolean;
  discount_pct: number;
  tx_hash: string | null;
  status: OrderStatus;
  created_at: string;
  verified_at: string | null;
}
