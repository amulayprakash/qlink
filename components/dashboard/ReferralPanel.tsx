"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/fees";

/**
 * The share-this-link block.
 *
 * A client component only because copying to the clipboard needs one. The link
 * itself is rendered by the server — putting the code in a `useEffect` fetch
 * would make the one thing this screen exists for the last thing to appear.
 */
export function ReferralPanel({
  url,
  referralPct,
  earned,
  referredCount,
}: {
  /** Null when the code could not be minted; the panel says so rather than
   *  rendering a link to `/r/null`. */
  url: string | null;
  referralPct: number;
  earned: number;
  referredCount: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions policy).
      // The input below is selectable, so there is always a manual path and
      // nothing to recover from here.
    }
  }

  return (
    <div className="card p-6">
      <h2 className="text-lg font-bold">Your referral link</h2>
      <p className="mt-1 text-sm text-muted">
        Anyone who signs up through this link is yours. You earn {referralPct}%
        of what they redeem — taken out of our platform fee, so they never earn
        less for having used it.
      </p>

      {url ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={url}
            aria-label="Your referral link"
            onFocus={(e) => e.currentTarget.select()}
            className="input font-mono text-xs"
          />
          <button
            type="button"
            onClick={copy}
            className="btn-primary shrink-0 sm:w-32"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-danger">
          Your link could not be loaded. Refresh the page to try again.
        </p>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
        <div>
          <dt className="text-sm text-muted">Signed up</dt>
          <dd className="mt-0.5 text-2xl font-bold tabular-nums">
            {referredCount}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Earned from referrals</dt>
          <dd className="mt-0.5 text-2xl font-bold tabular-nums text-brand-600">
            {formatUsd(earned)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
