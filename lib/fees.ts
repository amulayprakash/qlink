/**
 * The platform's cut, and the arithmetic that applies it.
 *
 * Pay-as-you-go: no subscription, a percentage of what a creator redeems.
 * Charged at redemption rather than at checkout, so a creator's balance reads
 * as the gross value of what they sold. Because a partial redemption is
 * charged the same percentage, where the fee is collected does not change the
 * platform's total take — it only changes what the creator sees on screen.
 *
 * ⚠️ These numbers are DUPLICATED in supabase/migrations/0011, which is the
 * authoritative copy: the rate comes from `effective_fee_pct()` (a row in
 * `creator_fee_rates`, or this base rate when there is none) and the minimum
 * is a constant inside `request_payout()`. Everything here is for showing a
 * creator the split before they submit — the split that gets STORED is always
 * the one the database computed. Keep them in sync; a mismatch shows a wrong
 * preview, it does not mischarge.
 */

/** Base rate, matching the fallback in `effective_fee_pct()` in 0011. */
export const BASE_PLATFORM_FEE_PCT = 5;

/** Smallest redemption, matching `v_min` in `request_payout()`. */
export const MIN_PAYOUT_USD = 10;

/**
 * A referrer's share, matching `referral_pct()` in 0012.
 *
 * Carved OUT OF the platform fee above, not added on top: at the base rate the
 * platform keeps 3 and the referrer takes 2 of the 5 points. A creator on a
 * negotiated rate below this funds only what their fee covers, which is why the
 * SQL takes a `least()` and this constant is a ceiling rather than a promise.
 *
 * Display only. What a referrer is actually credited is computed in
 * `credit_referral()` at settlement, under a lifetime-sales cap this number
 * says nothing about.
 */
export const BASE_REFERRAL_PCT = 2;

export interface PayoutSplit {
  /** What the creator asked to redeem. */
  gross: number;
  /** Rate applied, as a percentage. */
  feePct: number;
  /** Platform's cut. */
  fee: number;
  /** What actually gets sent. Always `gross - fee`. */
  net: number;
}

/**
 * Split a redemption into fee and payout.
 *
 * Net is the remainder rather than a second rounded multiplication, so the two
 * halves always add back to the gross — the same reason 0011 computes it that
 * way and asserts it with the `payouts_split_adds_up` check constraint.
 *
 * Done in integer cents and basis points, NOT in floats. Postgres computes the
 * stored split on exact `numeric` and rounds half-away-from-zero; float math
 * disagrees with that on roughly one amount in forty, because the product
 * lands a hair below the midpoint that `numeric` sits exactly on. $42.70 at 5%
 * is the smallest case: 42.70 * 5 / 100 is exactly 2.135, which Postgres
 * rounds up to $2.14, while the nearest double is 2.13499999999999979… and
 * rounds down to $2.13. The creator would then be quoted a net of $40.57 and
 * charged one that left them $40.56.
 *
 * Scaling to integers removes the disagreement rather than narrowing it: every
 * value below is exact, and the +5000 is the half-up bias applied at the same
 * decimal place Postgres applies it.
 */
export function splitPayout(
  gross: number,
  feePct: number = BASE_PLATFORM_FEE_PCT,
): PayoutSplit {
  const grossCents = Math.round(gross * 100);
  // Basis points, so a fractional rate like 2.5% stays exact.
  const feeBp = Math.round(feePct * 100);
  const feeCents = Math.floor((grossCents * feeBp + 5000) / 10000);

  return {
    gross: grossCents / 100,
    feePct,
    fee: feeCents / 100,
    net: (grossCents - feeCents) / 100,
  };
}

/** USD for display. Always 2dp: this is money, and `$12.5` reads as an error. */
export function formatUsd(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}
