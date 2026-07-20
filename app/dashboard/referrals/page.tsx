import { createClient } from "@/lib/supabase/server";
import {
  loadReferralCode,
  loadReferrals,
  loadReferralEarnings,
  referralUrl,
} from "@/lib/referrals";
import { ReferralPanel } from "@/components/dashboard/ReferralPanel";
import { BASE_REFERRAL_PCT, formatUsd } from "@/lib/fees";

/**
 * Who this creator brought in, and what that has paid.
 *
 * Sits under "Earn" next to Balance because referral credits land in the same
 * pool and are redeemed through the same form — this screen explains a number
 * that shows up over there.
 */
export default async function ReferralsPage() {
  const supabase = await createClient();

  const [code, referrals, earnings] = await Promise.all([
    loadReferralCode(supabase),
    loadReferrals(supabase),
    loadReferralEarnings(supabase),
  ]);

  const total = earnings.reduce((sum, e) => sum + Number(e.amount_usd), 0);

  // Credits are keyed by payout, so a referee who has redeemed several times
  // has several rows. Collapsing them here keeps the table one-row-per-person,
  // which is how a creator thinks about it.
  const earnedByReferee = new Map<string, number>();
  for (const e of earnings) {
    earnedByReferee.set(
      e.referee_id,
      (earnedByReferee.get(e.referee_id) ?? 0) + Number(e.amount_usd),
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Referrals</h1>
        <p className="text-sm text-muted">
          Invite other creators and earn a share of what they redeem.
        </p>
      </div>

      <ReferralPanel
        url={code ? referralUrl(code) : null}
        // The rate a referrer actually gets is capped at the REFEREE's fee rate
        // and computed at settlement, so this is the headline rather than a
        // guarantee — which is why it comes from the shared constant and not
        // from anything person-specific.
        referralPct={BASE_REFERRAL_PCT}
        earned={total}
        referredCount={referrals.length}
      />

      <div>
        <h2 className="mb-3 text-lg font-bold">People you referred</h2>
        {referrals.length === 0 ? (
          <div className="card grid place-items-center p-12 text-center">
            <p className="font-medium">No sign-ups yet</p>
            <p className="mt-1 text-sm text-muted">
              Share your link above. Anyone who joins through it shows up here.
            </p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-4 py-3 font-medium">Creator</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Earned from them</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => {
                  const earned = earnedByReferee.get(r.referee_id) ?? 0;
                  return (
                    <tr
                      key={r.referee_id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium">
                          {r.display_name ?? "New creator"}
                        </span>
                        {r.username && (
                          <span className="block text-xs text-muted">
                            @{r.username}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {earned > 0 ? (
                          <span className="font-medium">
                            {formatUsd(earned)}
                          </span>
                        ) : (
                          // Not "$0.00": nothing has gone wrong, they simply
                          // have not redeemed yet, and a zero reads like a
                          // failed payment.
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        Referral earnings are credited when the person you referred redeems
        their balance, and are added to your own available balance. They are
        paid from our platform fee, so nothing is deducted from what they earn.
      </p>
    </div>
  );
}
