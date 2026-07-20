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
  wallpaperSchema,
  shareImageUrlSchema,
  payoutSchema,
  isValidPayoutAddress,
} from "@/lib/validation";
import { getNetwork, getToken } from "@/lib/crypto/config";
import {
  accentIsUsable,
  isButtonFill,
  isButtonShape,
  isPageThemeId,
} from "@/lib/themes";
import type { ThemeConfig } from "@/lib/types";

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

  // Read BEFORE the update, because after it there is no way back to it: this
  // is the only mutation that moves the page to a different URL, and
  // revalidatePublic() below can only ever see where the profile is NOW.
  const { data: before } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ username })
    .eq("id", userId);
  if (error) return { error: error.message };

  // The vacated URL. Now that /[username] is cached (see its `revalidate`),
  // the entry built under the old name outlives the rename and would keep
  // serving a live-looking page for up to an hour at an address that no longer
  // belongs to anyone — and would go on serving it to anyone who claims that
  // name next. Dropping it makes the old URL 404 on the next request, which is
  // what it now is.
  if (before?.username && before.username !== username) {
    revalidatePath(`/${before.username}`);
  }

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
 * Design: the theme preset and everything layered on top of it.
 *
 * Owns profiles.theme and profiles.theme_config OUTRIGHT, and is the only thing
 * that writes either. That is not tidiness — theme_config is a single jsonb
 * value that has to be written whole, so two actions writing it means whichever
 * saved last silently erases the other's fields. savePage used to build a fresh
 * config from its own form and write it, which is exactly that bug: with a
 * wallpaper in the column, saving a link would have deleted it. See the note
 * there.
 *
 * Every field is re-derived from the form rather than merged into the stored
 * row, so a field the creator cleared actually clears. The form always posts
 * all of them.
 */
export async function updateDesign(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, userId } = await requireUser();

  const theme = String(formData.get("theme") ?? "default");
  if (!isPageThemeId(theme)) return { error: "Unknown theme" };

  const config: ThemeConfig = {};

  const font = String(formData.get("font") ?? "sans");
  if (font === "serif" || font === "sans") config.font = font;

  const shape = String(formData.get("button_shape") ?? "");
  if (isButtonShape(shape)) config.buttonShape = shape;

  const fill = String(formData.get("button_fill") ?? "");
  if (isButtonFill(fill)) config.buttonFill = fill;

  const accentRaw = String(formData.get("accent") ?? "").trim();
  if (accentRaw) {
    const hex = hexColorSchema.safeParse(accentRaw);
    if (!hex.success) {
      return { error: hex.error.issues[0]?.message ?? "Invalid colour" };
    }
    // The gate that stops an unreadable page being saved. The picker warns in
    // the browser, but the browser is not a trust boundary.
    //
    // Still measured against the PRESET's background, even when a wallpaper is
    // set and that is no longer what the accent sits on. Kept deliberately: it
    // is the check this product has always applied, and the alternative — a
    // gate that pretends to know what an arbitrary photo looks like — would be
    // less honest than one with a stated blind spot, not more.
    const usable = accentIsUsable(hex.data, theme);
    if (!usable.ok) return { error: usable.reason };
    config.accent = hex.data;
  }

  const wallpaperRaw = String(formData.get("wallpaper") ?? "").trim();
  if (wallpaperRaw) {
    let json: unknown;
    try {
      json = JSON.parse(wallpaperRaw);
    } catch {
      return { error: "Could not read that wallpaper." };
    }
    const parsed = wallpaperSchema.safeParse(json);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid wallpaper" };
    }
    config.wallpaper = parsed.data;
  }

  // The og:image. Absent means "fall back to the avatar", which is what every
  // page did before this field existed — so an empty string here is a real
  // choice the creator can make (the Remove button), not a missing value.
  const shareImageRaw = String(formData.get("share_image") ?? "").trim();
  if (shareImageRaw) {
    const parsed = shareImageUrlSchema.safeParse(shareImageRaw);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid share image" };
    }
    config.shareImage = parsed.data;
  }

  const { error } = await supabase
    .from("profiles")
    .update({ theme, theme_config: config })
    .eq("id", userId);
  if (error) return { error: error.message };

  await revalidatePublic(supabase, userId);
  // The signature rides back out only on success, which is the whole point: it
  // is the form's proof of WHICH on-screen state the database now holds. Opaque
  // here on purpose — the client owns the format. See ActionState.signature.
  return { ok: true, signature: String(formData.get("signature") ?? "") };
}

/**
 * Replace the whole page: sections and their links.
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
 *
 * Touches NEITHER theme NOR theme_config, though it used to do both. Those
 * moved to updateDesign above and to /dashboard/design. Do not add them back:
 * theme_config is written whole, so an action that writes it from a form which
 * does not carry every field deletes the fields it does not carry — once there
 * was a wallpaper in that column, "save your links" meant "lose your
 * background". Same reasoning as the `editsLinks` guard in updateProfile.
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
        // save, so omitting any of the three would silently reset every paused
        // link, every platform and every social icon on the page the next time
        // the creator touched anything.
        is_active: l.is_active,
        platform: l.platform,
        show_as_icon: l.show_as_icon,
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
      .select("username, promo_code, promo_discount_pct")
      .eq("id", userId)
      .single();
    if (!profile?.username) return { error: "Set a username first" };
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

/**
 * Redeem part of a balance.
 *
 * Thin on purpose. The amount is checked against the creator's balance, the
 * platform fee is computed, and the row is inserted inside `request_payout()`
 * (0011) — one transaction holding a lock on the creator's profile row.
 * Pulling any of that up here would reintroduce the race it exists to close:
 * supabase-js has no transactions, so a read-then-insert in TypeScript lets
 * two concurrent submissions both pass the balance check and overdraw.
 *
 * So this validates shape, and lets the database own the money.
 */
export async function requestPayout(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser();

  const parsed = payoutSchema.safeParse({
    amount: Number(formData.get("amount")),
    address: formData.get("address"),
    network: formData.get("network"),
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const { amount, address, network, token } = parsed.data;

  // Membership of the registry, which payoutSchema deliberately does not check.
  const net = getNetwork(network);
  if (!net) return { error: "Unsupported network" };
  if (!getToken(network, token)) {
    return { error: `${token} is not supported on ${net.name}` };
  }
  if (!isValidPayoutAddress(address, net.kind)) {
    return {
      error:
        net.kind === "tron"
          ? "That is not a Tron address — they start with T"
          : "That is not a valid EVM address — 0x followed by 40 hex characters",
    };
  }

  const { error } = await supabase.rpc("request_payout", {
    p_amount: amount,
    p_address: address,
    p_network: network,
    p_token: token,
  });

  if (error) {
    // P0001 is what a bare `raise exception` in request_payout() produces, and
    // every one of those is a sentence written for a creator (below the
    // minimum, over the balance, bad address). Anything else is the database
    // talking to us, not to them — "numeric field overflow" or a constraint
    // name helps nobody and describes our internals.
    return {
      error:
        error.code === "P0001"
          ? error.message
          : "Could not submit that redemption. Please try again.",
    };
  }

  revalidatePath("/dashboard/balance");
  return { ok: true };
}
