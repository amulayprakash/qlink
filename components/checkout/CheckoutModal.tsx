"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useAccountEffect,
  useConnect,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import type { Connector } from "wagmi";
import { useAppKit, useAppKitState } from "@reown/appkit/react";
import { getNetwork, paymentOptions } from "@/lib/crypto/config";
import { fromBaseUnits } from "@/lib/crypto/amount";
import { ERC20_ABI } from "@/lib/crypto/abi";
import { sendTronTransfer } from "@/lib/crypto/tron-client";
import { useTronWallet } from "@/lib/crypto/use-tron-wallet";
import { useEvmWalletOptions } from "@/lib/crypto/use-evm-connectors";
import { useWalletEnv } from "@/lib/crypto/use-wallet-env";
import { WalletConnectQRModal } from "./WalletConnectQRModal";

type OrderResp = {
  orderId: string;
  kind: "evm" | "tron";
  networkId: string;
  chainId: number | null;
  recipient: string;
  tokenContract: string;
  tokenSymbol: string;
  decimals: number;
  amount: string;
  originalUsd: number;
  finalUsd: number;
  promoApplied: boolean;
  discountPct: number;
};

const STEP_LABELS = ["Network", "Wallet", "Amount", "Confirm"] as const;
type Step = 1 | 2 | 3 | 4;

/** Terminal states sit outside the stepper — there is no going forward. */
type Phase = "steps" | "verifying" | "success" | "error";

/**
 * How long after a foreign modal closes we keep ignoring backdrop clicks.
 * Motivated: AppKit and the Tron QR both render above this dialog, and the
 * click that dismisses them lands on our backdrop as they unmount — closing
 * checkout out from under a customer who just connected.
 */
const DISMISS_GRACE_MS = 3_000;

/** Long enough to outlast any modal session; re-armed to the grace on close. */
const DISMISS_BLOCK_MS = 600_000;

