/**
 * Style cascade resolvers for the five-layer presentation inheritance.
 * Pure and DOM-free — fully testable under node --test.
 * Used by SlideCanvas and deck-export.
 */

import type { Deck, Slide } from "./deck";
import type {
  BackgroundTreatment,
  DeckThemeTokenSet,
  MasterSlide,
} from "./deck-theme-tokens";
import {
  backgroundTreatmentToCss,
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
