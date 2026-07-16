import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreatorPageView } from "@/components/CreatorPageView";
import { PublishButton } from "@/components/onboarding/PublishButton";
import { loadCreatorPage } from "@/lib/sections";

export default async function PreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  // Same loader as the public page. Motivated: this screen promises "exactly
  // what visitors will see", but its own query used to omit the is_active
  // filter, so it showed paused packages the live page hides.
  const { sections, packages } = await loadCreatorPage(supabase, user!.id);

  const hasWallet =
    !!profile?.evm_wallet_address || !!profile?.tron_wallet_address;
  const pkgCount = packages?.length ?? 0;
  const ready = !!profile?.username && hasWallet && pkgCount > 0;

  const checklist = [
    { label: "Username claimed", ok: !!profile?.username, href: "/onboarding/username" },
    { label: "Receiving wallet added", ok: hasWallet, href: "/onboarding/wallets" },
    { label: "At least one package", ok: pkgCount > 0, href: "/onboarding/packages" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Preview &amp; publish</h1>
      <p className="mt-1 text-sm text-muted">
        This is exactly what visitors will see. Publish when you&apos;re happy.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Live preview */}
        <div className="overflow-hidden rounded-2xl border border-border">
          {profile && (
            <CreatorPageView
              profile={profile}
              sections={sections}
              packages={packages}
            />
          )}
        </div>

        {/* Publish panel */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold">Ready to publish?</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2">
                  <span
                    className={
                      c.ok
                        ? "text-accent"
                        : "text-muted"
                    }
                  >
                    {c.ok ? "✓" : "○"}
                  </span>
                  <span className={c.ok ? "" : "text-muted"}>{c.label}</span>
                  {!c.ok && (
                    <Link
                      href={c.href}
                      className="ml-auto text-xs text-brand-600 underline"
                    >
                      Fix
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <PublishButton disabled={!ready} />

          <Link href="/onboarding/packages" className="btn-ghost w-full">
            Back
          </Link>
        </div>
      </div>
    </div>
  );
}
