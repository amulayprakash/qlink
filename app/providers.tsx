"use client";

import { type ReactNode, useState } from "react";
import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieToInitialState, type Config } from "wagmi";
import { wagmiAdapter, projectId, evmNetworks } from "@/lib/crypto/wagmi";

const metadata = {
  name: "Qlink",
  description: "One link. Sell your packages. Get paid in crypto.",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

// Initialise the AppKit singleton once, in the browser only (avoids SSR
// `window` access during prerender/build).
if (typeof window !== "undefined" && projectId) {
  createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks: evmNetworks,
    defaultNetwork: evmNetworks[0],
    metadata,
    // We only need wallet connections, not email/social login.
    features: { analytics: false, email: false, socials: [] },
    // Don't hijack the page with a "Switch Network" modal on load when a
    // persisted wallet is on a chain we don't list — we switch to the correct
    // chain at pay time instead.
    allowUnsupportedChain: true,
  });
}

export function Providers({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies,
  );

  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig as Config}
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
