import { getAddress } from "viem";

/**
 * The single set of addresses every payment on the platform lands in.
 *
 * Creators used to supply their own receiving wallets (`profiles.evm_wallet_address`
 * / `tron_wallet_address`) via an onboarding step and a dashboard settings page.
 * That is gone: the recipient is now fixed platform-side, so it cannot be changed
 * by a creator — existing rows in those columns are ignored, not migrated.
 *
 * Order creation is the only place allowed to read these. It copies the value
 * into `orders.recipient`, which stays the source of truth for that order (so
 * changing an address here never retargets an already-issued payment intent, and
 * on-chain verification keeps matching against what the buyer was actually shown).
 */
export const PLATFORM_EVM_ADDRESS = getAddress(
  "0xF6a7751c337e14810b5EEe308F07916ffFB209A7",
);

export const PLATFORM_TRON_ADDRESS = "TGYM2dGrSSgD25kzGWvKC9zaAGcfFyKKLq";

/** Recipient for a network, by chain family. */
export function platformRecipient(kind: "tron" | "evm"): string {
  return kind === "tron" ? PLATFORM_TRON_ADDRESS : PLATFORM_EVM_ADDRESS;
}
