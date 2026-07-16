import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { OnboardingStepper } from "@/components/onboarding/Stepper";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="container-app flex items-center justify-between py-4">
          <Logo />
          <form action="/auth/signout" method="post">
            <button className="btn-ghost text-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="container-app grid gap-8 py-8 md:grid-cols-[220px_1fr]">
        <OnboardingStepper />
        <div className="w-full max-w-2xl">{children}</div>
      </div>
    </div>
  );
}
