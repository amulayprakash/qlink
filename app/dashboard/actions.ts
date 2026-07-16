"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { defaultSectionId } from "@/lib/sections";
import type { ActionState } from "@/lib/forms";
import {
  usernameSchema,
  linksSchema,
  packagesSchema,
  editorPageSchema,
  hexColorSchema,
} from "@/lib/validation";
import { accentIsUsable, isPageThemeId } from "@/lib/themes";
import type { ThemeConfig } from "@/lib/types";
import { isEvmAddress, isTronAddress, normalizeEvmAddress } from "@/lib/crypto/address";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

async function revalidatePublic(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .single();
  if (data?.username) revalidatePath(`/${data.username}`);
  revalidatePath("/dashboard");
}

export async function updateUsername(
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
  if (taken && taken.id !== userId) return { error: "That username is taken" };

  const { error } = await supabase
    .from("profiles")
    .update({ username })
    .eq("id", userId);
  if (error) return { error: error.message };

  await revalidatePublic(supabase, userId);
  return { ok: true };
}

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();

  const display_name = String(formData.get("display_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const avatar_url = String(formData.get("avatar_url") ?? "").trim() || null;
  if (!display_name) return { error: "Display name is required" };

  // Motivated: `has` is not a nicety. This form no longer renders a links
  // editor (the page editor owns links now), and reading a missing field as
  // "[]" would delete every link and empty every section on each save.
  const editsLinks = formData.has("links");
  let links: { title: string; url: string }[] = [];
  if (editsLinks) {
    try {
      links = linksSchema.parse(JSON.parse(String(formData.get("links") ?? "[]")));
    } catch {
      return { error: "One of your links is invalid" };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name, bio: bio || null, avatar_url })
    .eq("id", userId);
  if (error) return { error: error.message };

  if (editsLinks) {
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
  }

  await revalidatePublic(supabase, userId);
  return { ok: true };
}

export async function updateWallets(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();

  const evmRaw = String(formData.get("evm_wallet_address") ?? "").trim();
  const tronRaw = String(formData.get("tron_wallet_address") ?? "").trim();
  if (!evmRaw && !tronRaw) {
    return { error: "Add at least one receiving wallet" };
  }

  let evm_wallet_address: string | null = null;
  if (evmRaw) {
    if (!isEvmAddress(evmRaw)) return { error: "Invalid EVM address" };
    evm_wallet_address = normalizeEvmAddress(evmRaw);
  }
  let tron_wallet_address: string | null = null;
  if (tronRaw) {
    if (!isTronAddress(tronRaw)) return { error: "Invalid Tron address" };
    tron_wallet_address = tronRaw;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ evm_wallet_address, tron_wallet_address })
    .eq("id", userId);
  if (error) return { error: error.message };

  await revalidatePublic(supabase, userId);
  return { ok: true };
}

export async function updatePackages(
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
  if (packages.length === 0) return { error: "Add at least one package" };

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

  await revalidatePublic(supabase, userId);
  return { ok: true };
}

/**
 * Replace the whole page: sections, their links, and the theme.
 *
 * Sections are UPSERTED by their client-minted id rather than deleted and
 * reinserted like links are. Motivated: links carry a composite fk to
 * (section_id, profile_id), so churning section ids on every save would mean
 * re-pointing every link anyway, and stable section ids are what let a future
 * click-analytics table reference a group.
 *
 * There is no transaction (supabase-js has none), so the order matters: write
 * sections before the links that reference them, and prune sections last, once
 * nothing points at them.
 */
export async function savePage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();

  const parsed = editorPageSchema.safeParse(
    JSON.parse(String(formData.get("sections") ?? "[]")),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your links." };
  }
  const sections = parsed.data;

  const theme = String(formData.get("theme") ?? "default");
  if (!isPageThemeId(theme)) return { error: "Unknown theme" };

  const config: ThemeConfig = {};
  const font = String(formData.get("font") ?? "sans");
  if (font === "serif" || font === "sans") config.font = font;

  const accentRaw = String(formData.get("accent") ?? "").trim();
  if (accentRaw) {
    const hex = hexColorSchema.safeParse(accentRaw);
    if (!hex.success) {
      return { error: hex.error.issues[0]?.message ?? "Invalid colour" };
    }
    // The gate that stops an unreadable page being saved. The picker warns in
    // the browser, but the browser is not a trust boundary.
    const usable = accentIsUsable(hex.data, theme);
    if (!usable.ok) return { error: usable.reason };
    config.accent = hex.data;
  }

  const { error: pErr } = await supabase
    .from("profiles")
    .update({ theme, theme_config: config })
    .eq("id", userId);
  if (pErr) return { error: pErr.message };

  // 1. Sections. profile_id is forced to the session user, so a forged id
  //    belonging to someone else fails the RLS with-check rather than moving
  //    their row.
  if (sections.length) {
    const rows = sections.map((s, i) => ({
      id: s.id,
      profile_id: userId,
      kind: s.kind,
      title: s.title,
      position: i,
      collapsible: s.collapsible,
      default_open: s.default_open,
    }));
    const { error } = await supabase
      .from("sections")
      .upsert(rows, { onConflict: "id" });
    if (error) return { error: error.message };
  }

  // 2. Links: delete and reinsert, matching the house pattern elsewhere.
  const { error: dErr } = await supabase
    .from("links")
    .delete()
    .eq("profile_id", userId);
  if (dErr) return { error: dErr.message };

  const linkRows = sections
    .filter((s) => s.kind === "links")
    .flatMap((s) =>
      s.links.map((l, i) => ({
        profile_id: userId,
        section_id: s.id,
        title: l.title,
        url: l.url,
        position: i,
        // Round-tripped, not defaulted: these rows are reinserted on every
        // save, so omitting this would silently unpause every paused link the
        // next time the creator touched anything.
        is_active: l.is_active,
      })),
    );
  if (linkRows.length) {
    const { error } = await supabase.from("links").insert(linkRows);
    if (error) return { error: error.message };
  }

  // 3. Prune sections the creator deleted. Last, so nothing references them.
  const keep = sections.map((s) => s.id);
  const prune = supabase.from("sections").delete().eq("profile_id", userId);
  const { error: prErr } = keep.length
    ? await prune.not("id", "in", `(${keep.join(",")})`)
    : await prune;
  if (prErr) return { error: prErr.message };

  await revalidatePublic(supabase, userId);
  return { ok: true };
}

export async function setPublished(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const publish = formData.get("published") === "true";

  if (publish) {
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "username, promo_code, promo_discount_pct, evm_wallet_address, tron_wallet_address",
      )
      .eq("id", userId)
      .single();
    if (!profile?.username) return { error: "Set a username first" };
    if (!profile.evm_wallet_address && !profile.tron_wallet_address) {
      return { error: "Add a receiving wallet first" };
    }
    const { count } = await supabase
      .from("packages")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId);
    if (!count) return { error: "Add at least one package first" };

    const promo_code =
      profile.promo_code ??
      `${profile.username.replace(/[^a-z0-9]/g, "")}20`.toUpperCase();

    const { error } = await supabase
      .from("profiles")
      .update({ is_published: true, promo_code, onboarding_step: "done" })
      .eq("id", userId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("profiles")
      .update({ is_published: false })
      .eq("id", userId);
    if (error) return { error: error.message };
  }

  await revalidatePublic(supabase, userId);
  return { ok: true };
}
