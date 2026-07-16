"use client";

import { useMemo } from "react";
import { useConnect, type Connector } from "wagmi";
import { useWalletEnv } from "./use-wallet-env";

/** AppKit's own connector ids. See @reown/appkit-common ConstantsUtil. */
const APPKIT_WALLET_CONNECT_ID = "walletConnect";
const APPKIT_AUTH_ID = "AUTH";
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
 * AppKit seeds the wagmi config with a generic `injected` connector, its own
 * `walletConnect` connector, and whatever EIP-6963 announces. Rendering that
 * list raw gives you "MetaMask" next to a duplicate "Browser Wallet", plus a
 * WalletConnect entry that must not be connected to directly — AppKit's
 * connector routes `display_uri` into AppKit's own modal, so calling it
 * ourselves pairs against a QR nobody can see. The caller surfaces it as
 * "All wallets" instead, which opens the AppKit modal properly — and does so
 * unconditionally, which is why nothing here gates on the environment.
 */
export function useEvmWalletOptions(): EvmWalletOptions {
  const { connectors } = useConnect();
  const env = useWalletEnv();

  const filtered = useMemo(() => {
    if (!env.ready) return [];

    let list = connectors.filter(
      (c) => c.id !== APPKIT_WALLET_CONNECT_ID && c.id !== APPKIT_AUTH_ID,
    );

    // EIP-6963 names the wallet it discovered; the generic shim can't. When
    // both describe the same extension, keep the one that says "MetaMask".
    const hasNamed = list.some(
      (c) => c.type === "injected" && c.id !== GENERIC_INJECTED_ID,
    );
    if (hasNamed) {
      list = list.filter((c) => c.id !== GENERIC_INJECTED_ID);
    }

    // On a plain mobile browser there is no extension to shim, so the generic
    // injected entry is a button that opens nothing. Inside a wallet's in-app
    // browser it's the opposite — that entry IS the wallet — so it stays.
    if (env.mobile && !env.injectedEvm) {
      list = list.filter((c) => c.id !== GENERIC_INJECTED_ID);
    }

    return [...list].sort(
      (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    );
  }, [connectors, env]);

  return { connectors: filtered, ready: env.ready };
}
