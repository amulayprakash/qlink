import type { OnboardingStep } from "./types";

export const STEP_ORDER: OnboardingStep[] = [
  "username",
  "profile",
  "wallets",
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

/** Path a given onboarding step maps to. */
export function stepPath(step: OnboardingStep): string {
  if (step === "done") return "/dashboard";
  return `/onboarding/${step}`;
}

/** Whether `a` comes at or before `b` in the wizard. */
export function stepReached(current: OnboardingStep, target: OnboardingStep) {
  return STEP_ORDER.indexOf(current) >= STEP_ORDER.indexOf(target);
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)];
}
