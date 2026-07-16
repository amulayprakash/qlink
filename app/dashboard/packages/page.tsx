import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PackagesEditor, type PkgRow } from "@/components/PackagesEditor";
import { updatePackages } from "@/app/dashboard/actions";

export default async function DashboardPackages() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: packages } = await supabase
    .from("packages")
    .select("name, description, price_usd, features")
    .eq("profile_id", user!.id)
    .order("position");

  const initial: PkgRow[] = (packages ?? []).map((p) => ({
    name: p.name ?? "",
    price: p.price_usd != null ? String(p.price_usd) : "",
    description: p.description ?? "",
    features: Array.isArray(p.features) ? (p.features as string[]) : [],
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard" className="btn-ghost mb-4 text-sm">
        ← Back to overview
      </Link>
      <PackagesEditor
        initial={initial}
        action={updatePackages}
        submitLabel="Save changes"
      />
    </div>
  );
}
