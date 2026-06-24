/**
 * Style cascade resolvers for the five-layer presentation inheritance.
 * Pure and DOM-free — fully testable under node --test.
 * Used by SlideCanvas and deck-export.
 */

import type { Deck, Slide, TextElementStyle } from "./deck";
import type {
  BackgroundTreatment,
  DeckTextRole,
  DeckThemeTokenSet,
  MasterSlide,
} from "./deck-theme-tokens";
import {
  backgroundTreatmentToCss,
  resolveRoleToken,
  resolveSlideBackground,
  resolveThemeTokens,
} from "./deck-theme-tokens";

export interface ResolvedSlideStyle {
  background: BackgroundTreatment;
  backgroundCss: string;
  accent: string;
  titleColor: string;
  bodyColor: string;
  mutedColor: string;
  headingFontFamily: string;
  bodyFontFamily: string;
  master?: MasterSlide;
  footerText?: string;
  showPageNumbers: boolean;
  logoUrl?: string;
  logoPlacement?: string;
  tokenSet: DeckThemeTokenSet;
}

/** Resolves the token set for a deck, checking customTokenSet first. */
function resolveTokenSet(deck: Deck): DeckThemeTokenSet {
  if (deck.customTokenSet) return deck.customTokenSet;
  return resolveThemeTokens(deck.themeId ?? deck.theme);
}

/**
 * Resolves the master for a slide.
 * Falls back: masterRef → deck.masters[0] → undefined.
 */
export function resolveMaster(
  deck: Deck,
  slide: Slide,
): MasterSlide | undefined {
  if (!deck.masters || deck.masters.length === 0) return undefined;
  if (slide.masterRef) {
    return deck.masters.find((m) => m.id === slide.masterRef);
  }
  return deck.masters[0];
}

/**
 * Resolves the complete style for a slide, applying the five-layer cascade:
 * deck tokens → master → slide overrides.
 */
export function resolveSlideStyle(
  deck: Deck,
  slide: Slide,
): ResolvedSlideStyle {
  const tokenSet = resolveTokenSet(deck);
  const master = resolveMaster(deck, slide);

  const background = resolveSlideBackground(tokenSet, {
    masterBackground: master?.background,
    slideBackground: slide.background,
    slideBackgroundGradient: slide.backgroundGradient,
    slideBackgroundImage: slide.backgroundImage,
  });

  const accent = slide.accent ?? tokenSet.colors.accent;
  const titleColor = tokenSet.colors.onBg;
  const bodyColor = tokenSet.colors.onBg;
  const mutedColor = tokenSet.colors.muted;
  const headingFontFamily =
    tokenSet.typography.headingFontFamily ?? tokenSet.typography.fontFamily;
  const bodyFontFamily = tokenSet.typography.fontFamily;

  return {
    background,
    backgroundCss: backgroundTreatmentToCss(background),
    accent,
    titleColor,
    bodyColor,
    mutedColor,
    headingFontFamily,
    bodyFontFamily,
    ...(master !== undefined ? { master } : {}),
    ...(master?.footerText !== undefined
      ? { footerText: master.footerText }
      : {}),
    showPageNumbers: master?.showPageNumbers ?? false,
    ...(master?.logoUrl !== undefined ? { logoUrl: master.logoUrl } : {}),
    ...(master?.logoPlacement !== undefined
      ? { logoPlacement: master.logoPlacement }
      : {}),
    tokenSet,
  };
}

/**
 * Renders the footer text for a specific slide, replacing {{pageNumber}}
 * with the 1-based slide index.
 */
export function renderFooterText(template: string, slideIndex: number): string {
  return template.replace(/\{\{pageNumber\}\}/g, String(slideIndex + 1));
}

// ---------------------------------------------------------------------------
// Slide theme colours for the shared renderer (#609)
// ---------------------------------------------------------------------------

