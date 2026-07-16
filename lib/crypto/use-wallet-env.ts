"use client";

import { useSyncExternalStore } from "react";
import {
  hasInjectedEvm,
  hasInjectedTron,
  isInWalletBrowser,
  isMobileDevice,
} from "./wallet-env";

export interface WalletEnv {
  mobile: boolean;
  inWalletBrowser: boolean;
  injectedEvm: boolean;
  injectedTron: boolean;
  /** False only in the server snapshot — the probes need `window`. */
  ready: boolean;
}

const SERVER_SNAPSHOT: WalletEnv = {
  mobile: false,
  inWalletBrowser: false,
  injectedEvm: false,
  injectedTron: false,
  ready: false,
};

/**
 * Cached because `useSyncExternalStore` re-renders forever unless getSnapshot
 * returns a stable reference. Safe to compute once: a page does not change
 * device class mid-session, and by the time checkout opens — on a click, long
 * after load — any wallet extension has finished injecting itself.
 */
let snapshot: WalletEnv | null = null;

function getSnapshot(): WalletEnv {
  snapshot ??= {
    mobile: isMobileDevice(),
    inWalletBrowser: isInWalletBrowser(),
    injectedEvm: hasInjectedEvm(),
    injectedTron: hasInjectedTron(),
    ready: true,
  };
  return snapshot;
}

function getServerSnapshot(): WalletEnv {
  return SERVER_SNAPSHOT;
}

/** The environment never changes, so there is nothing to subscribe to. */
const subscribe = () => () => {};

/**
 * Wallet-environment probes.
 *
 * Read through `useSyncExternalStore` rather than in render: these touch
 * `window`/`navigator`, and a server render that guessed "desktop" would
 * hydrate against a client render that knows better.
 */
export function useWalletEnv(): WalletEnv {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
