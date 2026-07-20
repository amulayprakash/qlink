/**
 * The referral programme's read side, and the cookie that carries a click
 * through to a sign-up.
 *
 * Everything that decides whether money moves lives in 0012 — `claim_referral()`
 * owns attribution, `credit_referral()` owns the credit. This file reads what
 * those produced and builds the link a creator shares. One loader for the
 * referrals screen, mirroring how lib/balance.ts is the one loader for the
 * balance screen.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Referral, ReferralEarning } from "@/lib/types";

/**
 * Carries the code from the click on `/r/<code>` to the OAuth round-trip that
 * finishes at `/auth/callback`.
 *
 * A cookie rather than a `?ref=` on the redirect because the sign-in leaves our
 * origin entirely: Google is handed a `redirectTo` built by
 * GoogleSignInButton, and any query string we put on `/login` is gone by the
 * time the user comes back.
 */
export const REFERRAL_COOKIE = "qlink_ref";

/**
 * How long a click stays attributable.
 *
 * Shorter than the 30-day backstop inside `claim_referral()`, on purpose: the
 * cookie is the mechanism and the SQL window is the floor under it, so the SQL
 * must not be the thing that expires first. If it were, shortening this would
 * silently do nothing.
 */
export const REFERRAL_COOKIE_MAX_AGE = 14 * 24 * 60 * 60;

/** The link a creator shares. */
export function referralUrl(code: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base.replace(/\/$/, "")}/r/${code}`;
}

/**
 * The signed-in creator's code, minting one if they have never had it read.
 *
 * Takes no user id: `my_referral_code()` scopes itself to `auth.uid()`, the
 * same reason `my_balance()` does. Returns null rather than throwing so the
 * screen can degrade to "unavailable" instead of erroring — a referral link is
 * not worth a 500.
 */
export async function loadReferralCode(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_referral_code");
  if (error || typeof data !== "string") return null;
  return data;
}

/** People this creator referred, newest first. RLS scopes it to them. */
export async function loadReferrals(
  supabase: SupabaseClient,
): Promise<Referral[]> {
  // The join is on the FK from referrals.referee_id, so PostgREST needs the
  // constraint's target spelled out — `profiles` alone is ambiguous here
  // because this table references it twice.
  const { data } = await supabase
    .from("referrals")
    .select(
      "referee_id, created_at, profiles!referrals_referee_id_fkey(username, display_name, avatar_url)",
    )
    .order("created_at", { ascending: false });

  type Row = {
    referee_id: string;
    created_at: string;
    profiles: {
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    referee_id: r.referee_id,
    created_at: r.created_at,
    username: r.profiles?.username ?? null,
    display_name: r.profiles?.display_name ?? null,
    avatar_url: r.profiles?.avatar_url ?? null,
  }));
}

/** Credits this creator has earned, newest first. RLS scopes it to them. */
export async function loadReferralEarnings(
  supabase: SupabaseClient,
): Promise<ReferralEarning[]> {
  const { data } = await supabase
    .from("referral_earnings")
    .select(
      "id, referee_id, payout_id, source_gross_usd, referral_pct, amount_usd, created_at",
    )
    .order("created_at", { ascending: false });

  return (data ?? []) as ReferralEarning[];
}
