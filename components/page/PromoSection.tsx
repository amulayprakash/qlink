"use client";

import { Check, Tag } from "@phosphor-icons/react";
import { Reveal } from "@/components/motion/Reveal";
import { resolvePromo } from "@/lib/promo";
import { usePromo } from "./promo-context";

/**
 * The creator's discount, above their packages.
 *
 * Two halves, because a code is either advertised or arrived with: the code
 * itself, one tap from being applied, and an input for a visitor who was given
 * a different one. Both write the same PromoProvider value, which the checkout
 * modal reads when it opens — so the code is entered once, here, rather than
 * remembered and retyped three steps into a wallet flow.
 *
 * resolvePromo is the SAME function app/api/orders/route.ts validates with, so
 * the tick below cannot disagree with what the server actually charges. Do not
 * reimplement the comparison.
 *
 * Renders nothing without a code, or with no discount to give: resolvePromo can
 * never apply in either case, so the input would be a control that does nothing
 * and the heading would promise "0% off".
 */
export function PromoSection({
  code,
  discountPct,
  delay = 0,
  preview = false,
}: {
  code: string | null;
  discountPct: number;
  delay?: number;
  preview?: boolean;
}) {
  const ctx = usePromo();

  if (!code || discountPct <= 0) return null;

  const entered = ctx?.promo ?? "";
  const { applied } = resolvePromo({ entered, code, discountPct });

  return (
    <Reveal delay={delay} disabled={preview}>
      <div
        className="p-5"
        style={{
          // Same chrome as a package card, deliberately: this is a peer of the
          // thing it discounts, not a banner shouting over it. Tokens rather
          // than literal colours so it goes opaque over a photo wallpaper too —
          // see [data-page-wallpaper] in globals.css.
          borderRadius: "1.5rem",
          background: "var(--page-card-bg)",
          border: "1px solid var(--page-card-border)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Tag size={16} weight="bold" className="page-accent-text" />
            <h2 className="text-sm font-medium">{discountPct}% off with code</h2>
          </div>
          {/* The advertised code IS the apply button. Motivated: showing someone
              a code and then asking them to type it back is a transcription
              task, and the input below already covers the case where they have
              one we did not show them. */}
          <button
            type="button"
            onClick={() => ctx?.setPromo(code)}
            aria-label={`Apply code ${code}`}
            className="px-3 py-1.5 text-xs font-bold tracking-wider uppercase transition-opacity duration-200 hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderRadius: "var(--page-radius)",
              background: "var(--page-chip-bg)",
              color: "var(--page-fg)",
              outlineColor: "var(--page-ring)",
            }}
          >
            {code}
          </button>
        </div>

        <label className="sr-only" htmlFor="page-promo">
          Promo code
        </label>
        <input
          id="page-promo"
          value={entered}
          onChange={(e) => ctx?.setPromo(e.target.value)}
          placeholder="Have a code?"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          // uppercase is text-transform, so it styles what is typed without
          // touching the value. placeholder:normal-case because the transform
          // would otherwise shout "HAVE A CODE?" at an empty field.
          className="mt-3 w-full px-4 py-3 text-sm uppercase outline-none placeholder:normal-case focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            borderRadius: "var(--page-radius)",
            background: "var(--page-chip-bg)",
            color: "var(--page-fg)",
            border: "1px solid var(--page-card-border)",
            outlineColor: "var(--page-ring)",
          }}
        />

        {/* role=status, so the tick is announced when it flips rather than only
            seen. */}
        <p
          role="status"
          className={
            applied
              ? "page-accent-text mt-2 flex items-center gap-1.5 text-xs font-medium"
              : "page-muted mt-2 text-xs"
          }
        >
          {applied ? (
            <>
              <Check size={13} weight="bold" />
              {discountPct}% off applied at checkout
            </>
          ) : (
            "Applied at checkout."
          )}
        </p>
      </div>
    </Reveal>
  );
}
