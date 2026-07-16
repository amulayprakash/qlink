import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stepPath } from "@/lib/onboarding";
import type { OnboardingStep } from "@/lib/types";

export default async function OnboardingIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_step")
    .eq("id", user.id)
    .single();

  redirect(stepPath((profile?.onboarding_step as OnboardingStep) ?? "username"));
}
