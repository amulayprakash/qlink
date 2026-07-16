"use client";

import { useActionState, useEffect, useState } from "react";
import { saveUsername, type ActionState } from "@/app/onboarding/actions";
import { USERNAME_RE } from "@/lib/validation";

export function UsernameForm({
  initialUsername,
  host,
}: {
  initialUsername: string;
  /** Real request host, from lib/app-url.ts — not the build-time env var. */
  host: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveUsername,
    undefined,
  );
  const [value, setValue] = useState(initialUsername);
  const [available, setAvailable] = useState<boolean | null>(null);
  // The value the current `available` result belongs to (avoids stale flashes).
  const [checkedFor, setCheckedFor] = useState("");

  const normalized = value.trim().toLowerCase();
  const validFormat = USERNAME_RE.test(normalized);

  useEffect(() => {
    if (!validFormat) return;
    let active = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/username/check?u=${encodeURIComponent(normalized)}`,
        );
        const json = await res.json();
        if (active) {
          setAvailable(!!json.available);
          setCheckedFor(normalized);
        }
      } catch {
        if (active) setCheckedFor("");
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [normalized, validFormat]);

  const isChecked = checkedFor === normalized;
  const checking = validFormat && !isChecked;
  const blocked = !validFormat || checking || available === false;

  return (
    <form action={action} className="card p-6">
      <h1 className="text-2xl font-bold">Claim your ID</h1>
      <p className="mt-1 text-sm text-muted">
        This becomes your public link. Choose carefully. It&apos;s how people
        find you.
      </p>

      <div className="mt-6">
        <label className="label" htmlFor="username">
          Username
        </label>
        <div className="flex items-center rounded-xl border border-border bg-card focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <span className="pl-3.5 text-sm text-muted">{host}/</span>
          <input
            id="username"
            name="username"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent px-1.5 py-2.5 text-sm outline-none"
            placeholder="yourname"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <div className="mt-1.5 h-4 text-xs">
          {value && !validFormat && (
            <span className="text-danger">
              3-30 chars: lowercase letters, numbers, underscore
            </span>
          )}
          {validFormat && checking && (
            <span className="text-muted">Checking availability…</span>
          )}
          {validFormat && !checking && available === true && (
            <span className="text-accent">✓ {normalized} is available</span>
          )}
          {validFormat && !checking && available === false && (
            <span className="text-danger">
              {normalized} is already taken
            </span>
          )}
        </div>
      </div>

      {state?.error && (
        <p className="mt-2 text-sm text-danger">{state.error}</p>
      )}

      <button
        type="submit"
        className="btn-primary btn-lg mt-4 w-full"
        disabled={pending || blocked}
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
