import type { PageFontKey, ThemeConfig } from "@/lib/types";

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
  return style as React.CSSProperties;
}

export const PAGE_FONT_LABELS: Record<PageFontKey, string> = {
  sans: "Sans",
  serif: "Serif",
};
