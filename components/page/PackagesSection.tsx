import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/motion/Reveal";
import type { PageSection } from "@/lib/sections";
import type { Package } from "@/lib/types";

export type PagePackage = Pick<
  Package,
  "id" | "name" | "description" | "price_usd" | "features"
>;

function usd(n: number) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

/**
 * The packages block, as a positioned section.
 *
 * The section row carries only presentation (where it sits, its heading,
 * whether it collapses); the packages themselves come from the packages table
 * and are edited on /dashboard/packages. So this takes both.
 *
 * Collapsible is native <details>/<summary>, for the reasons spelled out in
 * LinksSection: no JS, works with scripting off, and the UA announces the
 * expanded state for free. Do NOT add role="button" or aria-expanded.
 *
 * Like LinksSection, this renders nothing when it has nothing to show, so the
 * section row that 0003 gives every profile stays invisible until they add a
 * package.
 */
export function PackagesSection({
  section,
  packages,
  buySlot,
  delay = 0,
  preview = false,
}: {
  section: PageSection;
  packages: PagePackage[];
  buySlot?: (pkg: PagePackage) => ReactNode;
  delay?: number;
  preview?: boolean;
}) {
  if (packages.length === 0) return null;

  const heading = section.title || "Packages";

  if (!section.collapsible) {
    return (
      <div className="pt-8">
        <Reveal delay={delay} disabled={preview}>
          <h2 className="page-muted mb-4 text-center text-sm font-medium">
            {heading}
          </h2>
        </Reveal>
        <div className="space-y-4">
          {packages.map((p, i) => (
            // Staggered per card, matching how this block has always arrived.
            <Reveal key={p.id} delay={delay + i * 0.06} disabled={preview}>
              <PackageCard pkg={p} buySlot={buySlot} />
            </Reveal>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Reveal delay={delay} disabled={preview}>
      {/* One Reveal, around the whole <details>, and none on the cards inside.
          Motivated: Reveal is a scroll-ARRIVAL primitive and opening a
          disclosure is not a scroll arrival — revealing the cards would make a
          section opened near the bottom of the viewport expand into a visibly
          empty box. Same rule as LinksSection. */}
      <details className="acc group" open={section.default_open}>
        <summary className="pill cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 break-words">{heading}</span>
          <span className="pill-trail" aria-hidden="true">
            <CaretDown
              size={17}
              weight="bold"
              className="transition-transform duration-200 group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="space-y-4 pt-3">
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} buySlot={buySlot} />
          ))}
        </div>
      </details>
    </Reveal>
  );
}

/**
 * Title and a button, and nothing else on purpose.
 *
 * The description and the feature list moved into PackageDetailModal, which the
 * button opens. Motivated: a page with six packages rendered six stacked
 * feature lists, and a visitor scanning that list is choosing between titles —
 * the terms matter once, for the one they picked. The price is not repeated
 * here either, because the button already carries it.
 */
function PackageCard({
  pkg,
  buySlot,
}: {
  pkg: PagePackage;
  buySlot?: (pkg: PagePackage) => ReactNode;
}) {
  return (
    <div
      className="p-5"
      style={{
        borderRadius: "1.5rem",
        // Tokens rather than literal colours, because an inline style beats
        // every stylesheet and this card has to be able to go OPAQUE when the
        // creator puts a photo behind the page — see [data-page-wallpaper] in
        // globals.css. Identical colours on a page without one.
        background: "var(--page-card-bg)",
        border: "1px solid var(--page-card-border)",
      }}
    >
      <h3 className="text-lg font-semibold">{pkg.name}</h3>
      <div className="mt-4">
        {buySlot ? (
          buySlot(pkg)
        ) : (
          <button
            className="page-cta"
            disabled
            title="Publish to enable checkout"
          >
            Subscribe {usd(pkg.price_usd)}
          </button>
        )}
      </div>
    </div>
  );
}
