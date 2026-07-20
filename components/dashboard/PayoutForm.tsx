"use client";

import { useActionState, useMemo, useState } from "react";
import { requestPayout } from "@/app/dashboard/actions";
import type { ActionState } from "@/lib/forms";
import { paymentOptions } from "@/lib/crypto/config";
import { isValidPayoutAddress } from "@/lib/validation";
import { MIN_PAYOUT_USD, formatUsd, splitPayout } from "@/lib/fees";

/**
 * Redeem a balance.
 *
 * Shows the fee split as the creator types, because the whole point of
 * charging at redemption rather than at checkout is that the creator sees the
 * deduction happen. A number that only appears in the confirmation would put
 * us back where a fee taken at checkout was.
 *
 * The preview is computed client-side and is NOT what gets stored — the action
 * sends only the gross amount and the database recomputes the split (0011).
 * If the two ever disagree the stored one wins, which is the right way round.
 */
export function PayoutForm({
  available,
  feePct,
}: {
  available: number;
  /** This creator's rate, from my_balance() — not assumed to be the base
   *  rate, since it can be negotiated per creator. */
  feePct: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    requestPayout,
    undefined,
  );

  const options = useMemo(() => paymentOptions(), []);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  // "network:token" — one control instead of two, because not every token
  // exists on every network and a pair of independent selects can be steered
  // into a combination that does not.
  const [pair, setPair] = useState(
    options.length ? `${options[0].network.id}:${options[0].token.symbol}` : "",
  );

  const [networkId, tokenSymbol] = pair.split(":");
  const chosen = options.find(
    (o) => o.network.id === networkId && o.token.symbol === tokenSymbol,
  );

  const parsedAmount = Number(amount);
  const amountValid =
    Number.isFinite(parsedAmount) &&
    parsedAmount >= MIN_PAYOUT_USD &&
    parsedAmount <= available;
  const addressValid = chosen
    ? isValidPayoutAddress(address, chosen.network.kind)
    : false;

  const split = splitPayout(amountValid ? parsedAmount : 0, feePct);
  const blocked = pending || !amountValid || !addressValid || !chosen;

  const belowMinimum = available < MIN_PAYOUT_USD;

  if (belowMinimum) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-bold">Redeem</h2>
        <p className="mt-1 text-sm text-muted">
          You can redeem once your available balance reaches{" "}
          {formatUsd(MIN_PAYOUT_USD)}. You have {formatUsd(available)}.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card p-6">
      <h2 className="text-lg font-bold">Redeem</h2>
      <p className="mt-1 text-sm text-muted">
        We deduct a {feePct}% platform fee from each redemption and send the
        rest to the address you choose.
      </p>

      <div className="mt-5">
        <label className="label" htmlFor="amount">
          Amount to redeem
        </label>
        <div className="flex items-center rounded-xl border border-border bg-card focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <span className="pl-3.5 text-sm text-muted">$</span>
          <input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={MIN_PAYOUT_USD}
            max={available}
            autoComplete="off"
            className="w-full bg-transparent px-1.5 py-2.5 text-sm outline-none"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="mr-2 shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
            onClick={() => setAmount(available.toFixed(2))}
          >
            Max
          </button>
        </div>
        <div className="mt-1.5 h-4 text-xs">
          {amount !== "" && parsedAmount < MIN_PAYOUT_USD && (
            <span className="text-danger">
              Minimum is {formatUsd(MIN_PAYOUT_USD)}
            </span>
          )}
          {amount !== "" && parsedAmount > available && (
            <span className="text-danger">
              You have {formatUsd(available)} available
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="pair">
          Send as
        </label>
        <select
          id="pair"
          className="input"
          value={pair}
          onChange={(e) => setPair(e.target.value)}
        >
          {options.map((o) => (
            <option
              key={`${o.network.id}:${o.token.symbol}`}
              value={`${o.network.id}:${o.token.symbol}`}
            >
              {o.token.symbol} on {o.network.name}
            </option>
          ))}
        </select>
        {/* The select posts one value; the action wants two. */}
        <input type="hidden" name="network" value={networkId ?? ""} />
        <input type="hidden" name="token" value={tokenSymbol ?? ""} />
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="address">
          Your {chosen?.network.kind === "tron" ? "Tron" : "wallet"} address
        </label>
        <input
          id="address"
          name="address"
          autoComplete="off"
          spellCheck={false}
          className="input font-mono text-xs"
          placeholder={chosen?.network.kind === "tron" ? "T…" : "0x…"}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <div className="mt-1.5 h-4 text-xs">
          {address !== "" && !addressValid && (
            <span className="text-danger">
              {chosen?.network.kind === "tron"
                ? "Tron addresses start with T and are 34 characters"
                : "Expected 0x followed by 40 hex characters"}
            </span>
          )}
          {addressValid && chosen && (
            <span className="text-muted">
              Paid on {chosen.network.name}. Double-check it — transfers cannot
              be reversed.
            </span>
          )}
        </div>
      </div>

      {/* Always rendered, so the fee is not a surprise that appears at the end. */}
      <dl className="mt-4 space-y-1.5 rounded-xl bg-white/[0.03] p-4 text-sm">
        <Row label="Redeeming" value={formatUsd(split.gross)} />
        <Row
          label={`Platform fee (${feePct}%)`}
          value={`-${formatUsd(split.fee)}`}
          muted
        />
        <div className="border-t border-border pt-1.5">
          <Row
            label={`You receive${chosen ? ` in ${chosen.token.symbol}` : ""}`}
            value={formatUsd(split.net)}
            strong
          />
        </div>
      </dl>

      {state?.error && <p className="mt-3 text-sm text-danger">{state.error}</p>}
      {state?.ok && (
        <p className="mt-3 text-sm text-accent">
          Requested. It will show as pending below until we send it.
        </p>
      )}

      <button
        type="submit"
        className="btn-primary btn-lg mt-4 w-full"
        disabled={blocked}
      >
        {pending ? "Requesting…" : `Redeem ${formatUsd(split.net)}`}
      </button>
    </form>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-muted" : ""}>{label}</dt>
      <dd
        className={[
          "tabular-nums",
          strong ? "font-bold" : "",
          muted ? "text-muted" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
