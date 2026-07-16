"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/forms";

export type PkgRow = {
  name: string;
  price: string;
  description: string;
  features: string[];
};

export const emptyPkg = (): PkgRow => ({
  name: "",
  price: "",
  description: "",
  features: [],
});

export function PackagesEditor({
  initial,
  action,
  submitLabel = "Continue",
  backHref,
}: {
  initial: PkgRow[];
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel?: string;
  backHref?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    undefined,
  );
  const [pkgs, setPkgs] = useState<PkgRow[]>(
    initial.length ? initial : [emptyPkg()],
  );

  const patch = (i: number, p: Partial<PkgRow>) =>
    setPkgs((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  const serialized = pkgs
    .filter((p) => p.name.trim())
    .map((p) => ({
      name: p.name.trim(),
      description: p.description.trim(),
      price_usd: Number.parseFloat(p.price) || 0,
      features: p.features.map((f) => f.trim()).filter(Boolean),
    }));

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Your packages</h1>
        <p className="mt-1 text-sm text-muted">
          Service tiers customers can buy. Prices are in USD. Customers pay the
          equivalent in USDT or USDC.
        </p>
      </div>

      {pkgs.map((p, i) => (
        <div key={i} className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_140px]">
              <div>
                <label className="label">Package name</label>
                <input
                  className="input"
                  placeholder="Starter"
                  value={p.name}
                  onChange={(e) => patch(i, { name: e.target.value })}
                  maxLength={80}
                />
              </div>
              <div>
                <label className="label">Price (USD)</label>
                <div className="flex items-center rounded-xl border border-border bg-card focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                  <span className="pl-3 text-sm text-muted">$</span>
                  <input
                    className="w-full bg-transparent px-1.5 py-2.5 text-sm outline-none"
                    placeholder="49"
                    inputMode="decimal"
                    value={p.price}
                    onChange={(e) =>
                      patch(i, {
                        price: e.target.value.replace(/[^0-9.]/g, ""),
                      })
                    }
                  />
                </div>
              </div>
            </div>
            {pkgs.length > 1 && (
              <button
                type="button"
                className="btn-ghost px-2 text-muted"
                onClick={() =>
                  setPkgs((xs) => xs.filter((_, idx) => idx !== i))
                }
                aria-label="Remove package"
              >
                ✕
              </button>
            )}
          </div>

          <div className="mt-3">
            <label className="label">Description</label>
            <textarea
              className="input min-h-16"
              placeholder="What the buyer gets."
              value={p.description}
              onChange={(e) => patch(i, { description: e.target.value })}
              maxLength={600}
            />
          </div>

          <div className="mt-3">
            <label className="label">Features</label>
            <div className="space-y-2">
              {p.features.map((f, fi) => (
                <div key={fi} className="flex gap-2">
                  <input
                    className="input"
                    placeholder="e.g. 3 revisions"
                    value={f}
                    onChange={(e) =>
                      patch(i, {
                        features: p.features.map((x, idx) =>
                          idx === fi ? e.target.value : x,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn-ghost px-3"
                    onClick={() =>
                      patch(i, {
                        features: p.features.filter((_, idx) => idx !== fi),
                      })
                    }
                    aria-label="Remove feature"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => patch(i, { features: [...p.features, ""] })}
              >
                + Add feature
              </button>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn-outline w-full"
        onClick={() => setPkgs((xs) => [...xs, emptyPkg()])}
      >
        + Add another package
      </button>

      <input type="hidden" name="packages" value={JSON.stringify(serialized)} />

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex items-center justify-between">
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
            disabled={pending || serialized.length === 0}
          >
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
