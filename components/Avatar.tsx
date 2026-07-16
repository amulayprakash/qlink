"use client";

import { useState } from "react";

/** Dummy avatar served from `public/`, used when there's no usable image. */
export const DEFAULT_AVATAR_URL = "/avatar-placeholder.svg";

/**
 * Fills its parent, so size and clipping belong on the wrapper
 * (e.g. `h-24 w-24 overflow-hidden rounded-full`).
 */
export function Avatar({
  src,
  name,
  alt,
}: {
  src?: string | null;
  /** When set, a monogram is drawn instead of the dummy image. */
  name?: string | null;
  alt?: string;
}) {
  // Track the failing URL rather than a boolean, so picking a new image
  // after a broken one retries instead of staying stuck on the fallback.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = src && src !== failedSrc ? src : null;

  if (!usable && name) {
    return (
      <div className="font-display grid h-full w-full place-items-center bg-gradient-to-br from-brand-500 to-brand-700 text-3xl font-bold text-background">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={usable ?? DEFAULT_AVATAR_URL}
      alt={alt ?? name ?? "Avatar"}
      onError={() => setFailedSrc(src ?? null)}
      className="h-full w-full object-cover"
    />
  );
}
