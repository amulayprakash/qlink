import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WalletsForm } from "@/components/onboarding/WalletsForm";
import { updateWallets } from "@/app/dashboard/actions";

export default async function DashboardWallets() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("evm_wallet_address, tron_wallet_address")
    .eq("id", user!.id)
    .single();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard" className="btn-ghost mb-4 text-sm">
        ← Back to overview
      </Link>
      <WalletsForm
        action={updateWallets}
        submitLabel="Save changes"
        backHref=""
        initial={{
          evm: profile?.evm_wallet_address ?? "",
          tron: profile?.tron_wallet_address ?? "",
        }}
      />
    </div>
  );
}
