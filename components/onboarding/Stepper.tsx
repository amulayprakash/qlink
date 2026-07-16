"use client";

import { usePathname } from "next/navigation";
import { STEP_ORDER, STEP_LABELS } from "@/lib/onboarding";
import type { OnboardingStep } from "@/lib/types";

const STEPS = STEP_ORDER.filter((s) => s !== "done") as OnboardingStep[];

export function OnboardingStepper() {
  const pathname = usePathname();
  const current = pathname.split("/")[2] as OnboardingStep | undefined;
  const currentIdx = current ? STEPS.indexOf(current) : 0;

  return (
    <nav className="hidden md:block">
      <ol className="space-y-1">
        {STEPS.map((step, i) => {
          const state =
            i < currentIdx ? "done" : i === currentIdx ? "active" : "todo";
          return (
            <li key={step} className="flex items-center gap-3 py-2">
              <span
                className={[
                  "grid h-7 w-7 place-items-center rounded-full text-xs font-bold",
                  state === "active"
                    ? "bg-brand-600 text-background"
                    : state === "done"
                      ? "bg-brand-600 text-background"
                      : "bg-brand-50 text-brand-700",
                ].join(" ")}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span
                className={
                  state === "active"
                    ? "text-sm font-semibold"
                    : "text-sm text-muted"
                }
              >
                {STEP_LABELS[step]}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
