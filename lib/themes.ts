import type {
  ButtonFillKey,
  ButtonShapeKey,
  PageFontKey,
  ThemeConfig,
  Wallpaper,
} from "@/lib/types";

/**
 * Page themes for the public creator page.
 *
 * The hex here is duplicated in the [data-page-theme] blocks in globals.css.
 * That is deliberate: the CSS is what paints (static, no per-request style
 * object, no FOUC), and this registry is what the editor's swatches and the
 * <meta name="theme-color"> tag read. Keep the two in sync; `default` must
 * stay byte-identical to the app's existing dark tokens so that every creator
 * who has never opened the editor sees no change at all.
 *
 * Every fg/bg pair below is verified against WCAG AA (4.5:1 body, 3:1 large
 * and non-text). Do not add a preset without checking it.
 */
export type PageThemeId = "default" | "mocha" | "forest" | "cobalt" | "paper";

export const PAGE_THEME_IDS = [
  "default",
  "mocha",
  "forest",
  "cobalt",
  "paper",
] as const satisfies readonly PageThemeId[];

export interface PageTheme {
  id: PageThemeId;
  label: string;
  /** Drives <meta name="theme-color"> and the editor swatch. */
  bg: string;
  fg: string;
  accent: string;
  pillBg: string;
  /** Whether the canvas is light. Drives color-scheme on the public route. */
  light: boolean;
}

export const PAGE_THEMES: Record<PageThemeId, PageTheme> = {
  default: {
    id: "default",
    label: "Qlink dark",
    bg: "#0a0a0c",
    fg: "#f4f4f5",
    accent: "#c5f24e",
    pillBg: "#141418",
    light: false,
  },
  mocha: {
    id: "mocha",
    label: "Mocha",
    bg: "#6f4a3c",
    fg: "#ffffff",
    accent: "#f0a868",
    pillBg: "#ffffff",
    light: false,
  },
  forest: {
    id: "forest",
    label: "Forest",
    bg: "#1e3a2f",
    fg: "#f2efe6",
    accent: "#e8b04b",
    pillBg: "#f2efe6",
    light: false,
  },
  cobalt: {
    id: "cobalt",
    label: "Cobalt",
    bg: "#1b3a8f",
    fg: "#ffffff",
    accent: "#ffd166",
    pillBg: "#f4f1e8",
    light: false,
  },
  paper: {
    id: "paper",
    label: "Paper",
    bg: "#f4f2ed",
    fg: "#17161a",
    accent: "#17161a",
    pillBg: "#17161a",
    light: true,
  },
};

export const DEFAULT_PAGE_THEME: PageThemeId = "default";

export function isPageThemeId(v: unknown): v is PageThemeId {
  return typeof v === "string" && v in PAGE_THEMES;
}

/** Falls back rather than throwing: a page must render even if the column
 *  holds something unexpected. */
export function pageTheme(id: string | null | undefined): PageTheme {
  return isPageThemeId(id) ? PAGE_THEMES[id] : PAGE_THEMES[DEFAULT_PAGE_THEME];
}

// ---------------------------------------------------------------------------
// Contrast. Creators can override the accent with any hex, so this is the gate
// that stops an unreadable page from being saved.
// ---------------------------------------------------------------------------

