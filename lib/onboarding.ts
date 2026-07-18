import type { OnboardingStep } from "./types";

export const STEP_ORDER: OnboardingStep[] = [
  "username",
  "profile",
  "packages",
  "preview",
  "done",
];

export const STEP_LABELS: Record<OnboardingStep, string> = {
  username: "Claim your ID",
  profile: "Your profile",
  wallets: "Receiving wallets",
  packages: "Packages",
  preview: "Preview & publish",
  done: "Done",
};

/**
 * "wallets" is retired — payments go to the platform's own addresses, so there
 * is nothing for a creator to enter. It survives in the type only because rows
 * written before the change still carry it in `profiles.onboarding_step`; those
 * users resume at the step that followed it.
 */
export function normalizeStep(step: OnboardingStep): OnboardingStep {
  return step === "wallets" ? "packages" : step;
}

/** Path a given onboarding step maps to. */
export function stepPath(step: OnboardingStep): string {
  const s = normalizeStep(step);
  if (s === "done") return "/dashboard";
  return `/onboarding/${s}`;
}

/** Whether `a` comes at or before `b` in the wizard. */
export function stepReached(current: OnboardingStep, target: OnboardingStep) {
  return (
    STEP_ORDER.indexOf(normalizeStep(current)) >=
    STEP_ORDER.indexOf(normalizeStep(target))
  );
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = STEP_ORDER.indexOf(normalizeStep(step));
  return STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)];
}
