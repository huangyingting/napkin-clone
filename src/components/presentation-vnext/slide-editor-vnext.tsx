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
} from "react";
import {
  ChevronDown,
  ClipboardPaste,
  Copy,
  FileDown,
  FileText,
  Group,
  Keyboard,
  Image as ImageIcon,
  Plus,
  Redo2,
  Save,
  Spline,
  Square,
  Table2,
  Type,
  Ungroup,
  Undo2,
  X,
} from "lucide-react";

import type { ActionResult } from "@/lib/action-result";
import type { SaveStatus } from "@/lib/presentation/save-status";
import type {
  DeckV7,
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
  updateNodeStyleBinding,
  updateLocalStyle,
  resetLocalStyleOverride,
  detachDecoration,
  updateNodeLayout,
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
import {
  alignmentGuidesForFrames,
  snapFrameToStageGuides,
  type StageGuide,
} from "@/lib/presentation-vnext/stage-guides";
import {
  normalizeSelectionFrame,
  selectNodesInFrame,
  type SelectionFrame,
} from "@/lib/presentation-vnext/selection-geometry";

import { SlideCanvasVNext, type ResizeHandlePosition } from "./slide-canvas";
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
import { ContextToolbar } from "./toolbar/context-toolbar";
import { Filmstrip } from "./filmstrip/filmstrip";
import { InlineTextEditorVNext } from "./inline-text-editor";
import { useDeckV7RenderTree } from "./use-deck-v7-render-tree";

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
  nodes: SlideChildNode[],
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

function canvasFrameStyle(deck: DeckV7): CSSProperties {
  const width = deck.canvas.width > 0 ? deck.canvas.width : 16;
  const height = deck.canvas.height > 0 ? deck.canvas.height : 9;
  return { aspectRatio: `${width} / ${height}` };
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

function nodeFactoryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
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
  const themePackages = listThemePackagesV7();

  // Export error surfaced below the toolbar banner
  const [exportError, setExportError] = useState<string | null>(null);

  // Insert dropdown open state
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const insertMenuRef = useRef<HTMLDivElement | null>(null);

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

  function handleInsertSlide() {
    const result = insertBlankSlide(deck, activeSlideIndex + 1);
    onDeckChange(result.deck);
    setActiveSlideIndex(activeSlideIndex + 1);
    setSelection(createSelectionState(selection.mode));
  }

  function handleInsertNode(node: SlideChildNode) {
    if (!activeSlide) return;
    const result = insertNode(deck, activeSlide.id, node);
    onDeckChange(result.deck);
    setSelection((s) => setSelectedNodeIds(s, [result.nodeId]));
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
    handleInsertNode(defaultImageNode(nextZIndex(activeSlide)));
  }

  function handleInsertVisual() {
    handleInsertNode(defaultVisualNode(nextZIndex(activeSlide)));
  }

  function handleInsertConnector() {
    handleInsertNode(defaultConnectorNode(nextZIndex(activeSlide)));
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
  }

  function handleUngroupSelection() {
    if (!activeSlide || !selectedNode || selectedNode.type !== "group") return;
    const result = ungroupNodes(deck, activeSlide.id, selectedNode.id);
    onDeckChange(result.deck);
    if (result.nodeIds.length > 0) {
      setSelection((s) => setSelectedNodeIds(s, result.nodeIds));
    }
  }

  function handleNodeClick(nodeId: string, event: MouseEvent) {
    // Commit any active inline edit when clicking a different node
    if (inlineEditNodeId && inlineEditNodeId !== nodeId) {
      setInlineEditNodeId(null);
    }
    setSelection((s) => selectNode(s, nodeId, event.shiftKey || event.metaKey));
  }

  function handleNodeDoubleClick(nodeId: string, _event: MouseEvent) {
    if (!activeSlide) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node) return;
    // Only text and shape (with text) nodes are inline-editable
    if (node.type === "text" || node.type === "shape") {
      setSelection((s) => setSelectedNodeIds(s, [nodeId]));
      setInlineEditNodeId(nodeId);
    }
  }

  function handleInlineEditCommit(
    nodeId: string,
    paragraphs: import("@/lib/presentation-vnext/schema").Paragraph[],
  ) {
    if (!activeSlide) return;
    const node = findNodeById(activeSlide.children, nodeId);
    if (!node) return;
    if (node.type === "text") {
      onDeckChange(
        updateNodeContent(deck, activeSlide.id, nodeId, { paragraphs }),
      );
    } else if (node.type === "shape") {
      onDeckChange(
        updateNodeContent(deck, activeSlide.id, nodeId, {
          text: { paragraphs },
        }),
      );
    }
    setInlineEditNodeId(null);
  }

  function handleInlineEditCancel() {
    setInlineEditNodeId(null);
  }

  function handleStageClick(e: MouseEvent) {
    if (suppressStageClickRef.current) return;
    if (isEditableTarget(e.target)) return;
    if (e.target instanceof HTMLElement && e.target.closest("[data-node-id]")) {
      return;
    }
    setSelection((s) => clearSelection(s));
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeSlide || event.button !== 0 || isEditableTarget(event.target)) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (
        target.closest("[data-node-id]") ||
        target.closest("[data-resize-handle]")
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

  // Also find the selected resolved node to support decoration detach
  const selectedResolvedNode: ResolvedRenderNode | undefined =
    activeSlideTree && firstSelectedId
      ? [
          ...activeSlideTree.nodes,
          ...(selection.mode === "layers" ? activeSlideTree.decorations : []),
        ].find((n) => n.id === firstSelectedId)
      : undefined;

  function resolveDeckAsset(assetId: string): string | undefined {
    return (
      deck.assets.images[assetId]?.src ?? deck.assets.files?.[assetId]?.src
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
      setStageGuides([]);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
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
        resizeFrame(originalFrame, handle, deltaX, deltaY),
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
      setStageGuides([]);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Don't intercept keys when inline editing is active (inline editor handles them)
    if (inlineEditNodeId) return;
    if (isEditableTarget(event.target)) return;
    if (!activeSlide) return;
    if (event.key === "Escape") {
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
      onDeckChange(deleteNodes(deck, activeSlide.id, selectedIds));
      setSelection((s) => clearSelection(s));
      event.preventDefault();
      return;
    }

    const nudge = event.shiftKey ? 2 : 0.5;
    const deltaByKey: Record<string, { x: number; y: number } | undefined> = {
      ArrowLeft: { x: -nudge, y: 0 },
      ArrowRight: { x: nudge, y: 0 },
      ArrowUp: { x: 0, y: -nudge },
      ArrowDown: { x: 0, y: nudge },
    };
    const delta = deltaByKey[event.key];
    if (delta) {
      onDeckChange(moveNodesBy(deck, activeSlide.id, selectedIds, delta));
      event.preventDefault();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
      const result = duplicateNodes(deck, activeSlide.id, selectedIds);
      onDeckChange(result.deck);
      if (result.duplicatedIds.length > 0) {
        setSelection((s) => setSelectedNodeIds(s, result.duplicatedIds));
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
    onDeckChange(
      updateNodeLayout(deck, activeSlide.id, firstSelectedId, patch),
    );
  }

  function handleUpdateSelectedAttributes(patch: {
    locked?: boolean;
    hidden?: boolean;
  }) {
    if (!activeSlide || !firstSelectedId) return;
    onDeckChange(
      updateNodeAttributes(deck, activeSlide.id, firstSelectedId, patch),
    );
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

  function handleSelectLayer(nodeId: string) {
    setSelection((s) => setSelectedNodeIds(s, [nodeId]));
  }

  function handleUpdateLayer(
    nodeId: string,
    patch: { locked?: boolean; hidden?: boolean },
  ) {
    if (!activeSlide) return;
    onDeckChange(updateNodeAttributes(deck, activeSlide.id, nodeId, patch));
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
    }
    // Other actions (split-slide, open-asset-panel, etc.) require parent
    // routing — a future caller can extend this via a prop callback
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

  const stageFrameStyle = canvasFrameStyle(deck);
  const activeSlideName = slideDisplayName(activeSlide, activeSlideIndex);
  const selectedNodeSummary = selectedSummary(selectedIds.length);
  const diagnosticSummary = diagnosticsSummary(diagnostics.length);
  const activeTemplate = activeSlide
    ? TEMPLATE_REGISTRY.get(activeSlide.template.kind)
    : undefined;
  const activeLayoutId = activeSlide?.template.layoutId;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isDecorationSelected =
    selectedResolvedNode?.source === "themeDecoration";

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
      {/* ------------------------------------------------------------------ */}
      {/* Top Toolbar                                                         */}
      {/* ------------------------------------------------------------------ */}
      <header
        data-slide-editor-chrome="true"
        className="flex shrink-0 items-center justify-between gap-3 border-b border-ds-border-subtle bg-ds-surface-chrome px-3 py-2 backdrop-blur"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-ds-text-primary">
              {deck.title ?? "Slides"}
            </span>
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
                      handleInsertVisual();
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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ------------------------------------------------------------------ */}
        {/* Main Stage                                                          */}
        {/* ------------------------------------------------------------------ */}
        <div
          data-slide-stage-shell="true"
          data-slide-toolbar-anchor="true"
          className="relative min-w-0 flex-1 overflow-hidden bg-ds-surface-recessed"
          onClick={handleStageClick}
          onPointerDown={handleStagePointerDown}
        >
          {/* Context / Popover Toolbar */}
          <ContextToolbar
            selectedIds={selectedIds}
            selectedNode={selectedNode}
            isInlineEditing={inlineEditNodeId !== null}
            isDragging={stageGuides.length > 0}
            isDecorationSelected={isDecorationSelected}
            onDelete={() => {
              if (!activeSlide) return;
              onDeckChange(deleteNodes(deck, activeSlide.id, selectedIds));
              setSelection((s) => clearSelection(s));
            }}
            onDuplicate={() => {
              if (!activeSlide) return;
              const result = duplicateNodes(deck, activeSlide.id, selectedIds);
              onDeckChange(result.deck);
              if (result.duplicatedIds.length > 0) {
                setSelection((s) =>
                  setSelectedNodeIds(s, result.duplicatedIds),
                );
              }
            }}
            onGroup={handleGroupSelection}
            onUngroup={handleUngroupSelection}
            onBringForward={() => {
              if (!activeSlide || selectedIds.length === 0) return;
              let updated = deck;
              selectedIds.forEach((id) => {
                const node = findNodeById(activeSlide.children, id);
                const currentZ = node?.layout?.zIndex ?? 0;
                updated = reorderZIndex(
                  updated,
                  activeSlide.id,
                  id,
                  currentZ + 1,
                );
              });
              onDeckChange(updated);
            }}
            onSendBackward={() => {
              if (!activeSlide || selectedIds.length === 0) return;
              let updated = deck;
              selectedIds.forEach((id) => {
                const node = findNodeById(activeSlide.children, id);
                const currentZ = node?.layout?.zIndex ?? 0;
                updated = reorderZIndex(
                  updated,
                  activeSlide.id,
                  id,
                  currentZ - 1,
                );
              });
              onDeckChange(updated);
            }}
            onDetachDecoration={handleDetachDecoration}
          />

          {activeSlideTree ? (
            <div className="grid h-full min-h-[360px] place-items-center overflow-auto p-6">
              <div
                ref={handleCanvasRef}
                data-slide-stage-frame="true"
                className="relative w-full min-w-[320px] max-w-[1120px]"
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
                  onResizeHandlePointerDown={handleResizeHandlePointerDown}
                  hiddenNodeIds={
                    inlineEditNodeId ? new Set([inlineEditNodeId]) : undefined
                  }
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
                    return (
                      <InlineTextEditorVNext
                        nodeId={inlineEditNodeId}
                        initialParagraphs={paragraphs}
                        frame={editNode.layout.frame}
                        canvasRect={canvasRect}
                        onCommit={handleInlineEditCommit}
                        onCancel={handleInlineEditCancel}
                      />
                    );
                  })()}

                {stageGuides.length > 0 ? (
                  <div className="pointer-events-none absolute inset-0">
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
                    }}
                  />
                ) : null}
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
        <InspectorShell
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
          onResetToTheme={handleResetToTheme}
          onUpdateSelectedSource={handleUpdateSelectedSource}
          onChangeStyleBinding={handleChangeStyleBinding}
          onSelectLayer={handleSelectLayer}
          onUpdateLayer={handleUpdateLayer}
          onDetachDecoration={handleDetachDecoration}
          onDiagnosticAction={handleDiagnosticAction}
          TEMPLATE_OPTIONS={TEMPLATE_OPTIONS}
          activeTemplate={activeTemplate}
          activeLayoutId={activeLayoutId}
          onReapplyTemplate={handleReapplyTemplate}
          selectionMode={selection.mode}
          onToggleSelectionMode={toggleSelectionMode}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom Filmstrip                                                     */}
      {/* ------------------------------------------------------------------ */}
      {renderTree && (
        <Filmstrip
          renderTree={renderTree}
          activeSlideIndex={activeSlideIndex}
          assetResolver={resolveDeckAsset}
          onSelectSlide={(index) => {
            setActiveSlideIndex(index);
            setSelection(createSelectionState(selection.mode));
            setInlineEditNodeId(null);
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
      <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-ds-border-subtle bg-ds-surface-chrome px-3 text-[11px] text-ds-text-muted">
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate">
            Slide {Math.min(activeSlideIndex + 1, deck.slides.length)} of{" "}
            {deck.slides.length}
          </span>
          <span className="truncate">{selectedNodeSummary}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
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
          <span>{selection.mode === "layers" ? "Layers" : "Normal"} mode</span>
        </div>
      </footer>
    </div>
  );
}
