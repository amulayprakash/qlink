"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

/* ============================================================================
   WalletConnectQRModal — the pairing QR for mobile Tron wallets.
   ----------------------------------------------------------------------------
   Sits at z-60, above the checkout dialog at z-50, and stops click propagation
   on its own backdrop. Motivated: the checkout dialog closes on backdrop click,
   and without both of those a click meant for this modal would tear down the
   checkout underneath it mid-pairing.
   ========================================================================== */
export function WalletConnectQRModal({
  open,
  uri,
  onClose,
}: {
  open: boolean;
  uri: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function copy() {
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the QR is still scannable */
    }
  }

  return (
    <div
      className="fixed inset-0 z-60 grid place-items-center bg-black/60 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Connect a Tron wallet with WalletConnect"
    >
      <div
        className="card w-full max-w-[360px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold">Scan to connect</h3>
            <p className="text-sm text-muted">Use your mobile Tron wallet</p>
          </div>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-5 grid place-items-center">
          <div className="grid h-[216px] w-[216px] place-items-center rounded-xl bg-white p-4">
            {uri ? (
              <QRCodeSVG value={uri} size={184} level="M" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-black/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-black/50" />
                <span className="text-xs">Generating code…</span>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          Open your wallet app, choose WalletConnect, and scan this code. Keep
          this window open.
        </p>

        {uri && (
          <button className="btn-outline mt-4 w-full" onClick={copy}>
            {copied ? "Copied" : "Copy link instead"}
          </button>
        )}
      </div>
    </div>
  );
}
