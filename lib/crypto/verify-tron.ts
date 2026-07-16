import { TronWeb } from "tronweb";
import type { NetworkConfig } from "./config";
import type { VerifyResult } from "./verify-evm";

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const last40 = (s: string) => s.toLowerCase().replace(/^0x/, "").slice(-40);

/**
 * Verify a TRC-20 stablecoin transfer on Tron by reading the transaction info
 * logs and summing Transfer(value) events from `tokenContract` to `recipient`.
 */
export async function verifyTronTransfer(opts: {
  network: NetworkConfig;
  txHash: string;
  tokenContract: string;
  recipient: string;
  minAmount: bigint;
}): Promise<VerifyResult> {
  const { network, txHash, tokenContract, recipient, minAmount } = opts;

  if (!/^[0-9a-fA-F]{64}$/.test(txHash.replace(/^0x/, ""))) {
    return { ok: false, reason: "Invalid transaction hash" };
  }

  const tronWeb = new TronWeb({
    fullHost: network.rpcUrl,
    headers: process.env.TRON_API_KEY
      ? { "TRON-PRO-API-KEY": process.env.TRON_API_KEY }
      : undefined,
  });

  let info: {
    id?: string;
    blockNumber?: number;
    receipt?: { result?: string };
    log?: { address: string; topics: string[]; data: string }[];
  };
  try {
    info = await tronWeb.trx.getTransactionInfo(txHash.replace(/^0x/, ""));
  } catch {
    return { ok: false, pending: true, reason: "Transaction not found yet" };
  }

  if (!info || !info.id || info.blockNumber == null) {
    return { ok: false, pending: true, reason: "Transaction not confirmed yet" };
  }
  if (info.receipt?.result && info.receipt.result !== "SUCCESS") {
    return { ok: false, reason: `Transaction failed (${info.receipt.result})` };
  }

  // Confirmations.
  try {
    const now = await tronWeb.trx.getCurrentBlock();
    const currentNumber = now?.block_header?.raw_data?.number ?? 0;
    const confirmations = currentNumber - info.blockNumber;
    if (confirmations < network.confirmations) {
      return {
        ok: false,
        pending: true,
        reason: `Waiting for confirmations (${confirmations}/${network.confirmations})`,
      };
    }
  } catch {
    // If the block lookup fails, fall through — the tx itself is confirmed.
  }

  const wantToken = last40(tronWeb.address.toHex(tokenContract));
  const wantTo = last40(tronWeb.address.toHex(recipient));

  let total = 0n;
  for (const log of info.log ?? []) {
    if (!log.topics || log.topics.length < 3) continue;
    // topic0 is the full 32-byte event signature hash.
    if (log.topics[0].toLowerCase().replace(/^0x/, "") !== TRANSFER_TOPIC)
      continue;
    if (last40(log.address) !== wantToken) continue;
    if (last40(log.topics[2]) !== wantTo) continue;
    try {
      total += BigInt("0x" + log.data.replace(/^0x/, ""));
    } catch {
      // ignore malformed log data
    }
  }

  if (total >= minAmount) {
    return { ok: true, amount: total };
  }
  return {
    ok: false,
    amount: total,
    reason:
      total === 0n
        ? "No matching TRC-20 transfer to the creator was found"
        : "Paid amount is less than required",
  };
}
