"use client";

import { useMemo } from "react";
import { useConnect, type Connector } from "wagmi";
import { useWalletEnv } from "./use-wallet-env";

const GENERIC_INJECTED_ID = "injected";

export interface EvmWalletOptions {
  /** Connectors safe to call `connect()` on directly, best first. */
  connectors: Connector[];
  /** False until mounted — these probes need `window`. */
  ready: boolean;
}

function rank(c: Connector): number {
  const n = c.name.toLowerCase();
  if (n.includes("metamask")) return 0;
  if (n.includes("trust")) return 1;
  if (n.includes("coinbase")) return 2;
  if (c.id === GENERIC_INJECTED_ID) return 8;
  return 5;
}

/**
 * The wallet choices worth showing this particular customer.
 *
 * This is an allowlist, and deliberately so. Only two kinds of connector prove
 * a wallet is actually installed:
 *
 *   - EIP-6963 announcements. A wallet only announces if it is really there,
 *     and it tells us its name, so these are listed on their own merit.
 *   - The generic `injected` shim, but ONLY when `window.ethereum` exists and
 *     nothing named announced. AppKit seeds this connector on every page, so it
 *     is otherwise a button that opens nothing — while inside a wallet's in-app
 *     browser it may be the only handle we get on that wallet.
 *
 * Everything else is dropped and reached through "All wallets" instead, which
 * opens the AppKit modal and lets it choose QR vs deep link. That covers
 * AppKit's `walletConnect` connector, which must never be connected to directly
 * — it routes `display_uri` into AppKit's own modal, so calling it ourselves
 * pairs against a QR nobody can see — as well as its `AUTH` connector and the
 * Coinbase/Base SDK connectors it seeds regardless of what is installed. The
 * seeded pair is also switched off at the source in CheckoutDialog; this filter
 * is the backstop for anything a future AppKit version decides to seed.
 */
export function useEvmWalletOptions(): EvmWalletOptions {
  const { connectors } = useConnect();
  const env = useWalletEnv();

  const filtered = useMemo(() => {
    if (!env.ready) return [];

    const announced = connectors.filter(
      (c) => c.type === "injected" && c.id !== GENERIC_INJECTED_ID,
    );

    let list = announced;
    if (!announced.length && env.injectedEvm) {
      const shim = connectors.find((c) => c.id === GENERIC_INJECTED_ID);
      if (shim) list = [shim];
    }

    list = [...list].sort(
      (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    );

    // Two extensions can announce under different rdns and still render the
    // same name — a wallet shipping a compatibility provider next to its own is
    // enough to do it. The customer reads two identical rows and cannot tell
    // which is which, so keep the better-ranked one and drop the rest.
    const seen = new Set<string>();
    return list.filter((c) => {
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [connectors, env]);

  return { connectors: filtered, ready: env.ready };
}
