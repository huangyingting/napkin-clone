/**
 * Pure brand → Visual transforms (US-007 — Brand Studio).
 *
 * `applyBrand` maps a saved `BrandStyle` onto a `Visual` via the existing
 * `setVisualStyle` helper, preserving all node/edge content.  The function is
 * intentionally free of React/Lexical imports so it can be called from inside
 * `editor.update()` blocks and tested in isolation.
 */

import {
  DEFAULT_STYLE,
  type Visual,
  type VisualStyle,
} from "@/lib/visual/schema";
import { setVisualStyle } from "@/lib/visual/transforms";
import type { BrandStyle } from "@/lib/brand/schema";

/**
 * Converts a `BrandStyle` into the subset of `VisualStyle` fields it controls.
 * Fields absent from the brand (null) fall back to `DEFAULT_STYLE` so the
 * output is always a complete `VisualStyle` patch.
 */
export function brandToStylePatch(brand: BrandStyle): Partial<VisualStyle> {
  const patch: Partial<VisualStyle> = {};

  if (brand.palette !== null && brand.palette !== undefined) {
    patch.palette = brand.palette;
  }
  if (brand.background !== null) patch.background = brand.background;
  if (brand.nodeFill !== null) patch.nodeFill = brand.nodeFill;
  if (brand.nodeStroke !== null) patch.nodeStroke = brand.nodeStroke;
  if (brand.nodeText !== null) patch.nodeText = brand.nodeText;
  if (brand.edgeColor !== null) patch.edgeColor = brand.edgeColor;
  if (brand.fontFamily !== null) patch.fontFamily = brand.fontFamily;

  return patch;
}

/**
 * Applies a saved brand to a single visual.  Merges the brand's color/font
 * fields via `setVisualStyle` — typography (`fontSize`/`fontWeight`) and all
 * node/edge content (ids, labels, positions, icons) are never touched.
 *
 * Returns a fresh `Visual` — the input is never mutated.
 */
export function applyBrand(visual: Visual, brand: BrandStyle): Visual {
  const patch = brandToStylePatch(brand);
  if (Object.keys(patch).length === 0) {
    // Brand has no overrides; return unchanged clone via a no-op patch.
    return setVisualStyle(visual, {});
  }
  return setVisualStyle(visual, patch);
}

/**
 * Checks whether a visual's current style matches the given brand.
 * Compares only the brand-controlled fields (null brand fields are skipped).
 */
export function isBrandActive(visual: Visual, brand: BrandStyle): boolean {
  const { style } = visual;

  if (brand.background !== null && style.background !== brand.background)
    return false;
  if (brand.nodeFill !== null && style.nodeFill !== brand.nodeFill)
    return false;
  if (brand.nodeStroke !== null && style.nodeStroke !== brand.nodeStroke)
    return false;
  if (brand.nodeText !== null && style.nodeText !== brand.nodeText)
    return false;
  if (brand.edgeColor !== null && style.edgeColor !== brand.edgeColor)
    return false;
  if (brand.fontFamily !== null && style.fontFamily !== brand.fontFamily)
    return false;

  if (brand.palette !== null && brand.palette !== undefined) {
    if (
      style.palette.length !== brand.palette.length ||
      !style.palette.every((c, i) => c === brand.palette![i])
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Helper for the DEFAULT_STYLE values that a brand patch doesn't set.
 * Useful for previewing what a brand will look like before applying.
 */
export function brandPreviewStyle(brand: BrandStyle): VisualStyle {
  return {
    ...DEFAULT_STYLE,
    ...brandToStylePatch(brand),
    // palette must always be an array
    palette:
      brand.palette !== null && brand.palette !== undefined
        ? brand.palette
        : DEFAULT_STYLE.palette,
  };
}
