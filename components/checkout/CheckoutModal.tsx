"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useSwitchChain } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { paymentOptions } from "@/lib/crypto/config";
import { fromBaseUnits } from "@/lib/crypto/amount";
import { ERC20_ABI } from "@/lib/crypto/abi";
import { sendTronTransfer } from "@/lib/crypto/tron-client";
import { Select } from "@/components/ui/Select";

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

type Stage = "select" | "pay" | "verifying" | "success" | "error";

function short(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
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
  const options = paymentOptions().filter((o) =>
    o.network.kind === "tron" ? hasTron : hasEvm,
  );
  const [optionKey, setOptionKey] = useState(
    options[0] ? `${options[0].network.id}:${options[0].token.symbol}` : "",
  );
  const [promo, setPromo] = useState("");
  const [stage, setStage] = useState<Stage>("select");
  const [order, setOrder] = useState<OrderResp | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const { isConnected, address } = useAccount();
  const { open: openAppKit } = useAppKit();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  if (!open) return null;

  const [selNet, selTok] = optionKey.split(":");

  function reset() {
    setStage("select");
    setOrder(null);
    setMessage("");
    setBusy(false);
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
          network: selNet,
          token: selTok,
          promoCode: promo.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "Could not create order");
        setStage("error");
        return;
      }
      setOrder(json as OrderResp);
      setStage("pay");
    } catch {
      setMessage("Network error creating order");
      setStage("error");
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
          setStage("success");
          return;
        }
        if (json.status === "unverified") {
          setMessage(json.reason ?? "Could not verify payment");
          setStage("error");
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
    setStage("error");
  }

  async function pay() {
    if (!order) return;
    setBusy(true);
    setMessage("");
    try {
      let txHash = "";
      let buyer: string | undefined = address;

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
        const r = await sendTronTransfer({
          tokenContract: order.tokenContract,
          recipient: order.recipient,
          amount: order.amount,
        });
        txHash = r.txHash;
        buyer = r.from;
      }

      setStage("verifying");
      await verify(order.orderId, txHash, buyer);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMessage(err.shortMessage ?? err.message ?? "Payment was rejected");
      setStage("error");
    } finally {
      setBusy(false);
    }
  }

  const tokenAmount = order
    ? fromBaseUnits(BigInt(order.amount), order.decimals)
    : "";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{pkg.name}</h2>
            <p className="text-sm text-muted">Complete your purchase</p>
          </div>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {options.length === 0 && (
          <p className="mt-6 text-sm text-danger">
            This creator hasn&apos;t configured a payment wallet yet.
          </p>
        )}

        {/* SELECT */}
        {stage === "select" && options.length > 0 && (
          <div className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="pay-with">
                Pay with
              </label>
              <Select
                id="pay-with"
                value={optionKey}
                onChange={setOptionKey}
                options={options.map((o) => ({
                  value: `${o.network.id}:${o.token.symbol}`,
                  label: o.network.name,
                  hint: o.token.symbol,
                }))}
              />
            </div>

            <div>
              <label className="label">Promo code (optional)</label>
              <input
                className="input uppercase"
                placeholder="Have a code?"
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
              />
              <p className="hint">Got a creator code? Enter it for a discount.</p>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm text-muted">Price</span>
              <span className="text-lg font-bold">
                ${pkg.price_usd}
              </span>
            </div>

            <button
              className="btn-primary btn-lg w-full"
              onClick={createOrder}
              disabled={busy || !optionKey}
            >
              {busy ? "Preparing…" : "Continue"}
            </button>
          </div>
        )}

        {/* PAY */}
        {stage === "pay" && order && (
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
                      <span className="line-through">${order.originalUsd}</span>{" "}
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
              <span className="font-medium">{selNet}</span>. We verify the
              transaction on-chain. Keep this window open until it confirms.
            </p>

            {order.kind === "evm" && !isConnected ? (
              <button
                className="btn-primary btn-lg w-full"
                onClick={() => openAppKit()}
              >
                Connect wallet
              </button>
            ) : (
              <button
                className="btn-primary btn-lg w-full"
                onClick={pay}
                disabled={busy}
              >
                {busy
                  ? "Confirm in your wallet…"
                  : `Pay ${tokenAmount} ${order.tokenSymbol}`}
              </button>
            )}
            <button className="btn-ghost w-full" onClick={reset}>
              Back
            </button>
          </div>
        )}

        {/* VERIFYING */}
        {stage === "verifying" && (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-brand-600" />
            <p className="font-medium">Confirming your payment…</p>
            <p className="text-sm text-muted">{message || "Reading the blockchain…"}</p>
          </div>
        )}

        {/* SUCCESS */}
        {stage === "success" && (
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
        {stage === "error" && (
          <div className="mt-6 flex flex-col items-center gap-2 py-4 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-danger/15 text-2xl text-danger">
              !
            </div>
            <p className="font-semibold">Something went wrong</p>
            <p className="text-sm text-muted">{message}</p>
            <button className="btn-outline mt-3 w-full" onClick={reset}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