/** WCAG 2.x relative luminance. Expects #rrggbb (validated by hexColorSchema). */
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((x) =>
    x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const INK = "#241812";
const PAPER = "#ffffff";

/**
 * The label colour to put ON a given background.
 *
 * Motivated: a fixed luminance threshold (the usual `L > 0.45 ? dark : light`)
 * picks the LESS readable option across a wide middle band. Comparing the two
 * actual ratios is the same amount of code and is always right.
 */
export function readableOn(bg: string): string {
  return contrastRatio(INK, bg) >= contrastRatio(PAPER, bg) ? INK : PAPER;
}

/** A custom accent must be findable against the canvas it sits on (1.4.11,
 *  3:1 for a non-text control boundary) and must carry a readable label. */
export function accentIsUsable(
  accent: string,
  themeId: string,
): { ok: true } | { ok: false; reason: string } {
  const theme = pageTheme(themeId);
  const vsBg = contrastRatio(accent, theme.bg);
  if (vsBg < 3) {
    return {
      ok: false,
      reason: `That colour is too close to the ${theme.label} background to see (${vsBg.toFixed(1)}:1, needs 3:1). Try something lighter or darker.`,
    };
  }
  const label = readableOn(accent);
  const vsLabel = contrastRatio(label, accent);
  if (vsLabel < 4.5) {
    return {
      ok: false,
      reason: `Button text would not be readable on that colour (${vsLabel.toFixed(1)}:1, needs 4.5:1).`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/**
 * Button shape and fill are FIXED ENUMS, so they are painted by CSS attribute
 * blocks ([data-page-shape], [data-page-buttons]) rather than by the inline
 * style below — the same split the font already uses. The rule: a value the
 * creator picks from a list belongs in the stylesheet, a value they author
 * (a hex, a URL) has to be inline because CSS cannot enumerate it.
 *
 * The radius here is duplicated in globals.css for the same reason the theme
 * hex is: CSS paints, and this registry is only what the picker's labels and
 * swatches read. Keep them in sync.
 */
export const BUTTON_SHAPES: Record<
  ButtonShapeKey,
  { label: string; radius: string }
> = {
  pill: { label: "Pill", radius: "9999px" },
  rounded: { label: "Rounded", radius: "0.9rem" },
  sharp: { label: "Sharp", radius: "0" },
};

export const BUTTON_FILL_LABELS: Record<ButtonFillKey, string> = {
  fill: "Fill",
  outline: "Outline",
};

export const DEFAULT_BUTTON_SHAPE: ButtonShapeKey = "pill";
export const DEFAULT_BUTTON_FILL: ButtonFillKey = "fill";

export function isButtonShape(v: unknown): v is ButtonShapeKey {
  return typeof v === "string" && v in BUTTON_SHAPES;
}

export function isButtonFill(v: unknown): v is ButtonFillKey {
  return v === "fill" || v === "outline";
}

// ---------------------------------------------------------------------------
// Wallpaper
// ---------------------------------------------------------------------------

/**
 * Fallback scrim for a stored photo that somehow has none.
 *
 * NOT what the picker starts at: that is scrimForAA(theme), which is derived
 * per preset and lands between 53% and 79%. This constant only backstops
 * wallpaperSchema when a payload arrives without the field, so it wants to be a
 * defensible middle rather than a number anyone actually chose.
 */
export const DEFAULT_SCRIM = 0.6;

export const WALLPAPER_KIND_LABELS = {
  fill: "Fill",
  gradient: "Gradient",
  image: "Photo",
} as const;

/**
 * A wallpaper as a CSS `background-image` value, or null for "the preset's flat
 * colour", which is what --page-bg already paints.
 *
 * All three kinds collapse to ONE token (--page-wallpaper) on purpose: a solid
 * fill is a two-stop gradient of the same colour, which costs nothing and means
 * the renderer has a single code path instead of a switch that has to be kept
 * in step with this one.
 *
 * The url() is why wallpaperUrlSchema exists. This value is set through a React
 * style object (i.e. via CSSOM, which cannot break out of the property) and the
 * URL is prefix-checked and quote-checked before it is ever stored, so there
 * are two independent guards between a creator and this string.
 */
export function wallpaperCss(w: Wallpaper | undefined): string | null {
  if (!w) return null;
  switch (w.kind) {
    case "fill":
      return `linear-gradient(${w.color}, ${w.color})`;
    case "gradient":
      return `linear-gradient(${w.angle}deg, ${w.color}, ${w.color2})`;
    case "image":
      return `url("${w.url}")`;
  }
}

/**
 * How readable the page's OWN text is over a photo, as a ratio, assuming the
 * worst case an arbitrary photo can force.
 *
 * A scrim of the theme's bg at alpha `a` over an unknown photo composites to
 * `a*bg + (1-a)*photo` per channel. The photo is arbitrary, so `photo` ranges
 * over the whole cube and the composite can land anywhere on the segment from
 * `over(0)` to `over(1)`.
 *
 * The subtlety, and the reason this is not a two-point check: the worst case is
 * INSIDE that segment, not at its ends. Contrast against a fixed text colour is
 * a V — it bottoms out at 1:1 where the backdrop's luminance equals the text's
 * — so testing only a white photo and a black photo reports whichever end
 * happens to be nearer and misses the photo that matches the text exactly. That
 * reads as a comfortable 2.9:1 at the scrim creators actually use, when the
 * honest answer is 1:1: a light photo with a near-white patch behind near-white
 * text is invisible, and it is a completely ordinary photo.
 *
 * Advisory ONLY. Unlike accentIsUsable this gates nothing: the product decision
 * is that a creator may put any photo behind any theme, including one we would
 * not call readable. This exists to tell the truth in the editor, not to refuse
 * a save. Kept next to the other contrast maths so the two cannot drift.
 */
export function scrimContrast(themeId: string, scrim: number): number {
  const theme = pageTheme(themeId);
  const a = Math.min(1, Math.max(0, scrim));
  // [r, g, b], 0..1, in that order.
  const bg = [0, 2, 4].map(
    (i) => parseInt(theme.bg.slice(1 + i, 3 + i), 16) / 255,
  );

  /** The scrim composited over a flat photo of the given channel value. */
  const over = (photo: number) =>
    "#" +
    bg
      .map((c) =>
        Math.round((a * c + (1 - a) * photo) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");

  const dark = over(0);
  const light = over(1);

  // Luminance along a convex blend is monotonic, so the reachable luminances
  // are exactly the interval between these two ends. If the text's own
  // luminance falls inside it, some photo drives the composite to match the
  // text and the text disappears.
  const fg = luminance(theme.fg);
  if (fg >= luminance(dark) && fg <= luminance(light)) return 1;

  return Math.min(contrastRatio(theme.fg, dark), contrastRatio(theme.fg, light));
}

/**
 * The lightest scrim that holds body text at AA (4.5:1) over ANY photo.
 *
 * This is what the Design page suggests and seeds a new photo with. It is a
 * suggestion and not a floor — the slider still goes to zero, deliberately.
 *
 * Scanned rather than solved: a closed form has to invert the sRGB transfer
 * curve per channel and then account for the interior worst case above, and one
 * hundred steps of a function this cheap is already finer than the slider moves.
 */
export function scrimForAA(themeId: string): number {
  for (let a = 0; a <= 100; a++) {
    if (scrimContrast(themeId, a / 100) >= 4.5) return a / 100;
  }
  // Unreachable for the shipped presets: a=1 is the preset's own fg on its own
  // bg, and every one of those is AA by construction. Falls back to fully opaque
  // rather than throwing, matching pageTheme's "a page must still render".
  return 1;
}

// ---------------------------------------------------------------------------
// Applying a theme
// ---------------------------------------------------------------------------

/**
 * Inline style for the page wrapper. Returns ONLY the creator's overrides;
 * the preset itself is painted by the [data-page-theme] block in globals.css.
 * An empty object when nothing is overridden, so the common case ships no
 * inline style at all.
 *
 * These values land in a React style object, which escapes them, and the hex
 * is regex-validated before it is ever stored. It is never interpolated into
 * a <style> tag.
 */
export function themeOverrideStyle(config: ThemeConfig): React.CSSProperties {
  const style: Record<string, string> = {};
  if (config.accent) {
    style["--page-accent"] = config.accent;
    style["--page-accent-fg"] = readableOn(config.accent);
  }

  const wallpaper = wallpaperCss(config.wallpaper);
  if (wallpaper) {
    style["--page-wallpaper"] = wallpaper;
    // Only a photo carries a scrim: there is nothing to see through a fill or a
    // gradient, so dimming one would just be a worse colour picker.
    if (config.wallpaper?.kind === "image") {
      style["--page-scrim"] = String(
        Math.min(1, Math.max(0, config.wallpaper.scrim)),
      );
    }
  }

  return style as React.CSSProperties;
}

export const PAGE_FONT_LABELS: Record<PageFontKey, string> = {
  sans: "Sans",
  serif: "Serif",
};
