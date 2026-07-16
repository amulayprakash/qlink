"use client";

import { type ReactNode, useState } from "react";
import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type Config } from "wagmi";
import { wagmiAdapter, projectId, evmNetworks } from "@/lib/crypto/wagmi";
import { CheckoutModal } from "./CheckoutModal";

/**
 * The wallet stack, and the only thing that pulls it into a bundle.
 *
 * This file exists to be the boundary. Reown AppKit + wagmi + viem + the
 * WalletConnect/Coinbase/MetaMask connectors are ~1.5MB of JS, and they used
 * to live in the ROOT layout, so every visitor to the marketing page, the login
 * page and every creator page downloaded and executed all of it. Exactly one
 * component has ever needed it: CheckoutModal.
 *
 * So the providers moved here, next to their only consumer, and BuyButton
 * reaches this file through a `next/dynamic` boundary that resolves when a
 * visitor actually clicks Buy. Keep it that way: importing this module (or
 * anything under @reown / wagmi) from a component that renders on first paint
 * puts the whole stack back on the critical path of every page.
 *
 * Module scope, not an effect: createAppKit registers a browser singleton, and
 * this module is only ever evaluated in the browser (BuyButton loads it with
 * `ssr: false`), so the `typeof window` guard the root-layout version needed to
 * survive prerendering is no longer load-bearing.
 */

const metadata = {
  name: "Qlink",
  description: "One link. Sell your packages. Get paid in crypto.",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

if (projectId) {
  createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks: evmNetworks,
    defaultNetwork: evmNetworks[0],
    metadata,
    // We only need wallet connections, not email/social login.
    features: { analytics: false, email: false, socials: [] },
    // The adapter seeds these two SDK connectors whether or not the customer
    // has anything installed, so the wallet step advertised "Coinbase Wallet"
    // and "Base Account" to everyone. Our step only lists wallets we can prove
    // are present; both remain reachable through "All wallets" over
    // WalletConnect. An installed Coinbase extension still announces itself
    // over EIP-6963 and is listed on its own merit.
    enableCoinbase: false,
    enableBaseAccount: false,
    // Don't hijack the page with a "Switch Network" modal on load when a
    // persisted wallet is on a chain we don't list — we switch to the correct
    // chain at pay time instead.
    allowUnsupportedChain: true,
  });
}

function CheckoutProviders({ children }: { children: ReactNode }) {
  // Motivated: no cookieToInitialState. That existed to hand wagmi the
  // connection state during SSR so a connected wallet didn't flash
  // disconnected on hydration — and reading it cost a `headers()` call in the
  // root layout, which opted EVERY route out of static rendering. Nothing here
  // is server-rendered any more, so there is no hydration to seed: the adapter
  // still uses cookieStorage, and wagmi restores the same state from
  // document.cookie when this mounts.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

/** Default export: this is what BuyButton's dynamic import resolves to. */
export default function CheckoutDialog(
  props: React.ComponentProps<typeof CheckoutModal>,
) {
  return (
    <CheckoutProviders>
      <CheckoutModal {...props} />
    </CheckoutProviders>
  );
}
