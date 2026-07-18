"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { defaultSectionId } from "@/lib/sections";
import {
  usernameSchema,
  linksSchema,
  packagesSchema,
} from "@/lib/validation";

export type { ActionState } from "@/lib/forms";
import type { ActionState } from "@/lib/forms";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

// ---------------------------------------------------------------------------
// Step 1 — username
// ---------------------------------------------------------------------------
export async function saveUsername(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const parsed = usernameSchema.safeParse(formData.get("username"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid username" };
  }
  const username = parsed.data;

  const { data: taken } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (taken && taken.id !== userId) {
    return { error: "That username is already taken" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ username, onboarding_step: "profile" })
    .eq("id", userId);
  if (error) return { error: error.message };

  redirect("/onboarding/profile");
}

// ---------------------------------------------------------------------------
// Step 2 — profile + links
// ---------------------------------------------------------------------------
export async function saveProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();

  const display_name = String(formData.get("display_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const avatar_url = String(formData.get("avatar_url") ?? "").trim() || null;

  if (!display_name) return { error: "Display name is required" };

  let links: { title: string; url: string }[] = [];
  try {
    links = linksSchema.parse(JSON.parse(String(formData.get("links") ?? "[]")));
  } catch {
    return { error: "One of your links is invalid" };
  }

  const { error: pErr } = await supabase
    .from("profiles")
    .update({
      display_name,
      bio: bio || null,
      avatar_url,
      onboarding_step: "packages",
    })
    .eq("id", userId);
  if (pErr) return { error: pErr.message };

  // Replace the link set. Links land in the default section; the editor is
  // where the creator splits them into groups later.
  await supabase.from("links").delete().eq("profile_id", userId);
  if (links.length) {
    const section_id = await defaultSectionId(supabase, userId);
    const rows = links.map((l, i) => ({
      profile_id: userId,
      section_id,
      title: l.title,
      url: l.url,
      position: i,
    }));
    const { error: lErr } = await supabase.from("links").insert(rows);
    if (lErr) return { error: lErr.message };
  }

  redirect("/onboarding/packages");
}

// ---------------------------------------------------------------------------
// Step 3 — packages
// ---------------------------------------------------------------------------
export async function savePackages(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();

  let packages: {
    name: string;
    description?: string;
    price_usd: number;
    features: string[];
  }[] = [];
  try {
    packages = packagesSchema.parse(
      JSON.parse(String(formData.get("packages") ?? "[]")),
    );
  } catch {
    return { error: "Check your package details. A field is invalid." };
  }
  if (packages.length === 0) {
    return { error: "Add at least one package" };
  }

  await supabase.from("packages").delete().eq("profile_id", userId);
  const rows = packages.map((p, i) => ({
    profile_id: userId,
    name: p.name,
    description: p.description || null,
    price_usd: p.price_usd,
    features: p.features ?? [],
    position: i,
    is_active: true,
  }));
  const { error } = await supabase.from("packages").insert(rows);
  if (error) return { error: error.message };

  await supabase
    .from("profiles")
    .update({ onboarding_step: "preview" })
    .eq("id", userId);

  redirect("/onboarding/preview");
}

// ---------------------------------------------------------------------------
// Step 4 — publish
// ---------------------------------------------------------------------------
export async function publishPage(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, promo_code")
    .eq("id", userId)
    .single();

  if (!profile?.username) return { error: "Set your username first" };

  const { count } = await supabase
    .from("packages")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", userId);
  if (!count) return { error: "Add at least one package before publishing" };

  // One flat 20%-off promo code per creator, derived from the (unique) username.
  const promo_code =
    profile.promo_code ??
    `${profile.username.replace(/[^a-z0-9]/g, "")}20`.toUpperCase();

  const { error } = await supabase
    .from("profiles")
    .update({
      promo_code,
      promo_discount_pct: 20,
      is_published: true,
      onboarding_step: "done",
    })
    .eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath(`/${profile.username}`);
  redirect("/dashboard?published=1");
}
