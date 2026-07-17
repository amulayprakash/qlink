"use client";

import { useActionState, useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowCounterClockwise,
  ImageSquare,
  PaintBrushBroad,
  Palette,
  Selection,
  ShareNetwork,
  TextAa,
} from "@phosphor-icons/react";
import { updateDesign } from "@/app/dashboard/actions";
import { PhonePreview } from "@/components/editor/PhonePreview";
import { Select } from "@/components/ui/Select";
import type { PublicProfile } from "@/components/CreatorPageView";
import type { PagePackage } from "@/components/page/PackagesSection";
import { uploadShareImage, uploadWallpaper } from "@/lib/image";
import { SHARE_IMAGE_H, SHARE_IMAGE_W } from "@/lib/validation";
import {
  BUTTON_FILL_LABELS,
  BUTTON_SHAPES,
  PAGE_FONT_LABELS,
  PAGE_THEMES,
  PAGE_THEME_IDS,
  accentIsUsable,
  pageTheme,
  scrimContrast,
  scrimForAA,
} from "@/lib/themes";
import type { PageSection } from "@/lib/sections";
import type { ActionState } from "@/lib/forms";
import type {
  ButtonFillKey,
  ButtonShapeKey,
  PageFontKey,
  ThemeConfig,
  Wallpaper,
  WallpaperKind,
} from "@/lib/types";

/**
 * The Design screen: everything about how the page LOOKS, in one place.
 *
 * It owns profiles.theme and profiles.theme_config outright. That is a
 * correctness requirement rather than a layout preference — theme_config is one
 * jsonb value written whole, so a second screen writing it would erase whatever
 * fields its own form did not carry. The link editor used to do exactly that;
 * see the note on savePage.
 *
 * Rows are native <details>, matching the panel this replaced: they cost no
 * state, and the summary gets Enter/Space and the expanded announcement from
 * the UA for free. Everything the creator changes repaints the phone beside it
 * immediately, because the preview renders the REAL page component off this
 * component's draft state — the same trick the link editor uses, and the reason
 * a preview here cannot drift from what a visitor gets.
 */
