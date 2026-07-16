"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

/**
 * The wallet stack is ~1.5MB of JS and it hangs off this one import.
 *
 * `ssr: false` is what makes the split real rather than cosmetic: a plain
 * dynamic() would still server-render the modal, which would pull @reown and
 * wagmi back into the page's server graph and ship them to the client anyway.
 * Legal here only because this is a Client Component — ssr:false is rejected
 * in Server Components.
 *
 * It also subsumes the reason the modal was already gated behind `open`:
 * CheckoutModal calls useAppKit() before its own `if (!open) return null`, and
 * createAppKit is browser-only, so server-rendering it threw "Please call
 * createAppKit before using useAppKit" and 500'd every public page that had a
 * package. Now it cannot be server-rendered at all.
 */
const CheckoutDialog = dynamic(() => import("./CheckoutDialog"), {
  ssr: false,
});

export function BuyButton({
  pkg,
  hasEvm,
  hasTron,
}: {
  pkg: { id: string; name: string; price_usd: number };
  hasEvm: boolean;
  hasTron: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = pkg.price_usd % 1 === 0 ? `$${pkg.price_usd}` : `$${pkg.price_usd.toFixed(2)}`;
  return (
    <>
      {/* page-cta, not btn-primary. Motivated: btn-primary is the app's lime,
          which would put a lime button on a mocha creator page. This follows
          whatever accent the creator's theme sets. */}
      <button
        className="page-cta"
        onClick={() => setOpen(true)}
        // Motivated: the chunk is big, so start fetching it on intent rather
        // than on click — by the time the pointer reaches the button and
        // presses, the download is usually in flight or done, which buys back
        // most of what the lazy boundary costs the buyer. Idempotent: the
        // module cache makes repeat calls free.
        onPointerEnter={() => void import("./CheckoutDialog")}
        onFocus={() => void import("./CheckoutDialog")}
      >
        Buy {label}
      </button>
      {/* Mounted only once opened. Not mounting a closed modal also resets its
          stage machine between opens, which is what you want anyway. */}
      {open && (
        <CheckoutDialog
          open={open}
          onClose={() => setOpen(false)}
          pkg={pkg}
          hasEvm={hasEvm}
          hasTron={hasTron}
        />
      )}
    </>
  );
}
