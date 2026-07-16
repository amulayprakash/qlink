import { ArrowSquareOut } from "@phosphor-icons/react/ssr";
import type { PageLink } from "@/lib/sections";

/**
 * One link on a creator page: a full-width pill.
 *
 * The trailing glyph is an outbound arrow and it is decorative
 * (`pointer-events: none` via .pill-trail, `aria-hidden` here). Motivated: the
 * reference design puts a padlock and an overflow menu here, but a padlock that
 * locks nothing is a lie to the visitor, and a real button inside this <a>
 * would be interactive content nested in a link: invalid HTML that also traps
 * keyboard users. An outbound arrow is the one affordance that is actually true
 * of every link here.
 */
export function PillLink({ link }: { link: PageLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="pill"
    >
      <span className="min-w-0 break-words">{link.title}</span>
      <span className="pill-trail" aria-hidden="true">
        <ArrowSquareOut size={17} weight="bold" />
      </span>
    </a>
  );
}
