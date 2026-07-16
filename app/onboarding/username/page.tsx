import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/app-url";
import { UsernameForm } from "@/components/onboarding/UsernameForm";

export default async function UsernamePage() {
  const host = (await getAppUrl()).replace(/^https?:\/\//, "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user!.id)
    .single();

  return <UsernameForm initialUsername={profile?.username ?? ""} host={host} />;
}
