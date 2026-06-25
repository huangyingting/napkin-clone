export const STAGE_CHROME_Z_INDEX = {
  elementOverlayOffset: 1,
  selectedElementOverlay: 2000,
  preselectedFrame: 2100,
  selectedFrame: 2110,
  groupFrame: 2120,
  multiSelectionBounds: 2130,
  connectorAnchorPreview: 2200,
  snapGuide: 2300,
  marquee: 2400,
  liveBadge: 2500,
} as const;

export function stageElementOverlayZIndex({
  elementZIndex,
  selected,
}: {
  elementZIndex: number;
  selected: boolean;
}): number {
  return selected
    ? STAGE_CHROME_Z_INDEX.selectedElementOverlay
    : elementZIndex + STAGE_CHROME_Z_INDEX.elementOverlayOffset;
}

// ---------------------------------------------------------------------------
// Editor state-feedback contract (#655)
//
// A single source of truth for how the major editing states present across the
// stage, toolbar, layer tree, and panels. Centralising the treatments keeps
// them distinct and prevents "competing" chrome (e.g. a hover ring fighting the
// selected ring) — see `resolveElementInteractionState`.
// ---------------------------------------------------------------------------

/**
 * The mutually-exclusive interaction state of a single element on the stage,
 * in priority order. Only one applies at a time so chrome never doubles up.
 */
export type EditorInteractionState =
  | "editing"
  | "rotating"
  | "resizing"
  | "dragging"
  | "selected"
  | "preselected"
  | "idle";

/**
 * Resolves the dominant interaction state from independent flags. Active
 * manipulation (editing/rotating/resizing/dragging) outranks a static
 * selection, and an explicit selection outranks hover preselection — so a
 * hover candidate never fights the selected state, and a dragged element reads
 * as "dragging" rather than merely "selected".
 */
export function resolveElementInteractionState(flags: {
  editing?: boolean;
  rotating?: boolean;
  resizing?: boolean;
  dragging?: boolean;
  selected?: boolean;
  preselected?: boolean;
}): EditorInteractionState {
  if (flags.editing) return "editing";
  if (flags.rotating) return "rotating";
  if (flags.resizing) return "resizing";
  if (flags.dragging) return "dragging";
  if (flags.selected) return "selected";
  if (flags.preselected) return "preselected";
  return "idle";
}

/** Visual treatment of the selection frame for a selected vs hover state. */
export interface SelectionFrameChrome {
  /** Border width in px (non-scaling). */
  borderWidthPx: number;
  /** Frame opacity. */
  opacity: number;
  /** Stacking order for the frame. */
  zIndex: number;
}

/**
 * The canonical selection-frame chrome. The selected frame is heavier and fully
 * opaque; the hover preselection frame is lighter and translucent so the two
 * are never confused when both could be visible.
 */
export function selectionFrameChrome(
  variant: "selected" | "preselected",
): SelectionFrameChrome {
  return variant === "selected"
    ? {
        borderWidthPx: 2,
        opacity: 1,
        zIndex: STAGE_CHROME_Z_INDEX.selectedFrame,
      }
    : {
        borderWidthPx: 1.5,
        opacity: 0.7,
        zIndex: STAGE_CHROME_Z_INDEX.preselectedFrame,
      };
}

/**
 * Layer-tree / stage treatment for an element's persistent flags. `locked`
 * elements stay fully visible but are non-interactive on stage; `hidden`
 * elements are dimmed in the layer tree and not rendered on stage. These are
 * orthogonal to the interaction state above (an element can be both selected
 * and locked).
 */
export const LOCKED_ELEMENT_TREATMENT = {
  /** Locked elements remain visible; only interaction is blocked. */
  stageOpacity: 1,
  pointerInteractive: false,
} as const;

export const HIDDEN_ELEMENT_TREATMENT = {
  /** Hidden elements are dimmed in the layer tree to read as "off". */
  layerTreeOpacity: 0.5,
  renderedOnStage: false,
} as const;
