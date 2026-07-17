import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/app-url";
import { DesignEditor } from "@/components/design/DesignEditor";
import { loadCreatorPage } from "@/lib/sections";

export const metadata: Metadata = { title: "Design" };

/**
 * How the page looks: theme, wallpaper, buttons, text, colours.
 *
 * Loads the creator's real sections and packages purely to feed the preview —
 * this screen cannot edit any of them. Motivated: a phone frame showing
 * placeholder links would answer the wrong question. The whole point of picking
 * a wallpaper is seeing it behind YOUR page.
 *
 * includeHidden is deliberately NOT passed, unlike the link editor: this preview
 * claims to show what a visitor sees, and a visitor does not see a paused link.
 */
export default async function DesignPage() {
  const appUrl = await getAppUrl();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  if (!profile) redirect("/onboarding");

  const { sections, packages } = await loadCreatorPage(supabase, profile.id);

  return (
    <DesignEditor
      profile={profile}
      sections={sections}
      packages={packages}
      publicUrl={profile.username ? `${appUrl}/${profile.username}` : ""}
      isPublished={profile.is_published}
    />
  );
}
