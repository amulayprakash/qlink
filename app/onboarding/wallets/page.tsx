import { createClient } from "@/lib/supabase/server";
import { WalletsForm } from "@/components/onboarding/WalletsForm";
import { saveWallets } from "@/app/onboarding/actions";

export default async function WalletsPage() {
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
    <WalletsForm
      action={saveWallets}
      initial={{
        evm: profile?.evm_wallet_address ?? "",
        tron: profile?.tron_wallet_address ?? "",
      }}
    />
  );
}
