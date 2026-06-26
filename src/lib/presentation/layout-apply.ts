/** Layout application after layout slots were removed. */

import type { SlideElement, SlideLayout } from "./deck";

/** Outcome of {@link applyLayoutPreservingContent}. */
export interface LayoutApplyResult {
  /** New element list. Layout presets no longer re-flow existing content. */
  elements: SlideElement[];
  /** Always empty; retained for command-result compatibility. */
  moved: string[];
  /** Always empty; placeholder insertion was removed with layout slots. */
  inserted: string[];
}

/**
 * Layout is now a creation preset. Applying a layout to a populated slide keeps
 * authored elements unchanged; callers may still update the slide's layout hint.
 */
export function applyLayoutPreservingContent(
  elements: readonly SlideElement[],
  _layout: SlideLayout,
): LayoutApplyResult {
  return { elements: [...elements], moved: [], inserted: [] };
}

/** Outcome of {@link resetLayoutPositions}. */
export interface LayoutResetResult {
  /** New element list. Layout presets no longer re-flow existing content. */
  elements: SlideElement[];
  /** Always empty; slot bindings were removed. */
  moved: string[];
}

/**
 * Resetting layout positions is a no-op after slot bindings were removed.
 */
export function resetLayoutPositions(
  elements: readonly SlideElement[],
  _layout: SlideLayout,
): LayoutResetResult {
  return { elements: [...elements], moved: [] };
}