function short(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function friendly(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  const m = err?.shortMessage ?? err?.message ?? "Something went wrong";
  if (/user rejected|user denied|rejected the request/i.test(m)) {
    return "You rejected the request in your wallet";
  }
  return m;
}

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="mt-5 flex items-stretch gap-1.5">
      {STEP_LABELS.map((label, i) => {
        const n = (i + 1) as Step;
        const reached = n <= step;
        return (
          <li
            key={label}
            className="flex flex-1 flex-col gap-1.5"
            aria-current={n === step ? "step" : undefined}
          >
            <span
              className={`h-1 rounded-full ${reached ? "bg-brand-600" : "bg-white/10"}`}
            />
            <span
              className={`text-[11px] ${
                n === step ? "font-medium text-foreground" : "text-muted"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function WalletRow({
  name,
  hint,
  onClick,
  busy,
}: {
  name: string;
  hint?: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      className="flex w-full items-center justify-between rounded-xl border border-border bg-white/[0.02] px-4 py-3 text-left transition hover:bg-white/[0.06] disabled:opacity-50"
      onClick={onClick}
      disabled={busy}
    >
      <span className="font-medium">{name}</span>
      <span className="text-sm text-muted">
        {busy ? "Connecting…" : (hint ?? "")}
      </span>
    </button>
  );
}

export function CheckoutModal({
  open,
  onClose,
  pkg,
  hasEvm,
  hasTron,
}: {
  open: boolean;
  onClose: () => void;
  pkg: { id: string; name: string; price_usd: number };
  hasEvm: boolean;
  hasTron: boolean;
}) {
  const options = useMemo(
    () =>
      paymentOptions().filter((o) =>
        o.network.kind === "tron" ? hasTron : hasEvm,
      ),
    [hasEvm, hasTron],
  );

  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<Phase>("steps");
  const [optionKey, setOptionKey] = useState(
    options[0] ? `${options[0].network.id}:${options[0].token.symbol}` : "",
  );
  const [promo, setPromo] = useState("");
  const [order, setOrder] = useState<OrderResp | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectingUid, setConnectingUid] = useState<string | null>(null);

  const {
    address: evmAddress,
    isConnected: evmConnected,
    chainId: evmChainId,
  } = useAccount();
  const { connectAsync } = useConnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { open: openAppKit } = useAppKit();
  const appkit = useAppKitState();
  const { connectors: evmConnectors, showWalletConnect } = useEvmWalletOptions();
  const tron = useTronWallet();
  const env = useWalletEnv();

  const [selNetId, selTok] = optionKey ? optionKey.split(":") : ["", ""];
  const selectedNetwork = selNetId ? getNetwork(selNetId) : undefined;
  const isTron = selectedNetwork?.kind === "tron";
  const targetChainId = selectedNetwork?.chainId;

  const wrongNetwork =
    !isTron && evmConnected && !!targetChainId && evmChainId !== targetChainId;
  const walletReady = isTron ? !!tron.address : evmConnected && !wrongNetwork;
  const activeAddress = isTron ? tron.address : evmAddress;

  // --- dismissal guard -----------------------------------------------------
  const graceUntil = useRef(0);
  const armGrace = useCallback((ms: number = DISMISS_GRACE_MS) => {
    graceUntil.current = Date.now() + ms;
  }, []);
  const guardedClose = useCallback(() => {
    if (Date.now() < graceUntil.current) return;
    onClose();
  }, [onClose]);

  const appkitWasOpen = useRef(false);
  useEffect(() => {
    if (appkit.open) {
      appkitWasOpen.current = true;
      armGrace(DISMISS_BLOCK_MS);
    } else if (appkitWasOpen.current) {
      appkitWasOpen.current = false;
      armGrace();
    }
  }, [appkit.open, armGrace]);

  const qrWasOpen = useRef(false);
  useEffect(() => {
    if (tron.qrOpen) {
      qrWasOpen.current = true;
      armGrace(DISMISS_BLOCK_MS);
    } else if (qrWasOpen.current) {
      qrWasOpen.current = false;
      armGrace();
    }
  }, [tron.qrOpen, armGrace]);

  // --- auto-advance --------------------------------------------------------
  /**
   * Leaving the wallet step is driven by the connection itself, not by an
   * effect watching derived state. This one subscription covers every EVM
   * route — our own connector rows and AppKit's modal both land here — which
   * is the only way to catch a connection AppKit made without telling us.
   * Tron and chain-switching advance from their own handlers below.
   */
  useAccountEffect({
    onConnect({ chainId }) {
      if (phase !== "steps" || step !== 2 || isTron) return;
      if (!targetChainId || chainId === targetChainId) setStep(3);
    },
  });

  // --- actions -------------------------------------------------------------
  function selectOption(key: string) {
    setOptionKey(key);
    setOrder(null);
    setMessage("");
  }

  function nextFromNetwork() {
    if (!optionKey) return;
    setMessage("");
    setStep(walletReady ? 3 : 2);
  }

  async function connectEvm(connector: Connector) {
    setConnectingUid(connector.uid);
    setMessage("");
    try {
      // Ask for the order's chain up front; wallets that honour it spare the
      // customer a second prompt at the switch step.
      await connectAsync({ connector, chainId: targetChainId });
    } catch (e) {
      setMessage(friendly(e));
    } finally {
      setConnectingUid(null);
    }
  }

  function openAllWallets() {
    setMessage("");
    armGrace(DISMISS_BLOCK_MS);
    openAppKit();
  }

  async function connectTronLink() {
    const addr = await tron.connectInjected();
    if (addr) setStep(3);
  }

  async function connectTronWc() {
    if (!selectedNetwork?.wcChainId) {
      setMessage("WalletConnect isn't available for this network.");
      return;
    }
    const addr = await tron.connectWalletConnect(selectedNetwork.wcChainId);
    if (addr) setStep(3);
  }

  async function doSwitch() {
    if (!targetChainId) return;
    setMessage("");
    try {
      await switchChainAsync({ chainId: targetChainId });
      // Only the wallet step gates on this; step 4 switches in place.
      if (step === 2) setStep(3);
    } catch (e) {
      setMessage(friendly(e));
    }
  }

  async function createOrder() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          packageId: pkg.id,
          network: selNetId,
          token: selTok,
          promoCode: promo.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "Could not create order");
        setPhase("error");
        return;
      }
      setOrder(json as OrderResp);
      setStep(4);
    } catch {
      setMessage("Network error creating order");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function verify(orderId: string, txHash: string, buyer?: string) {
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch("/api/orders/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId, txHash, buyerWallet: buyer }),
        });
        const json = await res.json();
        if (json.status === "paid") {
          setPhase("success");
          return;
        }
        if (json.status === "unverified") {
          setMessage(json.reason ?? "Could not verify payment");
          setPhase("error");
          return;
        }
        setMessage(json.reason ?? "Confirming on-chain…");
      } catch {
        /* transient — retry */
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
    setMessage(
      "Still confirming. Your payment may complete shortly, and the creator will see it once confirmed.",
    );
    setPhase("error");
  }

  async function pay() {
    if (!order) return;
    setBusy(true);
    setMessage("");
    try {
      let txHash = "";
      let buyer: string | undefined = activeAddress ?? undefined;

      if (order.kind === "evm") {
        if (order.chainId) {
          try {
            await switchChainAsync({ chainId: order.chainId });
          } catch {
            /* wallet may already be on chain */
          }
        }
        txHash = await writeContractAsync({
          address: order.tokenContract as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [order.recipient as `0x${string}`, BigInt(order.amount)],
          chainId: order.chainId ?? undefined,
        });
      } else {
        if (!tron.route || !tron.address) {
          throw new Error("Connect a Tron wallet to continue");
        }
        const net = getNetwork(order.networkId);
        const r = await sendTronTransfer({
          route: tron.route,
          tokenContract: order.tokenContract,
          recipient: order.recipient,
          amount: order.amount,
          rpcUrl: net?.rpcUrl,
          from: tron.address,
        });
        txHash = r.txHash;
        buyer = r.from;
      }

      setPhase("verifying");
      await verify(order.orderId, txHash, buyer);
    } catch (e) {
      setMessage(friendly(e));
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setPhase("steps");
    setStep(order ? 4 : 1);
    setMessage("");
    setBusy(false);
  }

  if (!open) return null;

  const tokenAmount = order
    ? fromBaseUnits(BigInt(order.amount), order.decimals)
    : "";
  const walletError = message || tron.error;

  return (
    <>
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
        onClick={guardedClose}
      >
        <div
          className="card w-full max-w-md p-6"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`Buy ${pkg.name}`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold">{pkg.name}</h2>
              <p className="text-sm text-muted">Complete your purchase</p>
            </div>
            <button
              className="btn-ghost px-2"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {options.length === 0 && (
            <p className="mt-6 text-sm text-danger">
              This creator hasn&apos;t configured a payment wallet yet.
            </p>
          )}

          {phase === "steps" && options.length > 0 && <Stepper step={step} />}

          {/* 1 — NETWORK */}
          {phase === "steps" && step === 1 && options.length > 0 && (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-muted">Choose how you want to pay.</p>
              <ul className="space-y-2">
                {options.map((o) => {
                  const key = `${o.network.id}:${o.token.symbol}`;
                  const active = key === optionKey;
                  return (
                    <li key={key}>
                      <button
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                          active
                            ? "border-brand-600 bg-brand-600/10"
                            : "border-border bg-white/[0.02] hover:bg-white/[0.06]"
                        }`}
                        onClick={() => selectOption(key)}
                        aria-pressed={active}
                      >
                        <span className="font-medium">{o.network.name}</span>
                        <span className="text-sm text-muted">
                          {o.token.symbol}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                className="btn-primary btn-lg w-full"
                onClick={nextFromNetwork}
                disabled={!optionKey}
              >
                Continue
              </button>
            </div>
          )}

          {/* 2 — WALLET */}
          {phase === "steps" && step === 2 && (
            <div className="mt-5 space-y-3">
              {wrongNetwork ? (
                <>
                  <p className="text-sm text-muted">
                    Your wallet is on a different network. Switch to{" "}
                    <span className="font-medium text-foreground">
                      {selectedNetwork?.name}
                    </span>{" "}
                    to continue.
                  </p>
                  <button
                    className="btn-primary btn-lg w-full"
                    onClick={doSwitch}
                    disabled={switching}
                  >
                    {switching
                      ? "Switching…"
                      : `Switch to ${selectedNetwork?.name}`}
                  </button>
                </>
              ) : isTron ? (
                <>
                  <p className="text-sm text-muted">
                    Connect a Tron wallet to pay.
                  </p>
                  {(!env.mobile || env.injectedTron) && (
                    <WalletRow
                      name="TronLink"
                      hint={env.injectedTron ? "Detected" : "Extension"}
                      onClick={connectTronLink}
                      busy={tron.connecting}
                    />
                  )}
                  {!env.inWalletBrowser && (
                    <WalletRow
                      name="Scan with a mobile wallet"
                      hint="WalletConnect"
                      onClick={connectTronWc}
                      busy={tron.connecting}
                    />
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    Connect a wallet on {selectedNetwork?.name}.
                  </p>
                  {evmConnectors.map((c) => (
                    <WalletRow
                      key={c.uid}
                      name={c.name}
                      onClick={() => connectEvm(c)}
                      busy={connectingUid === c.uid}
                    />
                  ))}
                  {showWalletConnect && (
                    <WalletRow
                      name="All wallets"
                      hint="QR / mobile"
                      onClick={openAllWallets}
                    />
                  )}
                  {evmConnectors.length === 0 && !showWalletConnect && (
                    <p className="text-sm text-danger">
                      No wallet detected in this browser.
                    </p>
                  )}
                </>
              )}

              {walletError && (
                <p className="text-sm text-danger">{walletError}</p>
              )}
              <button className="btn-ghost w-full" onClick={() => setStep(1)}>
                Back
              </button>
            </div>
          )}

          {/* 3 — AMOUNT */}
          {phase === "steps" && step === 3 && (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Paying with</span>
                  <span className="font-medium">
                    {selectedNetwork?.name} · {selTok}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted">Wallet</span>
                  <span className="font-medium">
                    {activeAddress ? short(activeAddress) : "—"}
                  </span>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="promo">
                  Promo code (optional)
                </label>
                <input
                  id="promo"
                  className="input uppercase"
                  placeholder="Have a code?"
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                />
                <p className="hint">
                  Got a creator code? Enter it for a discount.
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted">Price</span>
                <span className="text-lg font-bold">${pkg.price_usd}</span>
              </div>

              <button
                className="btn-primary btn-lg w-full"
                onClick={createOrder}
                disabled={busy}
              >
                {busy ? "Preparing…" : "Continue"}
              </button>
              <button className="btn-ghost w-full" onClick={() => setStep(2)}>
                Back
              </button>
            </div>
          )}

          {/* 4 — CONFIRM */}
          {phase === "steps" && step === 4 && order && (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl bg-brand-50 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted">You pay</span>
                  <span className="text-2xl font-bold">
                    {tokenAmount} {order.tokenSymbol}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-xs text-muted">
                  <span>
                    {order.promoApplied ? (
                      <>
                        <span className="line-through">
                          ${order.originalUsd}
                        </span>{" "}
                        <span className="font-medium text-accent">
                          −{order.discountPct}% applied
                        </span>
                      </>
                    ) : (
                      <>≈ ${order.finalUsd}</>
                    )}
                  </span>
                  <span>to {short(order.recipient)}</span>
                </div>
              </div>

              <p className="text-xs text-muted">
                Funds go directly to the creator on{" "}
                <span className="font-medium">{selectedNetwork?.name}</span>. We
                verify the transaction on-chain. Keep this window open until it
                confirms.
              </p>

              {wrongNetwork ? (
                <button
                  className="btn-primary btn-lg w-full"
                  onClick={doSwitch}
                  disabled={switching}
                >
                  {switching
                    ? "Switching…"
                    : `Switch to ${selectedNetwork?.name}`}
                </button>
              ) : (
                <button
                  className="btn-primary btn-lg w-full"
                  onClick={pay}
                  disabled={busy || !walletReady}
                >
                  {busy
                    ? "Confirm in your wallet…"
                    : `Pay ${tokenAmount} ${order.tokenSymbol}`}
                </button>
              )}

              {message && <p className="text-sm text-danger">{message}</p>}
              <button className="btn-ghost w-full" onClick={() => setStep(3)}>
                Back
              </button>
            </div>
          )}

          {/* VERIFYING */}
          {phase === "verifying" && (
            <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-brand-600" />
              <p className="font-medium">Confirming your payment…</p>
              <p className="text-sm text-muted">
                {message || "Reading the blockchain…"}
              </p>
            </div>
          )}

          {/* SUCCESS */}
          {phase === "success" && (
            <div className="mt-6 flex flex-col items-center gap-2 py-6 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-2xl text-accent">
                ✓
              </div>
              <p className="text-lg font-bold">Payment confirmed</p>
              <p className="text-sm text-muted">
                Thank you! The creator has been notified of your order.
              </p>
              <button className="btn-primary mt-3 w-full" onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {/* ERROR */}
          {phase === "error" && (
            <div className="mt-6 flex flex-col items-center gap-2 py-4 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-danger/15 text-2xl text-danger">
                !
              </div>
              <p className="font-semibold">Something went wrong</p>
              <p className="text-sm text-muted">{message}</p>
              <button className="btn-outline mt-3 w-full" onClick={retry}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <WalletConnectQRModal
        open={tron.qrOpen}
        uri={tron.qrUri}
        onClose={tron.closeQr}
      />
    </>
  );
}
