"use client";

import { useState } from "react";
import { Check, ShareNetwork } from "@phosphor-icons/react";

/**
 * Share the creator page. Uses the native share sheet where it exists (mobile),
 * and falls back to copying the URL, mirroring components/CopyButton.tsx.
 *
 * Reads the URL from the browser at click time rather than taking it as a prop.
 * Motivated: this is the page's own address, so location is always right, and
 * it keeps the component independent of NEXT_PUBLIC_APP_URL being set
 * correctly for whatever domain the page is actually served from.
 */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Dismissing the sheet rejects. Fall through to copying rather than
        // leaving the tap with no result.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked by permissions policy. Nothing useful to do.
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className="page-icon-btn"
      aria-label={copied ? "Link copied" : "Share this page"}
    >
      {copied ? (
        <Check size={18} weight="bold" />
      ) : (
        <ShareNetwork size={18} weight="bold" />
      )}
    </button>
  );
}
