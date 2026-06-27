/**
 * Dedicated adapter boundary for BrandStyle → presentation theme tokens/master chrome.
 *
 * Brand records describe user chrome/assets; PresentationTheme describes slide
 * rendering tokens. Keep the conversion here so brand persistence and visual
 * theme/display-style catalogs do not depend on deck token internals.
 */

import type { BrandStyle } from "@/lib/brand/schema";
import type { Deck, SlideMaster } from "./deck-core";
import type { PresentationTheme } from "./presentation-theme-types";
import { DEFAULT_TOKEN_SET } from "./presentation-theme-data";

/**
 * Generates a custom PresentationTheme from a BrandStyle.
 * Falls back to DEFAULT_TOKEN_SET for any brand fields that are null/absent.
 */
export function brandToTokenSet(brand: BrandStyle): PresentationTheme {
  const def = DEFAULT_TOKEN_SET;
  const accent = brand.nodeFill ?? brand.palette?.[0] ?? def.colors.accent;
  const bgColor = brand.background ?? def.colors.slideBg;
  const fontFamily = brand.fontFamily ?? def.typography.fontFamily;

  return {
    id: `brand:${brand.id}`,
    name: brand.name,
    colors: {
      slideBg: bgColor,
      surface: def.colors.surface,
      accent,
      onBg: def.colors.onBg,
      onSurface: def.colors.onSurface,
      onAccent: def.colors.onAccent,
      muted: def.colors.muted,
    },
    typography: {
      fontFamily,
      scale: def.typography.scale,
    },
    spacing: def.spacing,
    shape: def.shape,
    defaultBackground: { type: "solid", color: bgColor },
  };
}

/**
 * Generates a MasterSlide chrome record from a BrandStyle.
 */
export function brandToMasterChrome(
  brand: BrandStyle,
  _baseThemeId: string,
): SlideMaster {
  return {
    id: `master:${brand.id}`,
    name: `${brand.name} Master`,
    elements: [],
    ...(brand.background
      ? { background: { type: "solid", color: { value: brand.background } } }
      : {}),
    ...(brand.logoAssetUrl
      ? { logoUrl: brand.logoAssetUrl, logoPlacement: "top-right" as const }
      : {}),
  };
}

/**
 * Applies a brand to a deck by:
 * 1. Setting design.themeId to brand:<brand.id>
 * 2. Storing the computed token set in design.themeOverrides.tokenSet
 * 3. Setting/replacing deck.masters[0] with brand chrome
 * 4. NOT touching slide backgrounds, accents, or element overrides
 * Returns a new Deck (immutable).
 */
export function applyBrandToDeck(deck: Deck, brand: BrandStyle): Deck {
  const tokenSet = brandToTokenSet(brand);
  const masterChrome = brandToMasterChrome(brand, tokenSet.id);

  const existingMasters = deck.masters ?? [];
  const brandMasters = [
    masterChrome,
    ...existingMasters.filter((m) => m.id !== masterChrome.id),
  ];

  return {
    ...deck,
    design: {
      ...deck.design,
      themeId: tokenSet.id,
      themeOverrides: {
        ...(deck.design?.themeOverrides ?? {}),
        tokenSet,
      },
    },
    masters: brandMasters,
  };
}
