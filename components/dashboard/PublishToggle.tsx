"use client";

import { useActionState } from "react";
import { setPublished } from "@/app/dashboard/actions";
import type { ActionState } from "@/lib/forms";

export function PublishToggle({
  published,
  /** Fill the container instead of hugging the right edge. The sidebar footer
   *  wants a full-width button; the mobile header wants it inline. */
  block = false,
}: {
  published: boolean;
  block?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setPublished,
    undefined,
  );

  return (
    <form
      action={action}
      className={
        block ? "flex flex-col gap-1" : "flex flex-col items-end gap-1"
      }
    >
      <input type="hidden" name="published" value={(!published).toString()} />
      <button
        type="submit"
        className={[
          published ? "btn-outline" : "btn-primary",
          block ? "w-full" : "",
        ].join(" ")}
        disabled={pending}
      >
        {pending ? "…" : published ? "Unpublish" : "Publish page"}
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
