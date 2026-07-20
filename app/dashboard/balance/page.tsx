import { createClient } from "@/lib/supabase/server";
import { loadBalance, loadPayouts } from "@/lib/balance";
import { PayoutForm } from "@/components/dashboard/PayoutForm";
import { formatUsd } from "@/lib/fees";
import { getNetwork } from "@/lib/crypto/config";
import type { PayoutStatus } from "@/lib/types";

/**
 * What a creator has earned, and how to get it out.
 *
 * Sales land in the platform's wallets rather than the creator's, so this
 * screen is the creator's view of what we hold for them. The Orders page next
 * door answers "what sold"; this one answers "what am I owed".
 */
export default async function BalancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The fee rate comes back with the balance rather than from its own query:
  // `creator_fee_rates` (0011) has RLS on and no policies, so my_balance() is
  // the only way a creator can see their own rate.
  const [balance, payouts] = await Promise.all([
    loadBalance(supabase),
    loadPayouts(supabase, user!.id),
  ]);

  const feePct = balance.feePct;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Balance</h1>
        <p className="text-sm text-muted">
          Earnings from paid orders, held for you until you redeem them.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Available"
          value={formatUsd(balance.available)}
          hint="Ready to redeem"
          emphasis
        />
        <Stat
          label="Pending redemption"
          value={formatUsd(balance.inFlight)}
          hint="Requested, not yet sent"
        />
        <Stat
          label="Lifetime earned"
          value={formatUsd(balance.grossEarned)}
          hint="Gross, before fees"
        />
      </div>

      {/* Only once there is something to explain. Referral income is inside
          "Available" but not inside "Lifetime earned" — that one counts sales —
          so without this row the two do not reconcile on screen. */}
      {balance.referralEarned > 0 && (
        <Stat
          label="Referral earnings"
          value={formatUsd(balance.referralEarned)}
          hint="From creators you referred · included in Available"
        />
      )}

      <PayoutForm available={balance.available} feePct={feePct} />

      {/* Only worth the space once there is something to summarise. */}
      {balance.paidOutGross > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat
            label="Received to date"
            value={formatUsd(balance.netReceived)}
            hint="After platform fees"
          />
          <Stat
            label="Platform fees paid"
            value={formatUsd(balance.feesCharged)}
            hint={`${feePct}% of what you have redeemed`}
          />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold">Redemption history</h2>
        {payouts.length === 0 ? (
          <div className="card grid place-items-center p-12 text-center">
            <p className="font-medium">No redemptions yet</p>
            <p className="mt-1 text-sm text-muted">
              Your first one will show up here with its status.
            </p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Redeemed</th>
                  <th className="px-4 py-3 font-medium">Fee</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                  <th className="px-4 py-3 font-medium">To</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => {
                  const net = getNetwork(p.destination_network);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {formatUsd(p.amount_gross_usd)}
                      </td>
                      {/* The rate is the one frozen on the row, not the
                          creator's current rate — they can differ. */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">
                        -{formatUsd(p.fee_usd)}
                        <span className="ml-1 text-xs">({p.fee_pct}%)</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                        {formatUsd(p.amount_net_usd)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs">
                          {truncate(p.destination_address)}
                        </span>
                        <span className="block text-xs text-muted">
                          {p.destination_token} ·{" "}
                          {net?.name ?? p.destination_network}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={statusBadge(p.status)}>
                          {p.status}
                        </span>
                        {p.note && (
                          <span className="block text-xs text-muted">
                            {p.note}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.tx_hash && net ? (
                          <a
                            href={net.explorerTx(p.tx_hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 underline"
                          >
                            view
                          </a>
                        ) : (
                          <span className="text-muted">-</span>
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
    </div>
  );
}

/** Same mapping as the Orders page: paid is settled, rejected reads as an
 *  error, anything still moving is amber. */
function statusBadge(status: PayoutStatus) {
  if (status === "paid") return "badge bg-accent/15 text-accent";
  if (status === "rejected") return "badge bg-danger/15 text-danger";
  return "badge bg-amber-400/15 text-amber-300";
}

function truncate(address: string) {
  return address.length > 16
    ? `${address.slice(0, 8)}…${address.slice(-6)}`
    : address;
}

function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={[
          "mt-1 font-bold tabular-nums",
          emphasis ? "text-3xl text-brand-600" : "text-2xl",
        ].join(" ")}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
