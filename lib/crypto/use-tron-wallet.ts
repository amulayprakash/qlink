"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { projectId } from "./wagmi";
import {
  connectTronWalletConnect,
  disconnectTronWalletConnect,
  getTronWalletConnectAddress,
} from "./tron-walletconnect";
import { connectTronInjected, type TronRoute } from "./tron-client";

const metadata = () => ({
  name: "Qlink",
  description: "One link. Sell your packages. Get paid in crypto.",
  url:
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
});

export interface TronWallet {
  address: string | null;
  route: TronRoute | null;
  connecting: boolean;
  error: string | null;
  /** Pairing URI; null while the relay is still starting up. */
  qrUri: string | null;
  qrOpen: boolean;
  /** Both resolve to the connected address, or null if it didn't happen. */
  connectInjected: () => Promise<string | null>;
  connectWalletConnect: (wcChainId: string) => Promise<string | null>;
  closeQr: () => void;
  disconnect: () => Promise<void>;
}

/**
 * Tron connection state for the checkout flow.
 *
 * The WalletConnect session itself lives in module state (see
 * `tron-walletconnect.ts`) so it survives this component unmounting while the
 * customer is away in their wallet app; this hook mirrors it for render and
 * seeds from it on mount.
 */
export function useTronWallet(): TronWallet {
  const [address, setAddress] = useState<string | null>(() =>
    getTronWalletConnectAddress(),
  );
  const [route, setRoute] = useState<TronRoute | null>(() =>
    getTronWalletConnectAddress() ? "walletconnect" : null,
  );
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  // Guards every post-await setState: pairing can outlive the modal.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const connectInjected = useCallback(async (): Promise<string | null> => {
    setConnecting(true);
    setError(null);
    try {
      const { address: addr } = await connectTronInjected();
      if (!alive.current) return null;
      setAddress(addr);
      setRoute("injected");
      return addr;
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "Could not connect TronLink");
      }
      return null;
    } finally {
      if (alive.current) setConnecting(false);
    }
  }, []);

  const connectWalletConnect = useCallback(
    async (wcChainId: string): Promise<string | null> => {
      setConnecting(true);
      setError(null);
      // Open the modal before the URI exists so the customer sees a spinner
      // rather than nothing while the relay starts, which is not instant.
      setQrOpen(true);
      setQrUri(null);
      try {
        const { address: addr } = await connectTronWalletConnect({
          wcChainId,
          projectId,
          metadata: metadata(),
          onDisplayUri: (uri) => {
            if (alive.current) setQrUri(uri);
          },
          onCloseModal: () => {
            if (alive.current) {
              setQrOpen(false);
              setQrUri(null);
            }
          },
        });
        if (!alive.current) return null;
        setAddress(addr);
        setRoute("walletconnect");
        return addr;
      } catch (e) {
        if (alive.current) {
          const msg = e instanceof Error ? e.message : "Could not connect";
          // A cancel is a choice, not a failure — don't shout about it.
          setError(msg === "Connection cancelled" ? null : msg);
        }
        return null;
      } finally {
        if (alive.current) {
          setConnecting(false);
          setQrOpen(false);
          setQrUri(null);
        }
      }
    },
    [],
  );

  const closeQr = useCallback(() => {
    setQrOpen(false);
    setQrUri(null);
  }, []);

  const disconnect = useCallback(async () => {
    if (route === "walletconnect") {
      await disconnectTronWalletConnect();
    }
    if (!alive.current) return;
    setAddress(null);
    setRoute(null);
    setError(null);
  }, [route]);

  return {
    address,
    route,
    connecting,
    error,
    qrUri,
    qrOpen,
    connectInjected,
    connectWalletConnect,
    closeQr,
    disconnect,
  };
}
