import { createClient } from "@/lib/supabase/server";
import { PackagesEditor, type PkgRow } from "@/components/PackagesEditor";
import { savePackages } from "@/app/onboarding/actions";

export default async function PackagesPage() {
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
    <PackagesEditor
      initial={initial}
      action={savePackages}
      submitLabel="Continue"
      backHref="/onboarding/wallets"
    />
  );
}
