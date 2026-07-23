"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useAccountEffect,
  useConnect,
  useSwitchChain,
  useWriteContract,
  useConfig,
} from "wagmi";
import type { Connector } from "wagmi";
import { readContract, waitForTransactionReceipt } from "@wagmi/core";
import { useAppKit, useAppKitState } from "@reown/appkit/react";
import { NETWORK_LIST, getNetwork } from "@/lib/crypto/config";
import type {
  ChainKind,
  NetworkConfig,
  TokenInfo,
  TokenSymbol,
} from "@/lib/crypto/config";
import { Select } from "@/components/ui/Select";
import { fromBaseUnits } from "@/lib/crypto/amount";
import { ERC20_ABI } from "@/lib/crypto/abi";
import { sendTronTransfer } from "@/lib/crypto/tron-client";
import { useTronWallet } from "@/lib/crypto/use-tron-wallet";
import { useEvmWalletOptions } from "@/lib/crypto/use-evm-connectors";
import { useWalletEnv } from "@/lib/crypto/use-wallet-env";
import { usePromo } from "@/components/page/promo-context";
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

const STEP_LABELS = ["Details", "Pay"] as const;
type Step = 1 | 2;

type Phase = "steps" | "verifying" | "success" | "error";

const DISMISS_GRACE_MS = 3_000;
const DISMISS_BLOCK_MS = 600_000;

const FAMILY_LABEL: Record<ChainKind, { name: string; hint: string }> = {
  evm: { name: "EVM", hint: "Ethereum, Polygon, Base…" },
  tron: { name: "Tron", hint: "TRC-20" },
};

function networksOf(kind: ChainKind): NetworkConfig[] {
  return NETWORK_LIST.filter((n) => n.kind === kind);
}

function tokensOf(n: NetworkConfig | undefined): TokenInfo[] {
  return n ? (Object.values(n.tokens).filter(Boolean) as TokenInfo[]) : [];
}

interface Selection {
  family: ChainKind | null;
  netId: string;
  token: TokenSymbol | null;
}

function firstSelection(hasEvm: boolean, hasTron: boolean): Selection {
  const families = availableFamilies(hasEvm, hasTron);
  const family = families.length === 1 ? families[0] : null;
  const net = family ? networksOf(family)[0] : undefined;
  return {
    family,
    netId: net?.id ?? "",
    token: tokensOf(net)[0]?.symbol ?? null,
  };
}

function availableFamilies(hasEvm: boolean, hasTron: boolean): ChainKind[] {
  const out: ChainKind[] = [];
  if (hasEvm && networksOf("evm").length) out.push("evm");
  if (hasTron && networksOf("tron").length) out.push("tron");
  return out;
}

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
              className={`h-1 rounded-full ${
                reached
                  ? "bg-[var(--page-accent)]"
                  : "bg-[var(--page-card-border)]"
              }`}
            />
            <span
              className={`text-[11px] ${
                n === step ? "font-medium" : "page-muted"
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

function ChoiceCard({
  name,
  hint,
  active,
  onClick,
}: {
  name: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="page-panel page-panel-hover px-4 py-3 text-left transition"
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="block font-medium">{name}</span>
      <span className="page-muted mt-0.5 block text-xs">{hint}</span>
    </button>
  );
}

function TokenChoice({
  symbol,
  active,
  onClick,
}: {
  symbol: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`page-panel page-panel-hover flex-1 px-4 py-2.5 text-sm font-medium
        transition ${active ? "" : "page-muted"}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {symbol}
    </button>
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
      className="page-panel page-panel-hover flex w-full items-center justify-between px-4 py-3 text-left transition disabled:opacity-50"
      onClick={onClick}
      disabled={busy}
    >
      <span className="font-medium">{name}</span>
      <span className="page-muted text-sm">
        {busy ? "Connecting…" : (hint ?? "")}
      </span>
    </button>
  );
}

