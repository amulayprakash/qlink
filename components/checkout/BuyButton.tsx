"use client";

import { useState } from "react";
import { CheckoutModal } from "./CheckoutModal";

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
      <button className="page-cta" onClick={() => setOpen(true)}>
        Buy {label}
      </button>
      {/* Mounted only once opened. Motivated: CheckoutModal calls useAppKit()
          before its own `if (!open) return null`, and createAppKit is browser
          only, so rendering it during SSR threw "Please call createAppKit
          before using useAppKit" and 500'd every public page that had a
          package. Not mounting a closed modal also resets its stage machine
          between opens, which is what you want anyway. */}
      {open && (
        <CheckoutModal
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
