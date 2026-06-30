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
  FileText,
  Group,
  Keyboard,
  Image as ImageIcon,
  LayoutPanelLeft,
  Plus,
  Redo2,
  Save,
  Spline,
  Square,
  StickyNote,
  Table2,
  Type,
  Ungroup,
  Undo2,
  X,
} from "lucide-react";

import type { ActionResult } from "@/lib/action-result";
import type { SaveStatus } from "@/lib/presentation/save-status";
import type {
  ConnectorAnchor,
  ConnectorEndpoint,
  DeckV7,
  ImageCrop,
  ImageAsset,
  LayoutBox,
  NodeSourceMetadata,
  SemanticTemplateKind,
  SlideNode,
  SlideChildNode,
  SlotKey,
} from "@/lib/presentation-vnext/schema";
import type {
  AiSlideSpec,
  SlotValue,
} from "@/lib/presentation-vnext/ai-plan-schema";
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
import type { InspectorPanelId } from "@/lib/presentation-vnext/inspector-panel-ui";
import type { ResolvedRenderNode } from "@/lib/presentation-vnext/render-tree";
import {
  updateSlideControls,
  updateSlideAttributes,
  updateSlideLocalStyle,
  resetSlideLocalStyle,
  updateSlideSourceMetadata,
  setThemePackage,
  insertBlankSlide,
  duplicateSlide,
  deleteSlide,
  moveSlide,
  insertNode,
  pasteNodes,
  updateNodeContent,
  resetImageCrop,
  updateNodeStyleBinding,
  updateLocalStyle,
  resetLocalStyleOverride,
  detachDecoration,
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
} from "@/lib/presentation-vnext/editor-commands";
import { NEUTRAL_THEME_PACKAGE } from "@/lib/presentation-vnext/neutral-theme-package";
import { createDefaultTemplateRegistry } from "@/lib/presentation-vnext/theme-packages";
import { listThemePackagesV7 } from "@/lib/presentation-vnext/theme-package-registry";
import { buildExportSpec } from "@/lib/presentation-vnext/export-spec";
import { resolveNodeFontCss } from "@/lib/presentation-vnext/node-font-css";
import {
  alignmentGuidesForFrames,
  snapFrameToStageGuides,
  type StageGuide,
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
  SlideCanvasVNext,
  type ConnectorEndpointHandle,
  type CropHandlePosition,
  type ResizeHandlePosition,
} from "./slide-canvas";
import {
  createSelectionState,
  selectNode,
  clearSelection,
  setSelection as setSelectedNodeIds,
  setSelectionMode,
  selectedNodeIds,
  type SelectionState,
} from "./selection-model";
import { InspectorShell } from "./inspector";
import {
  ContextToolbar,
  type SelectionAlignMode,
  type SelectionDistributeMode,
  type SelectionMatchSizeMode,
} from "./toolbar/context-toolbar";
import { Filmstrip } from "./filmstrip/filmstrip";
import { InlineTextEditorVNext } from "./inline-text-editor";
import { useDeckV7RenderTree } from "./use-deck-v7-render-tree";
import { Popover } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { cx, FOCUS_RING } from "@/components/ui/tokens";
import { useFocusTrap } from "@/lib/presentation/use-focus-trap";

const TEMPLATE_REGISTRY = createDefaultTemplateRegistry();
const TEMPLATE_OPTIONS = TEMPLATE_REGISTRY.all();
const TEXT_SLOT_KEYS = new Set<SlotKey>([
  "kicker",
  "title",
  "subtitle",
  "body",
  "leftTitle",
  "leftBody",
  "rightTitle",
  "rightBody",
  "quote",
  "attribution",
  "stat",
  "statLabel",
  "caption",
]);
const FILMSTRIP_COLLAPSED_KEY = "slide-filmstrip-collapsed";
const ZOOM_PERCENT_PRESETS = [200, 150, 125, 100, 75, 50, 25] as const;

function isMobileInspectorViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1023px)").matches
  );
}

