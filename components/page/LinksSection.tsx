import { CaretDown } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/motion/Reveal";
import { PillLink } from "@/components/page/PillLink";
import type { PageSection } from "@/lib/sections";

/**
 * A group of links, optionally collapsible.
 *
 * Collapsible uses native <details>/<summary>. Motivated: it keeps this a
 * Server Component, costs zero JS, works with scripting off, is indexable, and
 * gets Enter/Space plus the correct expanded-state announcement from the UA for
 * free. Do NOT add role="button" or aria-expanded to the <summary>: the UA
 * already maps the `open` attribute, and adding them double-announces.
 *
 * Reveal wraps the whole <details>, never the items inside it. Motivated: Reveal
 * is a scroll-ARRIVAL primitive, and opening a disclosure is not a scroll
 * arrival. Wrapping the items means opening a section near the bottom of the
 * viewport expands it to a visibly empty box, because those items never reach
 * the intersection threshold until the visitor scrolls.
 */
export function LinksSection({
  section,
  delay = 0,
  preview = false,
}: {
  section: PageSection;
  delay?: number;
  preview?: boolean;
}) {
  if (section.links.length === 0) return null;

  const items = (
    <div className="space-y-3">
      {section.links.map((l) => (
        <PillLink key={l.id} link={l} />
      ))}
    </div>
  );

  if (!section.collapsible) {
    return (
      <Reveal delay={delay} disabled={preview}>
        {section.title && <SectionHeading>{section.title}</SectionHeading>}
        {items}
      </Reveal>
    );
  }

  return (
    <Reveal delay={delay} disabled={preview}>
      <details className="acc group" open={section.default_open}>
        <summary className="pill cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 break-words">
            {section.title || "More links"}
          </span>
          <span className="pill-trail" aria-hidden="true">
            <CaretDown
              size={17}
              weight="bold"
              className="transition-transform duration-200 group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="space-y-3 pt-3">{items}</div>
      </details>
    </Reveal>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="page-muted mb-3 px-2 text-center text-sm font-medium">
      {children}
    </h2>
  );
}
