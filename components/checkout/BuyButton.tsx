"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  PackageDetailModal,
  type PageCreator,
} from "@/components/page/PackageDetailModal";
import type { PagePackage } from "@/components/page/PackagesSection";

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
  creator,
  hasEvm,
  hasTron,
}: {
  pkg: PagePackage;
  creator: PageCreator;
  hasEvm: boolean;
  hasTron: boolean;
}) {
  const [detail, setDetail] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const label =
    pkg.price_usd % 1 === 0 ? `$${pkg.price_usd}` : `$${pkg.price_usd.toFixed(2)}`;

  return (
    <>
      {/* page-cta, not btn-primary. Motivated: btn-primary is the app's lime,
          which would put a lime button on a mocha creator page. This follows
          whatever accent the creator's theme sets. */}
      <button
        className="page-cta"
        onClick={() => {
          setDetail(true);
          // Prefetch on OPEN rather than on hover of this button. The hover
          // version predates the detail step and no longer earns its keep: this
          // button now means "show me what's in it", so hovering it would pull
          // 1.5MB for everyone browsing the list. A click that opens the detail
          // is real intent, and the seconds spent reading the modal are enough
          // to have the chunk cached by the time Subscribe is pressed —
          // strictly more warning than the old hover gave. Idempotent: the
          // module cache makes repeat calls free.
          void import("./CheckoutDialog");
        }}
      >
        Subscribe {label}
      </button>

      {/* Both mounted only once opened. Not mounting a closed modal also resets
          the checkout's stage machine between opens, which is what you want
          anyway, and lets the detail modal call showModal() from a mount
          effect. */}
      {detail && (
        <PackageDetailModal
          pkg={pkg}
          creator={creator}
          onClose={() => setDetail(false)}
          onSubscribe={() => {
            // Closed, not left open behind: two stacked dialogs would put the
            // detail's <dialog> in the top layer under the checkout's fixed
            // overlay, and its focus trap would fight the checkout's.
            setDetail(false);
            setCheckout(true);
          }}
        />
      )}
      {checkout && (
        <CheckoutDialog
          open={checkout}
          onClose={() => setCheckout(false)}
          pkg={pkg}
          hasEvm={hasEvm}
          hasTron={hasTron}
        />
      )}
    </>
  );
}
