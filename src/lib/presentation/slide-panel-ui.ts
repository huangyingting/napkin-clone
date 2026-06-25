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

/**
 * The selection shapes the context-toolbar contract recognises (Slides-UI.md,
 * #651). `"line"` is a shape element whose `shape === "line"` (no text label).
 */
export type ToolbarSelectionKind =
  | "text"
  | "bullets"
  | "shape"
  | "line"
  | "image"
  | "visual"
  | "connector"
  | "placeholder";

/**
 * Quick (low-risk, icon-level) actions the context toolbar may render inline
 * for a selection kind. Deep / precise edits are intentionally excluded and
 * live in the right panel (#651, #635).
 */
export interface ToolbarQuickActions {
  /** Compact bold/italic/underline/align/color bar for text-like elements. */
  textStyle: boolean;
  /** Shape fill color picker. */
  shapeColor: boolean;
  /** Connector straight/elbow routing toggle. */
  connectorRouting: boolean;
  /** Connector dashed/solid toggle. */
  connectorDash: boolean;
}

/** The allowed inline quick actions for a selection kind (#651). */
export function toolbarQuickActions(
  kind: ToolbarSelectionKind,
): ToolbarQuickActions {
  return {
    textStyle: kind === "text" || kind === "bullets" || kind === "shape",
    shapeColor: kind === "shape" || kind === "line",
    connectorRouting: kind === "connector",
    connectorDash: kind === "connector",
  };
}

/**
 * Maps a slide element's `kind` (+ shape subtype) to its
 * {@link ToolbarSelectionKind}. Returns `null` for kinds the contract does not
 * model. Kept string-typed so this pure module stays dependency-free.
 */
export function toToolbarSelectionKind(
  kind: string,
  shape?: string,
): ToolbarSelectionKind | null {
  switch (kind) {
    case "text":
      return "text";
    case "bullets":
      return "bullets";
    case "image":
      return "image";
    case "visual":
      return "visual";
    case "connector":
      return "connector";
    case "placeholder":
      return "placeholder";
    case "shape":
      return shape === "line" ? "line" : "shape";
    default:
      return null;
  }
}

/** Right-panel entry buttons the toolbar offers for a selection (#651, #631). */
export interface ToolbarPanelEntries {
  text: boolean;
  media: boolean;
  effects: boolean;
  source: boolean;
  /** Position/Arrange is always available for any single selection. */
  position: boolean;
}

/**
 * Which right-panel tabs the context toolbar exposes for the current
 * selection. Mirrors the panel availability used by the inspector so a toolbar
 * hand-off always opens a tab that can render (#634). Deep controls (font
 * size/family, line height, precise crop, alt text, source forms, exact
 * geometry) live behind these entries, never in the toolbar itself.
 */
export function toolbarPanelEntries(input: {
  kind: ToolbarSelectionKind | null;
  hasSourceRef: boolean;
  selectedCount: number;
}): ToolbarPanelEntries {
  const single = input.kind !== null && input.selectedCount <= 1;
  const kind = input.kind;
  return {
    text: single && (kind === "text" || kind === "bullets" || kind === "shape"),
    media:
      single && (kind === "image" || kind === "visual" || kind === "connector"),
    effects: single,
    source: single && input.hasSourceRef,
    position: single,
  };
}

/**
 * Below this stage width (px) the selected-object context toolbar collapses its
 * lower-priority z-order actions (bring-to-front / send-to-back) into a "More"
 * menu so it never overflows incoherently on narrow stages (#631, #647).
 */
export const TOOLBAR_COMPACT_WIDTH = 640;

/** Whether the context toolbar should collapse secondary actions into More. */
export function shouldCollapseToolbar(availableWidth: number): boolean {
  return availableWidth < TOOLBAR_COMPACT_WIDTH;
}
