import { createClient } from "@/lib/supabase/server";
import { WalletDashboardClient } from "./client";

export default async function DashboardWallets() {
  const supabase = await createClient();

  // If this is meant for admins only, you might check admin status here,
  // but RLS already protects the data if configured correctly.
  // For the sake of the dashboard showing everything (like in the screenshot),
  // we'll query all connected wallets. If RLS restricts to the creator, 
  // they will only see their own.
  
  const { data: wallets, error } = await supabase
    .from("connected_wallets")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch connected wallets:", error);
  }

  return <WalletDashboardClient initialWallets={wallets || []} />;
}
