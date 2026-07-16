import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  mainnet,
  polygon,
  bsc,
  arbitrum,
  optimism,
  base,
  sepolia,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import { IS_TESTNET } from "./config";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";

/** EVM networks exposed to Reown AppKit. Tron is handled separately (TronLink). */
export const evmNetworks: [AppKitNetwork, ...AppKitNetwork[]] = IS_TESTNET
  ? [sepolia]
  : [mainnet, polygon, bsc, arbitrum, optimism, base];

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId,
  networks: evmNetworks,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
