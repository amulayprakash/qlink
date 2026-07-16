import { createClient } from "@/lib/supabase/server";
import { CopyButton } from "@/components/CopyButton";
import { getNetwork, getToken, type TokenSymbol } from "@/lib/crypto/config";
import { fromBaseUnits } from "@/lib/crypto/amount";

function statusBadge(status: string) {
  if (status === "paid") return "badge bg-accent/15 text-accent";
  if (status === "failed") return "badge bg-danger/15 text-danger";
  return "badge bg-amber-400/15 text-amber-300";
}

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: orders }, { data: profile }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, created_at, status, price_usd, token_symbol, network, amount_expected, tx_hash, promo_applied, packages(name)",
      )
      .eq("profile_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("promo_code, promo_discount_pct")
      .eq("id", user!.id)
      .single(),
  ]);

  const rows = orders ?? [];
  const paid = rows.filter((o) => o.status === "paid");
  const revenue = paid.reduce((s, o) => s + Number(o.price_usd), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-sm text-muted">
          Payments are verified on-chain. Confirmed orders show as paid.
        </p>
      </div>

      {/* These three counted orders while living on a page about links. They
          are here now, above the rows they summarise. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total orders" value={rows.length.toString()} />
        <Stat label="Paid orders" value={paid.length.toString()} />
        <Stat
          label="Revenue (paid)"
          value={`$${revenue % 1 === 0 ? revenue : revenue.toFixed(2)}`}
        />
      </div>

      {profile?.promo_code && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-medium">
              Your promo code · {profile.promo_discount_pct}% off for customers
            </p>
            <code className="text-lg font-bold tracking-wider text-brand-700">
              {profile.promo_code}
            </code>
          </div>
          <CopyButton value={profile.promo_code} label="Copy code" />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card grid place-items-center p-12 text-center">
          <p className="font-medium">No orders yet</p>
          <p className="mt-1 text-sm text-muted">
            Share your link and promo code to get your first sale.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Network</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tx</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const pkg = Array.isArray(o.packages)
                  ? o.packages[0]
                  : o.packages;
                const net = getNetwork(o.network);
                const token = getToken(
                  o.network,
                  o.token_symbol as TokenSymbol,
                );
                const amount = token
                  ? `${fromBaseUnits(BigInt(o.amount_expected), token.decimals)} ${o.token_symbol}`
                  : `$${o.price_usd}`;
                return (
                  <tr
                    key={o.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {pkg?.name ?? "-"}
                      {o.promo_applied && (
                        <span className="badge ml-2 bg-brand-50 text-brand-700">
                          promo
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{amount}</td>
                    <td className="whitespace-nowrap px-4 py-3 capitalize">
                      {net?.name ?? o.network}
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusBadge(o.status)}>{o.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {o.tx_hash && net ? (
                        <a
                          href={net.explorerTx(o.tx_hash)}
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
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
