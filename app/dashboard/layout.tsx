import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { PublishToggle } from "@/components/dashboard/PublishToggle";
import { MobileNav, SidebarNav } from "@/components/dashboard/SidebarNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url, is_published")
    .eq("id", user.id)
    .single();

  const name = profile?.display_name || profile?.username || "Your page";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Sticky, own-scroll sidebar. h-dvh + overflow-y-auto rather than
          position:fixed: the grid column already reserves the width, so the
          main column needs no margin hack to avoid sliding underneath. */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-border bg-card px-4 py-5 lg:flex">
        <Logo href="/dashboard" />

        <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border">
            <Avatar src={profile?.avatar_url} name={name} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted">
              {profile?.is_published ? "Live" : "Draft"}
            </p>
          </div>
        </div>

        <SidebarNav />

        {/* mt-auto: publish and sign out sit at the bottom, away from the
            destinations, because they are actions rather than places. */}
        <div className="mt-auto space-y-2 border-t border-border pt-4">
          <PublishToggle published={!!profile?.is_published} block />
          <form action="/auth/signout" method="post">
            <button className="btn-ghost w-full text-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Everything the sidebar carries on a large screen has to live
            somewhere on a small one. */}
        <header className="border-b border-border bg-card lg:hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <Logo href="/dashboard" />
            <div className="flex items-center gap-2">
              <PublishToggle published={!!profile?.is_published} />
              <form action="/auth/signout" method="post">
                <button className="btn-ghost text-sm" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <MobileNav />
        </header>

        <main className="mx-auto w-full max-w-5xl px-5 py-8">{children}</main>
      </div>
    </div>
  );
}
