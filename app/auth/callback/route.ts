import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { stepPath } from "@/lib/onboarding";
import { REFERRAL_COOKIE } from "@/lib/referrals";
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
  const response = NextResponse.redirect(`${base}${dest}`);

  // ---- referral attribution ----
  // This is the only moment the code and a session exist together: the cookie
  // was set by /r/[code] before sign-in, and claim_referral() needs auth.uid().
  //
  // Runs on every sign-in rather than only on sign-up, because there is no
  // reliable "is this a first sign-in" signal here — the profile row is created
  // by a trigger on auth.users (0001), so it exists before this code runs even
  // for a brand-new account. The function absorbs that: a returning user is
  // already past its 30-day window or already has a `referrals` row, and either
  // way it returns false.
  //
  // Failures are swallowed on purpose. A referral is worth nothing next to
  // completing a sign-in, and every refusal is an expected outcome here rather
  // than an error — see the return-false-not-raise note on claim_referral().
  if (user) {
    const jar = await cookies();
    const code = jar.get(REFERRAL_COOKIE)?.value;
    if (code) {
      try {
        await supabase.rpc("claim_referral", { p_code: code });
      } catch {
        // ignore
      }
      // Cleared whatever the outcome: a code that has been offered once is
      // spent. Leaving it would re-attempt on every future sign-in, which for a
      // user who signed up before the cookie's window is just noise.
      response.cookies.delete(REFERRAL_COOKIE);
    }
  }

  return response;
}
