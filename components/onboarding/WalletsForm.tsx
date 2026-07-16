"use client";

import { useActionState, useState } from "react";
import { isEvmAddress, isTronAddress } from "@/lib/crypto/address";
import type { ActionState } from "@/lib/forms";

function fieldState(value: string, ok: (v: string) => boolean) {
  const v = value.trim();
  if (!v) return "empty" as const;
  return ok(v) ? ("valid" as const) : ("invalid" as const);
}

export function WalletsForm({
  initial,
  action,
  submitLabel = "Continue",
  backHref = "/onboarding/profile",
}: {
  initial: { evm: string; tron: string };
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel?: string;
  backHref?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    undefined,
  );
  const [evm, setEvm] = useState(initial.evm);
  const [tron, setTron] = useState(initial.tron);

  const evmState = fieldState(evm, isEvmAddress);
  const tronState = fieldState(tron, isTronAddress);
  const canSubmit =
    (evmState === "valid" || tronState === "valid") &&
    evmState !== "invalid" &&
    tronState !== "invalid";

  return (
    <form action={formAction} className="card p-6">
      <h1 className="text-2xl font-bold">Receiving wallets</h1>
      <p className="mt-1 text-sm text-muted">
        Payments go{" "}
        <span className="font-medium text-foreground">
          directly to these addresses
        </span>
        . We never hold your funds. Add at least one.
      </p>

      <div className="mt-6">
        <label className="label" htmlFor="evm">
          EVM address{" "}
          <span className="font-normal text-muted">
            (Ethereum, Polygon, BSC, Arbitrum, Optimism, Base)
          </span>
        </label>
        <input
          id="evm"
          name="evm_wallet_address"
          className="input font-mono text-xs"
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          value={evm}
          onChange={(e) => setEvm(e.target.value)}
        />
        <div className="mt-1 h-4 text-xs">
          {evmState === "invalid" && (
            <span className="text-danger">Not a valid EVM address</span>
          )}
          {evmState === "valid" && (
            <span className="text-accent">✓ Looks good</span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="tron">
          Tron address{" "}
          <span className="font-normal text-muted">(TRC-20)</span>
        </label>
        <input
          id="tron"
          name="tron_wallet_address"
          className="input font-mono text-xs"
          placeholder="T…"
          spellCheck={false}
          autoComplete="off"
          value={tron}
          onChange={(e) => setTron(e.target.value)}
        />
        <div className="mt-1 h-4 text-xs">
          {tronState === "invalid" && (
            <span className="text-danger">Not a valid Tron address</span>
          )}
          {tronState === "valid" && (
            <span className="text-accent">✓ Looks good</span>
          )}
        </div>
      </div>

      {state?.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}

      <div className="mt-5 flex items-center justify-between">
        {backHref ? (
          <a href={backHref} className="btn-ghost">
            Back
          </a>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {state?.ok && <span className="text-sm text-accent">Saved ✓</span>}
          <button
            type="submit"
            className="btn-primary btn-lg"
            disabled={pending || !canSubmit}
          >
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