export function DesignEditor({
  profile,
  sections,
  packages,
  publicUrl,
  isPublished,
}: {
  profile: PublicProfile;
  sections: PageSection[];
  packages: PagePackage[];
  publicUrl: string;
  isPublished: boolean;
}) {
  const [theme, setTheme] = useState<string>(profile.theme);
  const [config, setConfig] = useState<ThemeConfig>(profile.theme_config ?? {});
  const [saved, formAction, pending] = useActionState<ActionState, FormData>(
    updateDesign,
    undefined,
  );

  const patch = useCallback((p: Partial<ThemeConfig>) => {
    setConfig((c) => ({ ...c, ...p }));
  }, []);

  /**
   * Mirrors the server's own gate (accentIsUsable in updateDesign), which
   * refuses to store an accent nobody could see. Without this the creator would
   * only find out by pressing Save and getting a sentence back — the check is
   * cheap and the answer is the same on both sides, so it may as well be live.
   *
   * Note what it does NOT cover: with a wallpaper set, this measures the accent
   * against the preset's background rather than against the photo. Stated
   * plainly here because it is a real blind spot, not an oversight.
   */
  const accentWarning = useMemo(() => {
    if (!config.accent) return null;
    const r = accentIsUsable(config.accent, theme);
    return r.ok ? null : r.reason;
  }, [config.accent, theme]);

  const previewProfile: PublicProfile = {
    ...profile,
    theme,
    theme_config: config,
  };

  /**
   * The wallpaper as the server will parse it, or "" for none.
   *
   * A photo whose upload has not landed yet has no url, and posting that would
   * fail wallpaperUrlSchema and reject the whole save over a field the creator
   * has not finished filling in. Sending nothing is the honest encoding of
   * "they picked Photo but have not picked a photo".
   */
  const wallpaperValue = useMemo(() => {
    const w = config.wallpaper;
    if (!w) return "";
    if (w.kind === "image" && !w.url) return "";
    return JSON.stringify(w);
  }, [config.wallpaper]);

  /**
   * Everything this form posts, in one place.
   *
   * The hidden inputs are RENDERED from this and the signature is COMPUTED from
   * it, so the two cannot disagree. Motivated: updateDesign rebuilds
   * theme_config from this form alone, so a field that exists in one list and
   * not the other is either a field the next save deletes or a change that never
   * marks the page dirty. One object makes both of those unrepresentable.
   */
  const fields = useMemo(
    () => ({
      theme,
      font: config.font ?? "sans",
      accent: config.accent ?? "",
      button_shape: config.buttonShape ?? "pill",
      button_fill: config.buttonFill ?? "fill",
      wallpaper: wallpaperValue,
      share_image: config.shareImage ?? "",
    }),
    [theme, config, wallpaperValue],
  );

  const signature = useMemo(() => JSON.stringify(fields), [fields]);

  /**
   * What the server last confirmed it stored — the page as loaded, until a save
   * succeeds and echoes its own signature back.
   *
   * State with a lazy initial value, and no setter: that is the idiom for "the
   * value at first render, kept forever". A ref would say the same thing but is
   * not allowed to be READ during render, and this is a render-time input.
   */
  const [loadedSignature] = useState(signature);

  /**
   * Derived, never stored.
   *
   * A dirty FLAG has to be cleared from the action's result, which means an
   * effect that calls setState — and it rots silently the moment nothing clears
   * it, which is exactly what happened to the link editor: its reducer has a
   * `saved` case that is never dispatched, so that screen still reads "Unsaved
   * changes" after a save that worked. A comparison cannot rot. It also gets the
   * case a flag gets wrong for free: change a colour, change it back, and this
   * correctly says there is nothing to save.
   */
  const dirty = signature !== (saved?.signature ?? loadedSignature);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form action={formAction} className="min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Design</h1>
          <Link href="/dashboard/preview" className="btn-ghost text-sm lg:hidden">
            Preview
          </Link>
        </div>

        <Row
          icon={<Palette size={16} weight="bold" />}
          title="Theme"
          value={pageTheme(theme).label}
          defaultOpen
        >
          <ThemePicker value={theme} onChange={setTheme} />
        </Row>

        <Row
          icon={<ImageSquare size={16} weight="bold" />}
          title="Wallpaper"
          value={wallpaperLabel(config.wallpaper)}
          defaultOpen
        >
          <WallpaperPicker
            userId={profile.id}
            theme={theme}
            value={config.wallpaper}
            onChange={(wallpaper) => patch({ wallpaper })}
          />
        </Row>

        <Row
          icon={<Selection size={16} weight="bold" />}
          title="Buttons"
          value={`${BUTTON_SHAPES[config.buttonShape ?? "pill"].label} · ${
            BUTTON_FILL_LABELS[config.buttonFill ?? "fill"]
          }`}
        >
          <ButtonPicker
            shape={config.buttonShape ?? "pill"}
            fill={config.buttonFill ?? "fill"}
            onShape={(buttonShape) => patch({ buttonShape })}
            onFill={(buttonFill) => patch({ buttonFill })}
          />
        </Row>

        <Row
          icon={<TextAa size={16} weight="bold" />}
          title="Text"
          value={PAGE_FONT_LABELS[config.font ?? "sans"]}
        >
          <div>
            <label className="label" htmlFor="font-picker">
              Font
            </label>
            <Select
              id="font-picker"
              className="w-40"
              value={config.font ?? "sans"}
              onChange={(font) => patch({ font: font as PageFontKey })}
              options={(["sans", "serif"] as PageFontKey[]).map((f) => ({
                value: f,
                label: PAGE_FONT_LABELS[f],
              }))}
            />
          </div>
        </Row>

        <Row
          icon={<PaintBrushBroad size={16} weight="bold" />}
          title="Colors"
          value={config.accent ?? "Theme default"}
        >
          <AccentPicker
            theme={theme}
            accent={config.accent}
            warning={accentWarning}
            onChange={(accent) => patch({ accent })}
          />
        </Row>

        {/* Last, and after a visual break in meaning: every row above changes
            what a visitor sees ON the page. This one changes what someone sees
            who has not opened it yet. */}
        <Row
          icon={<ShareNetwork size={16} weight="bold" />}
          title="Share preview"
          value={shareImageLabel(config.shareImage, profile.avatar_url)}
        >
          <ShareImagePicker
            userId={profile.id}
            value={config.shareImage}
            avatarUrl={profile.avatar_url}
            onChange={(shareImage) => patch({ shareImage })}
          />
        </Row>

        {/* Every field, always posted — including the ones whose row has nothing
            to say. updateDesign rebuilds theme_config from this form alone, so a
            field the form omits is a field the next save deletes. */}
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {/* Posted so the action can hand it straight back on success. That echo
            is what tells this form which on-screen state the server has actually
            got — see ActionState.signature. */}
        <input type="hidden" name="signature" value={signature} />

        {saved?.error && (
          <p role="alert" className="text-sm text-danger">
            {saved.error}
          </p>
        )}

        <div className="sticky bottom-4 rounded-xl border border-border bg-card/90 p-3 backdrop-blur">
          {/* Why Save is off has to live HERE, against the button it disables.
              Motivated: this warning used to render only inside the Colors row,
              and Colors is collapsed by default — but the thing that invalidates
              an accent is usually changing the THEME, a different row entirely.
              So picking a new preset could grey out Save while the only
              explanation sat behind a disclosure the creator had no reason to
              open. A disabled control whose reason is offscreen is a dead end,
              and this one was reachable in two clicks from a fresh page.

              It offers the way out rather than only naming the problem: the
              accent is stale — it was chosen against the OLD preset — so the
              fix is nearly always "drop it and take the new one's". Resetting it
              for them silently would be worse; a colour they picked is not ours
              to change without saying so. */}
          {accentWarning && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-3">
              <p role="alert" className="min-w-0 flex-1 text-sm text-danger">
                <span className="font-medium">Colors:</span> {accentWarning}
              </p>
              <button
                type="button"
                className="btn-outline shrink-0 text-xs"
                onClick={() => patch({ accent: undefined })}
              >
                <ArrowCounterClockwise size={13} weight="bold" />
                Use {pageTheme(theme).label}&rsquo;s accent
              </button>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <span aria-live="polite" className="text-sm text-muted">
              {pending
                ? "Saving…"
                : saved?.ok && !dirty
                  ? "Saved ✓"
                  : dirty
                    ? "Unsaved changes"
                    : ""}
            </span>
            <button
              type="submit"
              className="btn-primary"
              disabled={pending || !!accentWarning}
            >
              {pending ? "Saving…" : "Save design"}
            </button>
          </div>
        </div>
      </form>

      {/* Same reasoning as the link editor's: a 320px frame does not fit beside
          the controls below lg, and stacking it underneath puts it a scroll away
          from the thing it is meant to answer. */}
      <aside className="hidden min-w-0 lg:block">
        <PhonePreview
          profile={previewProfile}
          sections={sections}
          packages={packages}
          publicUrl={publicUrl}
          isPublished={isPublished}
        />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------

function wallpaperLabel(w: Wallpaper | undefined): string {
  if (!w) return "Theme colour";
  if (w.kind === "image") return w.url ? "Photo" : "Photo — none chosen";
  return w.kind === "fill" ? "Fill" : "Gradient";
}

/** Names the state the creator is actually in, including the one they never
 *  chose: with no upload and no avatar, a pasted link shows no picture at all,
 *  and the closed row is the only place that can say so. */
function shareImageLabel(
  shareImage: string | undefined,
  avatarUrl: string | null,
): string {
  if (shareImage) return "Custom image";
  return avatarUrl ? "Your avatar" : "No image";
}

/** One row of the Design list: a summary you can read at a glance, and the
 *  controls behind it. `value` is the current setting, so the closed list still
 *  answers "what does my page look like" without opening anything. */
function Row({
  icon,
  title,
  value,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="card p-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span className="text-muted">{icon}</span>
        {title}
        <span className="ml-auto truncate pl-3 text-xs font-normal text-muted">
          {value}
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/**
 * The presets, as what they actually look like.
 *
 * Swatches rather than a <Select> of names: "Mocha" and "Cobalt" mean nothing
 * until you have seen them, and this is the one screen where showing is cheap.
 * Each swatch is built from the same PAGE_THEMES record the page paints from,
 * so a preset cannot be listed here in a colour it does not render in.
 */
function ThemePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex flex-wrap gap-2.5"
    >
      {PAGE_THEME_IDS.map((id) => {
        const t = PAGE_THEMES[id];
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className={[
              "flex w-[calc(50%-0.3125rem)] items-center gap-3 rounded-xl border p-2.5 text-left transition-colors sm:w-40",
              active
                ? "border-brand-600 bg-brand-50"
                : "border-border hover:border-white/20",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10"
              style={{ background: t.bg }}
            >
              <span
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: t.accent }}
              />
            </span>
            <span
              className={[
                "truncate text-sm font-medium",
                active ? "text-brand-700" : "text-foreground",
              ].join(" ")}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const WALLPAPER_KINDS: { key: WallpaperKind | "none"; label: string }[] = [
  { key: "none", label: "Theme colour" },
  { key: "fill", label: "Fill" },
  { key: "gradient", label: "Gradient" },
  { key: "image", label: "Photo" },
];

/**
 * The wallpaper.
 *
 * Switching kind builds a COMPLETE value seeded from the current theme rather
 * than carrying fields across, because the kinds share no fields that mean the
 * same thing (see the Wallpaper union). Seeding from the preset means the first
 * thing the creator sees after picking "Gradient" is their own page's colours,
 * not an arbitrary blue — the control starts where they are.
 */
function WallpaperPicker({
  userId,
  theme,
  value,
  onChange,
}: {
  userId: string;
  theme: string;
  value: Wallpaper | undefined;
  onChange: (w: Wallpaper | undefined) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = pageTheme(theme);

  function choose(kind: WallpaperKind | "none") {
    if (kind === value?.kind) return;
    switch (kind) {
      case "none":
        return onChange(undefined);
      case "fill":
        return onChange({ kind: "fill", color: t.bg });
      case "gradient":
        return onChange({
          kind: "gradient",
          color: t.bg,
          color2: t.accent,
          angle: 160,
        });
      case "image":
        // url:"" is "Photo, none chosen yet" — a real state the creator is in
        // for as long as the file picker is open. DesignEditor declines to post
        // it rather than sending a wallpaper with no image.
        //
        // Seeded at the scrim that earns AA on THIS preset rather than at a
        // flat number: the slider is free to go anywhere, but the value a
        // creator never touches should be one that works, and "works" is a
        // different number on a near-black canvas than on a light one.
        return onChange({ kind: "image", url: "", scrim: scrimForAA(theme) });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clearing the input is what lets the creator re-pick the SAME file after a
    // failed upload: without it the change event never fires a second time.
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadWallpaper(file, userId);
      if ("error" in res) {
        // Inline, not alert(): an alert is dismissed before it is read.
        setUploadError(res.error);
        return;
      }
      onChange({
        kind: "image",
        url: res.url,
        // Keep the scrim they had already dialled in, so replacing a photo does
        // not silently undo the adjusting they did to the last one.
        scrim: value?.kind === "image" ? value.scrim : scrimForAA(theme),
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Wallpaper type" className="flex flex-wrap gap-2">
        {WALLPAPER_KINDS.map((k) => {
          const active = (value?.kind ?? "none") === k.key;
          return (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(k.key)}
              className={[
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-border text-muted hover:border-white/20 hover:text-foreground",
              ].join(" ")}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      {value?.kind === "fill" && (
        <ColorField
          id="wallpaper-fill"
          label="Colour"
          value={value.color}
          onChange={(color) => onChange({ ...value, color })}
        />
      )}

      {value?.kind === "gradient" && (
        <div className="flex flex-wrap items-end gap-4">
          <ColorField
            id="wallpaper-from"
            label="From"
            value={value.color}
            onChange={(color) => onChange({ ...value, color })}
          />
          <ColorField
            id="wallpaper-to"
            label="To"
            value={value.color2}
            onChange={(color2) => onChange({ ...value, color2 })}
          />
          <div>
            <label className="label" htmlFor="wallpaper-angle">
              Angle
            </label>
            <div className="flex items-center gap-2">
              <input
                id="wallpaper-angle"
                type="range"
                min={0}
                max={360}
                step={10}
                value={value.angle}
                onChange={(e) =>
                  onChange({ ...value, angle: Number(e.target.value) })
                }
                className="w-32 accent-brand-600"
              />
              <span className="w-10 text-xs tabular-nums text-muted">
                {value.angle}°
              </span>
            </div>
          </div>
        </div>
      )}

      {value?.kind === "image" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div
              aria-hidden="true"
              className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-white/[0.03] bg-cover bg-center"
              style={
                value.url ? { backgroundImage: `url("${value.url}")` } : undefined
              }
            />
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={onFile}
              />
              <button
                type="button"
                className="btn-outline text-sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading
                  ? "Uploading…"
                  : value.url
                    ? "Replace photo"
                    : "Upload photo"}
              </button>
              {value.url && (
                <button
                  type="button"
                  className="btn-ghost text-sm"
                  onClick={() => onChange(undefined)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <p className="hint">
            JPEG, PNG or WebP, up to 6MB. Large photos are resized in your
            browser before they upload, so your page stays fast.
          </p>

          {uploadError && (
            <p role="alert" className="text-sm text-danger">
              Upload failed: {uploadError}
            </p>
          )}

          {value.url && (
            <ScrimField
              theme={theme}
              value={value.scrim}
              onChange={(scrim) => onChange({ ...value, scrim })}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The picture a chat app shows when the creator's link is pasted into it.
 *
 * Shown at the real 1200x630 aspect and cropped for real on upload, because
 * this control has a problem the wallpaper one does not: the creator cannot
 * check their work. A wallpaper is wrong on a page they can open. A share image
 * is wrong inside somebody else's WhatsApp thread, and they find out when a
 * friend tells them, or never. The frame here is the only chance to see it.
 *
 * The fallback is stated rather than left blank. "No custom image" and "chats
 * will show your avatar" describe the same state, but only the second answers
 * the question the creator opened this row with — and the avatar preview shows
 * the letterboxing honestly, which is usually what convinces them to upload
 * something.
 */
function ShareImagePicker({
  userId,
  value,
  avatarUrl,
  onChange,
}: {
  userId: string;
  value: string | undefined;
  avatarUrl: string | null;
  onChange: (url: string | undefined) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Same reason as the wallpaper picker: without this the creator cannot
    // re-pick the same file after a failure, because change never fires twice.
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadShareImage(file, userId);
      if ("error" in res) {
        setUploadError(res.error);
        return;
      }
      onChange(res.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-xl border border-border bg-white/[0.03]"
        style={{ aspectRatio: `${SHARE_IMAGE_W} / ${SHARE_IMAGE_H}` }}
      >
        {value ? (
          // Not next/image: this is a preview of a file whose whole point is to
          // be served raw to a crawler, and optimising it here would show the
          // creator something other than what the crawler gets.
          //
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Your share preview image"
            className="h-full w-full object-cover"
          />
        ) : avatarUrl ? (
          <div className="flex h-full w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-auto max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="grid h-full w-full place-items-center px-4 text-center text-xs text-muted">
            Your link will paste with no picture.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onFile}
        />
        <button
          type="button"
          className="btn-outline text-sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
        </button>
        {value && (
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => onChange(undefined)}
          >
            Remove
          </button>
        )}
      </div>

      <p className="hint">
        {value
          ? "Shown when your link is pasted into WhatsApp, iMessage, Slack, Discord or X."
          : avatarUrl
            ? "Chats currently show your avatar, cropped to a square. Upload a wide image to control what they show instead."
            : "Nothing shows beside your link right now. Upload an image to fix that."}{" "}
        JPEG, PNG or WebP, up to 6MB. Cropped to {SHARE_IMAGE_W}×{SHARE_IMAGE_H}{" "}
        in your browser — the frame above is exactly what gets sent.
      </p>

      {uploadError && (
        <p role="alert" className="text-sm text-danger">
          Upload failed: {uploadError}
        </p>
      )}

      <p className="hint">
        Chat apps cache previews hard. An updated image can take a while to
        appear on a link that has already been shared.
      </p>
    </div>
  );
}

/**
 * How much of the theme's own colour is laid over the photo.
 *
 * No floor and nothing is blocked: a creator may ship a page we would not call
 * readable, which is a deliberate product decision (see the note on
 * .page-wallpaper::after in globals.css).
 *
 * What is shown is a SUGGESTION and a reason, not a warning — it names the exact
 * percentage that makes the page work and offers to go there, which is more use
 * than a red sentence that only says no. Below that point the honest figure is
 * often 1.0:1 (a photo can contain a patch of exactly the text colour), so the
 * raw ratio is deliberately not the headline: it would read as broken at every
 * setting a creator is likely to try, and a number that always says "bad" gets
 * tuned out. See lib/themes.ts#scrimContrast for why 1.0 is the true answer.
 */
function ScrimField({
  theme,
  value,
  onChange,
}: {
  theme: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const safe = scrimForAA(theme);
  const ok = value >= safe;
  const pct = Math.round(value * 100);

  return (
    <div>
      <label className="label" htmlFor="wallpaper-scrim">
        Photo dimming
      </label>
      <div className="flex items-center gap-3">
        <input
          id="wallpaper-scrim"
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="w-48 accent-brand-600"
          aria-describedby="wallpaper-scrim-hint"
        />
        <span className="w-10 text-xs tabular-nums text-muted">{pct}%</span>
      </div>

      <p id="wallpaper-scrim-hint" className="hint">
        {ok ? (
          <>Your text stays readable over any photo ({scrimContrast(theme, value).toFixed(1)}:1).</>
        ) : (
          <>
            A busy or light photo may make your text hard to read.{" "}
            <button
              type="button"
              className="text-brand-700 underline underline-offset-2"
              onClick={() => onChange(safe)}
            >
              Use {Math.round(safe * 100)}%
            </button>{" "}
            to be safe on this theme.
          </>
        )}
      </p>
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-xs tabular-nums text-muted">{value}</span>
      </div>
    </div>
  );
}

function ButtonPicker({
  shape,
  fill,
  onShape,
  onFill,
}: {
  shape: ButtonShapeKey;
  fill: ButtonFillKey;
  onShape: (s: ButtonShapeKey) => void;
  onFill: (f: ButtonFillKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label className="label" htmlFor="button-shape">
          Shape
        </label>
        <Select
          id="button-shape"
          className="w-36"
          value={shape}
          onChange={(v) => onShape(v as ButtonShapeKey)}
          options={(Object.keys(BUTTON_SHAPES) as ButtonShapeKey[]).map((k) => ({
            value: k,
            label: BUTTON_SHAPES[k].label,
          }))}
        />
      </div>
      <div>
        <label className="label" htmlFor="button-fill">
          Style
        </label>
        <Select
          id="button-fill"
          className="w-36"
          value={fill}
          onChange={(v) => onFill(v as ButtonFillKey)}
          options={(["fill", "outline"] as ButtonFillKey[]).map((k) => ({
            value: k,
            label: BUTTON_FILL_LABELS[k],
          }))}
        />
      </div>
    </div>
  );
}

function AccentPicker({
  theme,
  accent,
  warning,
  onChange,
}: {
  theme: string;
  accent: string | undefined;
  warning: string | null;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="accent-picker">
          Accent
        </label>
        <div className="flex items-center gap-2">
          <input
            id="accent-picker"
            type="color"
            className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent"
            value={accent ?? pageTheme(theme).accent}
            onChange={(e) => onChange(e.target.value)}
          />
          {accent && (
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => onChange(undefined)}
            >
              <ArrowCounterClockwise size={13} weight="bold" />
              Reset
            </button>
          )}
        </div>
        <p className="hint">
          Used for the buy button and the glow behind your photo.
        </p>
      </div>

      {/* Deliberately NOT role="alert": the save bar renders this same sentence
          and owns the announcement. Two live regions with identical text means a
          screen reader says it twice. This copy is here for the sighted creator
          who has the picker open and wants the reason beside the control they
          are dragging, not as a second announcement of the same fact. */}
      {warning && <p className="text-sm text-danger">{warning}</p>}
    </div>
  );
}
