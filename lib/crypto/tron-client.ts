/**
 * Client-side Tron payments.
 *
 * Two routes to the same TRC-20 `transfer`:
 *   - `injected`      — TronLink's own `window.tronWeb` signs and broadcasts.
 *   - `walletconnect` — we build the transaction, a phone wallet signs it over
 *                       the relay, and we broadcast it ourselves.
 *
 * The WalletConnect route is the only reason `tronweb` reaches the client, so
 * it is imported dynamically: an extension customer shouldn't pay to download
 * a bundle they never execute.
 */

import type { TronTransaction } from "./tron-walletconnect";
import { signTronTransactionWc } from "./tron-walletconnect";

export type TronRoute = "injected" | "walletconnect";

interface TronLinkProvider {
  request?: (args: { method: string }) => Promise<unknown>;
  tronWeb?: TronWebLike;
}
interface TronWebLike {
  defaultAddress?: { base58?: string };
  contract: () => { at: (addr: string) => Promise<TronContract> };
}
interface TronContract {
  approve: (
    spender: string,
    amount: string,
  ) => { send: () => Promise<string> };
  transfer: (
    to: string,
    amount: string,
  ) => { send: () => Promise<string> };
}

function win() {
  return window as unknown as {
    tronLink?: TronLinkProvider;
    tronWeb?: TronWebLike;
  };
}

/** Fee ceiling for a TRC-20 transfer: 100 TRX, denominated in SUN. */
const FEE_LIMIT = 100_000_000;

export async function connectTronInjected(): Promise<{
  address: string;
  tronWeb: TronWebLike;
}> {
  const w = win();
  if (!w.tronLink && !w.tronWeb) {
    throw new Error(
      "TronLink not found. Install the TronLink extension, or scan the QR code with a mobile Tron wallet.",
    );
  }
  if (w.tronLink?.request) {
    await w.tronLink.request({ method: "tron_requestAccounts" });
  }
  const tronWeb = w.tronWeb ?? w.tronLink?.tronWeb;
  const address = tronWeb?.defaultAddress?.base58;
  if (!tronWeb || !address) {
    throw new Error("Could not connect TronLink. Unlock the wallet and retry.");
  }
  return { address, tronWeb };
}

async function sendViaInjected(opts: {
  tokenContract: string;
  recipient: string;
  amount: string;
}): Promise<{ txHash: string; from: string }> {
  const { address, tronWeb } = await connectTronInjected();
  const contract = await tronWeb.contract().at(opts.tokenContract);
  const maxUint256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
  await contract.approve(opts.recipient, maxUint256).send();
  const txHash = await contract.transfer(opts.recipient, opts.amount).send();
  return { txHash, from: address };
}

async function sendViaWalletConnect(opts: {
  tokenContract: string;
  recipient: string;
  amount: string;
  rpcUrl: string;
  from: string;
}): Promise<{ txHash: string; from: string }> {
  const { TronWeb } = await import("tronweb");
  const tronWeb = new TronWeb({ fullHost: opts.rpcUrl });
  const maxUint256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

  // APPROVE
  const builtApprove = await tronWeb.transactionBuilder.triggerSmartContract(
    opts.tokenContract,
    "approve(address,uint256)",
    { feeLimit: FEE_LIMIT },
    [
      { type: "address", value: opts.recipient },
      { type: "uint256", value: maxUint256 },
    ],
    opts.from,
  );
  if (!builtApprove?.transaction) {
    throw new Error("Could not build the Tron approve transaction");
  }
  const signedApprove = await signTronTransactionWc(
    builtApprove.transaction as unknown as TronTransaction,
  );
  const receiptApprove = (await tronWeb.trx.sendRawTransaction(
    signedApprove as never,
  )) as unknown as { code?: string; message?: string };
  if (receiptApprove?.code) {
    let detail = receiptApprove.message ?? receiptApprove.code;
    throw new Error(`Tron rejected the approve transaction: ${detail}`);
  }

  // TRANSFER
  const built = await tronWeb.transactionBuilder.triggerSmartContract(
    opts.tokenContract,
    "transfer(address,uint256)",
    { feeLimit: FEE_LIMIT },
    [
      { type: "address", value: opts.recipient },
      { type: "uint256", value: opts.amount },
    ],
    opts.from,
  );
  if (!built?.transaction) {
    throw new Error("Could not build the Tron transaction");
  }

  const signed = await signTronTransactionWc(
    built.transaction as unknown as TronTransaction,
  );

  const receipt = (await tronWeb.trx.sendRawTransaction(
    signed as never,
  )) as unknown as {
    result?: boolean;
    txid?: string;
    code?: string;
    message?: string;
  };
  if (receipt?.code) {
    // TronGrid hex-encodes `message` on the rejection path.
    let detail = receipt.message ?? receipt.code;
    if (receipt.message && /^[0-9a-fA-F]+$/.test(receipt.message)) {
      try {
        detail = new TextDecoder().decode(
          Uint8Array.from(
            receipt.message.match(/../g)!.map((b) => parseInt(b, 16)),
          ),
        );
      } catch {
        /* keep the raw value */
      }
    }
    throw new Error(`Tron rejected the transaction: ${detail}`);
  }

  const txHash = receipt?.txid ?? signed.txID;
  if (!txHash) throw new Error("Tron returned no transaction id");
  return { txHash, from: opts.from };
}

export async function sendTronTransfer(opts: {
  route: TronRoute;
  tokenContract: string;
  recipient: string;
  /** Base units. */
  amount: string;
  /** WalletConnect route only — it broadcasts on its own. */
  rpcUrl?: string;
  /** WalletConnect route only — the paired account. */
  from?: string;
}): Promise<{ txHash: string; from: string }> {
  if (opts.route === "injected") {
    return sendViaInjected(opts);
  }
  if (!opts.rpcUrl || !opts.from) {
    throw new Error("Tron wallet is not connected");
  }
  return sendViaWalletConnect({
    tokenContract: opts.tokenContract,
    recipient: opts.recipient,
    amount: opts.amount,
    rpcUrl: opts.rpcUrl,
    from: opts.from,
  });
}
