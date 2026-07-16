import Link from "next/link";

function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  href = "/",
  /**
   * "brand" is the lime wordmark used across the app. "page" is the mark alone,
   * tinted from the creator page's own tokens. Motivated: the lime is the Qlink
   * accent, and dropping it onto a creator's mocha page would put two accent
   * systems on one screen.
   */
  tone = "brand",
}: {
  href?: string;
  tone?: "brand" | "page";
}) {
  if (tone === "page") {
    return (
      <Link href={href} className="page-icon-btn" aria-label="Qlink home">
        <Mark />
      </Link>
    );
  }

  return (
    <Link href={href} className="inline-flex items-center gap-2 font-bold">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-background">
        <Mark />
      </span>
      <span className="font-display text-lg tracking-tight">
        <span className="text-brand-600">Q</span>link
      </span>
    </Link>
  );
}
