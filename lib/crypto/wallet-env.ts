/**
 * Browser-environment probes used to decide which wallet options are worth
 * showing a customer. All of these read `window`, so every one returns `false`
 * during SSR — call them from effects or event handlers, never from render, or
 * the server and client markup disagree.
 */

interface MaybeWalletWindow {
  ethereum?: {
    isMetaMask?: boolean;
    isTrust?: boolean;
    isCoinbaseWallet?: boolean;
    isRabby?: boolean;
    providers?: unknown[];
  };
  tronWeb?: unknown;
  tronLink?: unknown;
}

function win(): MaybeWalletWindow | null {
  return typeof window === "undefined"
    ? null
    : (window as unknown as MaybeWalletWindow);
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/** True when some EIP-1193 provider is injected into the page. */
export function hasInjectedEvm(): boolean {
  return !!win()?.ethereum;
}

/** True when TronLink (or another Tron wallet) injected its bridge. */
export function hasInjectedTron(): boolean {
  const w = win();
  return !!(w?.tronWeb || w?.tronLink);
}

/**
 * True when the page is running inside a wallet's own in-app browser
 * (MetaMask, Trust, Coinbase Wallet, TronLink…).
 *
 * Motivated: inside such a browser the wallet is already right there as an
 * injected provider, and WalletConnect is not just redundant but broken — its
 * QR is unscannable on the device displaying it, and its deep link would try to
 * launch the very app you are already inside.
 */
export function isInWalletBrowser(): boolean {
  const w = win();
  if (!w) return false;
  const eth = w.ethereum;
  const evmWallet = !!(
    eth?.isMetaMask ||
    eth?.isTrust ||
    eth?.isCoinbaseWallet ||
    eth?.isRabby
  );
  const tronWallet = !!(w.tronWeb || w.tronLink || eth?.isTrust);
  return evmWallet || tronWallet;
}
