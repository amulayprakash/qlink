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

/*
 * There is deliberately no `isInWalletBrowser()` probe here.
 *
 * WalletConnect is offered unconditionally, so nothing needs to detect a
 * wallet's in-app browser. If that rule ever comes back, note that the obvious
 * implementation is wrong: a desktop extension injects the same flags an in-app
 * browser does (the MetaMask extension sets `ethereum.isMetaMask`, TronLink
 * sets `window.tronWeb`), so any such check must be gated on isMobileDevice()
 * or it reports every desktop-with-a-wallet as an in-app browser.
 */
