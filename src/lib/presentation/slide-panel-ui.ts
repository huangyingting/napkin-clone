/**
 * Pure UI helpers for the slide editor's Concept B layout (Slides-UI.md).
 *
 * These keep the decision logic for the selected-object context toolbar and the
 * right supplemental panel out of the large `SlideEditor` component so it can be
 * unit-tested in isolation.
 */

/** Tabs available in the right supplemental panel (Slides-UI.md). */
export type RightPanelTab =
  | "arrange"
  | "details"
  | "layers"
  | "slide"
  | "source";

/** The two internal sections the current `SlideInspector` renders. */
export type InspectorTab = "content" | "style";

/**
 * Maps a requested right-panel tab to the inspector section that currently
 * hosts it. Slide-level settings live in the inspector's `style` section; every
 * other tab (arrange/details/layers/source) is hosted by `content`.
 */
export function inspectorTabForPanel(tab: RightPanelTab): InspectorTab {
  return tab === "slide" ? "style" : "content";
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
