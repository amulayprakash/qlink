import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stepPath } from "@/lib/onboarding";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Logo } from "@/components/Logo";
import type { OnboardingStep } from "@/lib/types";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_step")
      .eq("id", user.id)
      .single();
    redirect(stepPath((profile?.onboarding_step as OnboardingStep) ?? "username"));
  }

  return (
    <main className="grain relative grid min-h-dvh place-items-center overflow-hidden p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 w-80 rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle,#c5f24e,transparent 70%)" }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="glass p-6 sm:p-8">
          <h1 className="font-display text-center text-2xl font-bold">
            Welcome
          </h1>
          <p className="mt-1 text-center text-sm text-muted">
            Sign in to build your page and start selling.
          </p>

          {error && (
            <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-center text-sm text-danger">
              Sign-in failed. Please try again.
            </p>
          )}

          <div className="mt-6">
            <GoogleSignInButton next={next} />
          </div>

          <p className="mt-6 text-center text-xs text-muted">
            By continuing you agree to accept crypto payments directly to your
            own wallet. We never hold your funds.
          </p>
        </div>
      </div>
    </main>
  );
}
