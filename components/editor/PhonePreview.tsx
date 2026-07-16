import Link from "next/link";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { CopyButton } from "@/components/CopyButton";
import { CreatorPageView, type PublicProfile } from "@/components/CreatorPageView";
import type { PagePackage } from "@/components/page/PackagesSection";
import type { PageSection } from "@/lib/sections";

/**
 * The live preview: the creator's real page, in a phone.
 *
 * This renders CreatorPageView — the same component the public route renders —
 * off the editor's DRAFT state, so the preview cannot drift from what visitors
 * get. The frame is cosmetic; it only bounds the scroll area.
 *
 * No "use client" here on purpose. The file takes on whichever graph imports
 * it, and today that is SectionsEditor's client tree. It stays free of client-
 * only APIs so it could be server-rendered elsewhere unchanged.
 */
export function PhonePreview({
  profile,
  sections,
  packages,
  publicUrl,
  isPublished,
}: {
  profile: PublicProfile;
  sections: PageSection[];
  packages: PagePackage[];
  /** Empty until the creator claims a username. */
  publicUrl: string;
  isPublished: boolean;
}) {
  return (
    <div className="sticky top-6 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-card px-4 py-2">
          {publicUrl ? (
            <>
              <span className="truncate text-sm text-muted" title={publicUrl}>
                {publicUrl.replace(/^https?:\/\//, "")}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <CopyButton
                  value={publicUrl}
                  label="Copy"
                  className="btn-ghost px-2 py-1 text-xs"
                />
                {/* Only when published: an "Open" that 404s because the page is
                    still a draft is worse than no button. */}
                {isPublished && (
                  <Link
                    href={publicUrl}
                    target="_blank"
                    className="btn-ghost px-2 py-1"
                    aria-label="Open live page in a new tab"
                  >
                    <ArrowSquareOut size={15} weight="bold" />
                  </Link>
                )}
              </div>
            </>
          ) : (
            <Link
              href="/onboarding/username"
              className="truncate text-sm text-brand-700 underline"
            >
              Claim your username to get a link
            </Link>
          )}
        </div>
      </div>

      <div className="phone">
        <div className="phone-screen">
          {/* preview: no scroll-reveal (the scroll container is a div, so items
              below the fold would never animate in), no canvas escalation (it
              would repaint the whole dashboard in the page theme), and no
              buySlot, so checkout renders inert. */}
          <CreatorPageView
            profile={profile}
            sections={sections}
            packages={packages}
            preview
          />
        </div>
      </div>

      <p className="text-center text-xs text-muted">
        {isPublished
          ? "Live preview · unsaved edits show here first"
          : "Draft · publish to make this page public"}
      </p>
    </div>
  );
}
