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
 *  on top of the preset named by profiles.theme. */
export interface ThemeConfig {
  /** #rrggbb. Validated and contrast-gated server-side before it is stored. */
  accent?: string;
  font?: PageFontKey;
}

export type PageFontKey = "sans" | "serif";

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
