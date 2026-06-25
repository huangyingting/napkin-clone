/**
 * Style cascade layer resolvers for slide-level styles.
 *
 * Pure and DOM-free. The five cascade layers are deliberately documented here
 * because renderers/exporters depend on this order staying stable:
 *  1. deck token set — built-in or custom DeckThemeTokenSet.
 *  2. master slide — shared chrome/background for assigned slides.
 *  3. reusable layout — placeholder geometry/style defaults (reserved here;
 *     layout application materializes those defaults onto slide elements).
 *  4. slide override — Slide.background/accent/image/gradient fields.
 *  5. element override — handled by style-cascade-text for text-bearing nodes.
 *
 * Unit boundaries: this module returns CSS colors and CSS font stacks for
 * renderer use; export adapters convert slide percentages to inches and point
 * sizes at their own boundary.
 */

import type { Deck, Slide } from "./deck";
import type {
  BackgroundTreatment,
  DeckThemeTokenSet,
  MasterSlide,
} from "./deck-theme-tokens";
import {
  backgroundTreatmentToCss,
  resolveDeckThemeTokens,
  resolveSlideBackground,
} from "./deck-theme-tokens";

export const STYLE_CASCADE_LAYERS = [
  "deck",
  "master",
  "layout",
  "slide",
  "element",
] as const;

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
export function resolveDeckTokenSet(deck: Deck): DeckThemeTokenSet {
  return resolveDeckThemeTokens(deck);
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
  const tokenSet = resolveDeckTokenSet(deck);
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

/**
 * Resolves the {@link DeckThemeTokenSet} that governs a slide (#607). A full
 * deck is required because deck-level `themeId` / `customTokenSet` are the sole
 * theme source.
 */
export function resolveSlideTokenSet(
  deck: Deck,
  slide: Slide,
): DeckThemeTokenSet {
  return resolveSlideStyle(deck, slide).tokenSet;
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
 * A full {@link Deck} is required because deck-level `themeId` /
 * `customTokenSet` are the sole theme source. The background colour collapses a
 * gradient to its `from` stop and an image background to the token-set's
 * `slideBg`.
 */
export function resolveSlideThemeColors(
  deck: Deck,
  slide: Slide,
): SlideThemeColors {
  const r = resolveSlideStyle(deck, slide);
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
