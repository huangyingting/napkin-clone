/**
 * Maps a saved Brand (BrandStyle) into a DeckThemeTokenSet and optional
 * MasterSlide chrome. Extends deck-theme-tokens.ts without duplicating it.
 */

import type { BrandStyle } from "@/lib/brand/schema";
import type { DeckThemeTokenSet, MasterSlide } from "./deck-theme-tokens";
import { DEFAULT_TOKEN_SET } from "./deck-theme-tokens";
import type { Deck } from "./deck";

/**
 * Generates a custom DeckThemeTokenSet from a BrandStyle.
 * Falls back to DEFAULT_TOKEN_SET for any brand fields that are null/absent.
 */
export function brandToTokenSet(brand: BrandStyle): DeckThemeTokenSet {
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
  baseThemeId: string,
): MasterSlide {
  return {
    id: `master:${brand.id}`,
    name: `${brand.name} Master`,
    themeId: baseThemeId,
    showPageNumbers: false,
    ...(brand.logoUrl
      ? { logoUrl: brand.logoUrl, logoPlacement: "top-right" as const }
      : {}),
  };
}

/**
 * Applies a brand to a deck by:
 * 1. Setting deck.themeId to brand:<brand.id>
 * 2. Storing the computed token set in deck.customTokenSet
 * 3. Setting/replacing deck.masters[0] with brand chrome
 * 4. NOT touching slide.background, slide.accent, or element.style fields
 * Returns a new Deck (immutable).
 */
export function applyBrandToDeck(deck: Deck, brand: BrandStyle): Deck {
  const tokenSet = brandToTokenSet(brand);
  const masterChrome = brandToMasterChrome(brand, tokenSet.id);

  // Preserve existing masters beyond index 0, or start fresh
  const existingMasters = deck.masters ?? [];
  // Replace or insert the brand master at index 0
  const brandMasters = [
    masterChrome,
    ...existingMasters.filter((m) => m.id !== masterChrome.id),
  ];

  return {
    ...deck,
    themeId: tokenSet.id,
    customTokenSet: tokenSet,
    masters: brandMasters,
  };
}