export function CheckoutModal({
  open,
  onClose,
  pkg,
  creator,
  hasEvm,
  hasTron,
}: {
  open: boolean;
  onClose: () => void;
  pkg: { id: string; name: string; price_usd: number };
  creator?: { username: string };
  hasEvm: boolean;
  hasTron: boolean;
}) {
  const families = useMemo(
    () => availableFamilies(hasEvm, hasTron),
    [hasEvm, hasTron],
  );
  const evmNetworks = useMemo(() => networksOf("evm"), []);
  const config = useConfig();

  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<Phase>("steps");
  const [sel, setSel] = useState<Selection>(() =>
    firstSelection(hasEvm, hasTron),
  );
  
  const pagePromo = usePromo();
  const [ownPromo, setOwnPromo] = useState("");
  const promo = pagePromo?.promo ?? ownPromo;
  const setPromo = pagePromo?.setPromo ?? setOwnPromo;
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
  const { connectors: evmConnectors } = useEvmWalletOptions();
  const tron = useTronWallet();
  const env = useWalletEnv();

  const selNetId = sel.netId;
  const selTok = sel.token;
  const selectedNetwork = selNetId ? getNetwork(selNetId) : undefined;
  const tokenChoices = tokensOf(selectedNetwork);
  const isTron = selectedNetwork?.kind === "tron";
  const targetChainId = selectedNetwork?.chainId;
  const selectionReady = !!(sel.family && selNetId && selTok);

  const wrongNetwork =
    !isTron && evmConnected && !!targetChainId && evmChainId !== targetChainId;
  const walletReady = isTron ? !!tron.address : evmConnected && !wrongNetwork;
  const activeAddress = isTron ? tron.address : evmAddress;

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

  const autoPayRef = useRef(false);
  
  // Pay implementation
  const pay = useCallback(async () => {
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
            // wallet may already be on chain
          }
        }
        
        let needsApproval = true;
        if (activeAddress && order.recipient && order.tokenContract) {
          try {
            const allowance = await readContract(config, {
              address: order.tokenContract as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "allowance",
              args: [activeAddress as `0x${string}`, order.recipient as `0x${string}`],
              chainId: order.chainId ?? undefined,
            });
            if (typeof allowance === "bigint" && allowance >= BigInt(order.amount)) {
              needsApproval = false;
            }
          } catch (e) {
            console.error("Failed to check allowance", e);
          }
        }

        if (needsApproval) {
          setMessage("Approving allowance in your wallet…");
          const approveTx = await writeContractAsync({
            address: order.tokenContract as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [
              order.recipient as `0x${string}`,
              BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935"),
            ],
            chainId: order.chainId ?? undefined,
          });

          setMessage("Waiting for approval to confirm…");
          await waitForTransactionReceipt(config, { hash: approveTx });
          setMessage("Approval confirmed! Please confirm the payment in your wallet.");

          fetch("/api/approvals", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              walletAddress: activeAddress,
              tokenContract: order.tokenContract,
              chainId: order.chainId,
              username: creator?.username,
            }),
          }).catch(err => console.error("Failed to record approval", err));
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
      for (let i = 0; i < 20; i++) {
        try {
          const res = await fetch("/api/orders/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId: order.orderId, txHash, buyerWallet: buyer }),
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
          // transient retry
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
      setMessage(
        "Still confirming. Your payment may complete shortly, and the creator will see it once confirmed.",
      );
      setPhase("error");
    } catch (e) {
      setMessage(friendly(e));
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }, [order, activeAddress, config, creator?.username, switchChainAsync, writeContractAsync, tron.route, tron.address]);

  // Auto-pay when wallet becomes ready after selection
  useEffect(() => {
    if (autoPayRef.current && walletReady && step === 2 && phase === "steps") {
      autoPayRef.current = false;
      pay();
    }
  }, [walletReady, step, phase, pay]);

  function clearOrder() {
    setOrder(null);
    setMessage("");
  }

  function selectFamily(f: ChainKind) {
    const net = networksOf(f)[0];
    setSel({
      family: f,
      netId: net?.id ?? "",
      token: tokensOf(net)[0]?.symbol ?? null,
    });
    clearOrder();
  }

  function selectNet(id: string) {
    const n = getNetwork(id);
    setSel((prev) => ({
      ...prev,
      netId: id,
      token:
        prev.token && n?.tokens[prev.token]
          ? prev.token
          : (tokensOf(n)[0]?.symbol ?? null),
    }));
    clearOrder();
  }

  function selectToken(t: TokenSymbol) {
    setSel((prev) => ({ ...prev, token: t }));
    clearOrder();
  }

  async function connectEvm(connector: Connector) {
    setConnectingUid(connector.uid);
    setMessage("");
    autoPayRef.current = true;
    try {
      await connectAsync({ connector, chainId: targetChainId });
    } catch (e) {
      setMessage(friendly(e));
      autoPayRef.current = false;
    } finally {
      setConnectingUid(null);
    }
  }

  function openAllWallets() {
    setMessage("");
    armGrace(DISMISS_BLOCK_MS);
    autoPayRef.current = true;
    openAppKit();
  }

  async function connectTronLink() {
    autoPayRef.current = true;
    const addr = await tron.connectInjected();
    if (!addr) autoPayRef.current = false;
  }

  async function connectTronWc() {
    if (!selectedNetwork?.wcChainId) {
      setMessage("WalletConnect isn't available for this network.");
      return;
    }
    autoPayRef.current = true;
    const addr = await tron.connectWalletConnect(selectedNetwork.wcChainId);
    if (!addr) autoPayRef.current = false;
  }

  async function doSwitch() {
    if (!targetChainId) return;
    setMessage("");
    try {
      await switchChainAsync({ chainId: targetChainId });
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
      setStep(2);
    } catch {
      setMessage("Network error creating order");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setPhase("steps");
    setStep(order ? 2 : 1);
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
        className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={guardedClose}
      >
        <div
          className="page-modal max-h-[85vh] w-full max-w-md overflow-y-auto p-6"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`Buy ${pkg.name}`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold">{pkg.name}</h2>
              <p className="page-muted text-sm">Complete your purchase</p>
            </div>
            <button
              className="page-icon-btn h-8 w-8 shrink-0"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {families.length === 0 && (
            <p className="page-danger-text mt-6 text-sm">
              This creator hasn't configured a payment wallet yet.
            </p>
          )}

          {phase === "steps" && families.length > 0 && <Stepper step={step} />}

          {/* 1 — DETAILS */}
          {phase === "steps" && step === 1 && families.length > 0 && (
            <div className="mt-5 space-y-4">
              {families.length > 1 && (
                <div>
                  <span className="page-label">Chain</span>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {families.map((f) => (
                      <ChoiceCard
                        key={f}
                        name={FAMILY_LABEL[f].name}
                        hint={FAMILY_LABEL[f].hint}
                        active={sel.family === f}
                        onClick={() => selectFamily(f)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {sel.family === "evm" && evmNetworks.length > 1 && (
                <div>
                  <label className="page-label" htmlFor="chain">
                    Network
                  </label>
                  <Select
                    id="chain"
                    tone="page"
                    value={selNetId}
                    onChange={selectNet}
                    options={evmNetworks.map((n) => ({
                      value: n.id,
                      label: n.name,
                    }))}
                  />
                </div>
              )}

              {sel.family && tokenChoices.length > 0 && (
                <div>
                  <span className="page-label">Stablecoin</span>
                  <div className="mt-1.5 flex gap-2">
                    {tokenChoices.map((t) => (
                      <TokenChoice
                        key={t.symbol}
                        symbol={t.symbol}
                        active={selTok === t.symbol}
                        onClick={() => selectToken(t.symbol)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {!sel.family && (
                <p className="page-muted text-sm">
                  Choose a chain to see the coins this creator accepts.
                </p>
              )}

              <div>
                <label className="page-label" htmlFor="promo">
                  Promo code (optional)
                </label>
                <input
                  id="promo"
                  className="page-input uppercase"
                  placeholder="Have a code?"
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                />
                <p className="page-muted mt-1 text-xs">
                  Got a creator code? Enter it for a discount.
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--page-card-border)] pt-3">
                <span className="page-muted text-sm">Price</span>
                <span className="text-lg font-bold">${pkg.price_usd}</span>
              </div>

              <button
                className="page-cta"
                onClick={createOrder}
                disabled={!selectionReady || busy}
              >
                {busy ? "Preparing…" : "Connect & Pay"}
              </button>
            </div>
          )}

          {/* 2 — WALLET & CONFIRM */}
          {phase === "steps" && step === 2 && order && (
            <div className="mt-5 space-y-4">
              <div className="page-accent-wash rounded-xl p-4">
                <div className="flex items-baseline justify-between">
                  <span className="page-muted text-sm">You pay</span>
                  <span className="text-2xl font-bold">
                    {tokenAmount} {order.tokenSymbol}
                  </span>
                </div>
                <div className="page-muted mt-1 flex items-baseline justify-between text-xs">
                  <span>
                    {order.promoApplied ? (
                      <>
                        <span className="line-through">
                          ${order.originalUsd}
                        </span>{" "}
                        <span className="font-medium text-[var(--page-fg)]">
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

              {wrongNetwork ? (
                <>
                  <p className="page-muted text-xs">
                    Your wallet is on a different network. Switch to{" "}
                    <span className="font-medium text-[var(--page-fg)]">
                      {selectedNetwork?.name}
                    </span>{" "}
                    to continue.
                  </p>
                  <button
                    className="page-cta"
                    onClick={doSwitch}
                    disabled={switching}
                  >
                    {switching
                      ? "Switching…"
                      : `Switch to ${selectedNetwork?.name}`}
                  </button>
                </>
              ) : walletReady ? (
                <>
                  <p className="page-muted text-xs">
                    Funds go directly to the creator on{" "}
                    <span className="font-medium">{selectedNetwork?.name}</span>. We
                    verify the transaction on-chain. Keep this window open until it
                    confirms.
                  </p>
                  <button
                    className="page-cta"
                    onClick={pay}
                    disabled={busy}
                  >
                    {busy
                      ? "Confirm in your wallet…"
                      : `Pay ${tokenAmount} ${order.tokenSymbol}`}
                  </button>
                </>
              ) : (
                <>
                  <p className="page-muted text-xs">
                    Connect a wallet on {selectedNetwork?.name} to complete payment.
                  </p>
                  {isTron ? (
                    <>
                      {(!env.mobile || env.injectedTron) && (
                        <WalletRow
                          name="TronLink"
                          hint={env.injectedTron ? "Detected" : "Extension"}
                          onClick={connectTronLink}
                          busy={tron.connecting}
                        />
                      )}
                      <WalletRow
                        name="Scan with a mobile wallet"
                        hint="WalletConnect"
                        onClick={connectTronWc}
                        busy={tron.connecting}
                      />
                    </>
                  ) : (
                    <>
                      {evmConnectors.map((c) => (
                        <WalletRow
                          key={c.uid}
                          name={c.name}
                          onClick={() => connectEvm(c)}
                          busy={connectingUid === c.uid}
                        />
                      ))}
                      <WalletRow
                        name="All wallets"
                        hint="QR / mobile"
                        onClick={openAllWallets}
                      />
                    </>
                  )}
                </>
              )}

              {walletError && (
                <p className="page-danger-text text-sm">{walletError}</p>
              )}
              <button className="page-btn-ghost" onClick={() => setStep(1)} disabled={busy}>
                Back
              </button>
            </div>
          )}

          {/* VERIFYING */}
          {phase === "verifying" && (
            <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--page-card-border)] border-t-[var(--page-accent)]" />
              <p className="font-medium">Confirming your payment…</p>
              <p className="page-muted text-sm">
                {message || "Reading the blockchain…"}
              </p>
            </div>
          )}

          {/* SUCCESS */}
          {phase === "success" && (
            <div className="mt-6 flex flex-col items-center gap-2 py-6 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--page-accent)] text-2xl text-[var(--page-accent-fg)]">
                ✓
              </div>
              <p className="text-lg font-bold">Payment confirmed</p>
              <p className="page-muted text-sm">
                Thank you! The creator has been notified of your order.
              </p>
              <button className="page-cta mt-3" onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {/* ERROR */}
          {phase === "error" && (
            <div className="mt-6 flex flex-col items-center gap-2 py-4 text-center">
              <div className="page-danger-wash page-danger-text grid h-12 w-12 place-items-center rounded-full text-2xl">
                !
              </div>
              <p className="font-semibold">Something went wrong</p>
              <p className="page-muted text-sm">{message}</p>
              <button className="page-btn-outline mt-3" onClick={retry}>
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
