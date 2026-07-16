/**
 * Supported networks + stablecoin tokens for in-house crypto checkout.
 *
 * Isomorphic (no server-only imports). RPC env vars are read server-side for
 * on-chain verification; client bundles fall back to the public default.
 *
 * ⚠️ Decimals matter: USDT/USDC are 6 decimals on most chains but 18 on BSC.
 */

export type ChainKind = "evm" | "tron";
export type TokenSymbol = "USDT" | "USDC";

export interface TokenInfo {
  symbol: TokenSymbol;
  address: string;
  decimals: number;
}

export interface NetworkConfig {
  /** Stable key used in the DB `orders.network` column. */
  id: string;
  kind: ChainKind;
  name: string;
  /** EVM numeric chain id (undefined for Tron). */
  chainId?: number;
  /**
   * CAIP-2 chain id used by Tron WalletConnect sessions (undefined for EVM,
   * where wagmi derives it from `chainId`). Mobile Tron wallets namespace their
   * session by this exact string, so a Nile order must not advertise Mainnet.
   */
  wcChainId?: string;
  rpcUrl: string;
  /** Block confirmations required before an order is marked paid. */
  confirmations: number;
  explorerTx: (hash: string) => string;
  tokens: Partial<Record<TokenSymbol, TokenInfo>>;
}

const env = (k: string, fallback: string) => process.env[k] || fallback;

// --------------------------------------------------------------------------
// MAINNET
// --------------------------------------------------------------------------
const MAINNET: Record<string, NetworkConfig> = {
  ethereum: {
    id: "ethereum",
    kind: "evm",
    name: "Ethereum",
    chainId: 1,
    rpcUrl: env("RPC_ETHEREUM", "https://eth.llamarpc.com"),
    confirmations: 3,
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
    tokens: {
      USDT: { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
      USDC: { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    },
  },
  polygon: {
    id: "polygon",
    kind: "evm",
    name: "Polygon",
    chainId: 137,
    rpcUrl: env("RPC_POLYGON", "https://polygon-rpc.com"),
    confirmations: 20,
    explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
    tokens: {
      USDT: { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
      USDC: { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359", decimals: 6 },
    },
  },
  bsc: {
    id: "bsc",
    kind: "evm",
    name: "BNB Smart Chain",
    chainId: 56,
    rpcUrl: env("RPC_BSC", "https://bsc-dataseed.binance.org"),
    confirmations: 12,
    explorerTx: (h) => `https://bscscan.com/tx/${h}`,
    tokens: {
      // NOTE: 18 decimals on BSC, not 6.
      USDT: { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
      USDC: { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    },
  },
  arbitrum: {
    id: "arbitrum",
    kind: "evm",
    name: "Arbitrum One",
    chainId: 42161,
    rpcUrl: env("RPC_ARBITRUM", "https://arb1.arbitrum.io/rpc"),
    confirmations: 5,
    explorerTx: (h) => `https://arbiscan.io/tx/${h}`,
    tokens: {
      USDT: { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
      USDC: { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    },
  },
  optimism: {
    id: "optimism",
    kind: "evm",
    name: "Optimism",
    chainId: 10,
    rpcUrl: env("RPC_OPTIMISM", "https://mainnet.optimism.io"),
    confirmations: 5,
    explorerTx: (h) => `https://optimistic.etherscan.io/tx/${h}`,
    tokens: {
      USDT: { symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
      USDC: { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
    },
  },
  base: {
    id: "base",
    kind: "evm",
    name: "Base",
    chainId: 8453,
    rpcUrl: env("RPC_BASE", "https://mainnet.base.org"),
    confirmations: 5,
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
    tokens: {
      USDC: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
      USDT: { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
    },
  },
  tron: {
    id: "tron",
    kind: "tron",
    name: "Tron",
    wcChainId: "tron:0x2b6653dc",
    rpcUrl: env("TRON_FULL_HOST", "https://api.trongrid.io"),
    confirmations: 19,
    explorerTx: (h) => `https://tronscan.org/#/transaction/${h}`,
    tokens: {
      USDT: { symbol: "USDT", address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6 },
      USDC: { symbol: "USDC", address: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", decimals: 6 },
    },
  },
};

// --------------------------------------------------------------------------
// TESTNET  (Sepolia + Tron Nile)
// Token addresses on testnets churn; override here if a faucet token differs.
// --------------------------------------------------------------------------
const TESTNET: Record<string, NetworkConfig> = {
  sepolia: {
    id: "sepolia",
    kind: "evm",
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpcUrl: env("RPC_SEPOLIA", "https://ethereum-sepolia-rpc.publicnode.com"),
    confirmations: 2,
    explorerTx: (h) => `https://sepolia.etherscan.io/tx/${h}`,
    tokens: {
      // Circle's official test USDC on Sepolia.
      USDC: { symbol: "USDC", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6 },
    },
  },
  tron: {
    id: "tron",
    kind: "tron",
    name: "Tron Nile Testnet",
    wcChainId: "tron:0xcd8690dc",
    rpcUrl: env("TRON_FULL_HOST_TESTNET", "https://nile.trongrid.io"),
    confirmations: 3,
    explorerTx: (h) => `https://nile.tronscan.org/#/transaction/${h}`,
    tokens: {
      // Nile faucet test USDT.
      USDT: { symbol: "USDT", address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", decimals: 6 },
    },
  },
};

export const IS_TESTNET =
  (process.env.NEXT_PUBLIC_CRYPTO_ENV || "testnet") === "testnet";

export const NETWORKS: Record<string, NetworkConfig> = IS_TESTNET
  ? TESTNET
  : MAINNET;

export const NETWORK_LIST: NetworkConfig[] = Object.values(NETWORKS);

export function getNetwork(id: string): NetworkConfig | undefined {
  return NETWORKS[id];
}

export function getToken(
  networkId: string,
  symbol: TokenSymbol,
): TokenInfo | undefined {
  return NETWORKS[networkId]?.tokens[symbol];
}

/** All (network, token) pairs a customer can pay with, for checkout UIs. */
export function paymentOptions(): {
  network: NetworkConfig;
  token: TokenInfo;
}[] {
  const out: { network: NetworkConfig; token: TokenInfo }[] = [];
  for (const network of NETWORK_LIST) {
    for (const token of Object.values(network.tokens)) {
      out.push({ network, token });
    }
  }
  return out;
}
