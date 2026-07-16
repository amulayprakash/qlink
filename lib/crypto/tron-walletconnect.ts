/**
 * Tron payments over WalletConnect, for customers whose Tron wallet lives on
 * their phone rather than in a `window.tronWeb` extension.
 *
 * Built directly on `@walletconnect/universal-provider`. The `@tronweb3`
 * adapter family is deliberately not used: its adapters exist to satisfy
 * `@tronweb3/tronwallet-adapter-react-hooks`' `WalletProvider`, which this app
 * has no use for — we'd be adding five packages to reach the ~80 lines below.
 *
 * The session is module state rather than React state because it must outlive
 * the checkout modal: the customer is sent to their wallet app, and on iOS that
 * can tear down and restore the page.
 */

import type UniversalProvider from "@walletconnect/universal-provider";

const TRON_METHODS = {
  signTransaction: "tron_signTransaction",
  signMessage: "tron_signMessage",
} as const;

/** A Tron transaction as returned by `transactionBuilder.triggerSmartContract`. */
export interface TronTransaction {
  txID: string;
  raw_data: unknown;
  raw_data_hex: string;
  visible?: boolean;
  [key: string]: unknown;
}

export interface SignedTronTransaction extends TronTransaction {
  signature: string[];
}

interface TronSession {
  topic: string;
  sessionProperties?: Record<string, string>;
  namespaces: Record<string, { accounts: string[] }>;
}

let provider: UniversalProvider | null = null;
let session: TronSession | null = null;
let address: string | null = null;
let chainId: string | null = null;

function namespaceFor(wcChainId: string) {
  return {
    tron: {
      chains: [wcChainId],
      methods: [TRON_METHODS.signTransaction, TRON_METHODS.signMessage],
      events: [] as string[],
    },
  };
}

/**
 * `tron:0x2b6653dc:TAbc…` → `TAbc…`. Splitting on ":" and taking index 2 is
 * exactly the CAIP-10 account layout the Tron namespace uses.
 */
function addressFromSession(s: TronSession): string {
  const account = Object.values(s.namespaces).flatMap((ns) => ns.accounts)[0];
  if (!account) throw new Error("Wallet returned no Tron account");
  const addr = account.split(":")[2];
  if (!addr) throw new Error(`Unexpected account format: ${account}`);
  return addr;
}

export function getTronWalletConnectAddress(): string | null {
  return address;
}

export async function connectTronWalletConnect(opts: {
  wcChainId: string;
  projectId: string;
  metadata: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  onDisplayUri: (uri: string) => void;
  onCloseModal: () => void;
}): Promise<{ address: string }> {
  if (!opts.projectId) {
    throw new Error(
      "WalletConnect is unavailable — NEXT_PUBLIC_REOWN_PROJECT_ID is not set.",
    );
  }
  if (session && address && chainId === opts.wcChainId) {
    return { address };
  }

  // Dynamic: this pulls in the WalletConnect relay stack, which no customer
  // paying from an extension or on EVM should have to download.
  const { UniversalProvider: UP } = await import(
    "@walletconnect/universal-provider"
  );

  const p = await UP.init({
    projectId: opts.projectId,
    relayUrl: "wss://relay.walletconnect.com",
    metadata: opts.metadata,
  });
  provider = p as unknown as UniversalProvider;
  chainId = opts.wcChainId;

  const namespaces = namespaceFor(opts.wcChainId);

  // Reuse an acknowledged session so a returning customer isn't re-paired.
  const existing = p.client
    .find({ requiredNamespaces: namespaces })
    .filter((s: { acknowledged?: boolean }) => s.acknowledged);
  if (existing.length > 0) {
    session = existing[existing.length - 1] as unknown as TronSession;
    address = addressFromSession(session);
    return { address };
  }

  const onUri = (uri: string) => opts.onDisplayUri(uri);
  p.on("display_uri", onUri);

  try {
    const s = await p.connect({ optionalNamespaces: namespaces });
    if (!s) throw new Error("Wallet rejected the connection");
    session = s as unknown as TronSession;
    address = addressFromSession(session);
    return { address };
  } catch (err) {
    session = null;
    address = null;
    const msg = err instanceof Error ? err.message : String(err);
    if (/closed|rejected|cancel/i.test(msg)) {
      throw new Error("Connection cancelled");
    }
    throw new Error(msg || "Could not connect to your Tron wallet");
  } finally {
    // Always tear the QR down — on success it is stale, on failure it is a lie.
    p.off?.("display_uri", onUri);
    opts.onCloseModal();
  }
}

export async function signTronTransactionWc(
  transaction: TronTransaction,
): Promise<SignedTronTransaction> {
  if (!provider || !session || !chainId) {
    throw new Error("Tron wallet is not connected");
  }
  // Wallets that negotiated the v1 method shape expect the transaction bare;
  // the current shape nests it. Sending the wrong one silently hangs the wallet.
  const isV1 = session.sessionProperties?.tron_method_version === "v1";
  const result = await provider.client.request({
    chainId,
    topic: session.topic,
    request: {
      method: TRON_METHODS.signTransaction,
      params: isV1
        ? { address, transaction }
        : { address, transaction: { transaction } },
    },
  });
  const signed =
    (result as { result?: SignedTronTransaction })?.result ??
    (result as SignedTronTransaction);
  if (!signed?.signature?.length) {
    throw new Error("Wallet returned an unsigned transaction");
  }
  return signed;
}

export async function disconnectTronWalletConnect(): Promise<void> {
  const topic = session?.topic;
  if (topic && provider?.client) {
    try {
      const { getSdkError } = await import("@walletconnect/utils");
      await provider.client.disconnect({
        topic,
        reason: getSdkError("USER_DISCONNECTED"),
      });
    } catch {
      // The relay may already have dropped the session; local reset is enough.
    }
  }
  provider = null;
  session = null;
  address = null;
  chainId = null;
}
