"use client";

import { useEffect, useRef } from "react";
import { CheckSquare, X } from "@phosphor-icons/react";
import { Avatar } from "@/components/Avatar";
import type { PagePackage } from "./PackagesSection";

/** Who the visitor is buying from. Threaded in from the public route rather
 *  than read here, because this file must not touch Supabase. */
export type PageCreator = {
  name: string;
  username: string;
  avatarUrl: string | null;
};

function usd(n: number) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

/**
 * What a package actually includes, and the button that starts checkout.
 *
 * The card in the list carries only the title now, so this is where the
 * description and the feature list moved. Motivated: a page with six packages
 * was six stacked feature lists, and at that point the visitor is choosing
 * between titles rather than reading terms — the detail matters once, for the
 * one they picked.
 *
 * Built on <dialog> + showModal(), like the editor's modals: the UA gives focus
 * trapping, Esc-to-close, an inert background and ::backdrop for free. A div
 * with a fixed overlay gives none of the four and has to reimplement them all.
 *
 * MOUNTED ONLY WHILE OPEN (BuyButton guards with `{detail && ...}`), which is
 * what keeps showModal() in an effect with an empty dep array honest.
 *
 * Painted from the --page-* tokens rather than the app's .card, because it
 * opens over a creator page and has to follow that creator's theme. That works
 * from the top layer: showModal() changes where the dialog PAINTS, not where it
 * sits in the DOM, and custom properties inherit down the DOM tree — so the
 * [data-page-theme] wrapper this renders inside still reaches it.
 */
export function PackageDetailModal({
  pkg,
  creator,
  onClose,
  onSubscribe,
}: {
  pkg: PagePackage;
  creator: PageCreator;
  onClose: () => void;
  onSubscribe: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const features = Array.isArray(pkg.features) ? (pkg.features as string[]) : [];

  // showModal(), not the `open` attribute: only the method call gets the top
  // layer, the backdrop and the focus trap. The attribute alone renders a
  // non-modal dialog the page can still be tabbed behind.
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      // Esc routes through the parent's state too, or the dialog would close
      // while `detail` stayed true and then refuse to reopen.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click landing on <dialog> itself is a click on the backdrop: the
        // content box below covers the whole dialog.
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="pkg-detail-heading"
      className="m-auto max-h-[85dvh] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      style={{
        borderRadius: "1.5rem",
        // --page-bg, not --page-card-bg. The card token is ~92% transparent and
        // works on the page because the page's own canvas is behind it; in the
        // top layer there is no canvas behind, only the backdrop, so the same
        // token would render this as smoked glass over black and drag the text
        // off its verified contrast pair.
        background: "var(--page-bg)",
        border: "1px solid var(--page-card-border)",
        color: "var(--page-fg)",
      }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
              <Avatar src={creator.avatarUrl} name={creator.name} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{creator.name}</p>
              <p className="page-muted truncate text-xs">@{creator.username}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="page-icon-btn h-8 w-8 shrink-0"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <h2 id="pkg-detail-heading" className="mt-5 text-xl font-semibold">
          {pkg.name}
        </h2>
        {pkg.description && (
          <p className="page-muted mt-1.5 text-sm">{pkg.description}</p>
        )}

        {features.length > 0 && (
          <>
            <p className="page-muted mt-5 text-xs font-medium tracking-wider uppercase">
              What&apos;s included
            </p>
            <ul className="mt-3 space-y-2.5 text-sm">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckSquare
                    size={17}
                    weight="fill"
                    className="page-accent-text mt-px shrink-0"
                  />
                  <span className="opacity-90">{f}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* justify-between overrides .page-cta's justify-center — a utility
            beats an @layer components rule regardless of source order. */}
        <button className="page-cta mt-6 justify-between" onClick={onSubscribe}>
          <span>Subscribe</span>
          <span>{usd(pkg.price_usd)}</span>
        </button>
      </div>
    </dialog>
  );
}