/** The flat colour set the slide renderer needs for one slide. */
export interface SlideThemeColors {
  bgColor: string;
  accentColor: string;
  titleColor: string;
  bodyColor: string;
  mutedColor: string;
}

/**
 * Resolves the renderer's slide colours from the deck token cascade (#609).
 * A full {@link Deck} carries master / custom-token context; when absent a
 * minimal deck is synthesised from the slide's own `theme` so present and
 * public viewers resolve the same palette as the editor instead of a legacy
 * fallback. The background colour collapses a gradient to its `from` stop and
 * an image background to the token-set's `slideBg`.
 */
export function resolveSlideThemeColors(
  deck: Deck | undefined,
  slide: Slide,
): SlideThemeColors {
  const effectiveDeck: Deck = deck ?? {
    theme: slide.theme,
    themeId: slide.theme,
    slides: [slide],
  };
  const r = resolveSlideStyle(effectiveDeck, slide);
  const bgColor =
    r.background.type === "solid"
      ? r.background.color
      : r.background.type === "gradient"
        ? r.background.from
        : r.tokenSet.colors.slideBg;
  return {
    bgColor,
    accentColor: r.accent,
    titleColor: r.titleColor,
    bodyColor: r.bodyColor,
    mutedColor: r.mutedColor,
  };
}

// ---------------------------------------------------------------------------
// Resolved text / bullet / shape-label styles (#602)
// ---------------------------------------------------------------------------

/** Which cascade layer supplied a resolved value (for inspector UI). */
export type StyleOrigin = "deck" | "layout" | "slide" | "element";

/** Fields a {@link ResolvedTextStyle} tracks origin for. */
export type TextStyleField =
  | "fontFamily"
  | "fontSize"
  | "color"
  | "weight"
  | "italic"
  | "underline"
  | "align"
  | "lineHeight"
  | "paragraphSpacing";

/**
 * Final, render/export-ready text style resolved from the deck template role
 * token plus local element overrides.  `fontSize` is in points (the role-token
 * unit), so this is the authoritative typography for export specs; the editor
 * canvas continues to use the element's existing percent-based `style` until
 * fully migrated.
 */
export interface ResolvedTextStyle {
  fontFamily: string;
  /** Point size (role-token unit). */
  fontSize: number;
  color: string;
  /** Numeric weight (100–900). */
  weight: number;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  lineHeight?: number;
  paragraphSpacing?: number;
  /**
   * The role this style resolved from, after applying per-kind defaults for
   * elements that opt into template inheritance without naming a role.
   */
  role: DeckTextRole;
  /** Per-field origin: which cascade layer supplied each value. */
  origin: Record<TextStyleField, StyleOrigin>;
}

/** Default semantic role per text-bearing element kind (#605). */
const ELEMENT_DEFAULT_ROLE = {
  title: "h1",
  body: "body",
  bullet: "bullet",
  shapeLabel: "shapeLabel",
} as const;

/**
 * Core resolver: merges a deck-template role token with an optional local
 * `Partial<TextElementStyle>` override, tracking per-field origin.
 *
 * Override semantics (#605): a present override field wins (`origin: element`);
 * an absent field inherits the role token value (`origin: deck`). Because
 * {@link TextElementStyle} carries `bold` rather than a numeric weight, a
 * present `bold` maps to weight 700 (true) / 400 (false).
 */
