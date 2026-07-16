import { isAddress, getAddress } from "viem";

/** EVM address validation + checksum normalization. */
export function isEvmAddress(value: string): boolean {
  return isAddress(value);
}

export function normalizeEvmAddress(value: string): string {
  return getAddress(value); // throws if invalid; returns EIP-55 checksummed
}

/** Tron base58 address format check (T + 33 base58 chars). */
export function isTronAddress(value: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
}
