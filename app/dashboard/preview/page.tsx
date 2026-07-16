import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreatorPageView } from "@/components/CreatorPageView";
import { loadCreatorPage } from "@/lib/sections";

export const metadata: Metadata = { title: "Preview" };

export default async function DashboardPreview() {
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

  // Same loader as the public page, so the preview cannot drift from it.
  const { sections, packages } = await loadCreatorPage(supabase, profile.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Preview</h1>
            <span
              className={
                profile.is_published
                  ? "badge bg-accent/15 text-accent"
                  : "badge bg-white/[0.06] text-muted"
              }
            >
              {profile.is_published ? "Live" : "Draft"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {profile.is_published
              ? "This is what visitors see on your public page."
              : "This is what visitors will see once you publish."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/profile" className="btn-outline text-sm">
            Edit profile
          </Link>
          {profile.is_published && profile.username && (
            <Link
              href={`/${profile.username}`}
              target="_blank"
              className="btn-ghost text-sm"
            >
              Open live page ↗
            </Link>
          )}
        </div>
      </div>

      {!profile.username && (
        <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
          You haven&apos;t claimed a username yet.{" "}
          <Link href="/onboarding/username" className="text-brand-700 underline">
            Claim one
          </Link>{" "}
          to get your public link.
        </div>
      )}

      {/* Checkout is intentionally disabled here: CreatorPageView renders an
          inert Buy button when no buySlot is supplied. No `canvas` either, or
          opening Preview would repaint the whole dashboard in the page theme. */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <CreatorPageView
          profile={profile}
          sections={sections}
          packages={packages}
        />
      </div>
    </div>
  );
}
