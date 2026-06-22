/**
 * Deck theme token schema — pure types and constants.
 *
 * This module defines the `DeckThemeTokenSet` and companion types that make up
 * Layer 1 of the five-layer styling cascade described in
 * `docs/architecture/theme-layout-architecture.md`.
 *
 * Design constraints:
 *  - No DOM, no React, no browser APIs — fully testable under `node --test`.
 *  - Types only for structural data; constants for built-in token sets and
 *    helpers for resolving the cascade at runtime.
 *  - Compatible with existing `DeckTheme` / `themeId` fields on `Deck`.
 *
 * Cascade summary (outermost → innermost):
 *   Deck theme tokens → master slide → layout → slide override → element override
 */

import type { DeckTheme } from "@/lib/presentation/deck";
import { type FontScale } from "@/lib/presentation/theme-typography";

// ---------------------------------------------------------------------------
// Color tokens
// ---------------------------------------------------------------------------

/**
 * Semantic slide color tokens.
 *
 * All values are hex strings (`"#rrggbb"` or `"#rrggbbaa"`).  Names are
 * intentionally role-based rather than hue-based so token consumers can swap
 * palettes without touching rendering code.
 */
export type ColorToken = {
  /** Background fill of the slide canvas. */
  slideBg: string;
  /** Primary surface color used for card fills, callout boxes, etc. */
  surface: string;
  /** Default brand/accent color for shapes, links, chart highlights. */
  accent: string;
  /** Default foreground color for body text on `slideBg`. */
  onBg: string;
  /** Foreground color for text/icons on `surface`. */
  onSurface: string;
  /** Foreground color for text/icons on `accent`. */
  onAccent: string;
  /** Secondary/muted text and label color. */
  muted: string;
};

// ---------------------------------------------------------------------------
// Typography tokens — re-exported from theme-typography for cohesion
// ---------------------------------------------------------------------------

export type { FontScale } from "@/lib/presentation/theme-typography";

/**
 * Typography token bundle for one theme.  Mirrors `ThemeTypography` from
 * `theme-typography.ts` but is co-located here so token consumers have a
 * single import point.
 */
export type TypographyToken = {
  /** Body / general text font stack. */
  fontFamily: string;
  /** Heading font stack.  Falls back to `fontFamily` when absent. */
  headingFontFamily?: string;
  /** Point sizes for each semantic text role. */
  scale: FontScale;
};

// ---------------------------------------------------------------------------
// Spacing tokens
// ---------------------------------------------------------------------------

/** Slide-level spacing tokens (stored in points, 1 pt = 1/72 in). */
export type SpacingToken = {
  /** Inner padding from each edge of the slide canvas in points. */
  slidePaddingPt: number;
  /** Base snap-grid unit used by the layout engine in points. */
  gridUnitPt: number;
};

// ---------------------------------------------------------------------------
// Shape tokens
// ---------------------------------------------------------------------------

/** Default visual style for shapes that have no explicit style override. */
export type ShapeToken = {
  /** Corner radius for rectangle/card shapes in points. */
  cornerRadiusPt: number;
  /**
   * CSS `box-shadow` value used for floating / elevated elements.
   * Set to `"none"` to suppress shadows by default.
   */
  shadowCss: string;
};

// ---------------------------------------------------------------------------
// Background treatment
// ---------------------------------------------------------------------------

/**
 * Typed union representing the three supported background modes for a slide or
 * master.  A renderer inspects `type` and reads the corresponding fields.
 *
 * Corresponds to the existing `Slide.background` / `Slide.backgroundGradient` /
 * `Slide.backgroundImage` fields; this union is the normalized form used at
 * the token / master layer.
 */
export type BackgroundTreatment =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string; angle?: number }
  | { type: "image"; url: string };

// ---------------------------------------------------------------------------
// Complete token set
// ---------------------------------------------------------------------------

/**
 * A complete design-token bundle for one named theme.  Built-in sets are
 * exported below; custom sets can be created at runtime by brand-kit tooling.
 */
export type DeckThemeTokenSet = {
  /** Stable id.  Matches the `DeckTheme` / `themeId` value used on `Deck`. */
  id: string;
  /** Display name shown in the theme picker UI. */
  name: string;
  colors: ColorToken;
  typography: TypographyToken;
  spacing: SpacingToken;
  shape: ShapeToken;
  /** Default background applied when no slide- or master-level override exists. */
  defaultBackground: BackgroundTreatment;
};

// ---------------------------------------------------------------------------
// Master slide
// ---------------------------------------------------------------------------

/** Corner anchor for the logo overlay. */
export type LogoPlacement =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/**
 * Master-slide record stored in `Deck.masters`.
 *
 * A master controls structural chrome that appears on every slide assigned to
 * it — background, logo, footer, and page number.  One deck may carry multiple
 * masters (e.g., a title master and a content master).
 *
 * Cascade position: master fields narrow the token-set defaults before layout
 * and slide-level overrides are applied.
 */
