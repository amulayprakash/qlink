import { redirect } from "next/navigation";

/**
 * Retired. Creators no longer supply receiving wallets — payments go to the
 * platform's fixed addresses (`lib/crypto/platform-wallets.ts`).
 *
 * Kept as a redirect rather than deleted because the route shipped in the
 * sidebar for a while, so it is sitting in bookmarks and browser history; a
 * 404 there reads as "the dashboard is broken", not "this moved".
 */
export default function DashboardWallets() {
  redirect("/dashboard");
}