function FocusTrapped({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(ref);
  return <div ref={ref}>{children}</div>;
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

export type SlideEditorVNextSourceRefreshResult = {
  contentPatch?: Record<string, unknown>;
  source?: NodeSourceMetadata;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SlideEditorVNextProps {
  /** The v7 deck to edit. */
  deck: DeckV7;
  /** Theme package to use for rendering. Falls back to the neutral package. */
  themePackage?: ThemePackageV1 | null;
  /** Boundary diagnostics, e.g. migration or theme fallback notices. */
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
  onRefreshSource?: (args: {
    deck: DeckV7;
    slide: SlideNode;
    node: SlideChildNode;
    source: NodeSourceMetadata;
  }) => Promise<SlideEditorVNextSourceRefreshResult | undefined>;
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Finds the first slide child node with the given id, searching groups
 * recursively. Returns undefined if not found.
 */
function findNodeById(
  nodes: readonly SlideChildNode[],
  id: string,
): SlideChildNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === "group" && node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function flattenEditorNodes(
  nodes: readonly SlideChildNode[],
): SlideChildNode[] {
  return nodes.flatMap((node) =>
    node.type === "group"
      ? [node, ...flattenEditorNodes(node.children)]
      : [node],
  );
}

function nodesInReadingOrder(
  nodes: readonly SlideChildNode[],
): SlideChildNode[] {
  return flattenEditorNodes(nodes)
    .filter((node) => node.layout !== undefined && node.hidden !== true)
    .sort((a, b) => {
      const readingA = a.accessibility?.readingOrder;
      const readingB = b.accessibility?.readingOrder;
      if (readingA !== undefined || readingB !== undefined) {
        return (
          (readingA ?? Number.MAX_SAFE_INTEGER) -
          (readingB ?? Number.MAX_SAFE_INTEGER)
        );
      }
      const frameA = a.layout?.frame;
      const frameB = b.layout?.frame;
      if (!frameA || !frameB) return 0;
      return frameA.y === frameB.y ? frameA.x - frameB.x : frameA.y - frameB.y;
    });
}

function inlineEditableNodes(
  nodes: readonly SlideChildNode[],
): SlideChildNode[] {
  return nodesInReadingOrder(nodes).filter(
    (node) => node.type === "text" || node.type === "shape",
  );
}

function adjacentNodeId(
  nodes: readonly SlideChildNode[],
  currentId: string | undefined,
  direction: 1 | -1,
): string | undefined {
  const ordered = nodesInReadingOrder(nodes);
  if (ordered.length === 0) return undefined;
  const currentIndex = currentId
    ? ordered.findIndex((node) => node.id === currentId)
    : -1;
  const nextIndex =
    currentIndex === -1
      ? direction === 1
        ? 0
        : ordered.length - 1
      : (currentIndex + direction + ordered.length) % ordered.length;
  return ordered[nextIndex]?.id;
}

function adjacentInlineEditableNodeId(
  nodes: readonly SlideChildNode[],
  currentId: string,
  direction: 1 | -1,
): string | undefined {
  const ordered = inlineEditableNodes(nodes);
  if (ordered.length === 0) return undefined;
  const currentIndex = ordered.findIndex((node) => node.id === currentId);
  const nextIndex =
    currentIndex === -1
      ? direction === 1
        ? 0
        : ordered.length - 1
      : (currentIndex + direction + ordered.length) % ordered.length;
  return ordered[nextIndex]?.id;
}

function parentGroupIdForNode(
  nodes: readonly SlideChildNode[],
  nodeId: string,
  parentGroupId: string | null = null,
): string | null {
  for (const node of nodes) {
    if (node.id === nodeId) return parentGroupId;
    if (node.type === "group") {
      const found = parentGroupIdForNode(node.children, nodeId, node.id);
      if (found !== null) return found;
    }
  }
  return null;
}

function childIdsForGroup(
  nodes: readonly SlideChildNode[],
  groupId: string,
): string[] {
  const group = findNodeById(nodes, groupId);
  if (!group || group.type !== "group") return [];
  return flattenEditorNodes(group.children).map((node) => node.id);
}

function layoutFramesExcluding(
  nodes: readonly SlideChildNode[],
  excludedIds: ReadonlySet<string>,
): LayoutBox["frame"][] {
  return nodes.flatMap((node) => {
    const children =
      node.type === "group"
        ? layoutFramesExcluding(node.children, excludedIds)
        : [];
    if (excludedIds.has(node.id) || !node.layout) return children;
    return [node.layout.frame, ...children];
  });
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

function canvasAspectRatio(deck: DeckV7): number {
  const width = deck.canvas.width > 0 ? deck.canvas.width : 16;
  const height = deck.canvas.height > 0 ? deck.canvas.height : 9;
  return width / height;
}

function canvasStageFit(
  deck: DeckV7,
  zoomPercent: number,
  viewport: StageFitSize | null,
): CanvasStageFit {
  const safeViewport = viewport ?? STAGE_VIEWPORT_FALLBACK;
  const rightOverlayWidth =
    safeViewport.width >= 1024 ? DESKTOP_INSPECTOR_OVERLAY_WIDTH : 0;
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

function focusTableCellSoon(
  nodeId: string,
  rowIndex: number,
  colIndex: number,
): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    const safeId = nodeId.replace(/"/g, '\\"');
    const cell = document.querySelector<HTMLElement>(
      `[data-node-id="${safeId}"] [data-table-cell="${rowIndex}:${colIndex}"]`,
    );
    cell?.focus();
  }, 0);
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

function dedupeDiagnostics(
  diagnostics: readonly PresentationDiagnostic[],
): PresentationDiagnostic[] {
  const seen = new Set<string>();
  const result: PresentationDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.path ?? ""}:${diagnostic.nodeId ?? ""}:${diagnostic.message}`;
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
  const w = Math.max(0.5, Math.min(100, frame.w));
  const h = Math.max(0.5, Math.min(100, frame.h));
  return {
    x: Math.max(0, Math.min(100 - w, frame.x)),
    y: Math.max(0, Math.min(100 - h, frame.y)),
    w,
    h,
  };
}

function clampCrop(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(95, Math.round(value * 10) / 10));
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

function connectorEndpointFromSlidePoint(
  point: { x: number; y: number },
  connectorFrame: LayoutBox["frame"],
): ConnectorEndpoint {
  return {
    kind: "point",
    point: {
      x:
        connectorFrame.w <= 0
          ? 0
          : Math.max(
              0,
              Math.min(
                100,
                ((point.x - connectorFrame.x) / connectorFrame.w) * 100,
              ),
            ),
      y:
        connectorFrame.h <= 0
          ? 0
          : Math.max(
              0,
              Math.min(
                100,
                ((point.y - connectorFrame.y) / connectorFrame.h) * 100,
              ),
            ),
    },
  };
}

function nodeAnchorPoint(
  frame: LayoutBox["frame"],
  anchor: ConnectorAnchor,
): { x: number; y: number } {
  switch (anchor) {
    case "top":
      return { x: frame.x + frame.w / 2, y: frame.y };
    case "right":
      return { x: frame.x + frame.w, y: frame.y + frame.h / 2 };
    case "bottom":
      return { x: frame.x + frame.w / 2, y: frame.y + frame.h };
    case "left":
      return { x: frame.x, y: frame.y + frame.h / 2 };
    case "center":
    default:
      return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
  }
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
      const anchorPoint = nodeAnchorPoint(node.layout.frame, anchor);
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

function cloneNodeForSplit(node: SlideChildNode): SlideChildNode {
  const nextId = nodeFactoryId(node.type);
  if (node.type === "group") {
    return {
      ...node,
      id: nextId,
      children: node.children.map(cloneNodeForSplit),
    };
  }
  if (node.type === "text") {
    return {
      ...node,
      id: nextId,
      content: {
        ...node.content,
        paragraphs: node.content.paragraphs.map((paragraph, index) => ({
          ...paragraph,
          id: `${nextId}-p-${index + 1}`,
        })),
      },
    };
  }
  if (node.type === "shape" && node.content.text) {
    return {
      ...node,
      id: nextId,
      content: {
        ...node.content,
        text: {
          ...node.content.text,
          paragraphs: node.content.text.paragraphs.map((paragraph, index) => ({
            ...paragraph,
            id: `${nextId}-p-${index + 1}`,
          })),
        },
      },
    };
  }
  if (node.type === "table") {
    return {
      ...node,
      id: nextId,
      content: {
        ...node.content,
        columns: node.content.columns.map((column, index) => ({
          ...column,
          id: `${nextId}-col-${index + 1}`,
        })),
        rows: node.content.rows.map((row, index) => ({
          ...row,
          id: `${nextId}-row-${index + 1}`,
        })),
      },
    };
  }
  return { ...node, id: nextId } as SlideChildNode;
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

function paragraphText(
  node: Extract<SlideChildNode, { type: "text" }>,
): string {
  return node.content.paragraphs
    .map((paragraph) => paragraph.text)
    .join("\n")
    .trim();
}

function slotKeyForNode(node: SlideChildNode): SlotKey | undefined {
  if (node.slot) return node.slot;
  if (node.role === "title") return "title";
  if (node.role === "subtitle") return "subtitle";
  if (node.role === "kicker") return "kicker";
  if (node.role === "body") return "body";
  if (node.role === "quote") return "quote";
  if (node.role === "attribution") return "attribution";
  if (node.role === "caption") return "caption";
  if (node.role === "metric") return "stat";
  if (node.role === "table") return "table";
  if (node.role === "visual") return "visualId";
  return undefined;
}

function collectSlideSlots(
  nodes: readonly SlideChildNode[],
  slots: Partial<Record<SlotKey, SlotValue>>,
): void {
  for (const node of nodes) {
    const slotKey = slotKeyForNode(node);
    if (slotKey && node.type === "text" && TEXT_SLOT_KEYS.has(slotKey)) {
      const text = paragraphText(node);
      if (text) {
        slots[slotKey] =
          slotKey === "body"
            ? { type: "paragraph", paragraphs: text.split("\n") }
            : { type: "shortText", text };
      }
    } else if (slotKey === "table" && node.type === "table") {
      slots.table = {
        type: "table",
        columns: node.content.columns.map((column) => column.label),
        rows: node.content.rows.map((row) =>
          row.cells.map((cell) => cell.text),
        ),
        ...(node.content.caption ? { caption: node.content.caption } : {}),
      };
    } else if (
      slotKey === "visualId" &&
      node.type === "visual" &&
      node.content.visualId
    ) {
      slots.visualId = { type: "visual", visualId: node.content.visualId };
    }
    if (node.type === "group") {
      collectSlideSlots(node.children, slots);
    }
  }
}

function slideSpecFromSlide(
  slide: SlideNode,
  kind: SemanticTemplateKind,
  layoutId?: string,
): AiSlideSpec {
  const template = TEMPLATE_REGISTRY.get(kind);
  const layout = template?.layouts.find(
    (candidate) => candidate.id === layoutId,
  );
  const slots: Partial<Record<SlotKey, SlotValue>> = {};
  collectSlideSlots(slide.children, slots);
  return {
    kind,
    ...(slide.controls?.tone ? { tone: slide.controls.tone } : {}),
    ...(layout?.density[0]
      ? { density: layout.density[0] }
      : slide.controls?.density
        ? { density: slide.controls.density }
        : {}),
    ...(layout?.emphasis[0]
      ? { emphasis: layout.emphasis[0] }
      : slide.controls?.emphasis
        ? { emphasis: slide.controls.emphasis }
        : {}),
    slots,
    ...(slide.notes ? { speakerNotes: slide.notes } : {}),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SlideEditorVNext({
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
  onRefreshSource,
  onDeckChange,
  onSave,
  onClose,
  onExportPptx,
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
  const themePackages = listThemePackagesV7();

  // Export error surfaced below the toolbar banner
  const [exportError, setExportError] = useState<string | null>(null);

  // Insert dropdown open state
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const insertMenuRef = useRef<HTMLDivElement | null>(null);
  const replaceImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceImageTargetIdRef = useRef<string | null>(null);
  const insertImagePendingRef = useRef(false);

  // Close insert dropdown on click-outside or Escape
  useEffect(() => {
    if (!insertMenuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (
        insertMenuRef.current &&
        !insertMenuRef.current.contains(e.target as Node)
      ) {
        setInsertMenuOpen(false);
      }
    }
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setInsertMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [insertMenuOpen]);

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
    if (
      hasUnsavedWork &&
      typeof window !== "undefined" &&
      !window.confirm("You have unsaved slide changes. Close the editor?")
    ) {
      return;
    }
    onClose?.();
  }

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
    const spec = slideSpecFromSlide(activeSlide, kind, layoutId);
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
  const [clipboardNodes, setClipboardNodes] = useState<SlideChildNode[]>([]);
  const [stageGuides, setStageGuides] = useState<StageGuide[]>([]);
  const [marqueeFrame, setMarqueeFrame] = useState<SelectionFrame | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [stageAnnouncement, setStageAnnouncement] = useState("");
  const [stageZoomPercent, setStageZoomPercent] = useState(100);
  const [stageViewportSize, setStageViewportSize] =
    useState<StageFitSize | null>(null);
  const [filmstripCollapsed, setFilmstripCollapsed] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(FILMSTRIP_COLLAPSED_KEY) === "true";
  });
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [inspectorSheetOpen, setInspectorSheetOpen] = useState(false);
  const [inspectorPanelRequest, setInspectorPanelRequest] = useState<{
    panel: InspectorPanelId;
    nonce: number;
  } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const [draggingStage, setDraggingStage] = useState(false);
  const [activeResizeHandle, setActiveResizeHandle] = useState<{
    nodeId: string;
    handle: ResizeHandlePosition;
  } | null>(null);
  const [activeCropHandle, setActiveCropHandle] = useState<{
    nodeId: string;
    handle: CropHandlePosition;
  } | null>(null);
  const [activeRotationNodeId, setActiveRotationNodeId] = useState<
    string | null
  >(null);
  const [activeConnectorEndpoint, setActiveConnectorEndpoint] = useState<{
    nodeId: string;
    endpoint: ConnectorEndpointHandle;
  } | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [tableEditingNodeId, setTableEditingNodeId] = useState<string | null>(
    null,
  );
  const [activeTableCell, setActiveTableCell] = useState<{
    rowIndex: number;
    colIndex: number;
  } | null>(null);

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

  function toggleFilmstripCollapsed() {
    setFilmstripCollapsed((prev) => {
      const next = !prev;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(FILMSTRIP_COLLAPSED_KEY, String(next));
      }
      return next;
    });
  }

  function setFooterZoom(percent: number) {
    setStageZoomPercent(percent);
    setZoomMenuOpen(false);
  }

  function handleInsertSlide() {
    const result = insertBlankSlide(deck, activeSlideIndex + 1);
    onDeckChange(result.deck);
    setActiveSlideIndex(activeSlideIndex + 1);
    setSelection(createSelectionState(selection.mode));
    setFocusedNodeId(null);
    setHoveredNodeId(null);
    setActiveGroupId(null);
    setTableEditingNodeId(null);
    setActiveTableCell(null);
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
      const upload = onUploadImage
        ? await onUploadImage(file)
        : { src: await readImageFileAsDataUrl(file) };
      if (!upload.src) return;
      const assetId = upload.assetId ?? assetFactoryId("image");
      const deckWithAsset: DeckV7 = {
        ...deck,
        assets: {
          ...deck.assets,
          images: {
            ...deck.assets.images,
            [assetId]: {
              id: assetId,
              src: upload.src,
              alt: upload.alt ?? file.name,
              ...(upload.widthPx ? { widthPx: upload.widthPx } : {}),
              ...(upload.heightPx ? { heightPx: upload.heightPx } : {}),
              ...((upload.mimeType ?? imageMimeType(file.type))
                ? { mimeType: upload.mimeType ?? imageMimeType(file.type) }
                : {}),
              ...(upload.contentHash
                ? { contentHash: upload.contentHash }
                : {}),
              origin: { kind: "upload", importedAt: new Date().toISOString() },
            },
          },
        },
      };
      if (inserting) {
        const node = defaultImageNode(nextZIndex(activeSlide));
        if (node.type !== "image") return;
        const result = insertNode(deckWithAsset, activeSlide.id, {
          ...node,
          content: { ...node.content, assetId, alt: upload.alt ?? file.name },
        });
        onDeckChange(result.deck);
        setSelection((s) => setSelectedNodeIds(s, [result.nodeId]));
        focusSelectedNodeSoon(result.nodeId);
      } else if (targetId) {
        onDeckChange(
          updateNodeContent(deckWithAsset, activeSlide.id, targetId, {
            assetId,
            alt: upload.alt ?? file.name,
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

  async function handleInsertVisual() {
    if (!activeSlide) return;
    if (!onPickVisual) {
      handleInsertNode(defaultVisualNode(nextZIndex(activeSlide)));
      return;
    }
    const picked = await onPickVisual();
    if (!picked) return;
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
  }

  async function handleReplaceSelectedVisual() {
    if (!activeSlide || !selectedNode || selectedNode.type !== "visual") return;
    if (!onPickVisual) {
      setStageAnnouncement("No visual picker is configured for this editor.");
      return;
    }
    const picked = await onPickVisual();
    if (!picked) return;
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
  }

  function handleInsertConnector() {
    handleInsertNode(defaultConnectorNode(nextZIndex(activeSlide)));
  }

  function focusSelectedNodeSoon(nodeId: string | undefined) {
    if (!nodeId) return;
    setFocusedNodeId(nodeId);
    window.setTimeout(() => focusStageNode(nodeId), 0);
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
      setTableEditingNodeId(null);
      setActiveTableCell(null);
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
    const deletedCount = selectedIds.length;
    const replacementId = replacementNodeAfterDelete(selectedIds);
    onDeckChange(deleteNodes(deck, activeSlide.id, selectedIds));
    if (tableEditingNodeId && selectedIds.includes(tableEditingNodeId)) {
      setTableEditingNodeId(null);
      setActiveTableCell(null);
    }
    if (activeGroupId && selectedIds.includes(activeGroupId)) {
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
      setSelection((s) => setSelectedNodeIds(s, [nodeId]));
      setTableEditingNodeId(nodeId);
      setActiveTableCell({ rowIndex: 0, colIndex: 0 });
      focusTableCellSoon(nodeId, 0, 0);
      setStageAnnouncement("Editing table cells");
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
  ) {
    if (!activeSlide) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node) return;
    let updated = deck;
    if (node.type === "text") {
      updated = updateNodeContent(updated, activeSlide.id, nodeId, {
        paragraphs,
      });
    } else if (node.type === "shape") {
      updated = updateNodeContent(updated, activeSlide.id, nodeId, {
        text: { paragraphs },
      });
    }
    if (nextFrame) {
      updated = updateNodeLayout(updated, activeSlide.id, nodeId, {
        frame: nextFrame,
      });
    }
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
    setTableEditingNodeId(null);
    setActiveTableCell(null);
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
      onDeckChange(
        updateNodeContent(deck, activeSlide.id, nodeId, {
          crop: nextCrop,
        }),
      );
      setStageAnnouncement(`Cropping image ${handle}`);
    };

    const handlePointerUp = () => {
      setActiveCropHandle(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleResetSelectedImageCrop() {
    if (!activeSlide || !selectedNode || selectedNode.type !== "image") return;
    onDeckChange(resetImageCrop(deck, activeSlide.id, selectedNode.id));
    setSelection((s) => setSelectedNodeIds(s, [selectedNode.id]));
    focusSelectedNodeSoon(selectedNode.id);
    setStageAnnouncement("Image crop reset");
  }

  function handleEnterTableEdit(nodeId = selectedNode?.id) {
    if (!activeSlide || !nodeId) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node || node.type !== "table") return;
    setSelection((s) => setSelectedNodeIds(s, [node.id]));
    setFocusedNodeId(node.id);
    setTableEditingNodeId(node.id);
    setActiveTableCell({ rowIndex: 0, colIndex: 0 });
    focusTableCellSoon(node.id, 0, 0);
    setStageAnnouncement("Editing table cells. Use Tab or arrow keys to move.");
  }

  function handleTableCellFocus(
    nodeId: string,
    rowIndex: number,
    colIndex: number,
  ) {
    setTableEditingNodeId(nodeId);
    setActiveTableCell({ rowIndex, colIndex });
    setFocusedNodeId(nodeId);
    if (!selectedIds.includes(nodeId)) {
      setSelection((s) => setSelectedNodeIds(s, [nodeId]));
    }
  }

  function handleTableCellCommit(
    nodeId: string,
    rowIndex: number,
    colIndex: number,
    text: string,
  ) {
    if (!activeSlide) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node || node.type !== "table") return;
    const row = node.content.rows[rowIndex];
    const current = row?.cells[colIndex];
    if (!row || !current || current.text === text) return;
    onDeckChange(
      updateNodeContent(deck, activeSlide.id, nodeId, {
        rows: node.content.rows.map((candidateRow, candidateRowIndex) =>
          candidateRowIndex === rowIndex
            ? {
                ...candidateRow,
                cells: candidateRow.cells.map((cell, candidateColIndex) =>
                  candidateColIndex === colIndex
                    ? { text: text.replace(/\s+/g, " ").trim() }
                    : cell,
                ),
              }
            : candidateRow,
        ),
      }),
    );
  }

  function moveTableCellFocus(
    nodeId: string,
    rowIndex: number,
    colIndex: number,
    rowDelta: number,
    colDelta: number,
  ) {
    if (!activeSlide) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node || node.type !== "table") return;
    const rowCount = node.content.rows.length;
    const colCount = node.content.columns.length;
    const nextRow = Math.max(0, Math.min(rowCount - 1, rowIndex + rowDelta));
    const nextCol = Math.max(0, Math.min(colCount - 1, colIndex + colDelta));
    setActiveTableCell({ rowIndex: nextRow, colIndex: nextCol });
    focusTableCellSoon(nodeId, nextRow, nextCol);
  }

  function moveTableCellFocusLinear(
    nodeId: string,
    rowIndex: number,
    colIndex: number,
    direction: 1 | -1,
  ) {
    if (!activeSlide) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node || node.type !== "table") return;
    const colCount = node.content.columns.length;
    const total = node.content.rows.length * colCount;
    if (total <= 0) return;
    const current = rowIndex * colCount + colIndex;
    const next = (current + direction + total) % total;
    const nextRow = Math.floor(next / colCount);
    const nextCol = next % colCount;
    setActiveTableCell({ rowIndex: nextRow, colIndex: nextCol });
    focusTableCellSoon(nodeId, nextRow, nextCol);
  }

  function handleTableCellKeyDown(
    nodeId: string,
    rowIndex: number,
    colIndex: number,
    event: KeyboardEvent<HTMLElement>,
  ) {
    if (event.key === "Escape") {
      setTableEditingNodeId(null);
      setActiveTableCell(null);
      focusSelectedNodeSoon(nodeId);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === "Tab") {
      moveTableCellFocusLinear(
        nodeId,
        rowIndex,
        colIndex,
        event.shiftKey ? -1 : 1,
      );
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const movement: Record<string, [number, number] | undefined> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const delta = movement[event.key];
    if (delta && (event.metaKey || event.ctrlKey || event.altKey)) {
      moveTableCellFocus(nodeId, rowIndex, colIndex, delta[0], delta[1]);
      event.preventDefault();
      event.stopPropagation();
    }
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

  const exportDiagnostics = renderTree
    ? buildExportSpec(renderTree).diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === "unsupported-export-feature" ||
          diagnostic.code === "theme-decoration-export-fallback",
      )
    : [];
  const diagnostics = dedupeDiagnostics([
    ...boundaryDiagnostics,
    ...(renderTree?.diagnostics ?? []),
    ...exportDiagnostics,
  ]);

  // ---------------------------------------------------------------------------
  // Selected node data (from the persisted deck, not the resolved tree)
  // ---------------------------------------------------------------------------

  const selectedIds = selectedNodeIds(selection);
  const firstSelectedId = selectedIds[0];

  const selectedNode: SlideChildNode | undefined =
    activeSlide && firstSelectedId
      ? findNodeById(activeSlide.children, firstSelectedId)
      : undefined;

  useEffect(() => {
    if (!activeSlide) {
      setActiveGroupId(null);
      setTableEditingNodeId(null);
      return;
    }
    if (activeGroupId && !findNodeById(activeSlide.children, activeGroupId)) {
      setActiveGroupId(null);
    }
    if (
      tableEditingNodeId &&
      findNodeById(activeSlide.children, tableEditingNodeId)?.type !== "table"
    ) {
      setTableEditingNodeId(null);
      setActiveTableCell(null);
    }
  }, [activeGroupId, activeSlide, tableEditingNodeId]);

  // Also find the selected resolved node to support decoration detach
  const selectedResolvedNode: ResolvedRenderNode | undefined =
    activeSlideTree && firstSelectedId
      ? [
          ...activeSlideTree.nodes,
          ...(selection.mode === "layers" ? activeSlideTree.decorations : []),
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
    const visualAssetId = deck.assets.visuals?.[assetId]?.id;
    return (
      deck.assets.images[assetId]?.src ??
      deck.assets.files?.[assetId]?.src ??
      (visualAssetId
        ? (deck.assets.images[visualAssetId]?.src ??
          deck.assets.files?.[visualAssetId]?.src)
        : undefined)
    );
  }

  function handleNodePointerDown(nodeId: string, event: ReactPointerEvent) {
    if (!activeSlide || event.button !== 0 || isEditableTarget(event.target)) {
      return;
    }
    const nextSelection = selectedIds.includes(nodeId)
      ? selection
      : selectNode(selection, nodeId, event.shiftKey || event.metaKey);
    const dragIds = selectedNodeIds(nextSelection);
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
    setDraggingStage(true);
    const startX = event.clientX;
    const startY = event.clientY;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
      const patches = new Map<string, Partial<LayoutBox>>();
      const nextGuides: StageGuide[] = [];
      for (const [id, frame] of originalFrames) {
        const snapped = snapFrameToStageGuides(
          {
            ...frame,
            x: frame.x + deltaX,
            y: frame.y + deltaY,
          },
          0.75,
          alignmentGuides,
        );
        patches.set(id, {
          frame: snapped.frame,
        });
        nextGuides.push(...snapped.guides);
      }
      setStageGuides(nextGuides);
      onDeckChange(updateNodeLayouts(deck, activeSlide.id, patches));
    };

    const handlePointerUp = () => {
      setDraggingStage(false);
      setStageGuides([]);
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

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
      const snapped = snapFrameToStageGuides(
        node.layout?.constraints?.preserveAspectRatio
          ? applyAspectLock(
              originalFrame,
              resizeFrame(originalFrame, handle, deltaX, deltaY),
            )
          : resizeFrame(originalFrame, handle, deltaX, deltaY),
        0.75,
        alignmentGuides,
      );
      setStageGuides(snapped.guides);
      onDeckChange(
        updateNodeLayout(deck, activeSlide.id, nodeId, {
          frame: snapped.frame,
        }),
      );
    };

    const handlePointerUp = () => {
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
      onDeckChange(updateNodeRotation(deck, activeSlide.id, nodeId, rotation));
      setStageAnnouncement(`Rotated to ${Math.round(rotation)} degrees`);
    };

    const handlePointerUp = () => {
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

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const slidePoint = pointPctFromEvent(moveEvent, rect);
      const snapped =
        nearestConnectorAnchor(activeSlide.children, slidePoint, nodeId) ??
        connectorEndpointFromSlidePoint(slidePoint, connectorFrame);
      onDeckChange(
        updateNodeContent(deck, activeSlide.id, nodeId, {
          [endpoint]: snapped,
        }),
      );
      setStageAnnouncement(
        snapped.kind === "node"
          ? `Connector ${endpoint} bound to ${snapped.anchor} anchor`
          : `Connector ${endpoint} moved`,
      );
    };

    const handlePointerUp = () => {
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
        setTableEditingNodeId(null);
        setActiveTableCell(null);
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

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
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

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      handleCopyNodes();
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
        for (const entry of selectedLayoutEntries()) {
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

    if (event.key === "]" || event.key === "[") {
      const zIndexes =
        activeSlideTree?.nodes.map((node) => node.layout.zIndex) ?? [];
      const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
      const minZ = zIndexes.length > 0 ? Math.min(...zIndexes) : 0;
      let updated = deck;
      selectedIds.forEach((id, index) => {
        const node = findNodeById(activeSlide.children, id);
        const currentZ = node?.layout?.zIndex ?? 0;
        const nextZ =
          event.key === "]"
            ? event.metaKey || event.ctrlKey
              ? maxZ + index + 1
              : currentZ + 1
            : event.metaKey || event.ctrlKey
              ? minZ - index - 1
              : currentZ - 1;
        updated = reorderZIndex(updated, activeSlide.id, id, nextZ);
      });
      onDeckChange(updated);
      event.preventDefault();
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
      slides: deck.slides.map((s) =>
        s.id === activeSlide.id ? { ...s, props: { ...s.props, ...patch } } : s,
      ),
    };
    onDeckChange(updated);
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
    const rotation =
      patch.rotation !== undefined
        ? normalizeRotationDegrees(patch.rotation)
        : undefined;
    onDeckChange(
      updateNodeLayout(deck, activeSlide.id, firstSelectedId, {
        ...patch,
        ...(rotation !== undefined ? { rotation } : {}),
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
    if (!activeSlide || !selectedNode?.source || !onRefreshSource) return;
    const refreshed = await onRefreshSource({
      deck,
      slide: activeSlide,
      node: selectedNode,
      source: selectedNode.source,
    });
    if (!refreshed) return;
    let updated = deck;
    if (refreshed.contentPatch) {
      updated = updateNodeContent(
        updated,
        activeSlide.id,
        selectedNode.id,
        refreshed.contentPatch,
      );
    }
    if (refreshed.source) {
      updated = updateNodeSourceMetadata(
        updated,
        activeSlide.id,
        selectedNode.id,
        refreshed.source,
      );
    }
    onDeckChange(updated);
    setSelection((s) => setSelectedNodeIds(s, [selectedNode.id]));
    focusSelectedNodeSoon(selectedNode.id);
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
    patch: { locked?: boolean; hidden?: boolean },
  ) {
    if (!activeSlide) return;
    onDeckChange(updateNodeAttributes(deck, activeSlide.id, nodeId, patch));
  }

  function handleReorderLayer(nodeId: string, targetIndex: number) {
    if (!activeSlide) return;
    const layers = activeSlide.children
      .flatMap(function flatten(node): SlideChildNode[] {
        return node.type === "group"
          ? [node, ...node.children.flatMap(flatten)]
          : [node];
      })
      .filter((node) => node.layout !== undefined)
      .sort((a, b) => (b.layout?.zIndex ?? 0) - (a.layout?.zIndex ?? 0));
    const moving = layers.find((node) => node.id === nodeId);
    if (!moving) return;
    const reordered = layers.filter((node) => node.id !== nodeId);
    const insertIndex = Math.max(0, Math.min(targetIndex, reordered.length));
    reordered.splice(insertIndex, 0, moving);
    const patches = new Map<string, Partial<LayoutBox>>();
    reordered.forEach((node, index) => {
      patches.set(node.id, { zIndex: reordered.length - index });
    });
    onDeckChange(updateNodeLayouts(deck, activeSlide.id, patches));
  }

  function selectedLayoutEntries(): {
    id: string;
    node: SlideChildNode;
    frame: LayoutBox["frame"];
  }[] {
    if (!activeSlide) return [];
    return selectedIds
      .map((id) => {
        const node = findNodeById(activeSlide.children, id);
        return node?.layout && !node.locked
          ? { id, node, frame: node.layout.frame }
          : null;
      })
      .filter(
        (
          entry,
        ): entry is {
          id: string;
          node: SlideChildNode;
          frame: LayoutBox["frame"];
        } => entry !== null,
      );
  }

  function handleAlignSelection(mode: SelectionAlignMode) {
    if (!activeSlide) return;
    const entries = selectedLayoutEntries();
    if (entries.length < 2) return;
    const left = Math.min(...entries.map((entry) => entry.frame.x));
    const top = Math.min(...entries.map((entry) => entry.frame.y));
    const right = Math.max(
      ...entries.map((entry) => entry.frame.x + entry.frame.w),
    );
    const bottom = Math.max(
      ...entries.map((entry) => entry.frame.y + entry.frame.h),
    );
    const centerX = left + (right - left) / 2;
    const centerY = top + (bottom - top) / 2;
    const patches = new Map<string, Partial<LayoutBox>>();
    for (const entry of entries) {
      const frame = entry.frame;
      const nextFrame = { ...frame };
      if (mode === "left") nextFrame.x = left;
      if (mode === "center") nextFrame.x = centerX - frame.w / 2;
      if (mode === "right") nextFrame.x = right - frame.w;
      if (mode === "top") nextFrame.y = top;
      if (mode === "middle") nextFrame.y = centerY - frame.h / 2;
      if (mode === "bottom") nextFrame.y = bottom - frame.h;
      patches.set(entry.id, { frame: nextFrame });
    }
    onDeckChange(updateNodeLayouts(deck, activeSlide.id, patches));
  }

  function handleDistributeSelection(mode: SelectionDistributeMode) {
    if (!activeSlide) return;
    const entries = selectedLayoutEntries();
    if (entries.length < 3) return;
    const sorted = [...entries].sort((a, b) =>
      mode === "horizontal" ? a.frame.x - b.frame.x : a.frame.y - b.frame.y,
    );
    const first = sorted[0].frame;
    const last = sorted[sorted.length - 1].frame;
    const start = mode === "horizontal" ? first.x : first.y;
    const end = mode === "horizontal" ? last.x + last.w : last.y + last.h;
    const totalSize = sorted.reduce(
      (sum, entry) =>
        sum + (mode === "horizontal" ? entry.frame.w : entry.frame.h),
      0,
    );
    const gap = (end - start - totalSize) / (sorted.length - 1);
    const patches = new Map<string, Partial<LayoutBox>>();
    let cursor = start;
    for (const entry of sorted) {
      const frame = entry.frame;
      patches.set(entry.id, {
        frame:
          mode === "horizontal"
            ? { ...frame, x: cursor }
            : { ...frame, y: cursor },
      });
      cursor += (mode === "horizontal" ? frame.w : frame.h) + gap;
    }
    onDeckChange(updateNodeLayouts(deck, activeSlide.id, patches));
  }

  function handleMatchSize(mode: SelectionMatchSizeMode) {
    if (!activeSlide) return;
    const entries = selectedLayoutEntries();
    if (entries.length < 2) return;
    const base = entries[0].frame;
    const patches = new Map<string, Partial<LayoutBox>>();
    for (const entry of entries.slice(1)) {
      patches.set(entry.id, {
        frame: {
          ...entry.frame,
          w: mode === "height" ? entry.frame.w : base.w,
          h: mode === "width" ? entry.frame.h : base.h,
        },
      });
    }
    onDeckChange(updateNodeLayouts(deck, activeSlide.id, patches));
  }

  function handleReorderSelection(
    kind: "forward" | "backward" | "front" | "back",
  ) {
    if (!activeSlide || selectedIds.length === 0) return;
    const zIndexes = activeSlide.children
      .map((node) => node.layout?.zIndex)
      .filter((zIndex): zIndex is number => typeof zIndex === "number");
    const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
    const minZ = zIndexes.length > 0 ? Math.min(...zIndexes) : 0;
    let updated = deck;
    selectedIds.forEach((id, index) => {
      const node = findNodeById(activeSlide.children, id);
      const currentZ = node?.layout?.zIndex ?? 0;
      const nextZ =
        kind === "front"
          ? maxZ + index + 1
          : kind === "back"
            ? minZ - index - 1
            : kind === "forward"
              ? currentZ + 1
              : currentZ - 1;
      updated = reorderZIndex(updated, activeSlide.id, id, nextZ);
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
    if (!activeSlide) return;
    const result = deleteSlide(deck, activeSlide.id);
    onDeckChange(result.deck);
    setActiveSlideIndex(result.index);
    setSelection(createSelectionState(selection.mode));
  }

  // ---------------------------------------------------------------------------
  // Diagnostics actions
  // ---------------------------------------------------------------------------

  function handleDiagnosticAction(
    action: DiagnosticAction,
    diagnostic: PresentationDiagnostic,
  ) {
    const targetNodeId = diagnostic.nodeId ?? firstSelectedId;
    if (!activeSlide || !targetNodeId) {
      if (action === "choose-denser-layout" && activeSlide) {
        handleUpdateControls({ density: "dense" });
      }
      return;
    }
    if (action === "reset-to-theme" || action === "remove-override") {
      onDeckChange(resetLocalStyleOverride(deck, activeSlide.id, targetNodeId));
      setSelection((s) => setSelectedNodeIds(s, [targetNodeId]));
      return;
    }
    if (action === "replace-style-ref") {
      const node = findNodeById(activeSlide.children, targetNodeId);
      if (!node) return;
      onDeckChange(
        updateNodeStyleBinding(deck, activeSlide.id, targetNodeId, {
          ...defaultStyleBindingForNode(node),
        }),
      );
      setSelection((s) => setSelectedNodeIds(s, [targetNodeId]));
      return;
    }
    if (action === "choose-denser-layout") {
      handleUpdateControls({ density: "dense" });
      setSelection((s) => setSelectedNodeIds(s, [targetNodeId]));
      focusSelectedNodeSoon(targetNodeId);
      return;
    }
    if (action === "open-asset-panel") {
      const node = findNodeById(activeSlide.children, targetNodeId);
      setSelection((s) => setSelectedNodeIds(s, [targetNodeId]));
      focusSelectedNodeSoon(targetNodeId);
      if (node?.type === "image") {
        replaceImageTargetIdRef.current = targetNodeId;
        insertImagePendingRef.current = false;
        replaceImageFileInputRef.current?.click();
      } else {
        setStageAnnouncement(
          "Select the asset field in the inspector to repair this node.",
        );
      }
      return;
    }
    if (action === "split-slide") {
      const node = findNodeById(activeSlide.children, targetNodeId);
      if (!node) return;
      const splitNode = cloneNodeForSplit(node);
      const inserted = insertBlankSlide(deck, activeSlideIndex + 1);
      const nextDeck: DeckV7 = {
        ...inserted.deck,
        slides: inserted.deck.slides.map((slide) =>
          slide.id === inserted.slideId
            ? {
                ...slide,
                name: `${activeSlide.name ?? `Slide ${activeSlideIndex + 1}`} Split`,
                children: [splitNode],
              }
            : slide,
        ),
      };
      const movedDeck = deleteNodes(nextDeck, activeSlide.id, [targetNodeId]);
      onDeckChange(movedDeck);
      setActiveSlideIndex(activeSlideIndex + 1);
      setSelection((s) => setSelectedNodeIds(s, [splitNode.id]));
      focusSelectedNodeSoon(splitNode.id);
      setStageAnnouncement("Moved node to a new split slide");
    }
  }

  // ---------------------------------------------------------------------------
  // Decoration detach
  // ---------------------------------------------------------------------------

  function handleDetachDecoration() {
    if (!activeSlide || !selectedResolvedNode) return;
    if (selectedResolvedNode.source !== "themeDecoration") return;

    const { layout, style } = selectedResolvedNode;
    // Build a LayoutBox from the resolved layout (drop framePx)
    const { framePx: _framePx, ...persistedLayout } = layout;
    onDeckChange(
      detachDecoration(
        deck,
        activeSlide.id,
        selectedResolvedNode.id,
        persistedLayout,
        style as StylePatch,
      ),
    );
  }

  const stageFit = canvasStageFit(deck, stageZoomPercent, stageViewportSize);
  const stageFrameStyle = canvasFrameStyle(stageFit);
  const stageScrollStyle = stageScrollContentStyle(stageFit);
  const activeSlideName = slideDisplayName(activeSlide, activeSlideIndex);
  const selectedNodeSummary = selectedSummary(selectedIds.length);
  const diagnosticSummary = diagnosticsSummary(diagnostics.length);
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
    selectedResolvedNode?.source === "themeDecoration";
  const inspectorKey = `${inspectorPanelRequest?.panel ?? "auto"}-${inspectorPanelRequest?.nonce ?? 0}`;
  const renderInspectorShell = () => (
    <InspectorShell
      key={inspectorKey}
      initialPanel={inspectorPanelRequest?.panel}
      activeSlide={activeSlide}
      selectedNode={selectedNode}
      selectedIds={selectedIds}
      isDecorationSelected={isDecorationSelected}
      diagnostics={diagnostics}
      onUpdateControls={handleUpdateControls}
      onUpdateProps={handleUpdateProps}
      onUpdateSlideAttributes={handleUpdateSlideAttributes}
      onUpdateSlideLocalStyle={handleUpdateSlideLocalStyle}
      onResetSlideLocalStyle={handleResetSlideLocalStyle}
      onUpdateSlideSource={handleUpdateSlideSource}
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
      onResetToTheme={handleResetToTheme}
      onUpdateSelectedSource={handleUpdateSelectedSource}
      onRefreshSelectedSource={handleRefreshSelectedSource}
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

      {/* ------------------------------------------------------------------ */}
      {/* Top Toolbar                                                         */}
      {/* ------------------------------------------------------------------ */}
      <header
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
          {/* Insert dropdown */}
          <div ref={insertMenuRef} className="relative">
            <button
              type="button"
              aria-label="Insert element"
              aria-haspopup="true"
              aria-expanded={insertMenuOpen}
              disabled={!activeSlide}
              onClick={() => setInsertMenuOpen((o) => !o)}
              className="flex h-8 items-center gap-1 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2.5 text-xs font-medium text-ds-text-primary transition-colors hover:bg-ds-state-hover disabled:opacity-40"
            >
              <Plus size={13} aria-hidden="true" />
              Insert
              <ChevronDown size={12} aria-hidden="true" />
            </button>
            {insertMenuOpen && (
              <div
                className="absolute left-0 top-full z-dropdown mt-1 min-w-[140px] overflow-hidden rounded-ds-md border border-ds-border-subtle bg-ds-surface-overlay py-1 shadow-ds-popover"
                role="menu"
              >
                {[
                  {
                    label: "Text",
                    icon: <Type size={13} aria-hidden />,
                    action: () => {
                      handleInsertText();
                      setInsertMenuOpen(false);
                    },
                  },
                  {
                    label: "Shape",
                    icon: <Square size={13} aria-hidden />,
                    action: () => {
                      handleInsertShape();
                      setInsertMenuOpen(false);
                    },
                  },
                  {
                    label: "Image",
                    icon: <ImageIcon size={13} aria-hidden />,
                    action: () => {
                      handleInsertImage();
                      setInsertMenuOpen(false);
                    },
                  },
                  {
                    label: "Visual",
                    icon: <FileText size={13} aria-hidden />,
                    action: () => {
                      void handleInsertVisual();
                      setInsertMenuOpen(false);
                    },
                  },
                  {
                    label: "Connector",
                    icon: <Spline size={13} aria-hidden />,
                    action: () => {
                      handleInsertConnector();
                      setInsertMenuOpen(false);
                    },
                  },
                  {
                    label: "Table",
                    icon: <Table2 size={13} aria-hidden />,
                    action: () => {
                      handleInsertTable();
                      setInsertMenuOpen(false);
                    },
                  },
                ].map(({ label, icon, action }) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    onClick={action}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary"
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

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

      {shortcutHelpOpen ? (
        <div className="absolute inset-0 z-modal flex items-center justify-center bg-black/30 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Slide editor keyboard shortcuts"
            className="w-full max-w-lg rounded-ds-md border border-ds-border-subtle bg-ds-surface p-4 shadow-ds-overlay"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ds-text-primary">
                Keyboard shortcuts
              </h3>
              <button
                type="button"
                onClick={() => setShortcutHelpOpen(false)}
                aria-label="Close keyboard shortcuts"
                className="flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-muted hover:bg-ds-state-hover hover:text-ds-text-primary"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
              {[
                ["Move selection", "Arrow keys"],
                ["Large move", "Shift + Arrow"],
                ["Duplicate nodes", "Cmd/Ctrl + D"],
                ["Copy / Paste nodes", "Cmd/Ctrl + C / V"],
                ["Group / Ungroup", "Cmd/Ctrl + G / Shift + Cmd/Ctrl + G"],
                ["Layer forward / backward", "] / ["],
                ["Undo / Redo", "Cmd/Ctrl + Z / Shift + Cmd/Ctrl + Z"],
                ["Clear selection / close", "Esc"],
              ].map(([label, shortcut]) => (
                <div key={label} className="contents">
                  <dt className="text-ds-text-secondary">{label}</dt>
                  <dd className="font-mono text-ds-text-primary">{shortcut}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
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
            onDuplicateSlide={handleDuplicateActiveSlide}
            onDeleteSlide={handleDeleteActiveSlide}
            onDetachDecoration={handleDetachDecoration}
          />

          {activeSlideTree ? (
            <div
              ref={stageViewportRef}
              data-slide-stage-viewport="true"
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
        <div className="absolute bottom-4 right-4 top-4 z-panel hidden w-80 overflow-hidden rounded-ds-lg border border-ds-border-subtle bg-ds-surface-overlay shadow-ds-overlay lg:flex">
          {renderInspectorShell()}
        </div>

        {activeSlide ? (
          <div className="lg:hidden">
            <button
              type="button"
              data-floating-panel="true"
              aria-label="Edit slide"
              aria-haspopup="dialog"
              aria-expanded={inspectorSheetOpen}
              onClick={() => openMobileInspector()}
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
                  onClick={closeMobileInspector}
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
                        closeMobileInspector();
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
                        onClick={closeMobileInspector}
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
            setTableEditingNodeId(null);
            setActiveTableCell(null);
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
      <footer className="grid h-9 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 bg-transparent px-3 text-[11px] text-ds-text-muted">
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate">{selectedNodeSummary}</span>
        </div>
        <div className="flex min-w-0 items-center justify-center gap-1.5">
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
                "flex h-7 items-center gap-1.5 rounded-ds-md px-2 text-[11px] font-semibold transition-colors",
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
              "flex h-7 items-center gap-1 rounded-ds-md px-2 text-[11px] font-semibold transition-colors",
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
            className="w-24 accent-ds-accent sm:w-32"
          />
          <Popover
            open={zoomMenuOpen}
            onClose={() => setZoomMenuOpen(false)}
            aria-label="Zoom presets"
            placement="top"
            className="w-20 p-1"
            trigger={
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={zoomMenuOpen}
                onClick={() => setZoomMenuOpen((open) => !open)}
                className={cx(
                  "h-7 min-w-14 rounded-ds-md px-2 text-[11px] font-semibold tabular-nums text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                  FOCUS_RING,
                )}
              >
                {stageZoomPercent}%
              </button>
            }
          >
            <div className="flex flex-col">
              {ZOOM_PERCENT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFooterZoom(preset)}
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
                onClick={() => setFooterZoom(100)}
                className={cx(
                  "rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
                  FOCUS_RING,
                )}
              >
                Fit
              </button>
            </div>
          </Popover>
        </div>
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-3">
          {saveStatus === "error" && onSave ? (
            <button
              type="button"
              onClick={() => void onSave(deck)}
              className="text-ds-danger-text underline-offset-2 hover:underline"
            >
              {saveStatusLabel}
            </button>
          ) : (
            <span>{saveStatusLabel}</span>
          )}
          {saveStatus === "error" && saveErrorMessage ? (
            <span className="max-w-[260px] truncate text-ds-danger-text">
              {saveErrorMessage}
            </span>
          ) : null}
          <span>{diagnosticSummary}</span>
          {activeGroupId ? <span>Group edit</span> : null}
          {tableEditingNodeId ? <span>Table edit</span> : null}
          <span>{selection.mode === "layers" ? "Layers" : "Normal"} mode</span>
        </div>
      </footer>
    </div>
  );
}
