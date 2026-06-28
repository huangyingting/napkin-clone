/**
 * Pure UI helpers for the slide editor's current-object layout, documented in
 * docs/presentation/slide-editor.md.
 *
 * These keep the decision logic for the selected-object context toolbar and the
 * right supplemental panel out of the large `SlideEditor` component so it can be
 * unit-tested in isolation.
 */

/**
 * Task panels available in the right supplemental panel. Each panel owns one
 * broad property category and exactly one is rendered at a time. `Layers` is a
 * normal panel, not a separate inspector mode; object panels use concrete ids
 * (`text`, `label`, `shape`, `image`, `adjust`, `line`) instead of a generic
 * appearance bucket.
 */
export type RightPanelTab =
  | "slide"
  | "arrange"
  | "text"
  | "label"
  | "shape"
  | "image"
  | "adjust"
  | "line"
  | "effects"
  | "source"
  | "notes"
  | "layers";

/** Human-readable labels for each panel, shared by the toolbar and switcher. */
export const PANEL_LABELS: Record<RightPanelTab, string> = {
  slide: "Slide",
  arrange: "Arrange",
  text: "Text",
  label: "Label",
  shape: "Shape",
  image: "Image",
  adjust: "Adjust",
  line: "Line",
  effects: "Effects",
  source: "Source",
  notes: "Notes",
  layers: "Layers",
};

/**
 * Canonical render/menu order for panels. Availability filters this list so the
 * toolbar menu and in-panel switcher always agree on ordering.
 */
const PANEL_ORDER: readonly RightPanelTab[] = [
  "slide",
  "notes",
  "text",
  "label",
  "shape",
  "image",
  "adjust",
  "line",
  "arrange",
  "effects",
  "source",
  "layers",
];

/**
 * The tab the panel should open to by default. With a selection the most useful
 * default is `arrange`; with no selection, slide-level settings.
 */
export function defaultPanelTab(hasSelection: boolean): RightPanelTab {
  return hasSelection ? "arrange" : "slide";
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
 * Whether the slide-level current-object toolbar should be shown. It appears
 * only when the selection is empty, because the current object then resolves to
 * the active slide.
 */
export function isSlideToolbarVisible(input: {
  selectedElementId: string | null;
  selectedCount: number;
}): boolean {
  return input.selectedElementId === null && input.selectedCount === 0;
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
 * The selection shapes the context-toolbar contract recognises. `"line"` is a
 * shape element whose `shape === "line"` (no text label).
 */
export type ToolbarSelectionKind =
  | "text"
  | "shape"
  | "line"
  | "image"
  | "visual"
  | "connector";

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
    textStyle: kind === "text" || kind === "shape",
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
    case "image":
      return "image";
    case "visual":
      return "visual";
    case "connector":
      return "connector";
    case "shape":
      return shape === "line" ? "line" : "shape";
    default:
      return null;
  }
}

/** Selection context used to compute which panels apply (#651, #634). */
export interface PanelAvailabilityContext {
  /**
   * The single-selection element kind (+ shape subtype mapped through
   * {@link toToolbarSelectionKind}), or `null` for an empty selection or a
   * kind the contract does not model.
   */
  kind: ToolbarSelectionKind | null;
  /** Number of selected elements (0 for an empty selection). */
  selectedCount: number;
  /** Whether the single selected element already has a `sourceRef`. */
  hasSourceRef: boolean;
}

/**
 * The dynamic set of panels valid for the current object or selection, in
 * canonical {@link PANEL_ORDER}. This single helper powers the toolbar `...`
 * menu, the in-panel switcher, and active-panel invalidation, so they can never
 * drift.
 *
 * - Empty selection (slide is the current object): `slide`, `notes`, `layers`.
 * - Multi-selection: `arrange`, `effects`, `layers`.
 * - Single element: `arrange`, `effects`, `layers`, plus the matching object
 *   panel (`text`, `label` + `shape`, `image` + `adjust`, or `line`), and
 *   `source` only when the element already has a `sourceRef`.
 */
export function availablePanels(
  context: PanelAvailabilityContext,
): RightPanelTab[] {
  const set = new Set<RightPanelTab>();

  if (context.selectedCount === 0 && context.kind === null) {
    // Empty selection — the slide is the current object.
    set.add("slide");
    set.add("notes");
    set.add("layers");
  } else if (context.selectedCount >= 2) {
    // Multi-selection stays conservative: geometry and effects only.
    set.add("arrange");
    set.add("effects");
    set.add("layers");
  } else {
    // Single element.
    set.add("arrange");
    set.add("effects");
    set.add("layers");
    if (context.kind === "text") {
      set.add("text");
    }
    if (context.kind === "shape") {
      set.add("label");
      set.add("shape");
    }
    if (context.kind === "image") {
      set.add("image");
      set.add("adjust");
    }
    if (context.kind === "line" || context.kind === "connector") {
      set.add("line");
    }
    if (context.hasSourceRef) {
      set.add("source");
    }
  }

  return PANEL_ORDER.filter((panel) => set.has(panel));
}

/** Whether a specific panel is available for the given selection context. */
export function isPanelAvailable(
  panel: RightPanelTab,
  context: PanelAvailabilityContext,
): boolean {
  return availablePanels(context).includes(panel);
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
