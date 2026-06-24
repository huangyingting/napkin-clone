/**
 * Pure UI helpers for the slide editor's Concept B layout (Slides-UI.md).
 *
 * These keep the decision logic for the selected-object context toolbar and the
 * right supplemental panel out of the large `SlideEditor` component so it can be
 * unit-tested in isolation.
 */

/** Task panels available in the right supplemental panel (Slides-UI.md). */
export type RightPanelTab =
  | "position"
  | "text"
  | "effects"
  | "media"
  | "slide"
  | "notes"
  | "source";

/**
 * The tab the panel should open to by default. With a selection, the most
 * useful default is `arrange`; with no selection, slide-level settings.
 */
export function defaultPanelTab(hasSelection: boolean): RightPanelTab {
  return hasSelection ? "position" : "slide";
}

/**
 * Whether the top-centered selected-object toolbar should be shown. It appears
 * for any single or multi selection and is hidden when nothing is selected.
 */
export function isSelectionToolbarVisible(input: {
  hasSelectedElement: boolean;
  selectedCount: number;
}): boolean {
  return input.hasSelectedElement || input.selectedCount > 0;
}

/**
 * Whether the selected-object toolbar should render the rich per-element
 * controls (single selection) versus a compact multi-selection summary.
 */
export function shouldShowRichToolbarControls(input: {
  hasSelectedElement: boolean;
  selectedCount: number;
}): boolean {
  return input.hasSelectedElement && input.selectedCount <= 1;
}
