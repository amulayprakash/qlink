import { createPublicClient, http, getAddress, parseEventLogs } from "viem";
import { ERC20_ABI } from "./abi";
import type { NetworkConfig } from "./config";

export interface VerifyResult {
  ok: boolean;
  amount?: bigint;
  reason?: string;
  /** True when the tx simply isn't confirmed yet (caller may retry). */
  pending?: boolean;
}

/**
 * Verify an ERC-20 stablecoin transfer on an EVM chain by reading the tx
 * receipt and summing Transfer(value) logs from `tokenContract` to `recipient`.
 */
export async function verifyEvmTransfer(opts: {
  network: NetworkConfig;
  txHash: string;
  tokenContract: string;
  recipient: string;
  minAmount: bigint;
}): Promise<VerifyResult> {
  const { network, txHash, tokenContract, recipient, minAmount } = opts;

  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, reason: "Invalid transaction hash" };
  }

  const client = createPublicClient({ transport: http(network.rpcUrl) });
  const hash = txHash as `0x${string}`;

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch {
    return { ok: false, pending: true, reason: "Transaction not found yet" };
  }

  if (receipt.status !== "success") {
    return { ok: false, reason: "Transaction reverted on-chain" };
  }

  // Require enough confirmations to guard against re-orgs.
  const current = await client.getBlockNumber();
  const confirmations = current - receipt.blockNumber + 1n;
  if (confirmations < BigInt(network.confirmations)) {
    return {
      ok: false,
      pending: true,
      reason: `Waiting for confirmations (${confirmations}/${network.confirmations})`,
    };
  }

  const wantToken = getAddress(tokenContract);
  const wantTo = getAddress(recipient);

  const logs = parseEventLogs({
    abi: ERC20_ABI,
    eventName: "Transfer",
    logs: receipt.logs,
  });

  let total = 0n;
  for (const log of logs) {
    if (getAddress(log.address) !== wantToken) continue;
    if (getAddress(log.args.to) !== wantTo) continue;
    total += log.args.value;
  }

  if (total >= minAmount) {
    return { ok: true, amount: total };
  }
  return {
    ok: false,
    amount: total,
    reason:
      total === 0n
        ? "No matching transfer to the creator was found in this transaction"
        : "Paid amount is less than required",
  };
}
