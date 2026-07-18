"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise } from "@phosphor-icons/react";

/**
 * Re-runs the admin page's server render.
 *
 * router.refresh() rather than location.reload(): it re-fetches only the RSC
 * payload and patches it in, so the current ?days= range and scroll position
 * survive, and the browser never re-negotiates Basic Auth. The page is
 * force-dynamic, so there is no cache to bust — the refetch alone is the whole
 * refresh.
 *
 * Wrapped in startTransition because that is what gives router.refresh() an
 * observable pending state; without it the button has no way to know the
 * refetch is still in flight and would look inert on a slow query.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn-outline text-sm"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-label="Refresh analytics data"
    >
      <ArrowClockwise
        size={15}
        weight="bold"
        className={pending ? "animate-spin" : undefined}
      />
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
