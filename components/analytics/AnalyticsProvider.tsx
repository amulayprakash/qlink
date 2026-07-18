"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { VISITOR_KEY } from "@/lib/analytics/events";
import type { EventType, SectionName } from "@/lib/analytics/events";

type TrackData = { section?: SectionName; packageId?: string };
export type TrackFn = (type: EventType, data?: TrackData) => void;

const noop: TrackFn = () => {};
const AnalyticsContext = createContext<TrackFn | null>(null);

/**
 * The tracker, or a no-op when there is no provider above (the dashboard,
 * onboarding and editor previews). That fallback is what lets a shared
 * component like BuyButton call useTrack() unconditionally — off the public
 * page it simply does nothing, so a creator poking at their own draft never
 * inflates their own numbers.
 */
export function useTrack(): TrackFn {
  return useContext(AnalyticsContext) ?? noop;
}

/** Stable per-browser id, created lazily. Wrapped because localStorage throws
 *  in private-mode Safari and behind some cookie blockers — a missing id just
 *  means the hit is counted but not de-duplicated, which is fine. */
function getVisitorId(): string | undefined {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return undefined;
  }
}

/**
 * Wraps the PUBLIC creator page (app/[username]/page.tsx) and nothing else.
 *
 * It is a Client Component that receives the server-rendered page as `children`.
 * Context still reaches the Client Components nested deep inside that server
 * tree (BuyButton) — React context crosses the server/client boundary freely,
 * it only requires that the CONSUMER is a client component.
 *
 * On mount it:
 *   1. records a `page_view`,
 *   2. observes every `[data-av-section]` block CreatorPageView tagged and
 *      records a `section_view` the first time each scrolls ~40% into view,
 *   3. exposes track() so BuyButton can record package_open / checkout_start.
 *
 * Every send is fire-and-forget via sendBeacon (falling back to a keepalive
 * fetch), and wrapped so analytics can never throw into the page it measures.
 */
export function AnalyticsProvider({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  // The live tracker. Held in a ref so the context value never changes identity
  // (and never re-renders consumers) even though the real function is only
  // built after mount, where localStorage / navigator exist.
  const trackRef = useRef<TrackFn>(noop);

  useEffect(() => {
    const visitorId = getVisitorId();

    const track: TrackFn = (type, data) => {
      const body = JSON.stringify({
        u: username,
        t: type,
        s: data?.section,
        p: data?.packageId,
        v: visitorId,
      });
      try {
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/events",
            new Blob([body], { type: "application/json" }),
          );
        } else {
          void fetch("/api/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        /* analytics must never throw into the page */
      }
    };
    trackRef.current = track;

    track("page_view");

    // section_view — once per section, the first time it is meaningfully on
    // screen. unobserve after firing so a visitor scrolling up and down does
    // not re-count the same section.
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const name = entry.target.getAttribute("data-av-section");
          if (name && !seen.has(name)) {
            seen.add(name);
            track("section_view", { section: name as SectionName });
          }
          io.unobserve(entry.target);
        }
      },
      // Height-independent: fire once the block crosses into the top ~80% of the
      // viewport. A ratio threshold (e.g. 0.4) would never trip for a section
      // taller than the viewport — a page with many packages would go uncounted.
      { threshold: 0, rootMargin: "0px 0px -20% 0px" },
    );
    document
      .querySelectorAll<HTMLElement>("[data-av-section]")
      .forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      trackRef.current = noop;
    };
  }, [username]);

  // Stable identity for the life of the provider (so consumers never re-render),
  // reading trackRef.current at call time so it always routes to the live
  // tracker built in the effect above. Reading a ref inside a callback — rather
  // than during render — is the supported pattern.
  const track = useCallback<TrackFn>(
    (type, data) => trackRef.current(type, data),
    [],
  );

  return (
    <AnalyticsContext.Provider value={track}>
      {children}
    </AnalyticsContext.Provider>
  );
}
