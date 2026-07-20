/**
 * Reading a creator's balance.
 *
 * The numbers come from `my_balance()` (0011), not from summing rows here.
 * That matters: `request_payout()` checks a request against `creator_balance()`
 * in the same transaction that inserts it, so if this file re-derived the
 * total in TypeScript the figure shown to a creator and the figure their
 * request is validated against could disagree — and the disagreement would
 * surface as a rejected request against a balance the screen says they have.
 *
 * One loader for the dashboard, mirroring how lib/sections.ts is the one
 * loader for a creator's page.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Payout } from "@/lib/types";
import { BASE_PLATFORM_FEE_PCT } from "@/lib/fees";

export interface Balance {
  /** Everything ever earned from paid orders, before any fee. */
  grossEarned: number;
  /**
   * Credited from people this creator referred (0012).
   *
   * Counted into `available` alongside `grossEarned` — it is money owed on the
   * same terms — but kept as its own figure because the two answer different
   * questions and a single merged total makes "why did my balance move when I
   * sold nothing" unanswerable from the screen.
   */
  referralEarned: number;
  /** Reserved by requests that are submitted but not settled. */
  inFlight: number;
  /** Gross value of settled redemptions. */
  paidOutGross: number;
  /** Platform fees charged across settled redemptions. */
  feesCharged: number;
  /** What actually reached the creator's wallets. */
  netReceived: number;
  /** Redeemable right now: grossEarned - inFlight - paidOutGross. */
  available: number;
  /**
   * This creator's rate — BASE_PLATFORM_FEE_PCT unless they are on a
   * negotiated one.
   *
   * It rides along on the balance because it cannot be read any other way:
   * `creator_fee_rates` (0011) has RLS on and no policies, so neither `anon`
   * nor `authenticated` can select from it and one creator cannot enumerate
   * another's rate. `my_balance()` being SECURITY DEFINER is what lets a
   * creator see their own.
   */
  feePct: number;
}

const ZERO: Balance = {
  grossEarned: 0,
  referralEarned: 0,
  inFlight: 0,
  paidOutGross: 0,
  feesCharged: 0,
  netReceived: 0,
  available: 0,
  feePct: BASE_PLATFORM_FEE_PCT,
};

/**
 * Balance for the signed-in creator.
 *
 * Takes no user id by design — `my_balance()` scopes itself to `auth.uid()`,
 * so there is no id to pass wrong or to forge.
 */
export async function loadBalance(
  supabase: SupabaseClient,
): Promise<Balance> {
  const { data, error } = await supabase.rpc("my_balance").single();
  if (error || !data) return ZERO;

  // numeric comes back as a string from PostgREST, same as packages.price_usd.
  const row = data as Record<string, string | number | null>;
  return {
    grossEarned: num(row.gross_earned),
    referralEarned: num(row.referral_earned),
    inFlight: num(row.in_flight),
    paidOutGross: num(row.paid_out_gross),
    feesCharged: num(row.fees_charged),
    netReceived: num(row.net_received),
    available: num(row.available),
    feePct: row.fee_pct == null ? BASE_PLATFORM_FEE_PCT : num(row.fee_pct),
  };
}

/** A creator's redemption history, newest first. RLS scopes it to them. */
export async function loadPayouts(
  supabase: SupabaseClient,
  userId: string,
): Promise<Payout[]> {
  const { data } = await supabase
    .from("payouts")
    .select(
      "id, created_at, processed_at, status, amount_gross_usd, fee_pct, fee_usd, amount_net_usd, destination_address, destination_network, destination_token, tx_hash, note",
    )
    .eq("profile_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []) as Payout[];
}

function num(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
