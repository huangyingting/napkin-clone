"use client";

/**
 * vNext slide editor surface.
 *
 * A standalone editing surface for `DeckV7` decks that renders through the
 * `resolveDeckRenderTree` / `SlideCanvasVNext` path. It wires together:
 *
 *   - Slide rail (thumbnail navigation)
 *   - Main stage (`SlideCanvasVNext`)
 *   - Inspector: `SlideControlsPanel`, `StyleBindingPanel`,
 *     `LocalOverrideBadge`, `DiagnosticsPanel`
 *   - Node selection model (normal / layers mode)
 *   - vNext editor commands: `updateSlideControls`, `updateNodeStyleBinding`,
 *     `resetLocalStyleOverride`, `detachDecoration`, `updateNodeLayout`
 *
 * Decoration rendering rules:
 *   - Decorations are rendered behind user nodes and are not selectable in
 *     normal mode.
 *   - In "layers" mode, decorations become selectable and can be detached via
 *     the `detachDecoration` editor command.
 *
 * The component never mutates the deck prop. All changes are reported via
 * `onDeckChange`.
 *
 * Close / export: pass `onClose` to render a close button in the top toolbar
 * and `onExportPptx` to render an Export PPTX button. Export errors are caught
 * and surfaced inline via `exportDeckV7AsPPTX` (barrel-exported from
 * `@/lib/presentation-vnext`).
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Edit3,
  FileDown,
  Grid3x3,
  Group,
  Keyboard,
  LayoutPanelLeft,
  Redo2,
  Scissors,
  Save,
  StickyNote,
  Ungroup,
  Undo2,
  Users,
  X,
} from "lucide-react";

import type { ActionResult } from "@/lib/action-result";
import type { DocumentBlock } from "@/lib/content/document-blocks";
import type { SaveStatus } from "@/lib/presentation/save-status";
import type {
  ConnectorAnchor,
  ConnectorEndpoint,
  DeckV7,
  DeckChromeConfig,
  DeckChromeKind,
  ImageCrop,
  ImageAsset,
  LayoutBox,
  NodeSourceMetadata,
  SemanticTemplateKind,
  SlideNode,
  SlideChildNode,
} from "@/lib/presentation-vnext/schema";
import type { ThemePackageV1 } from "@/lib/presentation-vnext/theme-package-schema";
import type {
  StyleBinding,
  StylePatch,
} from "@/lib/presentation-vnext/style-schema";
import type {
  SlideControls,
  SlideProps,
} from "@/lib/presentation-vnext/schema";
import type {
  PresentationDiagnostic,
  DiagnosticAction,
} from "@/lib/presentation-vnext/diagnostics";
import type {
  SourceBlockIndex,
  SourceBlockIndexEntry,
} from "@/lib/presentation-vnext/block-index";
import { buildSourceBlockIndex } from "@/lib/presentation-vnext/block-index";
import {
  diagnosticTargetKey,
  getDiagnosticNodeId,
  getDiagnosticSlideId,
} from "@/lib/presentation-vnext/diagnostics";
import { applyDiagnosticRepairAction } from "@/lib/presentation-vnext/diagnostic-repairs";
import { deriveSourceReviewDerivations } from "@/lib/presentation-vnext/source-links";
import {
  dismissSourceReviewItem,
  refreshAllSourceReviewItems,
  refreshSelectedSourceLink,
  refreshSourceReviewItem,
  relinkSourceReviewItem,
  unlinkSourceReviewItem,
  type SourceLinkHostRefreshArgs,
  type SourceLinkHostRefreshResult,
  type SourceLinkOrchestrationResult,
} from "@/lib/presentation-vnext/source-link-orchestration";
import {
  createDocumentSourceNode,
  documentSourceInsertBlocks,
  sourceBlockKindLabel,
} from "@/lib/presentation-vnext/document-source-commands";
import type { InspectorPanelId } from "@/lib/presentation-vnext/inspector-panel-ui";
import type { ResolvedRenderNode } from "@/lib/presentation-vnext/render-tree";
import {
  MIN_DECK_SLIDES_MESSAGE,
  emptySlideSpecFromLayout,
  slideSpecFromSlide,
  updateSlideControls,
  updateSlideAttributes,
  updateSlideLocalStyle,
  resetSlideLocalStyle,
  updateSlideSourceMetadata,
  setThemePackage,
  updateDeckChrome,
  insertTemplateSlide,
  duplicateSlide,
  deleteSlide,
  moveSlide,
  insertNode,
  pasteNodes,
  cutNodes,
  updateNodeContent,
  resetImageCrop,
  updateNodeStyleBinding,
  updateLocalStyle,
  resetLocalStyleOverride,
  detachDecoration,
  detachDeckChrome,
  updateNodeLayout,
  updateNodeRotation,
  updateNodeLayouts,
  updateNodeAttributes,
  updateNodeSourceMetadata,
  moveNodesBy,
  deleteNodes,
  duplicateNodes,
  groupNodes,
  ungroupNodes,
  reorderZIndex,
  applyTemplate,
} from "@/lib/presentation-vnext";

import { NEUTRAL_THEME_PACKAGE } from "@/lib/presentation-vnext/neutral-theme-package";
import { createDefaultTemplateRegistry } from "@/lib/presentation-vnext/theme-packages";
import { listThemePackagesV7 } from "@/lib/presentation-vnext/theme-package-registry";
import { buildExportSpec } from "@/lib/presentation-vnext/export-spec";
import { resolveNodeFontCss } from "@/lib/presentation-vnext/node-font-css";
import { resolveDeckAssetSource } from "@/lib/presentation-vnext/deck-asset-source";
import {
  alignmentGuidesForFrames,
  snapFrameToStageGuides,
  type StageGuide,
  type StageGuideInput,
} from "@/lib/presentation-vnext/stage-guides";
import { STAGE_CHROME_Z_INDEX } from "@/lib/presentation-vnext/stage-chrome";
import {
  fitCanvasToViewport,
  type CanvasStageFit,
  type StageFitSize,
} from "@/lib/presentation-vnext/stage-fit";
import {
  normalizeSelectionFrame,
  selectNodesInFrame,
  type SelectionFrame,
} from "@/lib/presentation-vnext/selection-geometry";
import {
  connectorAnchorPoint,
  connectorEndpointFromSlidePoint,
} from "@/lib/presentation-vnext/connector-geometry";
import {
  buildAlignSelectionPatches,
  buildDistributeSelectionPatches,
  buildLayerReorderPatches,
  buildMatchSizeSelectionPatches,
  buildZOrderSelectionOperations,
  collectSelectedLayoutEntries,
} from "./arrangement-geometry";

import {
  SlideCanvasVNext,
  type SlideCanvasNodeGestureDraft,
  type ConnectorEndpointHandle,
  type CropHandlePosition,
  type ResizeHandlePosition,
} from "./slide-canvas";
import { createSingleCommitGesture } from "./single-commit-gesture";
import {
  createSelectionState,
  selectNode,
  clearSelection,
  setSelection as setSelectedNodeIds,
  setSelectionMode,
  selectedNodeIds,
  type SelectionState,
} from "./selection-model";
import {
  adjacentInlineEditableNodeId,
  adjacentNodeId,
  childIdsForGroup,
  findNodeById,
  flattenEditorNodes,
  layoutFramesExcluding,
  nodesInReadingOrder,
  parentGroupIdForNode,
} from "./selection-traversal";
import { DeckChromePanel, InspectorShell } from "./inspector";
import {
  ContextToolbar,
  type SelectionAlignMode,
  type SelectionDistributeMode,
  type SelectionMatchSizeMode,
} from "./toolbar/context-toolbar";
import { Filmstrip } from "./filmstrip/filmstrip";
import {
  readFilmstripCollapsed,
  writeFilmstripCollapsed,
} from "./filmstrip/filmstrip-collapse-storage";
import {
  AddSlideTemplatePicker,
  type AddSlideTemplateChoice,
} from "./add-slide-template-picker";
import { InlineTextEditorVNext } from "./inline-text-editor";
import { applyInlineTextCommit } from "./inline-text-commit";
import { useDeckV7RenderTree } from "./use-deck-v7-render-tree";
import { useTableCellEditing } from "./use-table-cell-editing";
import { SourceReviewPanel } from "./source-review-panel";
import { DeckDiagnosticsReview } from "./deck-diagnostics-review";
import { clipboardShortcutActionFromKey } from "./clipboard-shortcuts";
import {
  runVisualPickerMutation,
  VISUAL_PICKER_FAILURE_MESSAGE,
} from "./visual-picker-recovery";
import { KeyboardShortcutHelpDialog } from "@/components/presentation/slide-editor/keyboard-shortcut-help-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Popover } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { cx, FOCUS_RING } from "@/components/ui/tokens";
import { useFocusTrap } from "@/lib/presentation/use-focus-trap";
import {
  focusFirstMenuCommand,
  isMenuCommandNavigationKey,
  moveMenuCommandFocus,
} from "@/lib/a11y/menu-command-semantics";
import {
  hasRemotePeers,
  presencePeerLabel,
  useSlidePresence,
  type SlidePresenceAwareness,
  type SlidePresencePeer,
} from "@/lib/presentation/use-slide-presence";
import { canvasArrangeShortcutKind } from "@/lib/shortcuts/canvas-runtime";

const DECK_CHROME_KINDS: DeckChromeKind[] = [
  "logo",
  "footer",
  "pageNumber",
  "watermark",
  "border",
  "safeArea",
];

const TEMPLATE_REGISTRY = createDefaultTemplateRegistry();
const TEMPLATE_OPTIONS = TEMPLATE_REGISTRY.all();
const ZOOM_PERCENT_PRESETS = [200, 150, 125, 100, 75, 50, 25] as const;
const DESKTOP_INSPECTOR_MEDIA_QUERY = "(min-width: 1024px)";

function isDesktopInspectorViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(DESKTOP_INSPECTOR_MEDIA_QUERY).matches
  );
}

function isMobileInspectorViewport(): boolean {
  return !isDesktopInspectorViewport();
}

function useDesktopInspectorViewport(): boolean {
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(DESKTOP_INSPECTOR_MEDIA_QUERY);
    const syncViewport = () => {
      setIsDesktopViewport(mediaQuery.matches);
    };
    syncViewport();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }
    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  return isDesktopViewport;
}

function FocusTrapped({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(ref);
  return <div ref={ref}>{children}</div>;
}

interface SlideEditorInspectorRegionProps {
  isDesktopInspectorViewport: boolean;
  activeSlide: SlideNode | undefined;
  inspectorSheetOpen: boolean;
  onOpenMobileInspector: () => void;
  onCloseMobileInspector: () => void;
  renderInspectorShell: () => JSX.Element;
}

export function SlideEditorInspectorRegion({
  isDesktopInspectorViewport,
  activeSlide,
  inspectorSheetOpen,
  onOpenMobileInspector,
  onCloseMobileInspector,
  renderInspectorShell,
}: SlideEditorInspectorRegionProps): JSX.Element {
  const showMobileInspector =
    !isDesktopInspectorViewport && Boolean(activeSlide);

  return (
    <>
      {isDesktopInspectorViewport ? (
        <div className="absolute bottom-4 right-4 top-4 z-panel hidden w-80 overflow-hidden rounded-ds-lg border border-ds-border-subtle bg-ds-surface-overlay shadow-ds-overlay lg:flex">
          {renderInspectorShell()}
        </div>
      ) : null}

      {showMobileInspector ? (
        <div className="lg:hidden">
          <button
            type="button"
            data-floating-panel="true"
            aria-label="Edit slide"
            aria-haspopup="dialog"
            aria-expanded={inspectorSheetOpen}
            onClick={onOpenMobileInspector}
            className={cx(
              "tiq-safe-fab fixed z-modal flex h-12 w-12 items-center justify-center rounded-full bg-ds-accent text-ds-text-on-accent shadow-ds-overlay transition-colors hover:bg-ds-accent-hover",
              FOCUS_RING,
            )}
          >
            <Edit3 aria-hidden="true" className="h-5 w-5" />
          </button>

          {inspectorSheetOpen ? (
            <>
              <div
                data-floating-panel="true"
                aria-hidden="true"
                onClick={onCloseMobileInspector}
                className="fixed inset-0 z-modal bg-ds-backdrop"
              />
              <FocusTrapped>
                <div
                  data-floating-panel="true"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Slide inspector"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      onCloseMobileInspector();
                    }
                  }}
                  className="tiq-mobile-sheet fixed inset-x-0 bottom-0 z-modal flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border-t border-ds-border-subtle bg-ds-surface-base shadow-ds-popover"
                >
                  <div className="relative flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
                    <span
                      aria-hidden="true"
                      className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-ds-border-subtle"
                    />
                    <p className="text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
                      Edit slide
                    </p>
                    <button
                      type="button"
                      aria-label="Close slide inspector"
                      onClick={onCloseMobileInspector}
                      className={cx(
                        "tiq-touch-target flex h-7 w-7 items-center justify-center rounded-full text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                        FOCUS_RING,
                      )}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {renderInspectorShell()}
                  </div>
                </div>
              </FocusTrapped>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export type SlideEditorVNextImageUploadResult = {
  src: string;
  assetId?: string;
  alt?: string;
  widthPx?: number;
  heightPx?: number;
  mimeType?: ImageAsset["mimeType"];
  contentHash?: string;
};

export type SlideEditorVNextVisualPickResult = {
  visualId?: string;
  assetId?: string;
  alt?: string;
};

export type SlideEditorVNextSourceRefreshResult = SourceLinkHostRefreshResult;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SlideEditorVNextProps {
  documentId: string;
  /** The v7 deck to edit. */
  deck: DeckV7;
  /** Theme package to use for rendering. Falls back to the neutral package. */
  themePackage?: ThemePackageV1 | null;
  /** Boundary diagnostics, e.g. validation or theme fallback notices. */
  diagnostics?: readonly PresentationDiagnostic[];
  saveStatus?: SaveStatus;
  saveStatusLabel?: string;
  saveErrorMessage?: string;
  hasUnsavedWork?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /**
   * Focus target emitted after a committed undo/redo. When the `token` changes,
   * the editor restores selection and DOM focus to `nodeId` (a node, or a slide
   * id when the affected node was removed) so attention follows the change.
   */
  undoRedoFocus?: { nodeId: string; token: number } | null;
  onUploadImage?: (file: File) => Promise<SlideEditorVNextImageUploadResult>;
  onPickVisual?: () => Promise<SlideEditorVNextVisualPickResult | undefined>;
  documentBlocks?: readonly DocumentBlock[];
  sourceBlockIndex?: SourceBlockIndex;
  onRefreshSource?: (
    args: SourceLinkHostRefreshArgs,
  ) => Promise<SlideEditorVNextSourceRefreshResult | undefined>;
  /**
   * Called on every structural change. Receives the updated deck with the
   * command result applied. The parent is responsible for persistence.
   */
  onDeckChange: (deck: DeckV7) => void;
  /**
   * Optional explicit save callback. Called when the user requests an
   * immediate save (e.g. Save button). When omitted, the parent's
   * `onDeckChange` handler is solely responsible for persistence timing.
   *
   * Extension point for v7-specific autosave/commit infrastructure —
   * see `handleSaveV7` in `use-slide-editor-open.ts`.
   */
  onSave?: (deck: DeckV7) => Promise<ActionResult>;
  /**
   * Called when the user closes the editor. When provided, a close button
   * is rendered in the top toolbar.
   */
  onClose?: () => void;
  /**
   * Called when the user requests a PPTX export. The callback is responsible
   * for invoking `exportDeckV7AsPPTX` and triggering the browser download.
   * When provided, an "Export PPTX" button is rendered in the top toolbar.
   * Thrown errors are caught and displayed inline.
   */
  onExportPptx?: () => Promise<void>;
  presenceAwareness?: SlidePresenceAwareness | null;
  presenceUserId?: string;
  presenceUserName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function topLevelSelectedNodeIds(
  nodes: readonly SlideChildNode[],
  selectedIds: ReadonlySet<string>,
  insideSelectedGroup = false,
  result: string[] = [],
): string[] {
  for (const node of nodes) {
    const selected = selectedIds.has(node.id);
    if (selected && !insideSelectedGroup) result.push(node.id);
    if (node.type === "group") {
      topLevelSelectedNodeIds(
        node.children,
        selectedIds,
        insideSelectedGroup || selected,
        result,
      );
    }
  }
  return result;
}
function defaultStyleBindingForNode(node: SlideChildNode): StyleBinding {
  if (node.type === "text") {
    const role = node.role;
    let ref: StyleBinding["ref"] = "text.body";
    if (role === "title") ref = "text.title";
    else if (role === "subtitle") ref = "text.subtitle";
    else if (role === "kicker") ref = "text.kicker";
    else if (role === "caption") ref = "text.caption";
    else if (role === "quote") ref = "text.quote";
    else if (role === "metric") ref = "text.metric";
    return { ref };
  }
  if (node.type === "image") return { ref: "media.inline" };
  if (node.type === "visual") return { ref: "chart.primary" };
  if (node.type === "connector") return { ref: "connector.primary" };
  if (node.type === "table") return { ref: "surface.table" };
  return { ref: "surface.card" };
}

const STAGE_VIEWPORT_FALLBACK: StageFitSize = { width: 1120, height: 630 };
const DESKTOP_INSPECTOR_OVERLAY_WIDTH = 352;
const CLICK_MOVE_THRESHOLD_PX = 4;

function canvasAspectRatio(deck: DeckV7): number {
  const width = deck.canvas.width > 0 ? deck.canvas.width : 16;
  const height = deck.canvas.height > 0 ? deck.canvas.height : 9;
  return width / height;
}

function canvasStageFit(
  deck: DeckV7,
  zoomPercent: number,
  viewport: StageFitSize | null,
  isDesktopInspectorViewport: boolean,
): CanvasStageFit {
  const safeViewport = viewport ?? STAGE_VIEWPORT_FALLBACK;
  const rightOverlayWidth = isDesktopInspectorViewport
    ? DESKTOP_INSPECTOR_OVERLAY_WIDTH
    : 0;
  return fitCanvasToViewport({
    viewport: safeViewport,
    aspectRatio: canvasAspectRatio(deck),
    zoomPercent,
    rightOverlayWidth,
  });
}

