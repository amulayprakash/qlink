import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionsEditor } from "@/components/editor/SectionsEditor";
import {
  ensurePackagesSection,
  isSyntheticSection,
  loadCreatorPage,
} from "@/lib/sections";

export const metadata: Metadata = { title: "Links" };

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

/**
 * The dashboard IS the editor.
 *
 * It used to be a hub of cards linking to the places you could actually change
 * something, with the editor one click away at /dashboard/editor. The thing a
 * creator opens this product to do is edit their links, so that is what the
 * front door does now. The old hub's contents did not vanish: the share link
 * moved next to the preview it describes, and the stats moved to /dashboard/orders,
 * next to the orders they count.
 */
export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ published?: string }>;
}) {
  const justPublished = (await searchParams).published === "1";
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

  // Before the read, not after: the editor round-trips section ids through the
  // form and upserts them, so it needs a real row rather than the in-memory
  // fallback loadCreatorPage would otherwise synthesise.
  await ensurePackagesSection(supabase, profile.id);

  // includeHidden: this is the one screen that must show a paused link, since
  // it is the only one that can unpause it.
  const { sections, packages } = await loadCreatorPage(supabase, profile.id, {
    includeHidden: true,
  });

  // The editor edits rows, so it only ever sees rows. See isSyntheticSection:
  // a synthesised id is not a uuid and would fail validation on save. Dropping
  // it means that until 0003 is applied the editor simply looks the way it
  // always has, while the public page still renders packages via the fallback.
  const editable = sections.filter((s) => !isSyntheticSection(s.id));

  return (
    <div className="space-y-5">
      {justPublished && (
        <div className="rounded-xl bg-accent/10 px-4 py-3 text-sm text-accent">
          🎉 Your page is live! Share your link — it&apos;s next to the preview.
        </div>
      )}

      <SectionsEditor
        profile={profile}
        sections={editable}
        packages={packages}
        publicUrl={profile.username ? `${APP_URL}/${profile.username}` : ""}
        isPublished={profile.is_published}
      />
    </div>
  );
}
