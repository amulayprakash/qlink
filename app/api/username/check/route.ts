import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/validation";

/** Live username availability check for the onboarding form. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = usernameSchema.safeParse(searchParams.get("u"));
  if (!parsed.success) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", parsed.data)
    .maybeSingle();

  // Available if unclaimed, or already owned by the current user.
  const available = !data || data.id === user?.id;
  return NextResponse.json({ available });
}