export function resolveRoleTextStyle(
  tokenSet: DeckThemeTokenSet,
  role: DeckTextRole,
  override?: Partial<TextElementStyle>,
): ResolvedTextStyle {
  const token = resolveRoleToken(tokenSet, role);
  const o = override ?? {};
  const origin = {} as Record<TextStyleField, StyleOrigin>;

  let fontFamily: string;
  if (o.fontFamily !== undefined) {
    fontFamily = o.fontFamily;
    origin.fontFamily = "element";
  } else {
    fontFamily = token.fontFamily ?? tokenSet.typography.fontFamily;
    origin.fontFamily = "deck";
  }

  let fontSize: number;
  if (o.fontSize !== undefined) {
    fontSize = o.fontSize;
    origin.fontSize = "element";
  } else {
    fontSize = token.fontSize;
    origin.fontSize = "deck";
  }

  let color: string;
  if (o.color !== undefined) {
    color = o.color;
    origin.color = "element";
  } else {
    color = token.color;
    origin.color = "deck";
  }

  let weight: number;
  if (o.bold !== undefined) {
    weight = o.bold ? 700 : 400;
    origin.weight = "element";
  } else {
    weight = token.weight;
    origin.weight = "deck";
  }

  let italic: boolean;
  if (o.italic !== undefined) {
    italic = o.italic;
    origin.italic = "element";
  } else {
    italic = token.italic ?? false;
    origin.italic = "deck";
  }

  let underline: boolean;
  if (o.underline !== undefined) {
    underline = o.underline;
    origin.underline = "element";
  } else {
    underline = token.underline ?? false;
    origin.underline = "deck";
  }

  let align: "left" | "center" | "right";
  if (o.align !== undefined) {
    align = o.align;
    origin.align = "element";
  } else {
    align = token.align ?? "left";
    origin.align = "deck";
  }

  let lineHeight: number | undefined;
  if (o.lineHeight !== undefined) {
    lineHeight = o.lineHeight;
    origin.lineHeight = "element";
  } else {
    lineHeight = token.lineHeight;
    origin.lineHeight = "deck";
  }

  let paragraphSpacing: number | undefined;
  if (o.paragraphSpacing !== undefined) {
    paragraphSpacing = o.paragraphSpacing;
    origin.paragraphSpacing = "element";
  } else {
    paragraphSpacing = token.paragraphSpacing;
    origin.paragraphSpacing = "deck";
  }

  return {
    fontFamily,
    fontSize,
    color,
    weight,
    italic,
    underline,
    align,
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(paragraphSpacing !== undefined ? { paragraphSpacing } : {}),
    role,
    origin,
  };
}

/** Element shape accepted by the text-bearing resolvers (kind-agnostic). */
interface TextBearingElementLike {
  textRole?: DeckTextRole;
  styleOverride?: Partial<TextElementStyle>;
}

/**
 * Resolves the final style for a `text` element. The role comes from
 * `element.textRole`, falling back to the deck role for the element's legacy
 * `role` (`title` → `h1`, `body` → `body`).
 */
export function resolveTextElementStyle(
  deck: Deck,
  element: TextBearingElementLike & { role: "title" | "body" },
): ResolvedTextStyle {
  const tokenSet = resolveTokenSet(deck);
  const role: DeckTextRole =
    element.textRole ?? ELEMENT_DEFAULT_ROLE[element.role];
  return resolveRoleTextStyle(tokenSet, role, element.styleOverride);
}

/**
 * Resolves the final style for a `bullets` element, defaulting to the
 * `"bullet"` role when none is named.
 */
export function resolveBulletsElementStyle(
  deck: Deck,
  element: TextBearingElementLike,
): ResolvedTextStyle {
  const tokenSet = resolveTokenSet(deck);
  const role: DeckTextRole = element.textRole ?? ELEMENT_DEFAULT_ROLE.bullet;
  return resolveRoleTextStyle(tokenSet, role, element.styleOverride);
}

/**
 * Resolves the final style for a shape label, defaulting to the
 * `"shapeLabel"` role. Shape labels carry their override on
 * `textStyleOverride` rather than `styleOverride`.
 */
export function resolveShapeLabelStyle(
  deck: Deck,
  element: {
    textRole?: DeckTextRole;
    textStyleOverride?: Partial<TextElementStyle>;
  },
): ResolvedTextStyle {
  const tokenSet = resolveTokenSet(deck);
  const role: DeckTextRole =
    element.textRole ?? ELEMENT_DEFAULT_ROLE.shapeLabel;
  return resolveRoleTextStyle(tokenSet, role, element.textStyleOverride);
}
