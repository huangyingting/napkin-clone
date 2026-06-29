/**
 * Public API surface for the vNext presentation UI components.
 *
 * Import from this module rather than from individual files so the internal
 * file layout can change without breaking consumers.
 */

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export { SlideCanvasVNext, DeckCanvasVNext } from "./slide-canvas";
export type {
  SlideCanvasVNextProps,
  DeckCanvasVNextProps,
} from "./slide-canvas";

// ---------------------------------------------------------------------------
// Node renderer
// ---------------------------------------------------------------------------

export {
  SlideNodeRenderer,
  styleObjectToContainerCss,
} from "./slide-node-renderer";
export type { SlideNodeRendererProps } from "./slide-node-renderer";

// ---------------------------------------------------------------------------
// Selection model
// ---------------------------------------------------------------------------

export type { SelectionMode, SelectionState } from "./selection-model";
export {
  isSelectable,
  getSelectableNodes,
  createSelectionState,
  selectNode,
  deselectNode,
  toggleNode,
  clearSelection,
  setSelection,
  setSelectionMode,
  isSelected,
  hasSelection,
  selectionSize,
  selectedNodeIds,
} from "./selection-model";

// ---------------------------------------------------------------------------
// Inspector panels
// ---------------------------------------------------------------------------

export {
  StyleBindingPanel,
  LocalOverrideBadge,
  DiagnosticsPanel,
  SlideControlsPanel,
} from "./inspector";
export type {
  StyleBindingPanelProps,
  LocalOverrideBadgeProps,
  DiagnosticsPanelProps,
  SlideControlsPanelProps,
} from "./inspector";

// ---------------------------------------------------------------------------
// Stage helpers
// ---------------------------------------------------------------------------

export type { StageFit } from "./stage/fit-helpers";
export {
  fitCanvasToContainer,
  canvasPctToContainerPx,
  containerPxToCanvasPct,
} from "./stage/fit-helpers";

// ---------------------------------------------------------------------------
// Render tree hook
// ---------------------------------------------------------------------------

export { useDeckV7RenderTree } from "./use-deck-v7-render-tree";
export type { UseDeckV7RenderTreeOptions } from "./use-deck-v7-render-tree";

// ---------------------------------------------------------------------------
// vNext editor surface
// ---------------------------------------------------------------------------

export { SlideEditorVNext } from "./slide-editor-vnext";
export type { SlideEditorVNextProps } from "./slide-editor-vnext";

// ---------------------------------------------------------------------------
// vNext present mode
// ---------------------------------------------------------------------------

export { PresentModeVNext } from "./present-mode-vnext";
export type { PresentModeVNextProps } from "./present-mode-vnext";

// ---------------------------------------------------------------------------
// vNext public present viewer
// ---------------------------------------------------------------------------

export { PublicPresentViewerVNext } from "./public-present-viewer-vnext";
export type { PublicPresentViewerVNextProps } from "./public-present-viewer-vnext";

// ---------------------------------------------------------------------------
// vNext deck generation preview
// ---------------------------------------------------------------------------

export { DeckGenerationPreviewVNext } from "./deck-generation-preview-vnext";
export type { DeckGenerationPreviewVNextProps } from "./deck-generation-preview-vnext";