export type MasterSlide = {
  /** Stable id referenced by `Slide.masterRef`. */
  id: string;
  /** Display name (e.g., "Title", "Content", "Section"). */
  name: string;
  /** Id of the `DeckThemeTokenSet` this master inherits from. */
  themeId: string;
  /**
   * Optional background override applied to every slide that uses this master.
   * When absent the master inherits `DeckThemeTokenSet.defaultBackground`.
   */
  background?: BackgroundTreatment;
  /** Show slide page numbers on all slides using this master. Default false. */
  showPageNumbers: boolean;
  /** Brand logo image URL rendered in the `logoPlacement` corner. */
  logoUrl?: string;
  /** Corner anchor for the logo.  Required when `logoUrl` is set. */
  logoPlacement?: LogoPlacement;
  /**
   * Global footer text.  Supports the `{{pageNumber}}` placeholder token
   * which the renderer replaces with the 1-based slide index at render time.
   */
  footerText?: string;
};

// ---------------------------------------------------------------------------
// Override layer tag (documentation / type narrowing helper)
// ---------------------------------------------------------------------------

/**
 * Tags the five cascade layers.  Useful for functions that accept a resolved
 * value annotated with its origin, e.g. for a "where does this color come from?"
 * inspector in the editor.
 */
export type OverrideLayer = "deck" | "master" | "layout" | "slide" | "element";

// ---------------------------------------------------------------------------
// Built-in token sets
// ---------------------------------------------------------------------------

const DEFAULT_SPACING: SpacingToken = { slidePaddingPt: 36, gridUnitPt: 6 };
const DEFAULT_SHAPE: ShapeToken = { cornerRadiusPt: 4, shadowCss: "none" };

/**
 * Built-in `DeckThemeTokenSet` definitions.  Keyed by `DeckTheme` / `themeId`
 * so they can be looked up with `resolveThemeTokens`.
 *
 * Color values are drawn from the same palette used in `src/lib/visual/themes.ts`
 * to keep visual-content and slide-background colors harmonious.
 */
export const BUILT_IN_TOKEN_SETS: readonly DeckThemeTokenSet[] = [
  {
    id: "default",
    name: "Default",
    colors: {
      slideBg: "#ffffff",
      surface: "#f1f5f9",
      accent: "#6366f1",
      onBg: "#0f172a",
      onSurface: "#1e293b",
      onAccent: "#ffffff",
      muted: "#64748b",
    },
    typography: {
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
    },
    spacing: DEFAULT_SPACING,
    shape: DEFAULT_SHAPE,
    defaultBackground: { type: "solid", color: "#ffffff" },
  },
  {
    id: "indigo",
    name: "Indigo",
    colors: {
      slideBg: "#ffffff",
      surface: "#eef2ff",
      accent: "#4f46e5",
      onBg: "#1e1b4b",
      onSurface: "#312e81",
      onAccent: "#ffffff",
      muted: "#6366f1",
    },
    typography: {
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      headingFontFamily:
        "Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif",
      scale: { h1: 38, h2: 30, h3: 24, body: 16, list: 14, footer: 10 },
    },
    spacing: DEFAULT_SPACING,
    shape: { cornerRadiusPt: 6, shadowCss: "none" },
    defaultBackground: { type: "solid", color: "#ffffff" },
  },
  {
    id: "ocean",
    name: "Ocean",
    colors: {
      slideBg: "#f6fbff",
      surface: "#e0f2fe",
      accent: "#0284c7",
      onBg: "#0c4a6e",
      onSurface: "#075985",
      onAccent: "#ffffff",
      muted: "#0ea5e9",
    },
    typography: {
      fontFamily: "Avenir Next, Inter, ui-sans-serif, system-ui, sans-serif",
      scale: { h1: 38, h2: 30, h3: 24, body: 16, list: 14, footer: 10 },
    },
    spacing: DEFAULT_SPACING,
    shape: DEFAULT_SHAPE,
    defaultBackground: { type: "solid", color: "#f6fbff" },
  },
  {
    id: "forest",
    name: "Forest",
    colors: {
      slideBg: "#f6fdf8",
      surface: "#dcfce7",
      accent: "#16a34a",
      onBg: "#14532d",
      onSurface: "#166534",
      onAccent: "#ffffff",
      muted: "#22c55e",
    },
    typography: {
      fontFamily: "Trebuchet MS, Inter, ui-sans-serif, system-ui, sans-serif",
      scale: { h1: 36, h2: 28, h3: 22, body: 16, list: 14, footer: 10 },
    },
    spacing: DEFAULT_SPACING,
    shape: DEFAULT_SHAPE,
    defaultBackground: { type: "solid", color: "#f6fdf8" },
  },
  {
    id: "sunset",
    name: "Sunset",
    colors: {
      slideBg: "#fffaf5",
      surface: "#ffedd5",
      accent: "#ea580c",
      onBg: "#431407",
      onSurface: "#7c2d12",
      onAccent: "#ffffff",
      muted: "#f97316",
    },
    typography: {
      fontFamily: "Georgia, ui-serif, serif",
      headingFontFamily:
        "Avenir Next, Inter, ui-sans-serif, system-ui, sans-serif",
      scale: { h1: 40, h2: 32, h3: 24, body: 17, list: 15, footer: 10 },
    },
    spacing: DEFAULT_SPACING,
    shape: { cornerRadiusPt: 2, shadowCss: "none" },
    defaultBackground: { type: "solid", color: "#fffaf5" },
  },
  {
    id: "grape",
    name: "Grape",
    colors: {
      slideBg: "#fdf7ff",
      surface: "#f3e8ff",
      accent: "#9333ea",
      onBg: "#3b0764",
      onSurface: "#581c87",
      onAccent: "#ffffff",
      muted: "#a855f7",
    },
    typography: {
      fontFamily: "Avenir Next, Inter, ui-sans-serif, system-ui, sans-serif",
      headingFontFamily:
        "Trebuchet MS, Inter, ui-sans-serif, system-ui, sans-serif",
      scale: { h1: 40, h2: 30, h3: 24, body: 16, list: 14, footer: 10 },
    },
    spacing: DEFAULT_SPACING,
    shape: { cornerRadiusPt: 8, shadowCss: "none" },
    defaultBackground: { type: "solid", color: "#fdf7ff" },
  },
];

