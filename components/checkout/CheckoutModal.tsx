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

/** What a chain family + chain + coin selection looks like mid-flight. */
interface Selection {
  family: ChainKind | null;
  netId: string;
  token: TokenSymbol | null;
}

/**
 * Skip the family question when the creator only takes one kind of chain —
 * a two-card choice with one card is a chore, not a choice.
 */
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
  // The accent-on state is painted by .page-panel[aria-pressed="true"], which
  // reads the attribute this already has to set for a screen reader.
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
  hasEvm,
  hasTron,
}: {
  open: boolean;
  onClose: () => void;
  pkg: { id: string; name: string; price_usd: number };
  hasEvm: boolean;
  hasTron: boolean;
}) {
  const families = useMemo(
    () => availableFamilies(hasEvm, hasTron),
    [hasEvm, hasTron],
  );
  const evmNetworks = useMemo(() => networksOf("evm"), []);

  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<Phase>("steps");
  const [sel, setSel] = useState<Selection>(() =>
    firstSelection(hasEvm, hasTron),
  );
  // The page's promo section owns this when there is one above us, so a code
  // entered there is already filled in here and an edit here flows back — the
  // two inputs are one value rather than two that silently disagree. The local
  // state is the fallback for a checkout opened outside a creator page, where
  // there is no provider; see promo-context.
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
  /** Any change here invalidates a priced order — it was quoted per chain+coin. */
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
      // Keep their coin if the new chain lists it — not every chain has both.
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

  function nextFromNetwork() {
    if (!selectionReady) return;
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
        await writeContractAsync({
          address: order.tokenContract as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [
            order.recipient as `0x${string}`,
            BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935"),
          ],
          chainId: order.chainId ?? undefined,
        });
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
        className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={guardedClose}
      >
        {/* max-h/overflow: the modal is centred in the viewport, so without a
            ceiling a long step runs off both ends of the screen and the
            Continue button becomes unreachable. */}
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
              This creator hasn&apos;t configured a payment wallet yet.
            </p>
          )}

          {phase === "steps" && families.length > 0 && <Stepper step={step} />}

          {/* 1 — NETWORK */}
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

              {/* Tron has exactly one chain, so asking which is noise. */}
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

              <button
                className="page-cta"
                onClick={nextFromNetwork}
                disabled={!selectionReady}
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
                  <p className="page-muted text-sm">
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
              ) : isTron ? (
                <>
                  <p className="page-muted text-sm">
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
                  <WalletRow
                    name="Scan with a mobile wallet"
                    hint="WalletConnect"
                    onClick={connectTronWc}
                    busy={tron.connecting}
                  />
                </>
              ) : (
                <>
                  <p className="page-muted text-sm">
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
                  {/* Always offered: it is the only route for a customer with
                      no extension, and AppKit handles QR vs deep link itself. */}
                  <WalletRow
                    name="All wallets"
                    hint="QR / mobile"
                    onClick={openAllWallets}
                  />
                </>
              )}

              {walletError && (
                <p className="page-danger-text text-sm">{walletError}</p>
              )}
              <button className="page-btn-ghost" onClick={() => setStep(1)}>
                Back
              </button>
            </div>
          )}

          {/* 3 — AMOUNT */}
          {phase === "steps" && step === 3 && (
            <div className="mt-5 space-y-4">
              <div className="page-panel px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="page-muted">Paying with</span>
                  <span className="font-medium">
                    {selectedNetwork?.name} · {selTok}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="page-muted">Wallet</span>
                  <span className="font-medium">
                    {activeAddress ? short(activeAddress) : "—"}
                  </span>
                </div>
              </div>

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

              <button className="page-cta" onClick={createOrder} disabled={busy}>
                {busy ? "Preparing…" : "Continue"}
              </button>
              <button className="page-btn-ghost" onClick={() => setStep(2)}>
                Back
              </button>
            </div>
          )}

          {/* 4 — CONFIRM */}
          {phase === "steps" && step === 4 && order && (
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
                        {/* Weight, not .page-accent-text: this sits ON the
                            accent wash, and an accent is only guaranteed 3:1
                            against the bare canvas — nowhere near a label's
                            4.5:1 once the wash has closed the gap. */}
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

              <p className="page-muted text-xs">
                Funds go directly to the creator on{" "}
                <span className="font-medium">{selectedNetwork?.name}</span>. We
                verify the transaction on-chain. Keep this window open until it
                confirms.
              </p>

              {wrongNetwork ? (
                <button
                  className="page-cta"
                  onClick={doSwitch}
                  disabled={switching}
                >
                  {switching
                    ? "Switching…"
                    : `Switch to ${selectedNetwork?.name}`}
                </button>
              ) : (
                <button
                  className="page-cta"
                  onClick={pay}
                  disabled={busy || !walletReady}
                >
                  {busy
                    ? "Confirm in your wallet…"
                    : `Pay ${tokenAmount} ${order.tokenSymbol}`}
                </button>
              )}

              {message && <p className="page-danger-text text-sm">{message}</p>}
              <button className="page-btn-ghost" onClick={() => setStep(3)}>
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
              {/* Solid, where the error disc below is a wash. A 12% accent tint
                  would leave the tick at 3.22:1 on mocha — over the line for
                  large text, but with nothing left for a creator's own accent,
                  which only has to clear 3:1 against the bare canvas to be
                  saved. At full strength the accent carries its own verified
                  4.5:1 label pair instead, and loud is the right note here. */}
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
