import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/onboarding/ProfileForm";
import { saveProfile } from "@/app/onboarding/actions";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: links }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, bio, avatar_url")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("links")
      .select("title, url")
      .eq("profile_id", user!.id)
      .order("position"),
  ]);

  return (
    <ProfileForm
      userId={user!.id}
      action={saveProfile}
      initial={{
        display_name: profile?.display_name ?? "",
        bio: profile?.bio ?? "",
        avatar_url: profile?.avatar_url ?? "",
        links: links ?? [],
      }}
    />
  );
}