/** Lookup map: token-set id → `DeckThemeTokenSet`. */
const TOKEN_SET_BY_ID: ReadonlyMap<string, DeckThemeTokenSet> = new Map(
  BUILT_IN_TOKEN_SETS.map((ts) => [ts.id, ts]),
);

/** The fallback token set used when `themeId` is absent or unrecognised. */
export const DEFAULT_TOKEN_SET: DeckThemeTokenSet =
  TOKEN_SET_BY_ID.get("default")!;

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/**
 * Returns the `DeckThemeTokenSet` for a given `themeId` / `DeckTheme` value.
 * Falls back to {@link DEFAULT_TOKEN_SET} for unknown or absent ids.
 *
 * This is the primary entry point for renderers and exporters to access the
 * token cascade without directly importing the constant array.
 */
export function resolveThemeTokens(themeId?: string | null): DeckThemeTokenSet {
  if (!themeId) return DEFAULT_TOKEN_SET;
  return TOKEN_SET_BY_ID.get(themeId) ?? DEFAULT_TOKEN_SET;
}

/**
 * Returns the resolved `BackgroundTreatment` for a slide, applying the
 * cascade: slide background image → slide overrides → master background →
 * deck theme default background.
 *
 * Accepts the three existing per-slide fields as optional parameters so
 * callers do not need to construct a `BackgroundTreatment` union themselves.
 */
export function resolveSlideBackground(
  tokenSet: DeckThemeTokenSet,
  options: {
    masterBackground?: BackgroundTreatment;
    slideBackground?: string;
    slideBackgroundGradient?: { from: string; to: string; angle?: number };
    slideBackgroundImage?: string;
  } = {},
): BackgroundTreatment {
  const {
    masterBackground,
    slideBackground,
    slideBackgroundGradient,
    slideBackgroundImage,
  } = options;

  if (slideBackgroundImage) {
    return { type: "image", url: slideBackgroundImage };
  }
  if (slideBackgroundGradient) {
    return {
      type: "gradient",
      from: slideBackgroundGradient.from,
      to: slideBackgroundGradient.to,
      angle: slideBackgroundGradient.angle,
    };
  }
  if (slideBackground) {
    return { type: "solid", color: slideBackground };
  }
  return masterBackground ?? tokenSet.defaultBackground;
}

/**
 * Returns a CSS `background` shorthand string from a `BackgroundTreatment`.
 * Suitable for use as an inline `style.background` value in the renderer.
 */
export function backgroundTreatmentToCss(bg: BackgroundTreatment): string {
  switch (bg.type) {
    case "solid":
      return bg.color;
    case "gradient": {
      const angle = bg.angle ?? 135;
      return `linear-gradient(${angle}deg, ${bg.from}, ${bg.to})`;
    }
    case "image":
      return `url(${JSON.stringify(bg.url)}) center / cover no-repeat`;
  }
}

/**
 * Looks up the built-in token set for each registered `DeckTheme` and returns
 * the result.  Useful for migration tooling that needs to enumerate all themes.
 */
export function allThemeTokenSets(): DeckThemeTokenSet[] {
  return [...BUILT_IN_TOKEN_SETS];
}

/**
 * Returns `true` when `id` matches one of the built-in token sets.
 * Helps validators distinguish known ids from custom/brand-kit ids.
 */
export function isBuiltInTheme(id: string): id is DeckTheme {
  return TOKEN_SET_BY_ID.has(id);
}
