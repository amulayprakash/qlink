import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stepPath } from "@/lib/onboarding";
import type { OnboardingStep } from "@/lib/types";

/** OAuth redirect target: exchanges the code, then routes to onboarding/dashboard. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  // Behind a hosting proxy (Netlify et al.) request.url carries the internal
  // origin, which would redirect users off the public domain.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    forwardedHost && process.env.NODE_ENV !== "development"
      ? `https://${forwardedHost}`
      : origin;

  if (!code) {
    return NextResponse.redirect(`${base}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${base}/login?error=exchange_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let step: OnboardingStep = "username";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_step")
      .eq("id", user.id)
      .single();
    step = (profile?.onboarding_step as OnboardingStep) ?? "username";
  }

  // Finished onboarding -> honour the "next" the middleware set; else resume wizard.
  const dest = step === "done" ? (next ?? "/dashboard") : stepPath(step);
  return NextResponse.redirect(`${base}${dest}`);
}