function canvasFrameStyle(stageFit: CanvasStageFit): CSSProperties {
  return {
    position: "absolute",
    left: stageFit.frame.left,
    top: stageFit.frame.top,
    width: stageFit.frame.width,
    height: stageFit.frame.height,
  };
}

function stageScrollContentStyle(stageFit: CanvasStageFit): CSSProperties {
  return {
    position: "relative",
    width: stageFit.scrollContentSize.width,
    height: stageFit.scrollContentSize.height,
  };
}

function focusStageNode(nodeId: string): void {
  if (typeof document === "undefined") return;
  const safeId = nodeId.replace(/"/g, '\\"');
  const el = document.querySelector<HTMLElement>(`[data-node-id="${safeId}"]`);
  el?.focus();
}

/**
 * Finds the slide index that owns a node id (searching nested group children),
 * or, failing that, the index of a slide whose own id matches. Returns -1 when
 * the id is no longer present in the deck.
 */
function findSlideIndexForFocus(deck: DeckV7, targetId: string): number {
  const containsNode = (nodes: readonly SlideChildNode[]): boolean =>
    nodes.some(
      (node) =>
        node.id === targetId ||
        (node.type === "group" && containsNode(node.children)),
    );
  const byNode = deck.slides.findIndex((slide) => containsNode(slide.children));
  if (byNode !== -1) return byNode;
  return deck.slides.findIndex((slide) => slide.id === targetId);
}

function slideDisplayName(slide: SlideNode | undefined, index: number): string {
  return slide?.name ?? `Slide ${index + 1}`;
}

function selectedSummary(count: number): string {
  if (count === 0) return "No selection";
  if (count === 1) return "1 node selected";
  return `${count} nodes selected`;
}

function diagnosticsSummary(count: number): string {
  if (count === 0) return "No diagnostics";
  if (count === 1) return "1 diagnostic";
  return `${count} diagnostics`;
}

function presencePeerSummary(
  peer: SlidePresencePeer,
  deck: DeckV7,
  activeSlideId: string | undefined,
): string {
  const label = presencePeerLabel(peer);
  if (!peer.selectedSlideId) return `${label}: in deck`;
  if (peer.selectedSlideId === activeSlideId) {
    if (peer.selectedNodeIds.length === 1) return `${label}: selecting 1 node`;
    if (peer.selectedNodeIds.length > 1) {
      return `${label}: selecting ${peer.selectedNodeIds.length} nodes`;
    }
    return `${label}: viewing this slide`;
  }
  const slideIndex = deck.slides.findIndex(
    (slide) => slide.id === peer.selectedSlideId,
  );
  return slideIndex >= 0
    ? `${label}: on ${slideDisplayName(deck.slides[slideIndex], slideIndex)}`
    : `${label}: in deck`;
}

function dedupeDiagnostics(
  diagnostics: readonly PresentationDiagnostic[],
): PresentationDiagnostic[] {
  const seen = new Set<string>();
  const result: PresentationDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnosticTargetKey(diagnostic.target)}:${diagnostic.path ?? ""}:${diagnostic.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], [role="textbox"]',
    ),
  );
}

function clampFrame(frame: LayoutBox["frame"]): LayoutBox["frame"] {
  const w = Math.max(
    0.5,
    Math.min(100, Number.isFinite(frame.w) ? frame.w : 0.5),
  );
  const h = Math.max(
    0.5,
    Math.min(100, Number.isFinite(frame.h) ? frame.h : 0.5),
  );
  return {
    x: Math.max(0, Math.min(100 - w, Number.isFinite(frame.x) ? frame.x : 0)),
    y: Math.max(0, Math.min(100 - h, Number.isFinite(frame.y) ? frame.y : 0)),
    w,
    h,
  };
}

function framesEqual(a: LayoutBox["frame"], b: LayoutBox["frame"]): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function clampCrop(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(95, Math.round(value * 10) / 10));
}

function cropsEqual(a: ImageCrop, b: ImageCrop): boolean {
  return (
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.left === b.left
  );
}

function normalizeRotationDegrees(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;
  const normalized = ((rotation % 360) + 360) % 360;
  return Math.round(normalized * 10) / 10;
}

function snapRotationDegrees(rotation: number, snap: boolean): number {
  return normalizeRotationDegrees(
    snap ? Math.round(rotation / 15) * 15 : rotation,
  );
}

function resizeFrame(
  frame: LayoutBox["frame"],
  handle: ResizeHandlePosition,
  deltaX: number,
  deltaY: number,
): LayoutBox["frame"] {
  let { x, y, w, h } = frame;
  if (handle.includes("w")) {
    x += deltaX;
    w -= deltaX;
  }
  if (handle.includes("e")) {
    w += deltaX;
  }
  if (handle.includes("n")) {
    y += deltaY;
    h -= deltaY;
  }
  if (handle.includes("s")) {
    h += deltaY;
  }
  if (w < 0.5 && handle.includes("w")) x -= 0.5 - w;
  if (h < 0.5 && handle.includes("n")) y -= 0.5 - h;
  return clampFrame({ x, y, w, h });
}

function applyAspectLock(
  original: LayoutBox["frame"],
  next: LayoutBox["frame"],
): LayoutBox["frame"] {
  const aspect = original.w / original.h;
  if (!Number.isFinite(aspect) || aspect <= 0) return next;
  const widthDelta = Math.abs(next.w - original.w);
  const heightDelta = Math.abs(next.h - original.h);
  return widthDelta >= heightDelta
    ? clampFrame({ ...next, h: next.w / aspect })
    : clampFrame({ ...next, w: next.h * aspect });
}

function canvasRectFromEvent(event: ReactPointerEvent): DOMRect | undefined {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return undefined;
  return target
    .closest('[data-slide-canvas-vnext="true"]')
    ?.getBoundingClientRect();
}

function canvasElementFromTarget(
  target: EventTarget | null,
): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('[data-slide-canvas-vnext="true"]');
}

function pointPctFromEvent(
  event: PointerEvent | ReactPointerEvent,
  rect: DOMRect,
): { x: number; y: number } {
  return {
    x: Math.max(
      0,
      Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
    ),
    y: Math.max(
      0,
      Math.min(100, ((event.clientY - rect.top) / rect.height) * 100),
    ),
  };
}

export interface NodeMovePreview {
  patches: Map<string, Partial<LayoutBox>>;
  guides: StageGuide[];
}

function nodeMovePatchFramesEqual(
  a: ReadonlyMap<string, Partial<LayoutBox>>,
  b: ReadonlyMap<string, Partial<LayoutBox>>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, patch] of a) {
    const nextPatch = b.get(id);
    if (!nextPatch?.frame || !patch.frame) return false;
    if (!framesEqual(patch.frame, nextPatch.frame)) return false;
  }
  return true;
}

export function nodeMovePreviewsEqual(
  a: NodeMovePreview,
  b: NodeMovePreview,
): boolean {
  return nodeMovePatchFramesEqual(a.patches, b.patches);
}

function nodeMoveGestureDrafts(
  preview: NodeMovePreview | null,
): ReadonlyMap<string, SlideCanvasNodeGestureDraft> | null {
  if (!preview || preview.patches.size === 0) return null;
  const drafts = new Map<string, SlideCanvasNodeGestureDraft>();
  for (const [nodeId, patch] of preview.patches) {
    if (!patch.frame) continue;
    drafts.set(nodeId, { frame: patch.frame });
  }
  return drafts.size > 0 ? drafts : null;
}

interface NodeMovePreviewArgs {
  startClientX: number;
  startClientY: number;
  nextClientX: number;
  nextClientY: number;
  rectWidth: number;
  rectHeight: number;
  originalFrames: ReadonlyMap<string, LayoutBox["frame"]>;
  alignmentGuides: readonly StageGuideInput[];
  snapToGuides?: boolean;
  thresholdPx?: number;
}

export function createNodeMovePreview({
  startClientX,
  startClientY,
  nextClientX,
  nextClientY,
  rectWidth,
  rectHeight,
  originalFrames,
  alignmentGuides,
  snapToGuides = true,
  thresholdPx = CLICK_MOVE_THRESHOLD_PX,
}: NodeMovePreviewArgs): NodeMovePreview | null {
  if (rectWidth <= 0 || rectHeight <= 0 || originalFrames.size === 0)
    return null;
  if (
    Math.abs(nextClientX - startClientX) <= thresholdPx &&
    Math.abs(nextClientY - startClientY) <= thresholdPx
  ) {
    return null;
  }

  const deltaX = ((nextClientX - startClientX) / rectWidth) * 100;
  const deltaY = ((nextClientY - startClientY) / rectHeight) * 100;
  const patches = new Map<string, Partial<LayoutBox>>();
  const guides: StageGuide[] = [];
  for (const [id, frame] of originalFrames) {
    const nextFrame = clampFrame({
      ...frame,
      x: frame.x + deltaX,
      y: frame.y + deltaY,
    });
    const snapped = snapToGuides
      ? snapFrameToStageGuides(nextFrame, 0.75, alignmentGuides)
      : { frame: nextFrame, guides: [] as StageGuide[] };
    patches.set(id, {
      frame: snapped.frame,
    });
    guides.push(...snapped.guides);
  }
  return { patches, guides };
}

function connectorEndpointsEqual(
  a: ConnectorEndpoint,
  b: ConnectorEndpoint,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "point" && b.kind === "point") {
    return a.point.x === b.point.x && a.point.y === b.point.y;
  }
  if (a.kind === "node" && b.kind === "node") {
    return a.nodeId === b.nodeId && a.anchor === b.anchor;
  }
  return false;
}
function nearestConnectorAnchor(
  nodes: readonly SlideChildNode[],
  point: { x: number; y: number },
  excludedId: string,
  thresholdPct = 4,
): ConnectorEndpoint | null {
  const anchors: ConnectorAnchor[] = [
    "top",
    "right",
    "bottom",
    "left",
    "center",
  ];
  let best: { endpoint: ConnectorEndpoint; distance: number } | null = null;
  for (const node of flattenEditorNodes(nodes)) {
    if (node.id === excludedId || node.type === "connector" || !node.layout) {
      continue;
    }
    for (const anchor of anchors) {
      const anchorPoint = connectorAnchorPoint(node.layout.frame, anchor);
      const distance = Math.hypot(
        anchorPoint.x - point.x,
        anchorPoint.y - point.y,
      );
      if (!best || distance < best.distance) {
        best = {
          endpoint: { kind: "node", nodeId: node.id, anchor },
          distance,
        };
      }
    }
  }
  return best && best.distance <= thresholdPct ? best.endpoint : null;
}

function nodeFactoryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

function assetFactoryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function imageMimeType(
  type: string,
): "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml" | undefined {
  return type === "image/png" ||
    type === "image/jpeg" ||
    type === "image/webp" ||
    type === "image/svg+xml"
    ? type
    : undefined;
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (src) {
        resolve(src);
      } else {
        reject(new Error("empty image data"));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("image read failed"));
    };
    reader.readAsDataURL(file);
  });
}

function nextZIndex(slide: SlideNode | undefined): number {
  if (!slide || slide.children.length === 0) return 1;
  return (
    Math.max(...slide.children.map((node) => node.layout?.zIndex ?? 0)) + 1
  );
}

function defaultTextNode(zIndex: number): SlideChildNode {
  const id = nodeFactoryId("text");
  return {
    id,
    type: "text",
    role: "body",
    layout: { frame: { x: 12, y: 16, w: 42, h: 12 }, zIndex },
    style: { ref: "text.body" },
    content: { paragraphs: [{ id: `${id}-p-1`, text: "Text" }] },
  };
}

function defaultShapeNode(zIndex: number): SlideChildNode {
  return {
    id: nodeFactoryId("shape"),
    type: "shape",
    role: "card",
    layout: { frame: { x: 16, y: 20, w: 28, h: 18 }, zIndex },
    style: { ref: "surface.card" },
    content: { shape: "rect" },
  };
}

function defaultTableNode(zIndex: number): SlideChildNode {
  return {
    id: nodeFactoryId("table"),
    type: "table",
    role: "table",
    layout: { frame: { x: 12, y: 18, w: 56, h: 24 }, zIndex },
    style: { ref: "surface.table" },
    content: {
      columns: [
        { id: "col-1", label: "Column 1" },
        { id: "col-2", label: "Column 2" },
      ],
      rows: [
        { id: "row-1", cells: [{ text: "" }, { text: "" }] },
        { id: "row-2", cells: [{ text: "" }, { text: "" }] },
      ],
    },
  };
}

function defaultImageNode(zIndex: number): SlideChildNode {
  return {
    id: nodeFactoryId("image"),
    type: "image",
    role: "image",
    layout: { frame: { x: 18, y: 18, w: 40, h: 28 }, zIndex },
    style: { ref: "media.inline" },
    content: { assetId: "placeholder", alt: "Image" },
  };
}

function defaultVisualNode(zIndex: number): SlideChildNode {
  return {
    id: nodeFactoryId("visual"),
    type: "visual",
    role: "visual",
    layout: { frame: { x: 18, y: 18, w: 46, h: 30 }, zIndex },
    style: { ref: "chart.primary" },
    content: { visualId: "visual-placeholder" },
  };
}

function deckWithPickedVisualAsset(
  deck: DeckV7,
  picked: SlideEditorVNextVisualPickResult,
): DeckV7 {
  if (!picked.assetId) return deck;
  const visualId = picked.visualId ?? picked.assetId;
  return {
    ...deck,
    assets: {
      ...deck.assets,
      visuals: {
        ...deck.assets.visuals,
        [picked.assetId]: {
          id: picked.assetId,
          visualId,
          ...(picked.alt !== undefined ? { alt: picked.alt } : {}),
        },
      },
    },
  };
}

function visualContentPatchFromPick(
  picked: SlideEditorVNextVisualPickResult,
): Record<string, unknown> {
  return {
    ...(picked.visualId !== undefined ? { visualId: picked.visualId } : {}),
    ...(picked.assetId !== undefined ? { assetId: picked.assetId } : {}),
    ...(picked.alt !== undefined ? { alt: picked.alt } : {}),
  };
}

function defaultConnectorNode(zIndex: number): SlideChildNode {
  return {
    id: nodeFactoryId("connector"),
    type: "connector",
    role: "connector",
    layout: { frame: { x: 20, y: 45, w: 32, h: 10 }, zIndex },
    style: { ref: "connector.primary" },
    content: {
      from: { kind: "point", point: { x: 0, y: 50 } },
      to: { kind: "point", point: { x: 100, y: 50 } },
      routing: "straight",
    },
  };
}

interface CloseRequestHandlers {
  openCloseConfirmDialog: () => void;
  closeEditor: () => void;
}

export function routeCloseRequest(
  hasUnsavedWork: boolean,
  handlers: CloseRequestHandlers,
): void {
  if (hasUnsavedWork) {
    handlers.openCloseConfirmDialog();
    return;
  }
  handlers.closeEditor();
}

interface CloseConfirmActionHandlers {
  closeCloseConfirmDialog: () => void;
  closeEditor: () => void;
}

export function handleCloseConfirmAction(
  action: "cancel" | "discard",
  handlers: CloseConfirmActionHandlers,
): void {
  handlers.closeCloseConfirmDialog();
  if (action === "discard") {
    handlers.closeEditor();
  }
}

interface BeforeUnloadGuardHandlers {
  addBeforeUnloadListener: (
    listener: (event: BeforeUnloadEvent) => void,
  ) => void;
  removeBeforeUnloadListener: (
    listener: (event: BeforeUnloadEvent) => void,
  ) => void;
}

export function setupBeforeUnloadGuard(
  hasUnsavedWork: boolean,
  handlers: BeforeUnloadGuardHandlers,
): (() => void) | undefined {
  if (!hasUnsavedWork) {
    return undefined;
  }
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = "";
  };
  handlers.addBeforeUnloadListener(onBeforeUnload);
  return () => handlers.removeBeforeUnloadListener(onBeforeUnload);
}

export function deleteActiveSlideFromToolbar(
  deck: DeckV7,
  activeSlideId: string | undefined,
): {
  deleted: boolean;
  nextDeck: DeckV7;
  nextIndex: number;
  statusMessage?: string;
} {
  if (!activeSlideId) {
    return { deleted: false, nextDeck: deck, nextIndex: 0 };
  }
  if (deck.slides.length <= 1) {
    return {
      deleted: false,
      nextDeck: deck,
      nextIndex: 0,
      statusMessage: MIN_DECK_SLIDES_MESSAGE,
    };
  }
  const result = deleteSlide(deck, activeSlideId);
  return {
    deleted: result.deck !== deck,
    nextDeck: result.deck,
    nextIndex: result.index,
  };
}

