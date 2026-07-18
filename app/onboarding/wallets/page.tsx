import { redirect } from "next/navigation";

/** Retired onboarding step — see `lib/crypto/platform-wallets.ts`. Anyone whose
 *  saved `onboarding_step` still points here resumes at packages. */
export default function WalletsPage() {
  redirect("/onboarding/packages");
}
