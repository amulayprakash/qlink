"use client";

import { useActionState } from "react";
import { publishPage, type ActionState } from "@/app/onboarding/actions";

export function PublishButton({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    publishPage,
    undefined,
  );

  return (
    <form action={action}>
      {state?.error && (
        <p className="mb-2 text-sm text-danger">{state.error}</p>
      )}
      <button
        type="submit"
        className="btn-primary btn-lg w-full"
        disabled={pending || disabled}
      >
        {pending ? "Publishing…" : "Publish my page"}
      </button>
    </form>
  );
}