export function SlideEditorCloseConfirmDialog({
  onCancel,
  onDiscard,
}: {
  onCancel: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onCancel}
      aria-labelledby="slide-editor-vnext-close-confirm-title"
      className="max-w-sm"
    >
      <h2
        id="slide-editor-vnext-close-confirm-title"
        className="text-base font-semibold text-ds-text-primary"
      >
        Close and discard changes?
      </h2>
      <p className="mt-2 text-sm text-ds-text-secondary">
        You have unsaved slide changes. Close the editor and discard them?
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className={cx(
            "flex h-9 items-center justify-center rounded-full border border-ds-border-strong px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary",
            FOCUS_RING,
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className={cx(
            "flex h-9 items-center justify-center rounded-full bg-ds-danger px-4 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90",
            FOCUS_RING,
          )}
        >
          Discard changes
        </button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SlideEditorVNext({
  documentId,
  deck,
  themePackage,
  diagnostics: boundaryDiagnostics = [],
  saveStatus = "saved",
  saveStatusLabel = "All changes saved",
  saveErrorMessage,
  hasUnsavedWork = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  undoRedoFocus = null,
  onUploadImage,
  onPickVisual,
  documentBlocks = [],
  sourceBlockIndex,
  onRefreshSource,
  onDeckChange,
  onSave,
  onClose,
  onExportPptx,
  presenceAwareness = null,
  presenceUserId = "",
  presenceUserName = "Anonymous",
}: SlideEditorVNextProps): JSX.Element {
  const pkg = themePackage ?? NEUTRAL_THEME_PACKAGE;
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(
    null,
  );
  const handleCanvasRef = useCallback((el: HTMLDivElement | null) => {
    setCanvasElement(el);
  }, []);
  const suppressStageClickRef = useRef(false);
  const lastUndoRedoFocusTokenRef = useRef<number | null>(null);
  const themePackages = useMemo(() => listThemePackagesV7(), []);
  const isMac = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ??
      navigator.platform ??
      navigator.userAgent;
    return /mac|iphone|ipad|ipod/i.test(platform);
  }, []);
  const documentSourceIndex = useMemo(() => {
    if (sourceBlockIndex) return sourceBlockIndex;
    if (documentBlocks.length === 0) return undefined;
    return buildSourceBlockIndex(documentId, documentBlocks);
  }, [documentBlocks, documentId, sourceBlockIndex]);

  // Recoverable export/media errors surfaced below the toolbar banner
  const [exportError, setExportError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const [addSlidePickerOpen, setAddSlidePickerOpen] = useState(false);
  const replaceImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceSlideBackgroundFileInputRef = useRef<HTMLInputElement | null>(
    null,
  );
  const replaceImageTargetIdRef = useRef<string | null>(null);
  const insertImagePendingRef = useRef(false);

  // Inline text editing state
  const [inlineEditNodeId, setInlineEditNodeId] = useState<string | null>(null);
  const [deckTitleEditing, setDeckTitleEditing] = useState(false);
  const [deckTitleDraft, setDeckTitleDraft] = useState(deck.title ?? "Slides");

  useEffect(() => {
    if (!deckTitleEditing) setDeckTitleDraft(deck.title ?? "Slides");
  }, [deck.title, deckTitleEditing]);

  async function handleExportPptx() {
    if (!onExportPptx) return;
    setExportError(null);
    try {
      await onExportPptx();
    } catch {
      setExportError("PPTX export failed. Please try again.");
    }
  }

  function handleCloseRequest() {
    routeCloseRequest(hasUnsavedWork, {
      openCloseConfirmDialog: () => setCloseConfirmOpen(true),
      closeEditor: () => onClose?.(),
    });
  }

  useEffect(
    () =>
      setupBeforeUnloadGuard(hasUnsavedWork, {
        addBeforeUnloadListener: (listener) =>
          window.addEventListener("beforeunload", listener),
        removeBeforeUnloadListener: (listener) =>
          window.removeEventListener("beforeunload", listener),
      }),
    [hasUnsavedWork],
  );

  function handleThemePackageChange(packageId: string) {
    const nextPackage = themePackages.find(
      (candidate) => candidate.id === packageId,
    );
    onDeckChange(setThemePackage(deck, packageId, nextPackage?.version));
  }

  function handleDeckTitleCommit() {
    const title = deckTitleDraft.trim();
    onDeckChange({ ...deck, title: title.length > 0 ? title : undefined });
    setDeckTitleEditing(false);
  }

  function handleCanvasRatioChange(format: "16:9" | "4:3" | "square") {
    const dimensions =
      format === "4:3"
        ? { width: 4, height: 3 }
        : format === "square"
          ? { width: 1, height: 1 }
          : { width: 16, height: 9 };
    onDeckChange({
      ...deck,
      canvas: { ...deck.canvas, format, ...dimensions, unit: "percent" },
    });
  }

  function handleReapplyTemplate(
    kind: SemanticTemplateKind,
    layoutId?: string,
  ) {
    if (!activeSlide) return;
    const template = TEMPLATE_REGISTRY.get(kind);
    if (!template) return;
    const spec = slideSpecFromSlide(
      activeSlide,
      kind,
      layoutId,
      TEMPLATE_REGISTRY,
    );
    onDeckChange(applyTemplate(deck, activeSlide.id, spec, template));
    setSelection(createSelectionState(selection.mode));
  }

  useEffect(() => {
    editorRootRef.current?.focus();
  }, []);

  // ---------------------------------------------------------------------------
  // Slide navigation
  // ---------------------------------------------------------------------------

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const activeSlide: SlideNode | undefined = deck.slides[activeSlideIndex];

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  const [selection, setSelection] = useState<SelectionState>(() =>
    createSelectionState("normal"),
  );
  const [snapToGuides, setSnapToGuides] = useState(true);
  const [clipboardNodes, setClipboardNodes] = useState<SlideChildNode[]>([]);
  const [stageGuides, setStageGuides] = useState<StageGuide[]>([]);
  const [marqueeFrame, setMarqueeFrame] = useState<SelectionFrame | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [stageAnnouncement, setStageAnnouncement] = useState("");
  const [sourceReviewStatus, setSourceReviewStatus] = useState("");
  const [stageZoomPercent, setStageZoomPercent] = useState(100);
  const [stageViewportSize, setStageViewportSize] =
    useState<StageFitSize | null>(null);
  const [filmstripCollapsed, setFilmstripCollapsed] = useState(() =>
    readFilmstripCollapsed(documentId),
  );
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [footerStatusMenuOpen, setFooterStatusMenuOpen] = useState(false);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const zoomMenuId = useId();
  const zoomMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const zoomMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const footerStatusMenuId = useId();
  const footerStatusMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const footerStatusMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const sourceMenuId = useId();
  const sourceMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sourceMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [deckChromeToolbarOpen, setDeckChromeToolbarOpen] = useState(false);
  const [inspectorSheetOpen, setInspectorSheetOpen] = useState(false);
  const [deckDiagnosticsReviewOpen, setDeckDiagnosticsReviewOpen] =
    useState(false);
  const [inspectorPanelRequest, setInspectorPanelRequest] = useState<{
    panel: InspectorPanelId;
    nonce: number;
  } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const [draggingStage, setDraggingStage] = useState(false);
  const [moveGestureDraft, setMoveGestureDraft] = useState<ReadonlyMap<
    string,
    SlideCanvasNodeGestureDraft
  > | null>(null);
  const [activeResizeHandle, setActiveResizeHandle] = useState<{
    nodeId: string;
    handle: ResizeHandlePosition;
  } | null>(null);
  const [resizeGestureDraft, setResizeGestureDraft] = useState<{
    nodeId: string;
    frame: LayoutBox["frame"];
  } | null>(null);
  const [activeCropHandle, setActiveCropHandle] = useState<{
    nodeId: string;
    handle: CropHandlePosition;
  } | null>(null);
  const [cropGestureDraft, setCropGestureDraft] = useState<{
    nodeId: string;
    crop: ImageCrop;
  } | null>(null);
  const [activeRotationNodeId, setActiveRotationNodeId] = useState<
    string | null
  >(null);
  const [rotationGestureDraft, setRotationGestureDraft] = useState<{
    nodeId: string;
    rotation: number;
  } | null>(null);
  const [activeConnectorEndpoint, setActiveConnectorEndpoint] = useState<{
    nodeId: string;
    endpoint: ConnectorEndpointHandle;
  } | null>(null);
  const [connectorGestureDraft, setConnectorGestureDraft] = useState<{
    nodeId: string;
    endpoint: ConnectorEndpointHandle;
    value: ConnectorEndpoint;
  } | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const isDesktopInspectorViewport = useDesktopInspectorViewport();
  const deckChromeToolbarPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!deckChromeToolbarOpen) return;
    const panel = deckChromeToolbarPanelRef.current;
    if (!panel) return;
    const focusTarget = panel.querySelector<HTMLElement>(
      "input, select, button, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusTarget?.focus();
  }, [deckChromeToolbarOpen]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    focusFirstMenuCommand(zoomMenuPanelRef.current);
  }, [zoomMenuOpen]);

  useEffect(() => {
    if (!footerStatusMenuOpen) return;
    focusFirstMenuCommand(footerStatusMenuPanelRef.current);
  }, [footerStatusMenuOpen]);

  useEffect(() => {
    if (!sourceMenuOpen) return;
    focusFirstMenuCommand(sourceMenuPanelRef.current);
  }, [sourceMenuOpen]);

  useEffect(() => {
    if (isDesktopInspectorViewport && inspectorSheetOpen) {
      setInspectorSheetOpen(false);
    }
  }, [inspectorSheetOpen, isDesktopInspectorViewport]);

  useEffect(() => {
    setMoveGestureDraft(null);
    setResizeGestureDraft(null);
    setCropGestureDraft(null);
    setRotationGestureDraft(null);
    setConnectorGestureDraft(null);
  }, [activeSlide?.id]);

  useEffect(() => {
    if (!undoRedoFocus) return;
    if (lastUndoRedoFocusTokenRef.current === undoRedoFocus.token) return;
    lastUndoRedoFocusTokenRef.current = undoRedoFocus.token;
    const nextSlideIndex = findSlideIndexForFocus(deck, undoRedoFocus.nodeId);
    if (nextSlideIndex < 0) {
      setSelection((s) => clearSelection(s));
      setFocusedNodeId(null);
      setInlineEditNodeId(null);
      window.setTimeout(() => editorRootRef.current?.focus(), 0);
      return;
    }

    const targetSlide = deck.slides[nextSlideIndex];
    const targetNode = targetSlide
      ? findNodeById(targetSlide.children, undoRedoFocus.nodeId)
      : undefined;
    setActiveSlideIndex(nextSlideIndex);
    setInlineEditNodeId(null);
    setHoveredNodeId(null);
    if (targetNode) {
      setSelection((s) => setSelectedNodeIds(s, [targetNode.id]));
      setFocusedNodeId(targetNode.id);
      window.setTimeout(() => focusStageNode(targetNode.id), 0);
      return;
    }

    setSelection((s) => clearSelection(s));
    setFocusedNodeId(null);
    window.setTimeout(() => editorRootRef.current?.focus(), 0);
  }, [deck, undoRedoFocus]);

  function requestInspectorPanel(panel: InspectorPanelId) {
    setInspectorPanelRequest((current) => ({
      panel,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }

  function openMobileInspector(panel: InspectorPanelId = "slide") {
    requestInspectorPanel(panel);
    setInspectorSheetOpen(true);
  }

  function closeMobileInspector() {
    setInspectorSheetOpen(false);
  }

  function handleNotesControlClick() {
    setSelection(createSelectionState(selection.mode));
    setInlineEditNodeId(null);
    requestInspectorPanel("notes");
    if (isMobileInspectorViewport()) {
      setInspectorSheetOpen(true);
      return;
    }
  }

  useEffect(() => {
    const node = stageViewportRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let frameId: number | null = null;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const paddingX =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight);
      const paddingY =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom);
      const next = {
        width: Math.max(1, rect.width - paddingX),
        height: Math.max(1, rect.height - paddingY),
      };
      setStageViewportSize((current) =>
        current?.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };
    const scheduleMeasure = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        measure();
      });
    };
    scheduleMeasure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(node);
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setFilmstripCollapsed(readFilmstripCollapsed(documentId));
  }, [documentId]);

  function toggleFilmstripCollapsed() {
    setFilmstripCollapsed((prev) => {
      const next = !prev;
      writeFilmstripCollapsed(documentId, next);
      return next;
    });
  }

  function toggleSnapToGuides() {
    const next = !snapToGuides;
    setSnapToGuides(next);
    if (!next) setStageGuides([]);
    setStageAnnouncement(next ? "Snap to guides on" : "Snap to guides off");
  }

  function setFooterZoom(percent: number) {
    setStageZoomPercent(percent);
    setZoomMenuOpen(false);
  }

  function closeZoomMenuAndRestoreFocus() {
    setZoomMenuOpen(false);
    zoomMenuTriggerRef.current?.focus();
  }

  function closeFooterStatusMenuAndRestoreFocus() {
    setFooterStatusMenuOpen(false);
    footerStatusMenuTriggerRef.current?.focus();
  }

  function closeSourceMenuAndRestoreFocus() {
    setSourceMenuOpen(false);
    sourceMenuTriggerRef.current?.focus();
  }

  function handleZoomMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeZoomMenuAndRestoreFocus();
      return;
    }
    if (!isMenuCommandNavigationKey(event.key)) return;
    if (
      moveMenuCommandFocus({
        container: zoomMenuPanelRef.current,
        key: event.key,
        currentTarget: event.target,
      })
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleFooterStatusMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeFooterStatusMenuAndRestoreFocus();
      return;
    }
    if (!isMenuCommandNavigationKey(event.key)) return;
    if (
      moveMenuCommandFocus({
        container: footerStatusMenuPanelRef.current,
        key: event.key,
        currentTarget: event.target,
      })
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleSourceMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSourceMenuAndRestoreFocus();
      return;
    }
    if (!isMenuCommandNavigationKey(event.key)) return;
    if (
      moveMenuCommandFocus({
        container: sourceMenuPanelRef.current,
        key: event.key,
        currentTarget: event.target,
      })
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function clearActiveEditingState(
    mode: SelectionState["mode"] = selection.mode,
  ) {
    setSelection(createSelectionState(mode));
    setFocusedNodeId(null);
    setHoveredNodeId(null);
    setActiveGroupId(null);
    clearTableEditing();
  }

  function handleInsertSlide() {
    setAddSlidePickerOpen(true);
  }

  function handleInsertTemplateSlide(choice: AddSlideTemplateChoice) {
    const template = TEMPLATE_REGISTRY.get(choice.kind);
    if (!template) return;
    const spec = emptySlideSpecFromLayout(
      choice.kind,
      choice.layoutId,
      TEMPLATE_REGISTRY,
    );
    const result = insertTemplateSlide(
      deck,
      spec,
      template,
      activeSlideIndex + 1,
    );
    onDeckChange(result.deck);
    setActiveSlideIndex(result.index);
    clearActiveEditingState();
    setAddSlidePickerOpen(false);
    setStageAnnouncement(`${template.label} slide added.`);
  }

  function handleInsertNode(node: SlideChildNode) {
    if (!activeSlide) return;
    const result = insertNode(deck, activeSlide.id, node);
    onDeckChange(result.deck);
    setSelection((s) => setSelectedNodeIds(s, [result.nodeId]));
    setFocusedNodeId(result.nodeId);
    window.setTimeout(() => focusStageNode(result.nodeId), 0);
  }

  function handleInsertText() {
    handleInsertNode(defaultTextNode(nextZIndex(activeSlide)));
  }

  function handleInsertShape() {
    handleInsertNode(defaultShapeNode(nextZIndex(activeSlide)));
  }

  function handleInsertTable() {
    handleInsertNode(defaultTableNode(nextZIndex(activeSlide)));
  }

  function handleInsertImage() {
    if (!activeSlide) return;
    insertImagePendingRef.current = true;
    replaceImageTargetIdRef.current = null;
    replaceImageFileInputRef.current?.click();
  }

  function handleReplaceSelectedImageRequest() {
    if (!selectedNode || selectedNode.type !== "image") return;
    insertImagePendingRef.current = false;
    replaceImageTargetIdRef.current = selectedNode.id;
    replaceImageFileInputRef.current?.click();
  }

  async function deckWithUploadedImageAsset(file: File): Promise<
    | {
        deckWithAsset: DeckV7;
        assetId: string;
        alt: string;
      }
    | undefined
  > {
    const upload = onUploadImage
      ? await onUploadImage(file)
      : { src: await readImageFileAsDataUrl(file) };
    if (!upload.src) return undefined;
    const assetId = upload.assetId ?? assetFactoryId("image");
    const alt = upload.alt ?? file.name;
    const mimeType = upload.mimeType ?? imageMimeType(file.type);
    return {
      deckWithAsset: {
        ...deck,
        assets: {
          ...deck.assets,
          images: {
            ...deck.assets.images,
            [assetId]: {
              id: assetId,
              src: upload.src,
              alt,
              ...(upload.widthPx ? { widthPx: upload.widthPx } : {}),
              ...(upload.heightPx ? { heightPx: upload.heightPx } : {}),
              ...(mimeType ? { mimeType } : {}),
              ...(upload.contentHash
                ? { contentHash: upload.contentHash }
                : {}),
              origin: { kind: "upload", importedAt: new Date().toISOString() },
            },
          },
        },
      },
      assetId,
      alt,
    };
  }

  async function handleReplaceImageFile(file: File | undefined) {
    const targetId = replaceImageTargetIdRef.current;
    const inserting = insertImagePendingRef.current;
    replaceImageTargetIdRef.current = null;
    insertImagePendingRef.current = false;
    if (!file || !activeSlide || (!targetId && !inserting)) return;
    if (!file.type.startsWith("image/")) {
      setExportError("Choose an image file to replace the selected image.");
      return;
    }
    try {
      const uploadedImage = await deckWithUploadedImageAsset(file);
      if (!uploadedImage) return;
      const { deckWithAsset, assetId, alt } = uploadedImage;
      if (inserting) {
        const node = defaultImageNode(nextZIndex(activeSlide));
        if (node.type !== "image") return;
        const result = insertNode(deckWithAsset, activeSlide.id, {
          ...node,
          content: { ...node.content, assetId, alt },
        });
        onDeckChange(result.deck);
        setSelection((s) => setSelectedNodeIds(s, [result.nodeId]));
        focusSelectedNodeSoon(result.nodeId);
      } else if (targetId) {
        onDeckChange(
          updateNodeContent(deckWithAsset, activeSlide.id, targetId, {
            assetId,
            alt,
          }),
        );
        setSelection((s) => setSelectedNodeIds(s, [targetId]));
        focusSelectedNodeSoon(targetId);
      }
      setExportError(null);
    } catch {
      setExportError("Image replacement failed. Please try another file.");
    }
  }

  function handleUploadSlideBackgroundImageRequest() {
    if (!activeSlide) return;
    replaceSlideBackgroundFileInputRef.current?.click();
  }

  async function handleReplaceSlideBackgroundImageFile(file: File | undefined) {
    if (!file || !activeSlide) return;
    if (!file.type.startsWith("image/")) {
      setExportError("Choose an image file to set the slide background.");
      return;
    }
    const slideId = activeSlide.id;
    try {
      const uploadedImage = await deckWithUploadedImageAsset(file);
      if (!uploadedImage) return;
      onDeckChange(
        updateSlideLocalStyle(uploadedImage.deckWithAsset, slideId, {
          slide: {
            background: {
              type: "image",
              assetId: uploadedImage.assetId,
              opacity: 1,
            },
          },
        }),
      );
      setExportError(null);
    } catch {
      setExportError(
        "Background image upload failed. Please try another file.",
      );
    }
  }

  async function handleInsertVisual() {
    if (!activeSlide) return;
    if (!onPickVisual) {
      handleInsertNode(defaultVisualNode(nextZIndex(activeSlide)));
      setExportError(null);
      return;
    }
    const pickResult = await runVisualPickerMutation({
      onPickVisual,
      onPicked: (picked) => {
        const deckWithAsset = deckWithPickedVisualAsset(deck, picked);
        const node = defaultVisualNode(nextZIndex(activeSlide));
        if (node.type !== "visual") return;
        const result = insertNode(deckWithAsset, activeSlide.id, {
          ...node,
          content: {
            ...node.content,
            ...visualContentPatchFromPick(picked),
          },
        });
        onDeckChange(result.deck);
        setSelection((s) => setSelectedNodeIds(s, [result.nodeId]));
        focusSelectedNodeSoon(result.nodeId);
      },
    });
    if (pickResult === "failed") {
      setExportError(VISUAL_PICKER_FAILURE_MESSAGE);
      return;
    }
    setExportError(null);
  }

  async function handleReplaceSelectedVisual() {
    if (!activeSlide || !selectedNode || selectedNode.type !== "visual") return;
    if (!onPickVisual) {
      setStageAnnouncement("No visual picker is configured for this editor.");
      return;
    }
    const pickResult = await runVisualPickerMutation({
      onPickVisual,
      onPicked: (picked) => {
        onDeckChange(
          updateNodeContent(
            deckWithPickedVisualAsset(deck, picked),
            activeSlide.id,
            selectedNode.id,
            visualContentPatchFromPick(picked),
          ),
        );
        setSelection((s) => setSelectedNodeIds(s, [selectedNode.id]));
        focusSelectedNodeSoon(selectedNode.id);
      },
    });
    if (pickResult === "failed") {
      setExportError(VISUAL_PICKER_FAILURE_MESSAGE);
      return;
    }
    setExportError(null);
  }

  function handleInsertConnector() {
    handleInsertNode(defaultConnectorNode(nextZIndex(activeSlide)));
  }

  function handleInsertDocumentSourceBlock(
    block: Parameters<typeof createDocumentSourceNode>[0]["block"],
  ) {
    if (!activeSlide) return;
    const result = insertNode(
      deck,
      activeSlide.id,
      createDocumentSourceNode({
        block,
        nodeId: nodeFactoryId(block.kind),
        zIndex: nextZIndex(activeSlide),
        linkedAt: new Date().toISOString(),
      }),
    );
    onDeckChange(result.deck);
    setSelection((s) => setSelectedNodeIds(s, [result.nodeId]));
    focusSelectedNodeSoon(result.nodeId);
    setSourceMenuOpen(false);
    setStageAnnouncement(
      `Inserted ${sourceBlockKindLabel(block.kind)} from document.`,
    );
  }

  function focusSelectedNodeSoon(nodeId: string | undefined) {
    if (!nodeId) return;
    setFocusedNodeId(nodeId);
    window.setTimeout(() => focusStageNode(nodeId), 0);
  }

  function focusStageViewportSoon() {
    window.setTimeout(() => {
      const stageViewport = stageViewportRef.current;
      if (stageViewport) {
        stageViewport.focus();
        return;
      }
      editorRootRef.current?.focus();
    }, 0);
  }

  function handleContextToolbarEscape() {
    if (firstSelectedId) {
      focusSelectedNodeSoon(firstSelectedId);
      return;
    }
    focusStageViewportSoon();
  }

  function handleCopyNodes() {
    if (!activeSlide || selectedIds.length === 0) return;
    const copied = selectedIds
      .map((id) => findNodeById(activeSlide.children, id))
      .filter((node): node is SlideChildNode => node !== undefined);
    setClipboardNodes(copied);
  }

  function handlePasteNodes() {
    if (!activeSlide || clipboardNodes.length === 0) return;
    const result = pasteNodes(deck, activeSlide.id, clipboardNodes);
    onDeckChange(result.deck);
    if (result.nodeIds.length > 0) {
      setSelection((s) => setSelectedNodeIds(s, result.nodeIds));
      focusSelectedNodeSoon(result.nodeIds[0]);
    }
  }

  function applySelectionDeletion(
    deletedIds: readonly string[],
    nextDeck: DeckV7,
  ) {
    if (!activeSlide || deletedIds.length === 0) return;
    const deletedCount = deletedIds.length;
    const replacementId = replacementNodeAfterDelete(deletedIds);
    onDeckChange(nextDeck);
    if (tableEditingNodeId && deletedIds.includes(tableEditingNodeId)) {
      clearTableEditing();
    }
    if (activeGroupId && deletedIds.includes(activeGroupId)) {
      setActiveGroupId(null);
    }
    if (replacementId) {
      setSelection((s) => setSelectedNodeIds(s, [replacementId]));
      setFocusedNodeId(replacementId);
      window.setTimeout(() => focusStageNode(replacementId), 0);
    } else {
      setSelection((s) => clearSelection(s));
      setFocusedNodeId(null);
      window.setTimeout(() => editorRootRef.current?.focus(), 0);
    }
    setStageAnnouncement(
      `Deleted ${deletedCount} ${deletedCount === 1 ? "node" : "nodes"}, ${Math.max(
        0,
        nodesInReadingOrder(activeSlide.children).length - deletedCount,
      )} remaining`,
    );
  }

  function handleCutNodes() {
    if (!activeSlide || selectedIds.length === 0) return;
    const result = cutNodes(deck, activeSlide.id, selectedIds);
    if (result.nodes.length === 0) return;
    setClipboardNodes(result.nodes);
    applySelectionDeletion(selectedIds, result.deck);
  }

  function handleGroupSelection() {
    if (!activeSlide || selectedIds.length < 2) return;
    const groupId = nodeFactoryId("group");
    onDeckChange(
      groupNodes(deck, activeSlide.id, selectedIds, groupId, {
        ref: "surface.card",
      }),
    );
    setSelection((s) => setSelectedNodeIds(s, [groupId]));
    setActiveGroupId(groupId);
    setStageAnnouncement("Grouped nodes. Group context active.");
    focusSelectedNodeSoon(groupId);
  }

  function handleUngroupSelection() {
    if (!activeSlide || !selectedNode || selectedNode.type !== "group") return;
    const result = ungroupNodes(deck, activeSlide.id, selectedNode.id);
    onDeckChange(result.deck);
    setActiveGroupId((current) =>
      current === selectedNode.id ? null : current,
    );
    if (result.nodeIds.length > 0) {
      setSelection((s) => setSelectedNodeIds(s, result.nodeIds));
      setStageAnnouncement("Ungrouped nodes");
      focusSelectedNodeSoon(result.nodeIds[0]);
    }
  }

  function handleNodeClick(nodeId: string, event: MouseEvent) {
    // Commit any active inline edit when clicking a different node
    if (inlineEditNodeId && inlineEditNodeId !== nodeId) {
      setInlineEditNodeId(null);
    }
    if (tableEditingNodeId && tableEditingNodeId !== nodeId) {
      clearTableEditing();
    }
    if (activeSlide) {
      const parentGroupId = parentGroupIdForNode(activeSlide.children, nodeId);
      if (parentGroupId) {
        setActiveGroupId(parentGroupId);
      } else if (activeGroupId && nodeId !== activeGroupId) {
        setActiveGroupId(null);
      }
    }
    setFocusedNodeId(nodeId);
    setSelection((s) => selectNode(s, nodeId, event.shiftKey || event.metaKey));
  }

  function handleNodeFocus(nodeId: string) {
    setFocusedNodeId(nodeId);
    if (activeSlide) {
      const parentGroupId = parentGroupIdForNode(activeSlide.children, nodeId);
      if (parentGroupId) setActiveGroupId(parentGroupId);
    }
    if (!selectedIds.includes(nodeId)) {
      setSelection((s) => setSelectedNodeIds(s, [nodeId]));
    }
  }

  function handleNodeHoverChange(nodeId: string, hovering: boolean) {
    setHoveredNodeId((current) => {
      if (hovering) return nodeId;
      return current === nodeId ? null : current;
    });
  }

  function replacementNodeAfterDelete(
    deletedIds: readonly string[],
  ): string | undefined {
    if (!activeSlide) return undefined;
    const deleted = new Set(deletedIds);
    const ordered = nodesInReadingOrder(activeSlide.children);
    const firstDeletedIndex = ordered.findIndex((node) => deleted.has(node.id));
    const remaining = ordered.filter((node) => !deleted.has(node.id));
    if (remaining.length === 0) return undefined;
    return remaining[
      Math.max(0, Math.min(firstDeletedIndex, remaining.length - 1))
    ]?.id;
  }

  function handleDeleteSelection() {
    if (!activeSlide || selectedIds.length === 0) return;
    applySelectionDeletion(
      selectedIds,
      deleteNodes(deck, activeSlide.id, selectedIds),
    );
  }

  function handleNodeDoubleClick(nodeId: string, _event: MouseEvent) {
    if (!activeSlide) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node) return;
    if (node.type === "group") {
      setActiveGroupId(node.id);
      const firstChildId = childIdsForGroup(activeSlide.children, node.id)[0];
      if (firstChildId) {
        setSelection((s) => setSelectedNodeIds(s, [firstChildId]));
        focusSelectedNodeSoon(firstChildId);
      }
      setStageAnnouncement("Entered group. Press Escape to exit group.");
      return;
    }
    if (node.type === "table") {
      handleEnterTableEdit(nodeId, { announcement: "Editing table cells" });
      return;
    }
    // Only text and shape (with text) nodes are inline-editable
    if (node.type === "text" || node.type === "shape") {
      setSelection((s) => setSelectedNodeIds(s, [nodeId]));
      setActiveGroupId(parentGroupIdForNode(activeSlide.children, nodeId));
      setInlineEditNodeId(nodeId);
    }
  }

  function handleInlineEditCommit(
    nodeId: string,
    paragraphs: import("@/lib/presentation-vnext/schema").Paragraph[],
    nextFrame?: LayoutBox["frame"],
    textAlign?: "left" | "center" | "right",
  ) {
    if (!activeSlide) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node || (node.type !== "text" && node.type !== "shape")) return;
    const updated = applyInlineTextCommit({
      deck,
      slideId: activeSlide.id,
      node,
      paragraphs,
      nextFrame,
      textAlign,
    });
    onDeckChange(updated);
    setInlineEditNodeId(null);
  }

  function handleInlineEditCancel() {
    setInlineEditNodeId(null);
  }

  function handleInlineEditTab(direction: 1 | -1) {
    if (!activeSlide || !inlineEditNodeId) return;
    const nextId = adjacentInlineEditableNodeId(
      activeSlide.children,
      inlineEditNodeId,
      direction,
    );
    if (!nextId || nextId === inlineEditNodeId) return;
    setSelection((s) => setSelectedNodeIds(s, [nextId]));
    setInlineEditNodeId(nextId);
  }

  function handleStageClick(e: MouseEvent) {
    if (suppressStageClickRef.current) return;
    if (isEditableTarget(e.target)) return;
    if (e.target instanceof HTMLElement && e.target.closest("[data-node-id]")) {
      return;
    }
    setSelection((s) => clearSelection(s));
    setFocusedNodeId(null);
    setActiveGroupId(null);
    clearTableEditing();
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeSlide || event.button !== 0 || isEditableTarget(event.target)) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (
        target.closest("[data-node-id]") ||
        target.closest("[data-resize-handle]") ||
        target.closest("[data-crop-handle]") ||
        target.closest("[data-rotation-handle]") ||
        target.closest("[data-connector-endpoint]")
      ) {
        return;
      }
    }
    const canvasElement = canvasElementFromTarget(event.target);
    if (!canvasElement) return;
    const rect = canvasElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    event.preventDefault();
    const start = pointPctFromEvent(event, rect);
    setMarqueeFrame({ ...start, w: 0, h: 0 });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const frame = normalizeSelectionFrame(
        start,
        pointPctFromEvent(moveEvent, rect),
      );
      setMarqueeFrame(frame);
      const ids = selectNodesInFrame(activeSlide.children, frame);
      setSelection((selectionState) => setSelectedNodeIds(selectionState, ids));
    };

    const handlePointerUp = () => {
      setMarqueeFrame((frame) => {
        if (frame && (frame.w > 0.5 || frame.h > 0.5)) {
          suppressStageClickRef.current = true;
          window.setTimeout(() => {
            suppressStageClickRef.current = false;
          }, 0);
        }
        return null;
      });
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleCropHandlePointerDown(
    nodeId: string,
    handle: CropHandlePosition,
    event: ReactPointerEvent,
  ) {
    if (!activeSlide || event.button !== 0) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node || node.type !== "image" || node.locked) return;
    const rect = canvasRectFromEvent(event);
    const frame = node.layout?.frame;
    if (!rect || !frame || frame.w <= 0 || frame.h <= 0) return;
    const start = pointPctFromEvent(event, rect);
    const startCrop: ImageCrop = {
      top: node.content.crop?.top ?? 0,
      right: node.content.crop?.right ?? 0,
      bottom: node.content.crop?.bottom ?? 0,
      left: node.content.crop?.left ?? 0,
    };

    event.preventDefault();
    event.stopPropagation();
    setActiveCropHandle({ nodeId, handle });
    setSelection((s) => setSelectedNodeIds(s, [nodeId]));
    const gesture = createSingleCommitGesture<ImageCrop>({
      initialValue: startCrop,
      equals: cropsEqual,
      onPreview: (crop) => setCropGestureDraft(crop ? { nodeId, crop } : null),
      onCommit: (crop) =>
        onDeckChange(updateNodeContent(deck, activeSlide.id, nodeId, { crop })),
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const point = pointPctFromEvent(moveEvent, rect);
      const deltaX = ((point.x - start.x) / frame.w) * 100;
      const deltaY = ((point.y - start.y) / frame.h) * 100;
      const nextCrop: ImageCrop = { ...startCrop };
      if (handle === "left") nextCrop.left = clampCrop(startCrop.left + deltaX);
      if (handle === "right") {
        nextCrop.right = clampCrop(startCrop.right - deltaX);
      }
      if (handle === "top") nextCrop.top = clampCrop(startCrop.top + deltaY);
      if (handle === "bottom") {
        nextCrop.bottom = clampCrop(startCrop.bottom - deltaY);
      }
      gesture.update(nextCrop);
      setStageAnnouncement(`Cropping image ${handle}`);
    };

    const handlePointerUp = () => {
      gesture.finish();
      setActiveCropHandle(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function handleResetSelectedImageCrop() {
    if (!activeSlide || !selectedNode || selectedNode.type !== "image") return;
    onDeckChange(resetImageCrop(deck, activeSlide.id, selectedNode.id));
    setSelection((s) => setSelectedNodeIds(s, [selectedNode.id]));
    focusSelectedNodeSoon(selectedNode.id);
    setStageAnnouncement("Image crop reset");
  }

  function toggleSelectionMode() {
    setSelection((s) =>
      setSelectionMode(s, s.mode === "normal" ? "layers" : "normal"),
    );
  }

  // ---------------------------------------------------------------------------
  // Resolved render tree
  // ---------------------------------------------------------------------------

  const renderTree = useDeckV7RenderTree(deck, pkg);
  const activeSlideTree = renderTree?.slides[activeSlideIndex] ?? null;
  const stageNodeGestureDrafts:
    | ReadonlyMap<string, SlideCanvasNodeGestureDraft>
    | undefined = (() => {
    const drafts = new Map<string, SlideCanvasNodeGestureDraft>();
    if (moveGestureDraft) {
      for (const [nodeId, draft] of moveGestureDraft) {
        drafts.set(nodeId, {
          ...(drafts.get(nodeId) ?? {}),
          ...draft,
        });
      }
    }
    if (resizeGestureDraft) {
      drafts.set(resizeGestureDraft.nodeId, {
        frame: resizeGestureDraft.frame,
      });
    }
    if (cropGestureDraft) {
      drafts.set(cropGestureDraft.nodeId, {
        ...(drafts.get(cropGestureDraft.nodeId) ?? {}),
        crop: cropGestureDraft.crop,
      });
    }
    if (rotationGestureDraft) {
      drafts.set(rotationGestureDraft.nodeId, {
        ...(drafts.get(rotationGestureDraft.nodeId) ?? {}),
        rotation: rotationGestureDraft.rotation,
      });
    }
    if (connectorGestureDraft) {
      drafts.set(connectorGestureDraft.nodeId, {
        ...(drafts.get(connectorGestureDraft.nodeId) ?? {}),
        connectorEndpoints: {
          ...(drafts.get(connectorGestureDraft.nodeId)?.connectorEndpoints ??
            {}),
          [connectorGestureDraft.endpoint]: connectorGestureDraft.value,
        },
      });
    }
    return drafts.size > 0 ? drafts : undefined;
  })();

  const exportDiagnostics = renderTree
    ? buildExportSpec(renderTree).diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === "unsupported-export-feature" ||
          diagnostic.code === "theme-decoration-export-fallback",
      )
    : [];
  const sourceDerivations = useMemo(
    () => deriveSourceReviewDerivations(deck, documentSourceIndex),
    [deck, documentSourceIndex],
  );
  const sourceClassifications = sourceDerivations.classifications;
  const diagnostics = dedupeDiagnostics([
    ...boundaryDiagnostics,
    ...(renderTree?.diagnostics ?? []),
    ...exportDiagnostics,
    ...sourceDerivations.diagnostics,
  ]);
  const sourceReview = sourceDerivations.reviewItems;
  const documentInsertBlocks = documentSourceInsertBlocks(documentSourceIndex);
  const sourceStatusLabel =
    documentSourceIndex === undefined
      ? "No live document source"
      : sourceReview.length > 0
        ? `${sourceReview.length} source issue${sourceReview.length === 1 ? "" : "s"}`
        : "Up to date";

  // ---------------------------------------------------------------------------
  // Selected node data (from the persisted deck, not the resolved tree)
  // ---------------------------------------------------------------------------

  const selectedIds = selectedNodeIds(selection);
  const firstSelectedId = selectedIds[0];

  const selectedNode: SlideChildNode | undefined =
    activeSlide && firstSelectedId
      ? findNodeById(activeSlide.children, firstSelectedId)
      : undefined;
  const selectedSourceClassification =
    activeSlide && firstSelectedId
      ? sourceClassifications.find(
          (item) =>
            item.slideId === activeSlide.id && item.nodeId === firstSelectedId,
        )
      : undefined;
  const selectedSource = selectedNode?.source;
  const {
    tableEditingNodeId,
    activeTableCell,
    clearTableEditing,
    handleEnterTableEdit,
    handleTableCellFocus,
    handleTableCellCommit,
    handleTableCellKeyDown,
  } = useTableCellEditing({
    deck,
    activeSlide,
    selectedNodeId: firstSelectedId,
    selectedNodeIds: selectedIds,
    findNodeById,
    setSelection,
    setFocusedNodeId,
    onDeckChange,
    setStageAnnouncement,
    focusSelectedNodeSoon,
  });
  const slidePresence = useSlidePresence({
    documentId,
    userName: presenceUserName,
    userId: presenceUserId,
    selectedSlideId: activeSlide?.id ?? null,
    selectedNodeIds: selectedIds,
    editingMode:
      inlineEditNodeId || tableEditingNodeId
        ? "editing"
        : selectedIds.length > 0
          ? "selecting"
          : "browsing",
    awareness: presenceAwareness,
    deck,
  });
  const remotePresencePeers = slidePresence.peers.filter((peer) => !peer.self);

  useEffect(() => {
    if (!activeSlide) {
      setActiveGroupId(null);
      clearTableEditing();
      return;
    }
    if (activeGroupId && !findNodeById(activeSlide.children, activeGroupId)) {
      setActiveGroupId(null);
    }
    if (
      tableEditingNodeId &&
      findNodeById(activeSlide.children, tableEditingNodeId)?.type !== "table"
    ) {
      clearTableEditing();
    }
  }, [activeGroupId, activeSlide, clearTableEditing, tableEditingNodeId]);

  // Also find the selected resolved node to support decoration detach
  const selectedResolvedNode: ResolvedRenderNode | undefined =
    activeSlideTree && firstSelectedId
      ? [
          ...activeSlideTree.nodes,
          ...(selection.mode === "layers" ? activeSlideTree.decorations : []),
          ...(selection.mode === "layers" ? activeSlideTree.chrome : []),
        ].find((n) => n.id === firstSelectedId)
      : undefined;

  useEffect(() => {
    if (selectedIds.length === 0) {
      setStageAnnouncement("Slide selected");
    } else if (selectedIds.length === 1) {
      const type = selectedNode?.type ?? "node";
      setStageAnnouncement(
        `${type.charAt(0).toUpperCase()}${type.slice(1)} selected`,
      );
    } else {
      setStageAnnouncement(`${selectedIds.length} nodes selected`);
    }
  }, [selectedIds, selectedNode?.type]);

  function resolveDeckAsset(assetId: string): string | undefined {
    return resolveDeckAssetSource(deck, assetId);
  }

  function handleNodePointerDown(nodeId: string, event: ReactPointerEvent) {
    if (!activeSlide || event.button !== 0 || isEditableTarget(event.target)) {
      return;
    }
    const nextSelection = selectedIds.includes(nodeId)
      ? selection
      : selectNode(selection, nodeId, event.shiftKey || event.metaKey);
    const dragIds = topLevelSelectedNodeIds(
      activeSlide.children,
      new Set(selectedNodeIds(nextSelection)),
    );
    setSelection(nextSelection);

    const rect = canvasRectFromEvent(event);
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    const originalFrames = new Map<string, LayoutBox["frame"]>();
    for (const id of dragIds) {
      const node = findNodeById(activeSlide.children, id);
      if (!node?.layout || node.locked) continue;
      originalFrames.set(id, node.layout.frame);
    }
    if (originalFrames.size === 0) return;
    const alignmentGuides = alignmentGuidesForFrames(
      layoutFramesExcluding(activeSlide.children, new Set(dragIds)),
    );

    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    let dragThresholdPassed = false;
    const gesture = createSingleCommitGesture<NodeMovePreview>({
      initialValue: {
        patches: new Map<string, Partial<LayoutBox>>(),
        guides: [],
      },
      equals: nodeMovePreviewsEqual,
      onPreview: (preview) => {
        setMoveGestureDraft(nodeMoveGestureDrafts(preview));
        setStageGuides(preview?.guides ?? []);
      },
      onCommit: (preview) =>
        onDeckChange(updateNodeLayouts(deck, activeSlide.id, preview.patches)),
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const preview = createNodeMovePreview({
        startClientX: startX,
        startClientY: startY,
        nextClientX: moveEvent.clientX,
        nextClientY: moveEvent.clientY,
        rectWidth: rect.width,
        rectHeight: rect.height,
        originalFrames,
        alignmentGuides,
        snapToGuides: snapToGuides && !moveEvent.altKey,
      });
      if (!preview) return;
      if (!dragThresholdPassed) {
        dragThresholdPassed = true;
        setDraggingStage(true);
      }
      gesture.update(preview);
    };

    const handlePointerUp = () => {
      gesture.finish();
      setDraggingStage(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function handleResizeHandlePointerDown(
    nodeId: string,
    handle: ResizeHandlePosition,
    event: ReactPointerEvent,
  ) {
    if (!activeSlide || event.button !== 0) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node?.layout || node.locked) return;
    const rect = canvasRectFromEvent(event);
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    setActiveResizeHandle({ nodeId, handle });
    const startX = event.clientX;
    const startY = event.clientY;
    const originalFrame = node.layout.frame;
    const alignmentGuides = alignmentGuidesForFrames(
      layoutFramesExcluding(activeSlide.children, new Set([nodeId])),
    );
    const gesture = createSingleCommitGesture<LayoutBox["frame"]>({
      initialValue: originalFrame,
      equals: framesEqual,
      onPreview: (frame) =>
        setResizeGestureDraft(frame ? { nodeId, frame } : null),
      onCommit: (frame) =>
        onDeckChange(
          updateNodeLayout(deck, activeSlide.id, nodeId, {
            frame,
          }),
        ),
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
      const nextFrame = node.layout?.constraints?.preserveAspectRatio
        ? applyAspectLock(
            originalFrame,
            resizeFrame(originalFrame, handle, deltaX, deltaY),
          )
        : resizeFrame(originalFrame, handle, deltaX, deltaY);
      const snapped =
        snapToGuides && !moveEvent.altKey
          ? snapFrameToStageGuides(nextFrame, 0.75, alignmentGuides)
          : { frame: nextFrame, guides: [] as StageGuide[] };
      setStageGuides(snapped.guides);
      gesture.update(snapped.frame);
    };

    const handlePointerUp = () => {
      gesture.finish();
      setActiveResizeHandle(null);
      setStageGuides([]);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function handleRotationHandlePointerDown(
    nodeId: string,
    event: ReactPointerEvent,
  ) {
    if (!activeSlide || event.button !== 0) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node?.layout || node.locked || node.type === "connector") return;
    const rect = canvasRectFromEvent(event);
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const frame = node.layout.frame;
    const center = {
      x: rect.left + ((frame.x + frame.w / 2) / 100) * rect.width,
      y: rect.top + ((frame.y + frame.h / 2) / 100) * rect.height,
    };
    const startAngle =
      (Math.atan2(event.clientY - center.y, event.clientX - center.x) * 180) /
      Math.PI;
    const startRotation = node.layout.rotation ?? 0;

    event.preventDefault();
    event.stopPropagation();
    setActiveRotationNodeId(nodeId);
    setSelection((s) => setSelectedNodeIds(s, [nodeId]));
    const gesture = createSingleCommitGesture<number>({
      initialValue: startRotation,
      onPreview: (rotation) =>
        setRotationGestureDraft(
          rotation === null ? null : { nodeId, rotation },
        ),
      onCommit: (rotation) =>
        onDeckChange(
          updateNodeRotation(deck, activeSlide.id, nodeId, rotation),
        ),
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const angle =
        (Math.atan2(
          moveEvent.clientY - center.y,
          moveEvent.clientX - center.x,
        ) *
          180) /
        Math.PI;
      const rotation = snapRotationDegrees(
        startRotation + angle - startAngle,
        !moveEvent.altKey,
      );
      gesture.update(rotation);
      setStageAnnouncement(`Rotated to ${Math.round(rotation)} degrees`);
    };

    const handlePointerUp = () => {
      gesture.finish();
      setActiveRotationNodeId(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function handleConnectorEndpointPointerDown(
    nodeId: string,
    endpoint: ConnectorEndpointHandle,
    event: ReactPointerEvent,
  ) {
    if (!activeSlide || event.button !== 0) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node?.layout || node.type !== "connector" || node.locked) return;
    const rect = canvasRectFromEvent(event);
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    setActiveConnectorEndpoint({ nodeId, endpoint });
    setSelection((s) => setSelectedNodeIds(s, [nodeId]));
    const connectorFrame = node.layout.frame;
    const startEndpoint = node.content[endpoint];
    const gesture = createSingleCommitGesture<ConnectorEndpoint>({
      initialValue: startEndpoint,
      equals: connectorEndpointsEqual,
      onPreview: (value) =>
        setConnectorGestureDraft(value ? { nodeId, endpoint, value } : null),
      onCommit: (value) =>
        onDeckChange(
          updateNodeContent(deck, activeSlide.id, nodeId, {
            [endpoint]: value,
          }),
        ),
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const slidePoint = pointPctFromEvent(moveEvent, rect);
      const snapped =
        nearestConnectorAnchor(activeSlide.children, slidePoint, nodeId) ??
        connectorEndpointFromSlidePoint(slidePoint, connectorFrame);
      gesture.update(snapped);
      setStageAnnouncement(
        snapped.kind === "node"
          ? `Connector ${endpoint} bound to ${snapped.anchor} anchor`
          : `Connector ${endpoint} moved`,
      );
    };

    const handlePointerUp = () => {
      gesture.finish();
      setActiveConnectorEndpoint(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Don't intercept keys when inline editing is active (inline editor handles them)
    if (inlineEditNodeId) return;
    if (isEditableTarget(event.target)) return;
    if (!activeSlide) return;
    if (event.key === "Tab") {
      const nextId = adjacentNodeId(
        activeSlide.children,
        firstSelectedId,
        event.shiftKey ? -1 : 1,
      );
      if (nextId) {
        setSelection((s) => setSelectedNodeIds(s, [nextId]));
        setFocusedNodeId(nextId);
        window.setTimeout(() => focusStageNode(nextId), 0);
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Escape") {
      if (tableEditingNodeId) {
        const tableId = tableEditingNodeId;
        clearTableEditing();
        focusSelectedNodeSoon(tableId);
        event.preventDefault();
        return;
      }
      if (activeGroupId) {
        const groupId = activeGroupId;
        setActiveGroupId(null);
        setSelection((s) => setSelectedNodeIds(s, [groupId]));
        focusSelectedNodeSoon(groupId);
        setStageAnnouncement("Exited group");
        event.preventDefault();
        return;
      }
      if (selectedIds.length > 0) {
        setSelection((s) => clearSelection(s));
      } else {
        handleCloseRequest();
      }
      event.preventDefault();
      return;
    }

    // Enter key enters inline edit mode on the selected text/shape node
    if (event.key === "Enter" && selectedIds.length === 1 && selectedNode) {
      if (selectedNode.type === "group") {
        setActiveGroupId(selectedNode.id);
        const firstChildId = childIdsForGroup(
          activeSlide.children,
          selectedNode.id,
        )[0];
        if (firstChildId) {
          setSelection((s) => setSelectedNodeIds(s, [firstChildId]));
          focusSelectedNodeSoon(firstChildId);
        }
        setStageAnnouncement("Entered group. Press Escape to exit group.");
        event.preventDefault();
        return;
      }
      if (selectedNode.type === "table") {
        handleEnterTableEdit(selectedNode.id);
        event.preventDefault();
        return;
      }
      if (selectedNode.type === "text" || selectedNode.type === "shape") {
        setInlineEditNodeId(selectedNode.id);
        event.preventDefault();
        return;
      }
    }

    const clipboardAction = clipboardShortcutActionFromKey(event);

    if (clipboardAction === "paste") {
      handlePasteNodes();
      event.preventDefault();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      if (event.shiftKey) {
        onRedo?.();
      } else {
        onUndo?.();
      }
      event.preventDefault();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
      onRedo?.();
      event.preventDefault();
      return;
    }

    if (event.key === "?") {
      setShortcutHelpOpen((open) => !open);
      event.preventDefault();
      return;
    }

    if (selectedIds.length === 0) return;

    if (clipboardAction === "copy") {
      handleCopyNodes();
      event.preventDefault();
      return;
    }

    if (clipboardAction === "cut") {
      handleCutNodes();
      event.preventDefault();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g") {
      if (event.shiftKey) {
        handleUngroupSelection();
      } else {
        handleGroupSelection();
      }
      event.preventDefault();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      handleDeleteSelection();
      event.preventDefault();
      return;
    }

    const nudge = event.shiftKey ? 5 : 1;
    const deltaByKey: Record<string, { x: number; y: number } | undefined> = {
      ArrowLeft: { x: -nudge, y: 0 },
      ArrowRight: { x: nudge, y: 0 },
      ArrowUp: { x: 0, y: -nudge },
      ArrowDown: { x: 0, y: nudge },
    };
    const delta = deltaByKey[event.key];
    if (delta) {
      if (event.altKey) {
        const patches = new Map<string, Partial<LayoutBox>>();
        for (const entry of collectSelectedLayoutEntries(
          activeSlide.children,
          selectedIds,
        )) {
          const resized = clampFrame({
            ...entry.frame,
            w: entry.frame.w + delta.x,
            h: entry.frame.h + delta.y,
          });
          patches.set(entry.id, {
            frame: entry.node.layout?.constraints?.preserveAspectRatio
              ? applyAspectLock(entry.frame, resized)
              : resized,
          });
        }
        if (patches.size > 0) {
          onDeckChange(updateNodeLayouts(deck, activeSlide.id, patches));
          setStageAnnouncement(
            `Resized ${patches.size} ${patches.size === 1 ? "node" : "nodes"}`,
          );
        }
        event.preventDefault();
        return;
      }
      onDeckChange(moveNodesBy(deck, activeSlide.id, selectedIds, delta));
      const direction =
        delta.x < 0
          ? "left"
          : delta.x > 0
            ? "right"
            : delta.y < 0
              ? "up"
              : "down";
      setStageAnnouncement(
        `Moved ${selectedIds.length} ${selectedIds.length === 1 ? "node" : "nodes"} ${direction}`,
      );
      event.preventDefault();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
      const result = duplicateNodes(deck, activeSlide.id, selectedIds);
      onDeckChange(result.deck);
      if (result.duplicatedIds.length > 0) {
        setSelection((s) => setSelectedNodeIds(s, result.duplicatedIds));
        focusSelectedNodeSoon(result.duplicatedIds[0]);
      }
      event.preventDefault();
      return;
    }

    const arrangeKind = canvasArrangeShortcutKind(event);
    if (arrangeKind) {
      handleReorderSelection(arrangeKind);
      event.preventDefault();
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Slide root controls
  // ---------------------------------------------------------------------------

  function handleUpdateControls(patch: Partial<SlideControls>) {
    if (!activeSlide) return;
    onDeckChange(updateSlideControls(deck, activeSlide.id, patch));
  }

  function handleUpdateProps(patch: Partial<SlideProps>) {
    if (!activeSlide) return;
    // SlideProps (decoration/chrome) updates are applied via updateSlideControls
    // by merging into the slide props
    const updated: DeckV7 = {
      ...deck,
      slides: deck.slides.map((s) => {
        if (s.id !== activeSlide.id) return s;
        const props = { ...s.props, ...patch };
        const detachedNodeIds = new Set<string>();
        if (Object.prototype.hasOwnProperty.call(patch, "deckChrome")) {
          const nextDeckChrome = patch.deckChrome;
          for (const kind of DECK_CHROME_KINDS) {
            const previousOverride = s.props?.deckChrome?.[kind];
            if (
              previousOverride?.mode !== "detached" ||
              !previousOverride.nodeId
            ) {
              continue;
            }
            const nextOverride = nextDeckChrome?.[kind];
            if (
              nextOverride?.mode !== "detached" ||
              nextOverride.nodeId !== previousOverride.nodeId
            ) {
              detachedNodeIds.add(previousOverride.nodeId);
            }
          }
        }
        for (const key of Object.keys(props) as (keyof SlideProps)[]) {
          if (props[key] === undefined) {
            delete props[key];
          }
        }
        return {
          ...s,
          props: Object.keys(props).length > 0 ? props : undefined,
          children:
            detachedNodeIds.size > 0
              ? s.children.filter((child) => !detachedNodeIds.has(child.id))
              : s.children,
        };
      }),
    };
    onDeckChange(updated);
  }

  function handleUpdateDeckChrome(patch: Partial<DeckChromeConfig>) {
    onDeckChange(updateDeckChrome(deck, patch));
  }

  function handleUpdateSlideAttributes(patch: {
    name?: string;
    notes?: string;
  }) {
    if (!activeSlide) return;
    onDeckChange(updateSlideAttributes(deck, activeSlide.id, patch));
  }

  function handleUpdateSlideLocalStyle(patch: StylePatch) {
    if (!activeSlide) return;
    onDeckChange(updateSlideLocalStyle(deck, activeSlide.id, patch));
  }

  function handleResetSlideLocalStyle() {
    if (!activeSlide) return;
    onDeckChange(resetSlideLocalStyle(deck, activeSlide.id));
  }

  function handleUpdateSlideSource(source: NodeSourceMetadata | undefined) {
    if (!activeSlide) return;
    onDeckChange(updateSlideSourceMetadata(deck, activeSlide.id, source));
  }

  // ---------------------------------------------------------------------------
  // Style binding
  // ---------------------------------------------------------------------------

  function handleChangeStyleBinding(binding: StyleBinding) {
    if (!activeSlide || !firstSelectedId) return;
    onDeckChange(
      updateNodeStyleBinding(deck, activeSlide.id, firstSelectedId, binding),
    );
  }

  function handleUpdateSelectedLayout(patch: Partial<LayoutBox>) {
    if (!activeSlide || !firstSelectedId) return;
    const frame =
      patch.frame !== undefined ? clampFrame(patch.frame) : undefined;
    const rotation =
      patch.rotation !== undefined
        ? normalizeRotationDegrees(patch.rotation)
        : undefined;
    const zIndex =
      patch.zIndex !== undefined && Number.isFinite(patch.zIndex)
        ? Math.trunc(patch.zIndex)
        : undefined;
    onDeckChange(
      updateNodeLayout(deck, activeSlide.id, firstSelectedId, {
        ...patch,
        ...(frame !== undefined ? { frame } : {}),
        ...(rotation !== undefined ? { rotation } : {}),
        ...(zIndex !== undefined ? { zIndex } : {}),
      }),
    );
  }

  function handleUpdateSelectedAttributes(patch: {
    locked?: boolean;
    hidden?: boolean;
  }) {
    if (!activeSlide || !firstSelectedId) return;
    let updated = deck;
    for (const id of selectedIds.length > 0 ? selectedIds : [firstSelectedId]) {
      updated = updateNodeAttributes(updated, activeSlide.id, id, patch);
    }
    onDeckChange(updated);
    if (patch.locked !== undefined) {
      setStageAnnouncement(
        patch.locked ? "Selection locked" : "Selection unlocked",
      );
      focusSelectedNodeSoon(firstSelectedId);
    }
    if (patch.hidden === true) {
      const affectedIds =
        selectedIds.length > 0 ? selectedIds : [firstSelectedId];
      const replacementId = replacementNodeAfterDelete(affectedIds);
      if (replacementId) {
        setSelection((s) => setSelectedNodeIds(s, [replacementId]));
        focusSelectedNodeSoon(replacementId);
      } else {
        setSelection((s) => clearSelection(s));
        setFocusedNodeId(null);
        window.setTimeout(() => editorRootRef.current?.focus(), 0);
      }
    }
  }

  function handleUpdateSelectedContent(patch: Record<string, unknown>) {
    if (!activeSlide || !firstSelectedId) return;
    onDeckChange(
      updateNodeContent(deck, activeSlide.id, firstSelectedId, patch),
    );
  }

  // ---------------------------------------------------------------------------
  // Local override reset
  // ---------------------------------------------------------------------------

  function handleResetToTheme() {
    if (!activeSlide || !firstSelectedId) return;
    onDeckChange(
      resetLocalStyleOverride(deck, activeSlide.id, firstSelectedId),
    );
  }

  function handleUpdateSelectedLocalStyle(patch: StylePatch) {
    if (!activeSlide || !firstSelectedId) return;
    onDeckChange(
      updateLocalStyle(deck, activeSlide.id, firstSelectedId, patch),
    );
  }

  function handleUpdateSelectedSource(source: NodeSourceMetadata | undefined) {
    if (!activeSlide || !firstSelectedId) return;
    onDeckChange(
      updateNodeSourceMetadata(deck, activeSlide.id, firstSelectedId, source),
    );
  }

  async function handleRefreshSelectedSource() {
    if (!activeSlide || !selectedNode?.source) return;
    const result = await refreshSelectedSourceLink({
      deck,
      slide: activeSlide,
      node: selectedNode,
      now: new Date().toISOString(),
      sourceBlockIndex: documentSourceIndex,
      onRefreshSource,
    });
    if (!result) return;
    applySourceLinkOrchestration(result);
  }

  function handleSelectSourceItem(slideId: string, nodeId: string) {
    const slideIndex = deck.slides.findIndex((slide) => slide.id === slideId);
    if (slideIndex === -1) return;
    setActiveSlideIndex(slideIndex);
    setSelection((s) => setSelectedNodeIds(s, [nodeId]));
    focusSelectedNodeSoon(nodeId);
  }

  function applySourceLinkOrchestration(
    result: SourceLinkOrchestrationResult,
  ): void {
    if (result.deck) {
      onDeckChange(result.deck);
    }
    if (result.selection) {
      handleSelectSourceItem(result.selection.slideId, result.selection.nodeId);
    }
    if (result.statusMessage) {
      setSourceReviewStatus(result.statusMessage);
    }
    if (result.announcement) {
      setStageAnnouncement(result.announcement);
    }
  }

  function handleRefreshSourceAt(slideId: string, nodeId: string) {
    if (!documentSourceIndex) return;
    applySourceLinkOrchestration(
      refreshSourceReviewItem({
        deck,
        sourceBlockIndex: documentSourceIndex,
        slideId,
        nodeId,
        now: new Date().toISOString(),
      }),
    );
  }

  function handleUnlinkSourceAt(slideId: string, nodeId: string) {
    applySourceLinkOrchestration(
      unlinkSourceReviewItem({
        deck,
        slideId,
        nodeId,
        now: new Date().toISOString(),
      }),
    );
  }

  function handleRelinkSourceAt(
    slideId: string,
    nodeId: string,
    block: SourceBlockIndexEntry,
  ) {
    applySourceLinkOrchestration(
      relinkSourceReviewItem({
        deck,
        slideId,
        nodeId,
        block,
        now: new Date().toISOString(),
      }),
    );
  }

  function handleDismissSourceAt(slideId: string, nodeId: string) {
    if (!documentSourceIndex) return;
    applySourceLinkOrchestration(
      dismissSourceReviewItem({
        deck,
        sourceBlockIndex: documentSourceIndex,
        slideId,
        nodeId,
        now: new Date().toISOString(),
      }),
    );
  }

  function handleRefreshAllSources() {
    if (!documentSourceIndex) return;
    applySourceLinkOrchestration(
      refreshAllSourceReviewItems({
        deck,
        sourceBlockIndex: documentSourceIndex,
        now: new Date().toISOString(),
      }),
    );
  }

  function handleSyncFromDocument() {
    handleRefreshAllSources();
    setSourceMenuOpen(false);
  }

  function handleReviewSourceLinks() {
    const [first] = sourceReview;
    if (!first) return;
    handleSelectSourceItem(first.slideId, first.nodeId);
    requestInspectorPanel("source");
    if (isMobileInspectorViewport()) setInspectorSheetOpen(true);
    setSourceMenuOpen(false);
  }

  function handleSelectLayer(nodeId: string) {
    setSelection((s) => setSelectedNodeIds(s, [nodeId]));
    if (activeSlide) {
      setActiveGroupId(parentGroupIdForNode(activeSlide.children, nodeId));
    }
    focusSelectedNodeSoon(nodeId);
  }

  function handleUpdateLayer(
    nodeId: string,
    patch: { name?: string; locked?: boolean; hidden?: boolean },
  ) {
    if (!activeSlide) return;
    onDeckChange(updateNodeAttributes(deck, activeSlide.id, nodeId, patch));
  }

  function handleReorderLayer(nodeId: string, targetIndex: number) {
    if (!activeSlide) return;
    const patches = buildLayerReorderPatches(
      activeSlide.children,
      nodeId,
      targetIndex,
    );
    if (patches.size === 0) return;
    onDeckChange(updateNodeLayouts(deck, activeSlide.id, patches));
  }

  function handleAlignSelection(mode: SelectionAlignMode) {
    if (!activeSlide) return;
    const entries = collectSelectedLayoutEntries(
      activeSlide.children,
      selectedIds,
    );
    const patches = buildAlignSelectionPatches(entries, mode);
    if (patches.size === 0) return;
    onDeckChange(updateNodeLayouts(deck, activeSlide.id, patches));
  }

  function handleDistributeSelection(mode: SelectionDistributeMode) {
    if (!activeSlide) return;
    const entries = collectSelectedLayoutEntries(
      activeSlide.children,
      selectedIds,
    );
    const patches = buildDistributeSelectionPatches(entries, mode);
    if (patches.size === 0) return;
    onDeckChange(updateNodeLayouts(deck, activeSlide.id, patches));
  }

  function handleMatchSize(mode: SelectionMatchSizeMode) {
    if (!activeSlide) return;
    const entries = collectSelectedLayoutEntries(
      activeSlide.children,
      selectedIds,
    );
    const patches = buildMatchSizeSelectionPatches(entries, mode);
    if (patches.size === 0) return;
    onDeckChange(updateNodeLayouts(deck, activeSlide.id, patches));
  }

  function handleReorderSelection(
    kind: "forward" | "backward" | "front" | "back",
  ) {
    if (!activeSlide || selectedIds.length === 0) return;
    const operations = buildZOrderSelectionOperations(
      activeSlide.children,
      selectedIds,
      kind,
    );
    if (operations.length === 0) return;
    let updated = deck;
    operations.forEach((operation) => {
      updated = reorderZIndex(
        updated,
        activeSlide.id,
        operation.id,
        operation.zIndex,
      );
    });
    onDeckChange(updated);
  }

  function handleDuplicateActiveSlide() {
    if (!activeSlide) return;
    const result = duplicateSlide(deck, activeSlide.id);
    onDeckChange(result.deck);
    if (result.index >= 0) setActiveSlideIndex(result.index);
    setSelection(createSelectionState(selection.mode));
  }

  function handleDeleteActiveSlide() {
    const result = deleteActiveSlideFromToolbar(deck, activeSlide?.id);
    if (!result.deleted) {
      if (result.statusMessage) {
        setStageAnnouncement(result.statusMessage);
      }
      return;
    }
    onDeckChange(result.nextDeck);
    setActiveSlideIndex(result.nextIndex);
    setSelection(createSelectionState(selection.mode));
  }

  // ---------------------------------------------------------------------------
  // Diagnostics actions
  // ---------------------------------------------------------------------------

  function focusDiagnosticTarget(
    focus: { slideId: string; nodeId?: string },
    sourceDeck: DeckV7 = deck,
  ) {
    const slideIndex = sourceDeck.slides.findIndex(
      (slide) => slide.id === focus.slideId,
    );
    if (slideIndex < 0) return;
    const targetSlide = sourceDeck.slides[slideIndex];
    const node =
      focus.nodeId && targetSlide
        ? findNodeById(targetSlide.children, focus.nodeId)
        : undefined;
    setActiveSlideIndex(slideIndex);
    setInlineEditNodeId(null);
    setHoveredNodeId(null);
    if (node) {
      setSelection((s) => setSelectedNodeIds(s, [node.id]));
      setFocusedNodeId(node.id);
      focusSelectedNodeSoon(node.id);
      return;
    }
    setSelection((s) => clearSelection(s));
    setFocusedNodeId(null);
  }

  function handleDiagnosticNavigate(diagnostic: PresentationDiagnostic) {
    const nodeId = getDiagnosticNodeId(diagnostic);
    const slideId = getDiagnosticSlideId(diagnostic);
    const slideIndex = slideId
      ? deck.slides.findIndex((slide) => slide.id === slideId)
      : nodeId
        ? findSlideIndexForFocus(deck, nodeId)
        : -1;
    if (slideIndex < 0) {
      setStageAnnouncement("Diagnostic target is no longer present.");
      return;
    }
    const targetSlide = deck.slides[slideIndex];
    const targetNode =
      nodeId && targetSlide
        ? findNodeById(targetSlide.children, nodeId)
        : undefined;
    focusDiagnosticTarget({
      slideId: targetSlide.id,
      ...(targetNode ? { nodeId: targetNode.id } : {}),
    });
    requestInspectorPanel("diagnostics");
    if (isMobileInspectorViewport()) setInspectorSheetOpen(true);
    setDeckDiagnosticsReviewOpen(false);
    setStageAnnouncement(
      targetNode
        ? "Moved to diagnostic target node."
        : "Moved to diagnostic target slide.",
    );
  }

  function handleDiagnosticAction(
    action: DiagnosticAction,
    diagnostic: PresentationDiagnostic,
  ) {
    if (
      action.type === "refresh-source" ||
      action.type === "unlink-source" ||
      action.type === "relink-source" ||
      action.type === "open-source-review"
    ) {
      const targetedDiagnostic = action.target
        ? { ...diagnostic, target: action.target }
        : diagnostic;
      const targetNodeId =
        getDiagnosticNodeId(targetedDiagnostic) ?? firstSelectedId;
      const targetSlideId =
        getDiagnosticSlideId(targetedDiagnostic) ?? activeSlide?.id;

      if (action.type === "open-source-review") {
        if (targetSlideId && targetNodeId) {
          handleSelectSourceItem(targetSlideId, targetNodeId);
          requestInspectorPanel("source");
          if (isMobileInspectorViewport()) setInspectorSheetOpen(true);
        }
        setDeckDiagnosticsReviewOpen(false);
        setStageAnnouncement("Opened Source Review.");
        return;
      }

      if (!targetSlideId || !targetNodeId) {
        setStageAnnouncement("Source diagnostic target is no longer present.");
        return;
      }

      if (action.type === "refresh-source") {
        handleRefreshSourceAt(targetSlideId, targetNodeId);
        setDeckDiagnosticsReviewOpen(false);
        return;
      }
      if (action.type === "unlink-source") {
        handleUnlinkSourceAt(targetSlideId, targetNodeId);
        setDeckDiagnosticsReviewOpen(false);
        return;
      }

      handleSelectSourceItem(targetSlideId, targetNodeId);
      requestInspectorPanel("source");
      if (isMobileInspectorViewport()) setInspectorSheetOpen(true);
      setDeckDiagnosticsReviewOpen(false);
      setStageAnnouncement("Choose a source block to relink this node.");
      return;
    }

    const result = applyDiagnosticRepairAction(deck, action, diagnostic, {
      activeSlideId: activeSlide?.id,
      selectedNodeId: firstSelectedId,
      defaultStyleBindingForNode,
    });

    if (result.status === "noop") {
      setStageAnnouncement(result.reason);
      return;
    }

    if (result.status === "applied") {
      onDeckChange(result.deck);
      focusDiagnosticTarget(result.focus, result.deck);
      setStageAnnouncement(result.announcement);
      return;
    }

    if (result.port === "asset-panel") {
      focusDiagnosticTarget(result.focus);
      const slide = deck.slides.find(
        (candidate) => candidate.id === result.focus.slideId,
      );
      const node =
        result.focus.nodeId && slide
          ? findNodeById(slide.children, result.focus.nodeId)
          : undefined;
      if (node?.type === "image") {
        replaceImageTargetIdRef.current = node.id;
        insertImagePendingRef.current = false;
        replaceImageFileInputRef.current?.click();
      } else {
        requestInspectorPanel("diagnostics");
        setStageAnnouncement(
          "Select the asset field in the inspector to repair this node.",
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Decoration detach
  // ---------------------------------------------------------------------------

  function handleDetachDecoration() {
    if (!activeSlide || !selectedResolvedNode) return;
    if (
      selectedResolvedNode.source !== "themeDecoration" &&
      selectedResolvedNode.source !== "deckChrome"
    ) {
      return;
    }

    if (selectedResolvedNode.source === "deckChrome") {
      if (!selectedResolvedNode.chromeKind) return;
      onDeckChange(
        detachDeckChrome(
          deck,
          activeSlide.id,
          selectedResolvedNode.chromeKind,
          selectedResolvedNode,
        ),
      );
      return;
    }

    const { layout, style } = selectedResolvedNode;
    // Build a LayoutBox from the resolved layout (drop framePx)
    const { framePx: _framePx, ...persistedLayout } = layout;
    const decorationContent =
      selectedResolvedNode.content.type === "text" ||
      selectedResolvedNode.content.type === "image" ||
      selectedResolvedNode.content.type === "shape"
        ? selectedResolvedNode.content
        : undefined;
    onDeckChange(
      detachDecoration(
        deck,
        activeSlide.id,
        selectedResolvedNode.id,
        persistedLayout,
        style as StylePatch,
        decorationContent,
      ),
    );
  }

  const stageFit = canvasStageFit(
    deck,
    stageZoomPercent,
    stageViewportSize,
    isDesktopInspectorViewport,
  );
  const stageFrameStyle = canvasFrameStyle(stageFit);
  const stageScrollStyle = stageScrollContentStyle(stageFit);
  const activeSlideName = slideDisplayName(activeSlide, activeSlideIndex);
  const selectedNodeSummary = selectedSummary(selectedIds.length);
  const diagnosticSummary = diagnosticsSummary(diagnostics.length);
  const saveErrorAnnouncement =
    saveStatus === "error"
      ? saveErrorMessage
        ? `${saveStatusLabel}. ${saveErrorMessage}`
        : saveStatusLabel
      : null;
  const selectionModeLabel =
    selection.mode === "layers" ? "Layers mode" : "Normal mode";
  const activeTemplate = activeSlide
    ? TEMPLATE_REGISTRY.get(activeSlide.template.kind)
    : undefined;
  const activeLayoutId = activeSlide?.template.layoutId;
  const activeSlideBackgroundColor =
    activeSlide?.localStyle?.slide?.background?.type === "solid" &&
    typeof activeSlide.localStyle.slide.background.color === "string"
      ? activeSlide.localStyle.slide.background.color
      : "#ffffff";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isDecorationSelected =
    selectedResolvedNode?.source === "themeDecoration" ||
    selectedResolvedNode?.source === "deckChrome";
  const inspectorKey = `${inspectorPanelRequest?.panel ?? "auto"}-${inspectorPanelRequest?.nonce ?? 0}`;
  const renderInspectorShell = () => (
    <InspectorShell
      key={inspectorKey}
      initialPanel={inspectorPanelRequest?.panel}
      activeSlide={activeSlide}
      deckChrome={deck.chrome}
      selectedNode={selectedNode}
      selectedResolvedStyle={selectedResolvedNode?.style}
      selectedIds={selectedIds}
      isDecorationSelected={isDecorationSelected}
      selectedGeneratedSource={
        selectedResolvedNode?.source === "themeDecoration" ||
        selectedResolvedNode?.source === "deckChrome"
          ? selectedResolvedNode.source
          : undefined
      }
      diagnostics={diagnostics}
      layerDecorations={activeSlideTree?.decorations}
      layerChrome={activeSlideTree?.chrome}
      onUpdateControls={handleUpdateControls}
      onUpdateProps={handleUpdateProps}
      onUpdateDeckChrome={handleUpdateDeckChrome}
      onUpdateSlideAttributes={handleUpdateSlideAttributes}
      onUpdateSlideLocalStyle={handleUpdateSlideLocalStyle}
      onResetSlideLocalStyle={handleResetSlideLocalStyle}
      onUpdateSlideSource={handleUpdateSlideSource}
      onUploadSlideBackgroundImage={handleUploadSlideBackgroundImageRequest}
      onUpdateSelectedLayout={
        handleUpdateSelectedLayout as Parameters<
          typeof InspectorShell
        >[0]["onUpdateSelectedLayout"]
      }
      onUpdateSelectedAttributes={handleUpdateSelectedAttributes}
      onUpdateSelectedContent={handleUpdateSelectedContent}
      onUpdateSelectedLocalStyle={handleUpdateSelectedLocalStyle}
      assetResolver={resolveDeckAsset}
      onReplaceImage={handleReplaceSelectedImageRequest}
      onReplaceVisual={handleReplaceSelectedVisual}
      onResetToTheme={handleResetToTheme}
      onUpdateSelectedSource={handleUpdateSelectedSource}
      onRefreshSelectedSource={handleRefreshSelectedSource}
      onUnlinkSelectedSource={
        activeSlide && selectedNode
          ? () => handleUnlinkSourceAt(activeSlide.id, selectedNode.id)
          : undefined
      }
      onRelinkSelectedSource={
        activeSlide && selectedNode
          ? (block) =>
              handleRelinkSourceAt(activeSlide.id, selectedNode.id, block)
          : undefined
      }
      selectedSourceClassification={selectedSourceClassification}
      sourceBlocks={documentSourceIndex?.blocks}
      onChangeStyleBinding={handleChangeStyleBinding}
      onAlignSelection={handleAlignSelection}
      onDistributeSelection={handleDistributeSelection}
      onMatchSize={handleMatchSize}
      onGroupSelection={handleGroupSelection}
      onUngroupSelection={handleUngroupSelection}
      onReorderSelection={handleReorderSelection}
      onSelectLayer={handleSelectLayer}
      onUpdateLayer={handleUpdateLayer}
      onReorderLayer={handleReorderLayer}
      onDetachDecoration={handleDetachDecoration}
      onDiagnosticAction={handleDiagnosticAction}
      TEMPLATE_OPTIONS={TEMPLATE_OPTIONS}
      activeTemplate={activeTemplate}
      activeLayoutId={activeLayoutId}
      onReapplyTemplate={handleReapplyTemplate}
      selectionMode={selection.mode}
      onToggleSelectionMode={toggleSelectionMode}
    />
  );

  return (
    <div
      role="dialog"
      aria-label="Slide editor"
      data-slide-editor-vnext="true"
      ref={editorRootRef}
      tabIndex={-1}
      onKeyDown={handleEditorKeyDown}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-ds-surface"
    >
      <input
        ref={replaceImageFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          handleReplaceImageFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={replaceSlideBackgroundFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          handleReplaceSlideBackgroundImageFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {addSlidePickerOpen ? (
        <>
          <div
            data-floating-panel="true"
            aria-hidden="true"
            onClick={() => setAddSlidePickerOpen(false)}
            className="fixed inset-0 z-modal bg-ds-backdrop"
          />
          <FocusTrapped>
            <div
              data-floating-panel="true"
              role="dialog"
              aria-modal="true"
              aria-label="Add semantic slide"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setAddSlidePickerOpen(false);
                }
              }}
              className="fixed inset-x-4 top-8 z-modal mx-auto flex max-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden rounded-ds-lg border border-ds-border-subtle bg-ds-surface-overlay shadow-ds-overlay"
            >
              <AddSlideTemplatePicker
                templates={TEMPLATE_OPTIONS}
                onChoose={handleInsertTemplateSlide}
                onClose={() => setAddSlidePickerOpen(false)}
              />
            </div>
          </FocusTrapped>
        </>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Top Toolbar                                                         */}
      {/* ------------------------------------------------------------------ */}
      <header
        role="toolbar"
        aria-label="Slide editing tools"
        data-slide-editor-chrome="true"
        className="flex shrink-0 items-center justify-between gap-3 border-b border-ds-border-subtle bg-ds-surface-chrome px-3 py-2 backdrop-blur"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 flex-col">
            {deckTitleEditing ? (
              <input
                value={deckTitleDraft}
                autoFocus
                onChange={(event) =>
                  setDeckTitleDraft(event.currentTarget.value)
                }
                onBlur={handleDeckTitleCommit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleDeckTitleCommit();
                  if (event.key === "Escape") {
                    setDeckTitleDraft(deck.title ?? "Slides");
                    setDeckTitleEditing(false);
                  }
                }}
                className="h-6 min-w-0 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1.5 text-sm font-semibold text-ds-text-primary outline-none focus:border-ds-accent focus:ring-2 focus:ring-ds-focus-ring/20"
                aria-label="Deck title"
              />
            ) : (
              <button
                type="button"
                onClick={() => setDeckTitleEditing(true)}
                className="truncate text-left text-sm font-semibold text-ds-text-primary underline-offset-2 hover:underline"
                aria-label="Rename deck"
              >
                {deck.title ?? "Slides"}
              </button>
            )}
            <span className="truncate text-[11px] text-ds-text-muted">
              {activeSlideName} · {deck.slides.length} slides · {pkg.name}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Theme picker */}
          <label className="flex items-center gap-1.5 text-xs text-ds-text-muted">
            Theme
            <select
              value={deck.theme.packageId}
              onChange={(event) =>
                handleThemePackageChange(event.currentTarget.value)
              }
              className="h-8 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2 text-xs font-medium text-ds-text-primary"
            >
              {themePackages.map((themePackageOption) => (
                <option
                  key={themePackageOption.id}
                  value={themePackageOption.id}
                >
                  {themePackageOption.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-ds-text-muted">
            Ratio
            <select
              value={
                deck.canvas.format === "custom" ? "16:9" : deck.canvas.format
              }
              onChange={(event) =>
                handleCanvasRatioChange(
                  event.currentTarget.value as "16:9" | "4:3" | "square",
                )
              }
              className="h-8 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2 text-xs font-medium text-ds-text-primary"
            >
              <option value="16:9">16:9</option>
              <option value="4:3">4:3</option>
              <option value="square">1:1</option>
            </select>
          </label>

          <Popover
            open={sourceMenuOpen}
            onClose={() => setSourceMenuOpen(false)}
            role="menu"
            aria-label="Document source commands"
            className="w-72 p-2"
            trigger={
              <button
                ref={sourceMenuTriggerRef}
                type="button"
                aria-label="Document source"
                aria-haspopup="menu"
                aria-expanded={sourceMenuOpen}
                aria-controls={sourceMenuOpen ? sourceMenuId : undefined}
                onClick={() => setSourceMenuOpen((open) => !open)}
                className={cx(
                  "relative flex h-8 items-center gap-1 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2.5 text-xs font-medium text-ds-text-primary transition-colors hover:bg-ds-state-hover",
                  FOCUS_RING,
                )}
              >
                Source
                <ChevronDown size={12} aria-hidden="true" />
                {sourceReview.length > 0 ? (
                  <span className="absolute -right-1 -top-1 rounded-full bg-ds-warning-surface px-1 text-[10px] font-bold text-ds-warning-text">
                    {sourceReview.length}
                  </span>
                ) : null}
              </button>
            }
          >
            <div
              ref={sourceMenuPanelRef}
              id={sourceMenuId}
              className="space-y-1"
              onKeyDown={handleSourceMenuKeyDown}
            >
              <div className="rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-secondary">
                {sourceStatusLabel}
              </div>
              {documentSourceIndex ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSyncFromDocument}
                  className={cx(
                    "flex w-full items-center rounded-ds-sm px-2 py-1.5 text-left text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                    FOCUS_RING,
                  )}
                >
                  Sync from document
                </button>
              ) : null}
              {sourceReview.length > 0 ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleReviewSourceLinks}
                  className={cx(
                    "flex w-full items-center rounded-ds-sm px-2 py-1.5 text-left text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                    FOCUS_RING,
                  )}
                >
                  Review source links
                </button>
              ) : null}
              {selectedSource && selectedNode && activeSlide ? (
                <>
                  <div className="my-1 border-t border-ds-border-subtle" />
                  <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-ds-text-muted">
                    Selected source
                  </p>
                  <p className="truncate px-2 py-1 text-[11px] text-ds-text-secondary">
                    {(selectedSource.blockKind ?? "source").toString()} ·{" "}
                    {selectedSource.blockId ?? "linked"}
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void handleRefreshSelectedSource();
                      closeSourceMenuAndRestoreFocus();
                    }}
                    className={cx(
                      "flex w-full items-center rounded-ds-sm px-2 py-1.5 text-left text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                      FOCUS_RING,
                    )}
                  >
                    Refresh selected source
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      handleUnlinkSourceAt(activeSlide.id, selectedNode.id);
                      closeSourceMenuAndRestoreFocus();
                    }}
                    className={cx(
                      "flex w-full items-center rounded-ds-sm px-2 py-1.5 text-left text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                      FOCUS_RING,
                    )}
                  >
                    Mark selected as unlinked
                  </button>
                </>
              ) : null}
              {documentInsertBlocks.length > 0 ? (
                <>
                  <div className="my-1 border-t border-ds-border-subtle" />
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ds-text-muted">
                    From document
                  </p>
                  {documentInsertBlocks.map((block) => (
                    <button
                      key={`${block.kind}:${block.id}`}
                      type="button"
                      role="menuitem"
                      onClick={() => handleInsertDocumentSourceBlock(block)}
                      className={cx(
                        "flex w-full min-w-0 flex-col items-start rounded-ds-sm px-2 py-1.5 text-left text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                        FOCUS_RING,
                      )}
                    >
                      <span className="w-full truncate font-medium text-ds-text-primary">
                        {block.displayLabel}
                      </span>
                      <span className="w-full truncate text-[10px] text-ds-text-muted">
                        {sourceBlockKindLabel(block.kind)} · {block.id}
                      </span>
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </Popover>

          <Popover
            open={deckChromeToolbarOpen}
            onClose={() => setDeckChromeToolbarOpen(false)}
            aria-label="Deck chrome controls"
            className="max-h-[calc(100vh-6rem)] w-[22rem] overflow-y-auto p-0"
            trigger={
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={deckChromeToolbarOpen}
                aria-label="Deck chrome"
                onClick={() => setDeckChromeToolbarOpen((open) => !open)}
                className={cx(
                  "flex h-8 items-center gap-1.5 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2.5 text-xs font-medium text-ds-text-primary transition-colors hover:bg-ds-state-hover",
                  FOCUS_RING,
                )}
              >
                Deck chrome
              </button>
            }
          >
            <div
              ref={deckChromeToolbarPanelRef}
              data-deck-chrome-toolbar-panel="true"
            >
              <DeckChromePanel
                idPrefix="deck-chrome-toolbar"
                chrome={deck.chrome}
                slideProps={activeSlide?.props}
                onUpdateChrome={handleUpdateDeckChrome}
                onUpdateSlideProps={handleUpdateProps}
              />
            </div>
          </Popover>
          <Tooltip
            label={snapToGuides ? "Snap to guides: on" : "Snap to guides: off"}
            side="bottom"
          >
            <button
              type="button"
              aria-label="Toggle snap to guides"
              aria-pressed={snapToGuides}
              onClick={toggleSnapToGuides}
              className={cx(
                "flex h-8 items-center gap-1.5 rounded-ds-sm border px-2.5 text-xs font-medium transition-colors",
                snapToGuides
                  ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
                  : "border-ds-border-subtle bg-ds-surface text-ds-text-primary hover:bg-ds-state-hover",
                FOCUS_RING,
              )}
            >
              <Grid3x3 size={14} aria-hidden="true" />
              Snap
            </button>
          </Tooltip>

          <div
            className="mx-1 h-5 w-px bg-ds-border-subtle"
            aria-hidden="true"
          />

          {/* Clipboard */}
          <button
            type="button"
            onClick={handleCopyNodes}
            aria-label="Copy selected nodes"
            disabled={selectedIds.length === 0}
            className="flex h-8 w-8 items-center justify-center rounded-ds-sm border border-ds-border-subtle bg-ds-surface text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-40"
          >
            <Copy size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleCutNodes}
            aria-label="Cut selected nodes"
            disabled={selectedIds.length === 0}
            className="flex h-8 w-8 items-center justify-center rounded-ds-sm border border-ds-border-subtle bg-ds-surface text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-40"
          >
            <Scissors size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handlePasteNodes}
            aria-label="Paste nodes"
            disabled={clipboardNodes.length === 0 || !activeSlide}
            className="flex h-8 w-8 items-center justify-center rounded-ds-sm border border-ds-border-subtle bg-ds-surface text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-40"
          >
            <ClipboardPaste size={14} aria-hidden="true" />
          </button>

          {/* Group/Ungroup */}
          <button
            type="button"
            onClick={
              selectedNode?.type === "group"
                ? handleUngroupSelection
                : handleGroupSelection
            }
            aria-label={
              selectedNode?.type === "group"
                ? "Ungroup selected nodes"
                : "Group selected nodes"
            }
            disabled={
              selectedNode?.type === "group" ? false : selectedIds.length < 2
            }
            className="flex h-8 w-8 items-center justify-center rounded-ds-sm border border-ds-border-subtle bg-ds-surface text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-40"
          >
            {selectedNode?.type === "group" ? (
              <Ungroup size={14} aria-hidden="true" />
            ) : (
              <Group size={14} aria-hidden="true" />
            )}
          </button>

          <div
            className="mx-1 h-5 w-px bg-ds-border-subtle"
            aria-hidden="true"
          />

          {/* Keyboard shortcuts */}
          <button
            type="button"
            onClick={() => setShortcutHelpOpen(true)}
            aria-label="Keyboard shortcuts"
            className="flex h-8 w-8 items-center justify-center rounded-ds-sm border border-ds-border-subtle bg-ds-surface text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary"
          >
            <Keyboard size={14} aria-hidden="true" />
          </button>

          {/* Undo / Redo */}
          <button
            type="button"
            onClick={onUndo}
            aria-label="Undo"
            disabled={!canUndo}
            className="flex h-8 w-8 items-center justify-center rounded-ds-sm border border-ds-border-subtle bg-ds-surface text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-40"
          >
            <Undo2 size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            aria-label="Redo"
            disabled={!canRedo}
            className="flex h-8 w-8 items-center justify-center rounded-ds-sm border border-ds-border-subtle bg-ds-surface text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-40"
          >
            <Redo2 size={14} aria-hidden="true" />
          </button>

          <div
            className="mx-1 h-5 w-px bg-ds-border-subtle"
            aria-hidden="true"
          />

          <div
            className="flex h-8 items-center gap-1.5 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-secondary"
            aria-label={
              hasRemotePeers(slidePresence.peers)
                ? `Slide collaborators: ${remotePresencePeers
                    .map((peer) =>
                      presencePeerSummary(peer, deck, activeSlide?.id),
                    )
                    .join("; ")}`
                : "No other slide collaborators"
            }
          >
            <Users size={13} aria-hidden="true" />
            <span className="font-medium">
              {remotePresencePeers.length > 0
                ? `${remotePresencePeers.length} present`
                : "Solo"}
            </span>
          </div>

          <div
            className="mx-1 h-5 w-px bg-ds-border-subtle"
            aria-hidden="true"
          />

          {/* Deck diagnostics review */}
          <button
            type="button"
            onClick={() => setDeckDiagnosticsReviewOpen(true)}
            aria-label={`Open deck diagnostics review (${diagnosticsSummary(
              diagnostics.length,
            )})`}
            className="flex h-8 items-center gap-1.5 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2.5 text-xs font-medium text-ds-text-primary transition-colors hover:bg-ds-state-hover"
          >
            Diagnostics
            {diagnostics.length > 0 ? (
              <span className="rounded-full bg-ds-danger-surface px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-ds-danger-text">
                {diagnostics.length}
              </span>
            ) : (
              <span className="text-[11px] text-ds-text-muted">0</span>
            )}
          </button>

          <div
            className="mx-1 h-5 w-px bg-ds-border-subtle"
            aria-hidden="true"
          />

          {/* Save / Export / Close */}
          {onSave ? (
            <button
              type="button"
              onClick={() => void onSave(deck)}
              aria-label="Save slide deck"
              disabled={saveStatus === "saving"}
              className="flex h-8 items-center gap-1.5 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2.5 text-xs font-medium text-ds-text-primary transition-colors hover:bg-ds-state-hover"
            >
              <Save size={14} aria-hidden="true" />
              {saveStatus === "saving" ? "Saving" : "Save"}
            </button>
          ) : null}
          {onExportPptx ? (
            <button
              type="button"
              onClick={() => void handleExportPptx()}
              aria-label="Export as PPTX"
              className="flex h-8 items-center gap-1.5 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2.5 text-xs font-medium text-ds-text-primary transition-colors hover:bg-ds-state-hover"
            >
              <FileDown size={14} aria-hidden="true" />
              Export PPTX
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={handleCloseRequest}
              aria-label="Close slide editor"
              className="flex h-8 w-8 items-center justify-center rounded-ds-md border border-ds-border-subtle bg-ds-surface text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      {/* Export error banner */}
      {exportError ? (
        <div
          role="alert"
          className="shrink-0 border-b border-ds-danger-border bg-ds-danger-surface px-3 py-2 text-xs text-ds-danger-text"
        >
          {exportError}
        </div>
      ) : null}

      {documentSourceIndex ? (
        <SourceReviewPanel
          items={sourceReview}
          sourceBlocks={documentSourceIndex.blocks}
          onSelect={handleSelectSourceItem}
          onRefresh={handleRefreshSourceAt}
          onUnlink={handleUnlinkSourceAt}
          onRelink={handleRelinkSourceAt}
          onDismiss={handleDismissSourceAt}
          onRefreshAll={handleRefreshAllSources}
          statusMessage={sourceReviewStatus}
        />
      ) : null}

      <KeyboardShortcutHelpDialog
        open={shortcutHelpOpen}
        isMac={isMac}
        onClose={() => setShortcutHelpOpen(false)}
      />

      {deckDiagnosticsReviewOpen ? (
        <FocusTrapped>
          <DeckDiagnosticsReview
            diagnostics={diagnostics}
            onClose={() => setDeckDiagnosticsReviewOpen(false)}
            onNavigate={handleDiagnosticNavigate}
            onAction={handleDiagnosticAction}
          />
        </FocusTrapped>
      ) : null}
      {closeConfirmOpen ? (
        <SlideEditorCloseConfirmDialog
          onCancel={() =>
            handleCloseConfirmAction("cancel", {
              closeCloseConfirmDialog: () => setCloseConfirmOpen(false),
              closeEditor: () => onClose?.(),
            })
          }
          onDiscard={() =>
            handleCloseConfirmAction("discard", {
              closeCloseConfirmDialog: () => setCloseConfirmOpen(false),
              closeEditor: () => onClose?.(),
            })
          }
        />
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Editor surface (stage + inspector — rail moved to bottom filmstrip)  */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative isolate min-h-0 flex-1 overflow-hidden bg-ds-surface-recessed">
        {/* ------------------------------------------------------------------ */}
        {/* Main Stage                                                          */}
        {/* ------------------------------------------------------------------ */}
        <div
          data-slide-stage-shell="true"
          data-slide-toolbar-anchor="true"
          className="relative h-full min-w-0 overflow-hidden bg-ds-surface-recessed"
          onClick={handleStageClick}
          onPointerDown={handleStagePointerDown}
        >
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {stageAnnouncement}
          </div>

          {activeGroupId ? (
            <div className="absolute left-4 top-4 z-panel flex items-center gap-2 rounded-ds-md border border-ds-warning-border bg-ds-warning-surface px-2.5 py-1.5 text-xs text-ds-warning-text shadow-ds-popover">
              <span>Editing group</span>
              <button
                type="button"
                onClick={() => {
                  const groupId = activeGroupId;
                  setActiveGroupId(null);
                  setSelection((s) => setSelectedNodeIds(s, [groupId]));
                  focusSelectedNodeSoon(groupId);
                  setStageAnnouncement("Exited group");
                }}
                className="rounded-ds-sm px-1.5 py-0.5 font-medium underline-offset-2 hover:underline"
              >
                Exit
              </button>
            </div>
          ) : null}

          {/* Context / Popover Toolbar */}
          <ContextToolbar
            selectedIds={selectedIds}
            selectedNode={selectedNode}
            selectedResolvedStyle={selectedResolvedNode?.style}
            isInlineEditing={inlineEditNodeId !== null}
            isDragging={
              draggingStage ||
              activeResizeHandle !== null ||
              activeCropHandle !== null ||
              activeRotationNodeId !== null ||
              activeConnectorEndpoint !== null
            }
            isDecorationSelected={isDecorationSelected}
            onDelete={handleDeleteSelection}
            onCut={handleCutNodes}
            onDuplicate={() => {
              if (!activeSlide) return;
              const result = duplicateNodes(deck, activeSlide.id, selectedIds);
              onDeckChange(result.deck);
              if (result.duplicatedIds.length > 0) {
                setSelection((s) =>
                  setSelectedNodeIds(s, result.duplicatedIds),
                );
                focusSelectedNodeSoon(result.duplicatedIds[0]);
              }
            }}
            onGroup={handleGroupSelection}
            onUngroup={handleUngroupSelection}
            onBringForward={() => handleReorderSelection("forward")}
            onSendBackward={() => handleReorderSelection("backward")}
            onBringToFront={() => handleReorderSelection("front")}
            onSendToBack={() => handleReorderSelection("back")}
            onAlignSelection={handleAlignSelection}
            onDistributeSelection={handleDistributeSelection}
            onMatchSize={handleMatchSize}
            onUpdateSelectedContent={handleUpdateSelectedContent}
            onUpdateSelectedLayout={handleUpdateSelectedLayout}
            onUpdateSelectedLocalStyle={handleUpdateSelectedLocalStyle}
            onUpdateSelectedAttributes={handleUpdateSelectedAttributes}
            onReplaceImage={handleReplaceSelectedImageRequest}
            onReplaceVisual={handleReplaceSelectedVisual}
            onResetImageCrop={handleResetSelectedImageCrop}
            onEnterTableEdit={() => handleEnterTableEdit()}
            slideBackgroundColor={activeSlideBackgroundColor}
            onUpdateSlideLocalStyle={handleUpdateSlideLocalStyle}
            onInsertSlide={handleInsertSlide}
            onInsertText={handleInsertText}
            onInsertShape={handleInsertShape}
            onInsertImage={handleInsertImage}
            onInsertVisual={() => void handleInsertVisual()}
            onInsertConnector={handleInsertConnector}
            onInsertTable={handleInsertTable}
            onDuplicateSlide={handleDuplicateActiveSlide}
            onDeleteSlide={handleDeleteActiveSlide}
            canDeleteSlide={deck.slides.length > 1}
            onDetachDecoration={handleDetachDecoration}
            onRequestStageFocus={handleContextToolbarEscape}
          />

          {activeSlideTree ? (
            <div
              ref={stageViewportRef}
              data-slide-stage-viewport="true"
              tabIndex={-1}
              className={cx(
                "box-border h-full min-h-0 p-6",
                stageFit.needsScroll ? "overflow-auto" : "overflow-hidden",
              )}
            >
              <div style={stageScrollStyle}>
                <div
                  ref={handleCanvasRef}
                  data-slide-stage-frame="true"
                  className="relative"
                  style={stageFrameStyle}
                >
                  <SlideCanvasVNext
                    slide={activeSlideTree}
                    canvas={renderTree?.canvas}
                    assetResolver={resolveDeckAsset}
                    selection={selection}
                    onNodeClick={handleNodeClick}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onNodePointerDown={handleNodePointerDown}
                    onNodeFocus={handleNodeFocus}
                    onNodeHoverChange={handleNodeHoverChange}
                    onResizeHandlePointerDown={handleResizeHandlePointerDown}
                    onCropHandlePointerDown={handleCropHandlePointerDown}
                    onRotationHandlePointerDown={
                      handleRotationHandlePointerDown
                    }
                    onConnectorEndpointPointerDown={
                      handleConnectorEndpointPointerDown
                    }
                    nodeGestureDrafts={stageNodeGestureDrafts}
                    activeResizeHandle={activeResizeHandle}
                    activeCropHandle={activeCropHandle}
                    activeRotationNodeId={activeRotationNodeId}
                    activeConnectorEndpoint={activeConnectorEndpoint}
                    activeGroupId={activeGroupId}
                    tableEditingNodeId={tableEditingNodeId}
                    activeTableCell={activeTableCell}
                    onTableCellFocus={handleTableCellFocus}
                    onTableCellCommit={handleTableCellCommit}
                    onTableCellKeyDown={handleTableCellKeyDown}
                    hiddenNodeIds={
                      inlineEditNodeId ? new Set([inlineEditNodeId]) : undefined
                    }
                    hoveredNodeId={hoveredNodeId}
                    focusedNodeId={focusedNodeId ?? firstSelectedId ?? null}
                    className="rounded-ds-sm shadow-ds-xl ring-1 ring-ds-border-subtle"
                  />

                  {/* Inline text editor overlay */}
                  {inlineEditNodeId &&
                    activeSlide &&
                    canvasElement &&
                    (() => {
                      const editNode = findNodeById(
                        activeSlide.children,
                        inlineEditNodeId,
                      );
                      if (!editNode?.layout) return null;
                      const canvasEl = canvasElement.querySelector(
                        '[data-slide-canvas-vnext="true"]',
                      );
                      const canvasRect =
                        canvasEl?.getBoundingClientRect() ??
                        canvasElement.getBoundingClientRect();
                      const paragraphs =
                        editNode.type === "text"
                          ? editNode.content.paragraphs
                          : editNode.type === "shape" && editNode.content.text
                            ? editNode.content.text.paragraphs
                            : [{ id: `${inlineEditNodeId}-p-1`, text: "" }];
                      const resolvedEditNode = activeSlideTree.nodes.find(
                        (node) => node.id === inlineEditNodeId,
                      );
                      return (
                        <InlineTextEditorVNext
                          nodeId={inlineEditNodeId}
                          initialParagraphs={paragraphs}
                          frame={editNode.layout.frame}
                          canvasRect={canvasRect}
                          textStyle={resolveNodeFontCss(
                            resolvedEditNode?.style,
                          )}
                          autoHeight={editNode.layout.autoHeight === true}
                          onCommit={handleInlineEditCommit}
                          onCancel={handleInlineEditCancel}
                          onTabNext={() => handleInlineEditTab(1)}
                          onTabPrev={() => handleInlineEditTab(-1)}
                        />
                      );
                    })()}

                  {stageGuides.length > 0 ? (
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{ zIndex: STAGE_CHROME_Z_INDEX.snapGuide }}
                    >
                      {stageGuides.map((guide, index) => (
                        <span
                          key={`${guide.axis}-${guide.positionPct}-${index}`}
                          className="absolute bg-ds-accent-fill/70"
                          style={
                            guide.axis === "x"
                              ? {
                                  left: `${guide.positionPct}%`,
                                  top: 0,
                                  width: 1,
                                  height: "100%",
                                }
                              : {
                                  left: 0,
                                  top: `${guide.positionPct}%`,
                                  width: "100%",
                                  height: 1,
                                }
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                  {marqueeFrame ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute border border-ds-accent-border bg-ds-accent-surface/25"
                      style={{
                        left: `${marqueeFrame.x}%`,
                        top: `${marqueeFrame.y}%`,
                        width: `${marqueeFrame.w}%`,
                        height: `${marqueeFrame.h}%`,
                        zIndex: STAGE_CHROME_Z_INDEX.marquee,
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ds-text-muted">
              No slide selected
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Inspector Panel (tab-routed)                                        */}
        {/* ------------------------------------------------------------------ */}
        <SlideEditorInspectorRegion
          isDesktopInspectorViewport={isDesktopInspectorViewport}
          activeSlide={activeSlide}
          inspectorSheetOpen={inspectorSheetOpen}
          onOpenMobileInspector={openMobileInspector}
          onCloseMobileInspector={closeMobileInspector}
          renderInspectorShell={renderInspectorShell}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom Filmstrip                                                     */}
      {/* ------------------------------------------------------------------ */}
      {renderTree && (
        <Filmstrip
          renderTree={renderTree}
          activeSlideIndex={activeSlideIndex}
          collapsed={filmstripCollapsed}
          assetResolver={resolveDeckAsset}
          onSelectSlide={(index) => {
            setActiveSlideIndex(index);
            setSelection(createSelectionState(selection.mode));
            setInlineEditNodeId(null);
            setActiveGroupId(null);
            clearTableEditing();
          }}
          onInsertSlide={handleInsertSlide}
          onDuplicateSlide={(slideId) => {
            const result = duplicateSlide(deck, slideId);
            onDeckChange(result.deck);
            if (result.index >= 0) setActiveSlideIndex(result.index);
            setSelection(createSelectionState(selection.mode));
          }}
          onDeleteSlide={(slideId) => {
            const result = deleteSlide(deck, slideId);
            onDeckChange(result.deck);
            setActiveSlideIndex(result.index);
            setSelection(createSelectionState(selection.mode));
          }}
          onMoveSlide={(slideId, targetIndex) => {
            const result = moveSlide(deck, slideId, targetIndex);
            onDeckChange(result.deck);
            if (result.index >= 0) setActiveSlideIndex(result.index);
          }}
        />
      )}

      {/* Footer status bar */}
      <footer
        data-slide-bottom-dock="true"
        className="tiq-safe-bottom-dock grid min-h-9 shrink-0 grid-cols-1 items-center gap-2 bg-transparent px-3 py-1 text-[11px] text-ds-text-muted sm:h-9 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3 sm:py-0"
      >
        <div className="hidden min-w-0 items-center gap-3 sm:flex">
          <span className="truncate">{selectedNodeSummary}</span>
          {remotePresencePeers.length > 0 ? (
            <span className="truncate">
              {remotePresencePeers
                .map((peer) => presencePeerSummary(peer, deck, activeSlide?.id))
                .join(" · ")}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 sm:flex-nowrap sm:justify-center">
          <Tooltip
            label={
              filmstripCollapsed
                ? "Show slide thumbnails"
                : "Hide slide thumbnails"
            }
            side="top"
          >
            <button
              type="button"
              aria-label={
                filmstripCollapsed
                  ? "Show slide thumbnails"
                  : "Hide slide thumbnails"
              }
              aria-pressed={!filmstripCollapsed}
              onClick={toggleFilmstripCollapsed}
              className={cx(
                "flex h-7 items-center gap-1 rounded-ds-md px-1.5 text-[11px] font-semibold transition-colors sm:px-2",
                !filmstripCollapsed
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary",
                FOCUS_RING,
              )}
            >
              <LayoutPanelLeft size={13} aria-hidden />
              Slides
              {filmstripCollapsed ? (
                <ChevronUp size={11} aria-hidden />
              ) : (
                <ChevronDown size={11} aria-hidden />
              )}
            </button>
          </Tooltip>
          <button
            type="button"
            aria-pressed={inspectorPanelRequest?.panel === "notes"}
            onClick={handleNotesControlClick}
            className={cx(
              "flex h-7 items-center gap-1 rounded-ds-md px-1.5 text-[11px] font-semibold transition-colors sm:px-2",
              inspectorPanelRequest?.panel === "notes"
                ? "bg-ds-accent-surface text-ds-accent-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary",
              FOCUS_RING,
            )}
          >
            <StickyNote size={13} aria-hidden />
            Notes
          </button>
          <span className="hidden truncate font-medium text-ds-text-muted sm:inline">
            Slide {Math.min(activeSlideIndex + 1, deck.slides.length)} of{" "}
            {deck.slides.length}
          </span>
          <div
            className="mx-1 hidden h-5 w-px bg-ds-border-subtle sm:block"
            aria-hidden="true"
          />
          <input
            type="range"
            min={25}
            max={200}
            step={5}
            value={stageZoomPercent}
            onChange={(event) =>
              setStageZoomPercent(Number(event.currentTarget.value))
            }
            aria-label="Slide zoom"
            className="hidden w-24 accent-ds-accent sm:block sm:w-28 lg:w-32"
          />
          <Popover
            open={zoomMenuOpen}
            onClose={() => setZoomMenuOpen(false)}
            role="menu"
            aria-label="Zoom presets"
            placement="top"
            className="w-20 p-1"
            trigger={
              <button
                ref={zoomMenuTriggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={zoomMenuOpen}
                aria-controls={zoomMenuOpen ? zoomMenuId : undefined}
                aria-label={`Set slide zoom (${stageZoomPercent}%)`}
                onClick={() => setZoomMenuOpen((open) => !open)}
                className={cx(
                  "h-7 min-w-12 rounded-ds-md px-1.5 text-[11px] font-semibold tabular-nums text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary sm:min-w-14 sm:px-2",
                  FOCUS_RING,
                )}
              >
                {stageZoomPercent}%
              </button>
            }
          >
            <div
              ref={zoomMenuPanelRef}
              id={zoomMenuId}
              className="flex flex-col"
              onKeyDown={handleZoomMenuKeyDown}
            >
              {ZOOM_PERCENT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  role="menuitemradio"
                  aria-checked={preset === stageZoomPercent}
                  onClick={() => {
                    setFooterZoom(preset);
                    closeZoomMenuAndRestoreFocus();
                  }}
                  className={cx(
                    "rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                    preset === stageZoomPercent
                      ? "bg-ds-state-hover text-ds-text-primary"
                      : "text-ds-text-secondary",
                    FOCUS_RING,
                  )}
                >
                  {preset}%
                </button>
              ))}
              <div className="my-1 border-t border-ds-border-subtle" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFooterZoom(100);
                  closeZoomMenuAndRestoreFocus();
                }}
                className={cx(
                  "rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                  FOCUS_RING,
                )}
              >
                Fit
              </button>
            </div>
          </Popover>
          <Popover
            open={footerStatusMenuOpen}
            onClose={() => setFooterStatusMenuOpen(false)}
            role="menu"
            aria-label="Footer status"
            placement="top"
            align="end"
            className="w-56 p-2.5 sm:hidden"
            trigger={
              <button
                ref={footerStatusMenuTriggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={footerStatusMenuOpen}
                aria-controls={
                  footerStatusMenuOpen ? footerStatusMenuId : undefined
                }
                aria-label={`Footer status: ${saveStatusLabel}. ${diagnosticSummary}.`}
                onClick={() => setFooterStatusMenuOpen((open) => !open)}
                className={cx(
                  "h-7 rounded-ds-md px-2 text-[11px] font-semibold text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                  FOCUS_RING,
                )}
              >
                Status
              </button>
            }
          >
            <div
              ref={footerStatusMenuPanelRef}
              id={footerStatusMenuId}
              className="space-y-2 text-xs"
              onKeyDown={handleFooterStatusMenuKeyDown}
            >
              {saveStatus === "error" && onSave ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void onSave(deck);
                    closeFooterStatusMenuAndRestoreFocus();
                  }}
                  className="text-ds-danger-text underline-offset-2 hover:underline"
                >
                  {saveStatusLabel}
                </button>
              ) : (
                <p>{saveStatusLabel}</p>
              )}
              {saveStatus === "error" && saveErrorMessage ? (
                <p className="max-w-[200px] text-ds-danger-text">
                  {saveErrorMessage}
                </p>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setDeckDiagnosticsReviewOpen(true);
                  closeFooterStatusMenuAndRestoreFocus();
                }}
                aria-label={`Open deck diagnostics review (${diagnosticSummary})`}
                className={cx(
                  "rounded-ds-sm px-1.5 py-1 text-left font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                  FOCUS_RING,
                )}
              >
                {diagnosticSummary}
              </button>
              {activeGroupId ? <p>Group edit</p> : null}
              {tableEditingNodeId ? <p>Table edit</p> : null}
              <p>{selectionModeLabel}</p>
            </div>
          </Popover>
        </div>
        {saveErrorAnnouncement ? (
          <span role="alert" className="sr-only">
            {saveErrorAnnouncement}
          </span>
        ) : null}
        <div className="hidden min-w-0 shrink-0 items-center justify-end gap-3 sm:flex">
          {saveStatus === "error" && onSave ? (
            <button
              type="button"
              onClick={() => void onSave(deck)}
              className="text-ds-danger-text underline-offset-2 hover:underline"
            >
              {saveStatusLabel}
            </button>
          ) : (
            <span role="status" aria-live="polite" aria-atomic="true">
              {saveStatusLabel}
            </span>
          )}
          {saveStatus === "error" && saveErrorMessage ? (
            <span
              role="status"
              aria-live="assertive"
              aria-atomic="true"
              className="max-w-[260px] truncate text-ds-danger-text"
            >
              {saveErrorMessage}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setDeckDiagnosticsReviewOpen(true)}
            aria-label={`Open deck diagnostics review (${diagnosticSummary})`}
            className={cx(
              "rounded-ds-sm px-1.5 py-1 text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
              FOCUS_RING,
            )}
          >
            {diagnosticSummary}
          </button>
          {activeGroupId ? <span>Group edit</span> : null}
          {tableEditingNodeId ? <span>Table edit</span> : null}
          <span>{selectionModeLabel}</span>
        </div>
      </footer>
    </div>
  );
}
