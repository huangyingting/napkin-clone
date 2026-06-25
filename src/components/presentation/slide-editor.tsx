"use client";

/**
 * Slide Editor — a full-page presentation editing surface.
 *
 * Opens over the whole viewport (portaled to `document.body`, `z-modal`) with a
 * surface-ownership layout (see `Slides-UI.md`): a top toolbar for global
 * actions, a slide rail (reorder via HTML5 drag-and-drop, add / duplicate /
 * delete), a large live stage that renders the selected slide with the shared
 * {@link SlideCanvas}, a selected-object context toolbar, a right properties
 * panel (Arrange / Text / Media / Layers / Slide / Notes / Source), and a
 * bottom dock (zoom / notes / status). A theme picker lives in the top bar; arrow keys page
 * between slides (unless a field is focused), Escape closes.
 *
 * Every change flows through the pure `deck-mutations` helpers and is reported
 * via `onDeckChange`; edits are persisted automatically by a debounced autosave
 * (~1.5s after the last change) and the explicit Save button flushes them
 * immediately. A status badge in the top bar mirrors the document editor's
 * save-status feedback ("All changes saved" / "Saving…" / "Unsaved changes…" /
 * "Couldn't save — Retry"), and closing while there are unsaved edits prompts
 * for confirmation so work is never lost silently.
 *
 * Read/write only of the deck prop — it never touches Lexical/Yjs state.
 */

import {
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Circle,
  Copy,
  Edit3,
  FileText,
  Grid3x3,
  Image as ImageIcon,
  Keyboard,
  LayoutPanelLeft,
  List,
  Minus,
  MoreHorizontal,
  Plus,
  Redo2,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Triangle,
  Undo2,
  X,
  Palette,
  Type,
  BringToFront,
  SendToBack,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { FOCUS_RING } from "@/components/ui/tokens";
import type { ActionResult } from "@/lib/action-result";
import { useFocusTrap } from "@/lib/presentation/use-focus-trap";
import {
  DECK_THEMES,
  SlideCanvas,
  type ThemeConfig,
} from "@/components/presentation/slide-canvas";
import {
  SlideInspector,
  type AddElementKind,
} from "@/components/presentation/slide-inspector";
import {
  ElementToolbarContent,
  SlideStageEditor,
  type SelectionMode,
} from "@/components/presentation/slide-stage-editor";
import { VisualPicker } from "@/components/presentation/visual-picker";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { IconButton, Tooltip } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Popover } from "@/components/ui/popover";
import {
  clampZoom,
  DEFAULT_SCREEN_SIZE,
  fitAspectRatio,
  type Size,
  ZOOM_PERCENT_PRESETS,
  zoomToPercent,
} from "@/lib/presentation/stage-fit";
import {
  buildVisualElement,
  DEFAULT_VISUAL_BOX,
  makeElementId,
  type Deck,
  type ConnectorElement,
  type ElementBox,
  type ShapeKind,
  type SlideElement,
  type SlideLayout as ReusableSlideLayout,
} from "@/lib/presentation/deck";
import {
  resolveSlideFormat,
  slideAspectRatio,
  SLIDE_FORMATS,
  slideFormatConfig,
  type SlideFormat,
} from "@/lib/presentation/slide-format";
import {
  mergeDeckFromDocument,
  type MergeSummary,
} from "@/lib/presentation/deck-merge";
import type { Visual } from "@/lib/visual/schema";
import {
  buildTemplateSlide,
  SLIDE_TEMPLATES,
  TEMPLATE_IMAGE_PLACEHOLDER_SRC,
  type SlideTemplateKind,
} from "@/lib/presentation/slide-templates";
import {
  SAVE_STATUS_LABEL,
  SLIDE_SAVE_DEBOUNCE_MS,
  resolveSaveErrorMessage,
  resolveSaveStatus,
  shouldPersist,
  shouldScheduleAutosave,
} from "@/lib/presentation/save-status";
import {
  commitCommand,
  executeCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import { DeckTemplatePanel } from "@/components/presentation/deck-template-panel";
import { resolveThemeTokens } from "@/lib/presentation/deck-theme-tokens";
import type { DeckTemplatePatch } from "@/lib/presentation/deck-mutations";
import {
  announceDelete,
  announceMove,
  announceResize,
  announceSelection,
  buildConnectorBetween,
  canvasShortcutHelp,
  connectorBoundingBox,
  cycleEndpointAnchor,
  focusTargetAfterDelete,
  isArrowKey,
  nextElementId,
  orderedElementIds,
  resizeBoxByStep,
  selectedConnectablePair,
} from "@/lib/presentation/canvas-a11y";
import { resolveConnectorElementPoints } from "@/lib/presentation/connector-geometry";
import { elementAccessibleName } from "@/lib/presentation/element-accessible-name";
import {
  addElement,
  duplicateElements,
  insertSlide,
  type DistributiveOmit,
  type ElementPatch,
} from "@/lib/presentation/deck-mutations";
import type {
  AlignMode,
  DistributeMode,
  MatchSizeMode,
} from "@/lib/presentation/element-align";
import type { ArrangeMode } from "@/lib/presentation/element-arrange";
import { deriveSlideTitle } from "@/lib/presentation/slide-title";
import {
  isSelectionToolbarVisible,
  shouldCollapseToolbar,
  shouldShowRichToolbarControls,
  toolbarPanelEntries,
  toToolbarSelectionKind,
  type RightPanelTab,
} from "@/lib/presentation/slide-panel-ui";
import {
  reorderTargetIndex,
  slideReorderKeyDirection,
} from "@/lib/presentation/slide-reorder";
import { useDeckHistory } from "@/lib/presentation/use-deck-history";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
import { uploadSlideAsset } from "@/app/app/documents/[id]/slide-asset-actions";
import {
  buildInsertables,
  insertableTextElement,
  insertableVisualElement,
  type Insertable,
} from "@/lib/presentation/document-insertable";
import {
  findStaleSourceLinks,
  updateTextElementFromBlock,
  buildRefreshSourceRef,
  type StaleSourceLink,
} from "@/lib/presentation/source-link-staleness";
import { hashDocumentBlock } from "@/lib/presentation/document-block-hash";
import { type SourceRef } from "@/lib/presentation/deck";
import type {
  DocumentBlock,
  DocumentTextBlock,
} from "@/lib/visual/document-export";
import {
  createTextResizeMeasurer,
  fitTextElementToContent,
  type TextLikeElement,
} from "@/lib/presentation/text-element-fit";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";

interface SlideEditorProps {
  deck: Deck;
  visuals: ReadonlyMap<string, Visual>;
  /**
   * The source document's text blocks, surfaced in the "From document"
   * quick-insert panel so reused document text is one click away.
   */
  documentTextBlocks?: readonly DocumentTextBlock[];
  /**
   * All raw document blocks (text + visual). When provided, passed to
   * `mergeDeckFromDocument` for element-level source-ref precedence (#409)
   * and to `findStaleSourceLinks` for visual staleness detection (#424).
   */
  documentBlocks: readonly DocumentBlock[];
  /**
   * The source document's stable ID. Used for two purposes: passed through to
   * {@link insertableTextElement} so inserted text elements carry a full
   * `sourceRef` (issue #377); and passed to {@link useImageUpload} so uploaded
   * images are stored as server-side slide assets (Epic #374). Absent when the
   * panel is opened without a live document context.
   */
  documentId?: string;
  onDeckChange: (deck: Deck) => void;
  onClose: () => void;
  /**
   * Persists the deck through the owner-scoped save action. Returns the
   * {@link ActionResult} so the editor can surface success/failure in its
   * save-status badge and offer a working Retry on error. Used by both the
   * debounced autosave and the explicit Save button (a single save path).
   */
  onSave: (deck: Deck, patches: DeckPatch[]) => Promise<ActionResult>;
  /**
   * The deck freshly derived from the live document (`buildDeckFromBlocks`),
   * carrying the current document content hash. Drives the "Sync from document"
   * merge. Absent when the document state is unavailable — the sync action is
   * then hidden.
   */
  freshDeck?: Deck | null;
  /** Whether the document changed since this deck was last built/synced. */
  isDeckStale?: boolean;
  /**
   * The current user's brand-kit colors, surfaced first in the slide editor's
   * color pickers (background, accent, text, and shape). Best-effort and
   * optional — falls back to on-theme / default swatches when empty.
   */
  brandSwatches?: readonly string[];
  /**
   * Number of slide elements whose source-document links are stale (issue
   * #377). Drives the stale-count badge on the "From document" button. Absent
   * or zero means no badge is rendered.
   */
  staleSourceLinkCount?: number;
}

/** Tabs available in the right supplemental panel (Slides-UI.md). */

type BackgroundGradient = { from: string; to: string; angle?: number };

const SOLID_BACKGROUND_OPTIONS: {
  id: string;
  label: string;
  color: string;
}[] = [
  { id: "black", label: "Black", color: "#050505" },
  { id: "graphite", label: "Graphite", color: "#525252" },
  { id: "ash", label: "Ash", color: "#737373" },
  { id: "stone", label: "Stone", color: "#a3a3a3" },
  { id: "silver", label: "Silver", color: "#b8b8b8" },
  { id: "mist", label: "Mist", color: "#d4d4d4" },
  { id: "white", label: "White", color: "#fbfbfb" },
  { id: "vermillion", label: "Vermillion", color: "#df4038" },
  { id: "coral", label: "Coral", color: "#df625d" },
  { id: "orchid", label: "Orchid", color: "#d662b8" },
  { id: "lilac", label: "Lilac", color: "#caa2e7" },
  { id: "violet", label: "Violet", color: "#ad6ddd" },
  { id: "iris", label: "Iris", color: "#7b5cf0" },
  { id: "royal", label: "Royal", color: "#512ddc" },
  { id: "fjord", label: "Fjord", color: "#5799af" },
  { id: "sky", label: "Sky", color: "#6dbbd5" },
  { id: "aqua", label: "Aqua", color: "#8bd6d8" },
  { id: "azure", label: "Azure", color: "#6aaef0" },
  { id: "periwinkle", label: "Periwinkle", color: "#6374ee" },
  { id: "cobalt", label: "Cobalt", color: "#3455ad" },
  { id: "indigo", label: "Indigo", color: "#24139b" },
  { id: "leaf", label: "Leaf", color: "#66ba69" },
  { id: "lime", label: "Lime", color: "#9bd363" },
  { id: "sprout", label: "Sprout", color: "#cbfb6f" },
  { id: "sun", label: "Sun", color: "#f6dc62" },
  { id: "sand", label: "Sand", color: "#efbf61" },
  { id: "apricot", label: "Apricot", color: "#e99350" },
  { id: "orange", label: "Orange", color: "#e5782e" },
];

const GRADIENT_BACKGROUND_OPTIONS: {
  id: string;
  label: string;
  gradient: BackgroundGradient;
}[] = [
  {
    id: "black-gloss",
    label: "Black gloss",
    gradient: { from: "#050505", to: "#525252", angle: 90 },
  },
  {
    id: "mono-shine",
    label: "Mono shine",
    gradient: { from: "#0b0b0b", to: "#f5f5f5", angle: 90 },
  },
  {
    id: "pearl",
    label: "Pearl",
    gradient: { from: "#a8a8a8", to: "#f7f7f7", angle: 135 },
  },
  {
    id: "lime-pop",
    label: "Lime pop",
    gradient: { from: "#8bd548", to: "#daf56d", angle: 135 },
  },
  {
    id: "gold-night",
    label: "Gold night",
    gradient: { from: "#0f0d05", to: "#99741a", angle: 90 },
  },
  {
    id: "sunset-glow",
    label: "Sunset glow",
    gradient: { from: "#7c3f96", to: "#f5d64d", angle: 90 },
  },
  {
    id: "deep-violet",
    label: "Deep violet",
    gradient: { from: "#060a36", to: "#2514a0", angle: 135 },
  },
  {
    id: "frost",
    label: "Frost",
    gradient: { from: "#d4f8de", to: "#b9c8ff", angle: 135 },
  },
  {
    id: "ember",
    label: "Ember",
    gradient: { from: "#dd3f3a", to: "#ec9a4e", angle: 135 },
  },
  {
    id: "berry",
    label: "Berry",
    gradient: { from: "#d94d59", to: "#7b5cf0", angle: 135 },
  },
  {
    id: "candy",
    label: "Candy",
    gradient: { from: "#5b73f0", to: "#d45fc4", angle: 135 },
  },
  {
    id: "cosmic",
    label: "Cosmic",
    gradient: { from: "#2f58b8", to: "#8b4fda", angle: 135 },
  },
  {
    id: "aqua-pop",
    label: "Aqua pop",
    gradient: { from: "#7a5cf2", to: "#78d5dd", angle: 135 },
  },
  {
    id: "ocean",
    label: "Ocean",
    gradient: { from: "#70ced8", to: "#3455ad", angle: 135 },
  },
  {
    id: "rainforest",
    label: "Rainforest",
    gradient: { from: "#745cf0", to: "#58b96a", angle: 135 },
  },
  {
    id: "meadow",
    label: "Meadow",
    gradient: { from: "#5e9eaf", to: "#98d45f", angle: 135 },
  },
  {
    id: "sea-lime",
    label: "Sea lime",
    gradient: { from: "#63b7d6", to: "#e8df66", angle: 135 },
  },
  {
    id: "honey",
    label: "Honey",
    gradient: { from: "#f8d35a", to: "#ee9f51", angle: 135 },
  },
  {
    id: "peach",
    label: "Peach",
    gradient: { from: "#d95faa", to: "#f2d65d", angle: 135 },
  },
  {
    id: "blush",
    label: "Blush",
    gradient: { from: "#fff2a8", to: "#e5a7f0", angle: 135 },
  },
  {
    id: "sherbet",
    label: "Sherbet",
    gradient: { from: "#7b5cf0", to: "#e99350", angle: 135 },
  },
];

function gradientCss(gradient: BackgroundGradient): string {
  return `linear-gradient(${gradient.angle ?? 135}deg, ${gradient.from}, ${gradient.to})`;
}

function sameGradient(
  a: BackgroundGradient | undefined,
  b: BackgroundGradient,
): boolean {
  if (!a) return false;
  return (
    a.from === b.from && a.to === b.to && (a.angle ?? 135) === (b.angle ?? 135)
  );
}

function normalizeHexInput(value: string): string {
  const cleaned = value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
  return `#${cleaned}`;
}

function isCompleteHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function swatchColor(value: string, fallback: string): string {
  return isCompleteHexColor(value) ? value : fallback;
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!isCompleteHexColor(hex)) return null;
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function hexToHsv(hex: string, fallback: string) {
  const rgb = hexToRgb(hex) ?? hexToRgb(fallback)!;
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
}

function hsvToHex(h: number, s: number, v: number): string {
  const rgb = hsvToRgb(h, s, v);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

const FLOATING_PANEL_STAGE_RESERVE_PX = 352;
const PASTE_OFFSET_PCT = 3;
const PASTE_OFFSET_WRAP_STEPS = 8;

function appendPendingPatches(
  pendingPatchesRef: { current: DeckPatch[] },
  patches: DeckPatch[],
) {
  pendingPatchesRef.current = [...pendingPatchesRef.current, ...patches];
}

function clearPendingPatches(pendingPatchesRef: { current: DeckPatch[] }) {
  pendingPatchesRef.current = [];
}

function replacePendingPatches(
  pendingPatchesRef: { current: DeckPatch[] },
  patches: DeckPatch[],
) {
  pendingPatchesRef.current = patches;
}

/** Builds a freshly-positioned element for the "Add" buttons. */
function buildDefaultElement(
  kind: AddElementKind,
  accent: string,
  id: string,
  shapeKind: ShapeKind = "rect",
): DistributiveOmit<SlideElement, "id" | "zIndex"> & { id: string } {
  switch (kind) {
    case "text":
      return {
        id,
        kind: "text",
        role: "body",
        text: "New text",
        box: { x: 20, y: 40, w: 60, h: 16 },
        style: {
          fontSize: SLIDE_TEXT_FONT_SIZE.text,
          bold: false,
          italic: false,
          align: "left",
        },
      };
    case "bullets":
      return {
        id,
        kind: "bullets",
        bullets: ["First point", "Second point"],
        items: [{ text: "First point" }, { text: "Second point" }],
        box: { x: 14, y: 28, w: 72, h: 48 },
        style: {
          fontSize: SLIDE_TEXT_FONT_SIZE.list,
          bold: false,
          italic: false,
          align: "left",
        },
      };
    case "image":
      return {
        id,
        kind: "image",
        src: TEMPLATE_IMAGE_PLACEHOLDER_SRC,
        alt: "Image placeholder",
        box: { x: 25, y: 22, w: 50, h: 56 },
      };
    case "shape":
      return {
        id,
        kind: "shape",
        shape: shapeKind,
        color: accent,
        box:
          shapeKind === "line"
            ? { x: 20, y: 50, w: 60, h: 2 }
            : { x: 30, y: 34, w: 40, h: 32 },
      };
  }
}

function slideElementTypeLabel(element: SlideElement): string {
  switch (element.kind) {
    case "placeholder":
      return "Placeholder";
    case "text":
      return element.role === "title" ? "Title" : "Text";
    case "bullets":
      return "Bullets";
    case "image":
      return "Image";
    case "shape":
      return "Shape";
    case "visual":
      return "Visual";
    case "connector":
      return "Connector";
  }
}

/**
 * Thin wrapper that applies a focus trap to its single-element child. Rendered
 * only while the wrapped region is visible, so the trap installs/uninstalls
 * with mount/unmount and React rules-of-hooks are satisfied.
 */
function FocusTrapped({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return <div ref={ref}>{children}</div>;
}

/**
 * In-product keyboard shortcut help overlay for the slide editor canvas (#535).
 * Built on the shared accessible {@link Dialog} (focus-trapped, Escape to
 * close, focus restored on close); the shortcut content comes from the pure
 * {@link canvasShortcutHelp} helper so it stays in sync with the keyboard
 * model and is unit-tested.
 */
function KeyboardShortcutHelpDialog({
  open,
  isMac,
  onClose,
}: {
  open: boolean;
  isMac: boolean;
  onClose: () => void;
}) {
  const groups = useMemo(() => canvasShortcutHelp({ isMac }), [isMac]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="canvas-keyboard-help-title"
      className="max-w-2xl"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2
          id="canvas-keyboard-help-title"
          className="text-base font-semibold text-ds-text-primary"
        >
          Keyboard shortcuts
        </h2>
        <IconButton
          aria-label="Close"
          size="sm"
          variant="plain"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ds-text-muted">
              {group.title}
            </h3>
            <dl className="flex flex-col gap-1.5">
              {group.entries.map((entry) => (
                <div
                  key={entry.keys}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <dt className="text-ds-text-secondary">
                    {entry.description}
                  </dt>
                  <dd className="shrink-0">
                    <kbd className="rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-1.5 py-0.5 text-xs font-medium text-ds-text-primary">
                      {entry.keys}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

export function SlideEditor({
  deck: deckProp,
  visuals,
  documentTextBlocks = [],
  documentBlocks,
  documentId,
  onDeckChange: onDeckChangeProp,
  onClose,
  onSave,
  freshDeck = null,
  isDeckStale = false,
  brandSwatches = [],
  staleSourceLinkCount = 0,
}: SlideEditorProps) {
  // Snapshot-based undo/redo over the plain Deck object. Every mutation routes
  // through `onDeckChange` (the history `commit`), which records the previous
  // present and notifies the parent. This never touches contentJson / Yjs state.
  const {
    present: deck,
    commit: onDeckChange,
    replace: replaceDeck,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDeckHistory(deckProp, onDeckChangeProp);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [railOpen, setRailOpen] = useState(true);
  const [railContentMounted, setRailContentMounted] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    index: number;
    x: number;
    y: number;
    width: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  // Whether the mobile inspector bottom sheet is open (below `lg`; the inspector
  // is a fixed right panel at `lg+`). Issue #209.
  const [inspectorSheetOpen, setInspectorSheetOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const openInspectorSurface = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches
    ) {
      setInspectorSheetOpen(true);
      return;
    }
    setInspectorOpen(true);
  }, []);
  const closeRightPanel = useCallback(() => {
    setInspectorOpen(false);
    setInspectorSheetOpen(false);
  }, []);
  // Which tab the right supplemental panel shows. Set by toolbar handoff
  // (Position -> arrange, Layers -> layers) and automatic selection handoff.
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("position");
  const openRightPanel = useCallback(
    (tab: RightPanelTab) => {
      setRightPanelTab(tab);
      openInspectorSurface();
    },
    [openInspectorSurface],
  );
  const openSelectionPanel = useCallback(() => {
    openInspectorSurface();
  }, [openInspectorSurface]);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const handleZoomChange = useCallback((nextZoom: number) => {
    setZoom(clampZoom(nextZoom));
  }, []);
  const [stageBounds, setStageBounds] = useState<Size>(DEFAULT_SCREEN_SIZE);

  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  // The full multi-selection (issue #237). `selectedElementId` is the primary
  // (anchor) element used for single-element operations — move, resize, inline
  // edit, keyboard nudge/delete, and inspector properties — and is always a member
  // of this set when non-empty. A 1-element selection is the common path and
  // behaves exactly as before.
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Whether the stage "Add → Visual" picker popover is open.
  const [visualPickerOpen, setVisualPickerOpen] = useState(false);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  // Whether the top-level "From document" quick-insert panel is open.
  const [fromDocOpen, setFromDocOpen] = useState(false);
  // Whether the thumbnail rail "+ Add slide" template picker popover is open.
  const [addTemplateOpen, setAddTemplateOpen] = useState(false);
  // Whether the visual picker for the "Visual spotlight" template is open.
  const [spotlightPickerOpen, setSpotlightPickerOpen] = useState(false);
  // Whether the collapsed theme-swatch popover is open (shown below `lg`).
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [deckTemplateOpen, setDeckTemplateOpen] = useState(false);
  // Pending sync from the live document: a computed merge awaiting the user's
  // confirmation. `null` when no merge dialog is open.
  const [mergePreview, setMergePreview] = useState<{
    deck: Deck;
    summary: MergeSummary;
  } | null>(null);
  // Whether the staleness banner has been resolved (synced or dismissed) for
  // this editing session, so it does not keep nagging after the user acts.
  const [staleResolved, setStaleResolved] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  // Focus-trap ref for the main editor dialog.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  // Thumbnail rail list element — measured during a pointer reorder to map the
  // pointer position to a drop target (works for both the vertical rail and the
  // horizontal mobile strip). Issue #209.
  const railListRef = useRef<HTMLUListElement>(null);
  // Live reorder drag, tracked in a ref so the window pointer listeners always
  // read the latest source/target without re-subscribing on every move.
  // `capturedPointerId` filters out a second touch so it cannot corrupt
  // `dragOverIndex` (#306). `cachedRects` is populated once at pointerdown and
  // reused on every pointermove to avoid per-frame layout reads.
  const reorderRef = useRef<{
    fromIndex: number;
    overIndex: number;
    capturedPointerId: number;
    cachedRects: DOMRect[];
    startClientX: number;
    startClientY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  // In-memory element clipboard for copy / cut / paste (within & across slides).
  const clipboardRef = useRef<SlideElement[] | null>(null);
  const pasteCountRef = useRef(0);
  // Hidden file input for the Insert ▸ Image one-step picker flow (#299).
  const insertImageFileInputRef = useRef<HTMLInputElement>(null);
  // Element ID of the pending Insert ▸ Image pick session. Cleared by onAccept
  // (file chosen) and onError (validation failure) so the cancel-fallback
  // knows whether to insert the empty placeholder.
  const insertImagePendingIdRef = useRef<string | null>(null);
  const [insertImageError, setInsertImageError] = useState<string | null>(null);
  // Keydown handler state ref — deck and selection values read by the global
  // keydown listener are kept in a ref updated each render so the listener can
  // subscribe ONCE (empty stable deps) and always read the latest state without
  // re-subscribing on every deck identity change (which happens on every drag
  // frame). Behavior is unchanged; the re-subscription churn is eliminated.
  const keydownStateRef = useRef({
    deck,
    safeSelected: 0,
    effectiveSelectedElementId: null as string | null,
    effectiveSelectedElementIds: new Set<string>(),
  });

  // ── Canvas keyboard accessibility (#530–#535) ──────────────────────────────
  // Imperative focus restoration (#532): bumping the nonce tells the stage to
  // move DOM focus to `elementId` (or the canvas container when null) after a
  // keyboard mutation so users are never dropped to the top of the page.
  const focusNonceRef = useRef(0);
  const [focusRequest, setFocusRequest] = useState<{
    elementId: string | null;
    nonce: number;
  }>({ elementId: null, nonce: 0 });
  const requestElementFocus = useCallback((elementId: string | null) => {
    focusNonceRef.current += 1;
    setFocusRequest({ elementId, nonce: focusNonceRef.current });
  }, []);
  // Polite screen-reader announcements (#533): selection / move / resize /
  // delete results surfaced in the stage's visually-hidden live region.
  const liveNonceRef = useRef(0);
  const [liveMessage, setLiveMessage] = useState<{
    text: string;
    nonce: number;
  }>({ text: "", nonce: 0 });
  const announce = useCallback((text: string) => {
    liveNonceRef.current += 1;
    setLiveMessage({ text, nonce: liveNonceRef.current });
  }, []);
  // In-product keyboard shortcut help overlay (#535).
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);

  // ── Autosave + save-status feedback (issue #208) ───────────────────────────
  // Mirrors the document editor: a debounced autosave persists deck edits a
  // short while after the user stops editing, the Save button flushes
  // immediately, and a badge reflects the current persistence state.
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);
  // The server-returned reason for the last failed save, if any. Cleared on
  // success and on new edits so stale messages are never shown after recovery.
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Pending autosave debounce timer.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The freshest deck to persist; a save in flight reads this so a flush always
  // writes the newest edits, not a stale snapshot captured when it was queued.
  const latestDeckRef = useRef<Deck>(deck);
  // The last deck reference the autosave effect observed. `null` until the
  // initial deck is seen, so the first render is never autosaved.
  const lastSeenDeckRef = useRef<Deck | null>(null);
  // The serialized payload of the last deck successfully persisted, or `null`
  // before anything has been saved. Lets `flushSave` skip redundant network
  // writes when an edit serializes identically to what is already saved (#247).
  const lastSavedSerializedRef = useRef<string | null>(null);
  // Accumulated serializable patches emitted by committed commands. Cleared when
  // passed to onSave (or on undo/redo which invalidates the accumulated history).
  const pendingPatchesRef = useRef<DeckPatch[]>([]);

  // Single commit path for command-based handlers: runs commitCommand, accumulates
  // patches, then calls onDeckChange with the correct commitOptions.
  const doCommitAndChange = useCallback(
    (deck: Deck, cmd: Parameters<typeof commitCommand>[1]) => {
      const { result, commitOptions, patches } = commitCommand(deck, cmd);
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
    },
    [onDeckChange],
  );

  // Persists the latest deck immediately, cancelling any pending debounce. Both
  // the autosave timer and the manual Save / Retry buttons route through here so
  // there is a single save path.
  const flushSave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const deckToSave = latestDeckRef.current;
    // Re-serializing and POSTing the whole deck (incl. inlined base64 images)
    // is expensive, so skip the write entirely when nothing changed since the
    // last successful save — e.g. an edit undone back to the saved state (#247).
    const serialized = JSON.stringify(deckToSave);
    if (!shouldPersist(lastSavedSerializedRef.current, serialized)) {
      if (latestDeckRef.current === deckToSave) {
        setIsDirty(false);
      }
      setHasSaveError(false);
      setSaveErrorMessage(null);
      return;
    }
    const patchSnapshot = pendingPatchesRef.current;
    clearPendingPatches(pendingPatchesRef);
    setIsSaving(true);
    setHasSaveError(false);
    setSaveErrorMessage(null);
    try {
      const res = await onSave(deckToSave, patchSnapshot);
      if (res.ok) {
        lastSavedSerializedRef.current = serialized;
        // Only clear the dirty flag if no newer edit was queued mid-save.
        if (latestDeckRef.current === deckToSave) {
          setIsDirty(false);
        }
      } else {
        if (latestDeckRef.current === deckToSave) {
          replacePendingPatches(pendingPatchesRef, patchSnapshot);
        }
        setHasSaveError(true);
        setSaveErrorMessage(res.error);
      }
    } catch {
      if (latestDeckRef.current === deckToSave) {
        replacePendingPatches(pendingPatchesRef, patchSnapshot);
      }
      setHasSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }, [onSave]);

  // Schedule a debounced autosave on each real user edit. The present deck only
  // changes reference on a genuine action (mutation / undo / redo / applied
  // sync); the initial load and staleness banner never reach here, so no
  // spurious autosave fires.
  useEffect(() => {
    latestDeckRef.current = deck;
    const lastSeen = lastSeenDeckRef.current;
    lastSeenDeckRef.current = deck;
    if (!shouldScheduleAutosave({ current: deck, lastSeen })) {
      return;
    }
    setIsDirty(true);
    setHasSaveError(false);
    setSaveErrorMessage(null);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, SLIDE_SAVE_DEBOUNCE_MS);
  }, [deck, flushSave]);

  // Clear any pending autosave timer on unmount.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  // Lock page scroll while the full-screen editor overlay is open so the page
  // underneath can't peek through or leave a stray scrollbar. The page
  // scrollbar usually lives on <html>, so lock both it and <body>.
  useEffect(() => {
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const saveStatus = resolveSaveStatus({
    isDirty,
    isSaving,
    hasError: hasSaveError,
  });
  // There are edits at risk of being lost while not fully saved.
  const hasUnsavedWork = isDirty || isSaving || hasSaveError;

  // Confirm before closing with unsaved work so edits are never lost silently.
  const handleRequestClose = useCallback(() => {
    if (
      hasUnsavedWork &&
      typeof window !== "undefined" &&
      !window.confirm(
        "You have unsaved slide changes. Close the editor and discard them?",
      )
    ) {
      return;
    }
    onClose();
  }, [hasUnsavedWork, onClose]);

  // Native beforeunload guard: warn before a full page unload while edits are
  // still in flight or unsaved, mirroring the close confirmation.
  useEffect(() => {
    if (!hasUnsavedWork) {
      return;
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedWork]);

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
  const undoShortcut = isMac ? "⌘Z" : "Ctrl+Z";
  const redoShortcut = isMac ? "⌘⇧Z" : "Ctrl+Shift+Z";

  // Keep the selection within bounds as slides are added/removed.
  const safeSelected = Math.min(selectedIndex, deck.slides.length - 1);
  const selectedSlide = deck.slides[safeSelected];
  const selectedTheme = selectedSlide
    ? (DECK_THEMES[selectedSlide.theme] ?? DECK_THEMES.default)
    : DECK_THEMES.default;
  // A selection is only valid while its element exists on the active slide, so
  // switching slides (or deleting an element) implicitly clears it — no effect
  // needed.
  const effectiveSelectedElementId =
    selectedElementId != null &&
    (selectedSlide?.elements?.some((el) => el.id === selectedElementId) ??
      false)
      ? selectedElementId
      : null;
  // The multi-selection narrowed to elements that still exist on the active
  // slide (issue #237). Switching slides or deleting elements implicitly prunes
  // the selection — no effect needed, mirroring `effectiveSelectedElementId`.
  const effectiveSelectedElementIds = useMemo(() => {
    const existing = selectedSlide?.elements;
    if (!existing || selectedElementIds.size === 0) {
      return new Set<string>();
    }
    const next = new Set<string>();
    for (const el of existing) {
      if (selectedElementIds.has(el.id)) {
        next.add(el.id);
      }
    }
    return next;
  }, [selectedSlide?.elements, selectedElementIds]);
  // Keep the keydown state ref current after every render so the single-subscribed
  // listener always reads the latest deck and selection without re-subscribing.
  // useLayoutEffect runs synchronously after DOM updates (before paint) so the ref
  // is fresh before any user interaction can trigger the keydown handler.
  useLayoutEffect(() => {
    keydownStateRef.current = {
      deck,
      safeSelected,
      effectiveSelectedElementId,
      effectiveSelectedElementIds,
    };
  });
  const selectionSummary = useMemo(() => {
    if (effectiveSelectedElementIds.size > 1) {
      return `${effectiveSelectedElementIds.size} elements selected`;
    }
    if (!effectiveSelectedElementId || !selectedSlide?.elements) {
      return "No element selected";
    }
    const element = selectedSlide.elements.find(
      (candidate) => candidate.id === effectiveSelectedElementId,
    );
    return element
      ? `${slideElementTypeLabel(element)} selected`
      : "No element selected";
  }, [effectiveSelectedElementId, effectiveSelectedElementIds, selectedSlide]);
  const activeSlideAspectRatio = slideAspectRatio(deck.slideFormat);
  // Fit the stage to the deck's slide format — not the viewport's — so
  // cqh-sized slide text never overflows on portrait phones.
  const fittedStageSize = fitAspectRatio(stageBounds, activeSlideAspectRatio);
  const renderedStageWidth = fittedStageSize.width * zoom;
  const renderedStageHeight = fittedStageSize.height * zoom;
  const scrollContentWidth = Math.max(stageBounds.width, renderedStageWidth);
  const scrollContentHeight = Math.max(stageBounds.height, renderedStageHeight);
  const scrollInsetX = Math.max(
    0,
    (stageBounds.width - renderedStageWidth) / 2,
  );
  const scrollInsetY = Math.max(
    0,
    (scrollContentHeight - renderedStageHeight) / 2,
  );
  const panelSlideShiftX = inspectorOpen
    ? Math.max(
        -scrollInsetX,
        -Math.min(FLOATING_PANEL_STAGE_RESERVE_PX / 2, scrollInsetX),
      )
    : 0;

  const fitInsertedTextElement = useCallback(
    <T extends TextLikeElement>(element: T, anchor: "top-left" | "center") => {
      const stageWidth = fittedStageSize.width * zoom;
      const stageHeight = fittedStageSize.height * zoom;
      if (stageWidth <= 0 || stageHeight <= 0) {
        return element;
      }
      const measurer = createTextResizeMeasurer(stageWidth, stageHeight);
      return fitTextElementToContent(element, measurer, anchor);
    },
    [fittedStageSize.height, fittedStageSize.width, zoom],
  );

  const fitDerivedTextElementBoxes = useCallback(
    (source: Deck): Deck => {
      const stageWidth = fittedStageSize.width * zoom;
      const stageHeight = fittedStageSize.height * zoom;
      if (stageWidth <= 0 || stageHeight <= 0) {
        return source;
      }

      const measurer = createTextResizeMeasurer(stageWidth, stageHeight);
      let changed = false;
      const slides = source.slides.map((slide) => {
        if (slide.elementsDerived !== true || !slide.elements?.length) {
          return slide;
        }

        let slideChanged = false;
        const elements = slide.elements.map((element) => {
          if (element.kind !== "text" && element.kind !== "bullets") {
            return element;
          }
          const fitted = fitTextElementToContent(
            element,
            measurer,
            "preserve-text-position",
          );
          const sameBox =
            Math.abs(fitted.box.x - element.box.x) < 0.01 &&
            Math.abs(fitted.box.y - element.box.y) < 0.01 &&
            Math.abs(fitted.box.w - element.box.w) < 0.01 &&
            Math.abs(fitted.box.h - element.box.h) < 0.01;
          if (sameBox) {
            return element;
          }
          slideChanged = true;
          return fitted;
        });

        if (!slideChanged) {
          return slide;
        }
        changed = true;
        return { ...slide, elements };
      });

      return changed ? { ...source, slides } : source;
    },
    [fittedStageSize.height, fittedStageSize.width, zoom],
  );

  useLayoutEffect(() => {
    const fitted = fitDerivedTextElementBoxes(deck);
    if (fitted !== deck) {
      replaceDeck(fitted);
    }
  }, [deck, fitDerivedTextElementBoxes, replaceDeck]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) {
      return;
    }

    const updateBounds = () => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const paddingX =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight);
      const paddingY =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom);
      setStageBounds({
        width: Math.max(1, rect.width - paddingX),
        height: Math.max(1, rect.height - paddingY),
      });
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleToggleRail = useCallback(() => {
    setRailContentMounted(true);
    setRailOpen((open) => !open);
  }, []);

  const handleSlideFormatChange = useCallback(
    (slideFormat: SlideFormat) => {
      doCommitAndChange(deck, { type: "SET_DECK_FORMAT", slideFormat });
    },
    [deck, doCommitAndChange],
  );

  const applyDeckSolidBackground = useCallback(
    (color: string) => {
      let nextDeck = deck;
      const patches: DeckPatch[] = [];
      for (const slide of deck.slides) {
        const commands: Parameters<typeof commitCommand>[1][] = [];
        if (slide.backgroundImage !== undefined || slide.backgroundAssetId) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND_ASSET",
            slideId: slide.id,
            opts: undefined,
          });
        }
        if (slide.backgroundGradient !== undefined) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND_GRADIENT",
            slideId: slide.id,
            gradient: undefined,
          });
        }
        if (slide.background !== color) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND",
            slideId: slide.id,
            background: color,
          });
        }
        for (const command of commands) {
          const { result, patches: commandPatches } = commitCommand(
            nextDeck,
            command,
          );
          if (!result.ok) return;
          nextDeck = result.deck;
          patches.push(...commandPatches);
        }
      }
      if (patches.length > 0) {
        appendPendingPatches(pendingPatchesRef, patches);
        onDeckChange(nextDeck);
      }
      setThemeMenuOpen(false);
    },
    [deck, onDeckChange],
  );

  const applyDeckGradientBackground = useCallback(
    (gradient: BackgroundGradient) => {
      let nextDeck = deck;
      const patches: DeckPatch[] = [];
      for (const slide of deck.slides) {
        const commands: Parameters<typeof commitCommand>[1][] = [];
        if (slide.backgroundImage !== undefined || slide.backgroundAssetId) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND_ASSET",
            slideId: slide.id,
            opts: undefined,
          });
        }
        if (slide.background !== undefined) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND",
            slideId: slide.id,
            background: undefined,
          });
        }
        if (!sameGradient(slide.backgroundGradient, gradient)) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND_GRADIENT",
            slideId: slide.id,
            gradient,
          });
        }
        for (const command of commands) {
          const { result, patches: commandPatches } = commitCommand(
            nextDeck,
            command,
          );
          if (!result.ok) return;
          nextDeck = result.deck;
          patches.push(...commandPatches);
        }
      }
      if (patches.length > 0) {
        appendPendingPatches(pendingPatchesRef, patches);
        onDeckChange(nextDeck);
      }
      setThemeMenuOpen(false);
    },
    [deck, onDeckChange],
  );

  const activeSolidBackground = SOLID_BACKGROUND_OPTIONS.find((option) =>
    deck.slides.every(
      (slide) =>
        slide.background === option.color &&
        slide.backgroundGradient === undefined &&
        slide.backgroundImage === undefined &&
        slide.backgroundAssetId === undefined,
    ),
  )?.id;
  const activeGradientBackground = GRADIENT_BACKGROUND_OPTIONS.find((option) =>
    deck.slides.every(
      (slide) =>
        sameGradient(slide.backgroundGradient, option.gradient) &&
        slide.background === undefined &&
        slide.backgroundImage === undefined &&
        slide.backgroundAssetId === undefined,
    ),
  )?.id;
  const backgroundPreviewGradient = selectedSlide?.backgroundGradient;
  const backgroundPreviewStyle = backgroundPreviewGradient
    ? { background: gradientCss(backgroundPreviewGradient) }
    : { backgroundColor: selectedSlide?.background ?? selectedTheme.bgColor };

  const handleAddTemplate = useCallback(
    (kind: SlideTemplateKind) => {
      // When the user picks "Visual spotlight" and the document has visuals,
      // open the VisualPicker so they choose which visual to spotlight. The
      // actual slide insertion happens in handleSpotlightPick below.
      if (kind === "visual" && visuals.size > 0) {
        setAddTemplateOpen(false);
        setSpotlightPickerOpen(true);
        return;
      }
      const slide = buildTemplateSlide(kind, {
        theme: deck.theme,
        slideFormat: deck.slideFormat,
      });
      const next = insertSlide(deck, safeSelected, slide);
      clearPendingPatches(pendingPatchesRef);
      onDeckChange(next);
      setSelectedIndex(Math.min(safeSelected + 1, next.slides.length - 1));
      setAddTemplateOpen(false);
    },
    [deck, onDeckChange, safeSelected, visuals],
  );

  const handleSpotlightPick = useCallback(
    (visualId: string) => {
      const slide = buildTemplateSlide("visual", {
        theme: deck.theme,
        slideFormat: deck.slideFormat,
        visualId,
      });
      const next = insertSlide(deck, safeSelected, slide);
      clearPendingPatches(pendingPatchesRef);
      onDeckChange(next);
      setSelectedIndex(Math.min(safeSelected + 1, next.slides.length - 1));
      setSpotlightPickerOpen(false);
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleMove = useCallback(
    (index: number, direction: number) => {
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "MOVE_SLIDE",
        slideIndex: index,
        direction,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      setSelectedIndex(index + (direction > 0 ? 1 : -1));
    },
    [deck, onDeckChange],
  );

  const handleDuplicate = useCallback(
    (index: number) => {
      const slideId = deck.slides[index]?.id;
      if (!slideId) return;
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "DUPLICATE_SLIDE",
        slideId,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      setSelectedIndex(index + 1);
    },
    [deck, onDeckChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      const slideId = deck.slides[index]?.id;
      if (!slideId) return;
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "REMOVE_SLIDE",
        slideId,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      setSelectedIndex((current) =>
        Math.max(0, Math.min(current, deck.slides.length - 2)),
      );
    },
    [deck, onDeckChange],
  );

  const handleApplyReusableLayout = useCallback(
    (layout: ReusableSlideLayout) => {
      if (!deck.slides[safeSelected]) return;
      doCommitAndChange(deck, {
        type: "APPLY_SLIDE_LAYOUT",
        slideIndex: safeSelected,
        layout,
      });
      setSelectedElementId(null);
      setSelectedElementIds(new Set());
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleResetReusableLayout = useCallback(
    (layout: ReusableSlideLayout) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          `Reset slide positions to the "${layout.name}" layout? This will preserve slide content and element order.`,
        )
      ) {
        return;
      }
      if (!deck.slides[safeSelected]) return;
      doCommitAndChange(deck, {
        type: "RESET_SLIDE_LAYOUT",
        slideIndex: safeSelected,
        layout,
      });
      setSelectedElementId(null);
      setSelectedElementIds(new Set());
    },
    [deck, doCommitAndChange, safeSelected],
  );

  // ── Element clipboard (copy / cut / paste), shared by the keyboard handler
  // and the right-click context menu. Uses an in-memory ref so it works within
  // and across slides; each op routes through a pure mutation (single undo).
  const selectedElementIdList = useCallback(() => {
    if (!effectiveSelectedElementId) return [] as string[];
    return effectiveSelectedElementIds.size > 0
      ? [...effectiveSelectedElementIds]
      : [effectiveSelectedElementId];
  }, [effectiveSelectedElementId, effectiveSelectedElementIds]);

  const copyElementsToClipboard = useCallback(
    (sourceDeck: Deck, slideIndex: number, ids: readonly string[]) => {
      if (ids.length === 0) return false;
      const slideEls = sourceDeck.slides[slideIndex]?.elements ?? [];
      const copied = slideEls.filter((el) => ids.includes(el.id));
      if (copied.length === 0) return false;
      const selectedIdSet = new Set(ids);
      const partialGroups = new Set<string>();
      for (const el of slideEls) {
        const groupId = (el as { groupId?: string }).groupId;
        if (groupId && !selectedIdSet.has(el.id)) partialGroups.add(groupId);
      }
      clipboardRef.current = copied.map((el) => {
        const clone = structuredClone(el);
        const groupId = (clone as { groupId?: string }).groupId;
        if (groupId && partialGroups.has(groupId)) {
          delete (clone as { groupId?: string }).groupId;
        }
        return clone;
      });
      pasteCountRef.current = 0;
      return true;
    },
    [],
  );

  const pasteClipboardElements = useCallback(
    (sourceDeck: Deck, slideIndex: number) => {
      const clip = clipboardRef.current;
      if (!clip || clip.length === 0) return null;
      const groupRemap = new Map<string, string>();
      for (const el of clip) {
        const groupId = (el as { groupId?: string }).groupId;
        if (groupId && !groupRemap.has(groupId)) {
          groupRemap.set(groupId, makeElementId());
        }
      }
      let nextDeck = sourceDeck;
      const newIds: string[] = [];
      const pasteStep = (pasteCountRef.current % PASTE_OFFSET_WRAP_STEPS) + 1;
      const offset = pasteStep * PASTE_OFFSET_PCT;
      for (const el of clip) {
        const id = makeElementId();
        newIds.push(id);
        const x = Math.max(0, Math.min(100 - el.box.w, el.box.x + offset));
        const y = Math.max(0, Math.min(100 - el.box.h, el.box.y + offset));
        const clone = structuredClone(el);
        clone.id = id;
        clone.box = { ...clone.box, x, y };
        delete (clone as { zIndex?: number }).zIndex;
        const groupId = (clone as { groupId?: string }).groupId;
        if (groupId) {
          (clone as { groupId?: string }).groupId = groupRemap.get(groupId);
        }
        nextDeck = addElement(nextDeck, slideIndex, clone);
      }
      pasteCountRef.current += 1;
      return { deck: nextDeck, newIds };
    },
    [],
  );

  const handleCopyElements = useCallback(() => {
    const ids = selectedElementIdList();
    copyElementsToClipboard(deck, safeSelected, ids);
  }, [copyElementsToClipboard, deck, safeSelected, selectedElementIdList]);

  const handleCutElements = useCallback(() => {
    const ids = selectedElementIdList();
    if (!copyElementsToClipboard(deck, safeSelected, ids)) return;
    const slideId = deck.slides[safeSelected]?.id;
    if (!slideId) return;
    doCommitAndChange(deck, {
      type: "REMOVE_ELEMENTS",
      slideId,
      elementIds: ids,
    });
    setSelectedElementId(null);
    setSelectedElementIds(new Set());
  }, [
    copyElementsToClipboard,
    deck,
    safeSelected,
    doCommitAndChange,
    selectedElementIdList,
  ]);

  const handlePasteElements = useCallback(() => {
    const pasted = pasteClipboardElements(deck, safeSelected);
    if (!pasted) return;
    clearPendingPatches(pendingPatchesRef);
    onDeckChange(pasted.deck);
    setSelectedElementId(pasted.newIds[0] ?? null);
    setSelectedElementIds(new Set(pasted.newIds));
  }, [deck, safeSelected, onDeckChange, pasteClipboardElements]);

  const handleUndo = useCallback(() => {
    clearPendingPatches(pendingPatchesRef);
    undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    clearPendingPatches(pendingPatchesRef);
    redo();
  }, [redo]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Read volatile state from the ref so this handler never needs to
      // re-subscribe when deck identity or selection changes (e.g. during a
      // drag that fires 60 commits/s). The ref is updated on every render.
      const {
        deck: kDeck,
        safeSelected: kSafe,
        effectiveSelectedElementId: kElemId,
        effectiveSelectedElementIds: kElemIds,
      } = keydownStateRef.current;

      if (event.key === "Escape") {
        event.preventDefault();
        if (keyboardHelpOpen) {
          setKeyboardHelpOpen(false);
        } else if (inspectorSheetOpen) {
          setInspectorSheetOpen(false);
        } else if (kElemId) {
          setSelectedElementId(null);
          setSelectedElementIds(new Set());
          // Release canvas focus to the stage container so Tab can leave the
          // canvas — keyboard users are never trapped among elements (#531).
          requestElementFocus(null);
        } else {
          handleRequestClose();
        }
        return;
      }

      if (typing) {
        return;
      }

      // Open the in-product keyboard shortcut help (#535). `?` is Shift+/; the
      // `typing` guard above keeps it from firing while editing a field.
      if (event.key === "?") {
        event.preventDefault();
        setKeyboardHelpOpen(true);
        return;
      }

      // Tab / Shift+Tab cycle the selection among canvas elements in reading
      // order while a canvas element has focus (#531). Only intercepted when
      // focus is on an element; Tab from the bare stage container (e.g. after
      // Escape) falls through to native order so the canvas is never a trap.
      if (event.key === "Tab" && target?.closest("[data-element-id]")) {
        const tabSlide = kDeck.slides[kSafe];
        const ordered = orderedElementIds(tabSlide?.elements ?? []);
        if (ordered.length > 0) {
          event.preventDefault();
          const nextId = nextElementId(
            ordered,
            kElemId,
            event.shiftKey ? -1 : 1,
          );
          setSelectedElementId(nextId);
          setSelectedElementIds(nextId ? new Set([nextId]) : new Set());
          requestElementFocus(nextId);
          const nextEl = nextId
            ? tabSlide?.elements?.find((el) => el.id === nextId)
            : undefined;
          if (nextEl) {
            announce(
              announceSelection(
                elementAccessibleName(nextEl, tabSlide?.elements),
              ),
            );
          }
          return;
        }
      }

      // Undo / redo over deck history. Ctrl/⌘+Z = undo,
      // Ctrl/⌘+Shift+Z (or Ctrl+Y) = redo. The `typing` guard above keeps
      // these from hijacking field-level undo while editing text.
      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (mod && !event.shiftKey && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        handleRedo();
        return;
      }

      // Slide-management shortcuts (mod = Ctrl/⌘). The `typing` guard above keeps
      // these from firing while editing a field, and they all require the
      // modifier so they never collide with the element Delete/Backspace or the
      // bare ArrowLeft/Right paging below. Each routes through the same handlers
      // as the rail buttons, so every action lands on the undo/redo `commit`.
      if (mod && !event.shiftKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "d") {
          event.preventDefault();
          // Element-duplicate takes precedence when an element is selected;
          // otherwise fall back to slide-duplicate (#212). Duplicates the whole
          // multi-selection (offset copies) and selects them (#245). Inlined
          // (not via `handleDuplicateElement`) so this effect needs no extra dep
          // and avoids a temporal-dead-zone with handlers declared further down.
          if (kElemId) {
            const ids = kElemIds.size > 0 ? [...kElemIds] : [kElemId];
            const { deck: nextDeck, newElementIds } = duplicateElements(
              kDeck,
              kSafe,
              ids,
            );
            if (newElementIds.length > 0) {
              clearPendingPatches(pendingPatchesRef);
              onDeckChange(nextDeck);
              setSelectedElementId(newElementIds[0]);
              setSelectedElementIds(new Set(newElementIds));
              // Keep focus on the new copy (#532) and announce it (#533).
              requestElementFocus(newElementIds[0]);
              const dupEl = nextDeck.slides[kSafe]?.elements?.find(
                (el) => el.id === newElementIds[0],
              );
              if (dupEl) {
                announce(
                  announceSelection(
                    elementAccessibleName(
                      dupEl,
                      nextDeck.slides[kSafe]?.elements,
                    ),
                  ),
                );
              }
            }
          } else {
            const slideId = kDeck.slides[kSafe]?.id;
            if (slideId) {
              const { result, commitOptions, patches } = commitCommand(kDeck, {
                type: "DUPLICATE_SLIDE",
                slideId,
              });
              if (result.ok) {
                appendPendingPatches(pendingPatchesRef, patches);
                onDeckChange(result.deck, commitOptions);
                setSelectedIndex(kSafe + 1);
              }
            }
          }
          return;
        }
        if (key === "n") {
          event.preventDefault();
          const afterSlideId = kDeck.slides[kSafe]?.id ?? null;
          const { result, commitOptions, patches } = commitCommand(kDeck, {
            type: "ADD_SLIDE",
            afterSlideId,
          });
          if (result.ok) {
            appendPendingPatches(pendingPatchesRef, patches);
            onDeckChange(result.deck, commitOptions);
            setSelectedIndex(
              Math.min(kSafe + 1, result.deck.slides.length - 1),
            );
          }
          return;
        }
        // Element clipboard + select-all. Operate on the current slide's
        // elements; all route through pure mutations so they are single undo
        // steps, and paste works across slides via the shared clipboard ref.
        const slideEls = kDeck.slides[kSafe]?.elements ?? [];
        if (key === "a") {
          if (slideEls.length > 0) {
            event.preventDefault();
            setSelectedElementId(slideEls[slideEls.length - 1].id);
            setSelectedElementIds(new Set(slideEls.map((el) => el.id)));
          }
          return;
        }
        if (key === "c" || key === "x") {
          if (kElemId) {
            event.preventDefault();
            const ids = kElemIds.size > 0 ? [...kElemIds] : [kElemId];
            if (copyElementsToClipboard(kDeck, kSafe, ids)) {
              if (key === "x") {
                const slideId = kDeck.slides[kSafe]?.id;
                if (slideId) {
                  doCommitAndChange(kDeck, {
                    type: "REMOVE_ELEMENTS",
                    slideId,
                    elementIds: ids,
                  });
                  setSelectedElementId(null);
                  setSelectedElementIds(new Set());
                }
              }
            }
          }
          return;
        }
        if (key === "v") {
          const pasted = pasteClipboardElements(kDeck, kSafe);
          if (pasted) {
            event.preventDefault();
            clearPendingPatches(pendingPatchesRef);
            onDeckChange(pasted.deck);
            setSelectedElementId(pasted.newIds[0] ?? null);
            setSelectedElementIds(new Set(pasted.newIds));
          }
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          const slideId = kDeck.slides[kSafe]?.id;
          if (slideId) {
            const { result, commitOptions, patches } = commitCommand(kDeck, {
              type: "REMOVE_SLIDE",
              slideId,
            });
            if (result.ok) {
              appendPendingPatches(pendingPatchesRef, patches);
              onDeckChange(result.deck, commitOptions);
              setSelectedIndex((current) =>
                Math.max(0, Math.min(current, kDeck.slides.length - 2)),
              );
            }
          }
          return;
        }
      }

      // Group (Ctrl/⌘+G) and Ungroup (Ctrl/⌘+Shift+G) shortcuts (issue #330).
      if (mod && !event.altKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        const ids =
          kElemIds.size > 0 ? [...kElemIds] : kElemId ? [kElemId] : [];
        const slideId = kDeck.slides[kSafe]?.id;
        if (!slideId) {
          return;
        }
        if (event.shiftKey) {
          // Ungroup: clear groupId from every distinct group among the selected elements.
          const slideEls = kDeck.slides[kSafe]?.elements ?? [];
          const selectedEls = slideEls.filter((el) => ids.includes(el.id));
          const gids = new Set(
            selectedEls
              .map((el) => (el as { groupId?: string }).groupId)
              .filter((g): g is string => !!g),
          );
          if (gids.size > 0) {
            let nextDeck = kDeck;
            const patches: DeckPatch[] = [];
            for (const gid of gids) {
              const committed = commitCommand(nextDeck, {
                type: "UNGROUP_ELEMENTS",
                slideId,
                groupId: gid,
              });
              if (!committed.result.ok) {
                continue;
              }
              nextDeck = committed.result.deck;
              patches.push(...committed.patches);
            }
            if (nextDeck !== kDeck) {
              appendPendingPatches(pendingPatchesRef, patches);
              onDeckChange(nextDeck);
            }
          }
        } else if (ids.length >= 2) {
          doCommitAndChange(kDeck, {
            type: "GROUP_ELEMENTS",
            slideId,
            elementIds: ids,
          });
          // Keep focus on the group's primary element (#532).
          requestElementFocus(ids[0]);
        }
        return;
      }

      // Connector keyboard authoring (#534, interim subset). Bare `c`:
      //  - one connector selected → cycle its END endpoint anchor among the
      //    candidate anchors (Shift+C cycles the START endpoint),
      //  - exactly two connectable elements selected → insert a connector with
      //    default endpoints bound to both, then select + focus it.
      // Free-draw connector authoring stays deferred (ADR 0002, A1).
      if (!mod && !event.altKey && (event.key === "c" || event.key === "C")) {
        const connSlide = kDeck.slides[kSafe];
        const connSlideId = connSlide?.id;
        const connElements = connSlide?.elements ?? [];
        if (!connSlideId) {
          return;
        }
        const selectedConnector =
          kElemId && kElemIds.size <= 1
            ? connElements.find(
                (el): el is ConnectorElement =>
                  el.id === kElemId && el.kind === "connector",
              )
            : undefined;
        if (selectedConnector) {
          event.preventDefault();
          const whichEnd = event.shiftKey ? "start" : "end";
          const updated = cycleEndpointAnchor(selectedConnector, whichEnd, 1);
          if (updated !== selectedConnector) {
            // Recompute the connector's box from the resolved endpoints so its
            // selection bounds / handles track the new anchor.
            const pts = resolveConnectorElementPoints(
              updated,
              connElements,
              (el) => el.box,
            );
            const nextBox = connectorBoundingBox(pts.start, pts.end);
            doCommitAndChange(kDeck, {
              type: "UPDATE_ELEMENT",
              slideId: connSlideId,
              elementId: selectedConnector.id,
              patch:
                whichEnd === "start"
                  ? { start: updated.start, box: nextBox }
                  : { end: updated.end, box: nextBox },
            });
            requestElementFocus(selectedConnector.id);
            const endpoint = updated[whichEnd];
            const anchorLabel =
              "anchor" in endpoint ? endpoint.anchor : "anchor";
            announce(
              `Reattached connector ${whichEnd} endpoint to ${anchorLabel}`,
            );
          }
          return;
        }
        const pair = selectedConnectablePair(connElements, kElemIds);
        if (pair) {
          event.preventDefault();
          const newId = makeElementId();
          doCommitAndChange(kDeck, {
            type: "ADD_ELEMENT",
            slideId: connSlideId,
            element: { ...buildConnectorBetween(pair[0], pair[1]), id: newId },
          });
          setSelectedElementId(newId);
          setSelectedElementIds(new Set([newId]));
          requestElementFocus(newId);
          announce(
            `Connected ${elementAccessibleName(
              pair[0],
              connElements,
            )} to ${elementAccessibleName(pair[1], connElements)}`,
          );
          return;
        }
      }

      // With an element selected, arrow keys nudge it and Delete removes it.
      const slide = kDeck.slides[kSafe];
      const selected =
        kElemId && slide?.elements
          ? slide.elements.find((el) => el.id === kElemId)
          : undefined;

      if (selected) {
        // Apply Delete and arrow-nudge to the whole multi-selection (#245),
        // falling back to the primary alone when the set is somehow empty. A
        // multi-delete / multi-nudge routes through one pure mutation so it is a
        // single undo step.
        const selectedIds = kElemIds.size > 0 ? [...kElemIds] : [selected.id];
        const slideId = kDeck.slides[kSafe]?.id;
        if (!slideId) {
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          const ordered = orderedElementIds(slide?.elements ?? []);
          const focusTarget = focusTargetAfterDelete(
            ordered,
            new Set(selectedIds),
          );
          const deletedName =
            selectedIds.length > 1
              ? `${selectedIds.length} elements`
              : elementAccessibleName(selected, slide?.elements);
          doCommitAndChange(kDeck, {
            type: "REMOVE_ELEMENTS",
            slideId,
            elementIds: selectedIds,
          });
          setSelectedElementId(focusTarget);
          setSelectedElementIds(
            focusTarget ? new Set([focusTarget]) : new Set(),
          );
          requestElementFocus(focusTarget);
          announce(announceDelete(deletedName));
          return;
        }

        // Alt+Arrow resizes the selected element box (#530), mirroring the
        // nudge step model: Alt+Arrow = 1%, Alt+Shift+Arrow = 5%. Right/Down
        // grow the right/bottom edge; Left/Up shrink them. Alt distinguishes
        // this from the bare-Arrow nudge below so the two never collide.
        if (event.altKey && isArrowKey(event.key)) {
          event.preventDefault();
          const stepPct = event.shiftKey ? 5 : 1;
          const boxesById: Record<string, ElementBox> = {};
          for (const id of selectedIds) {
            const el = slide?.elements?.find(
              (candidate) => candidate.id === id,
            );
            if (!el) continue;
            const nextBox = resizeBoxByStep(el.box, event.key, stepPct);
            if (nextBox !== el.box) boxesById[id] = nextBox;
          }
          if (Object.keys(boxesById).length > 0) {
            doCommitAndChange(kDeck, {
              type: "SET_ELEMENT_BOXES",
              slideId,
              boxesById,
            });
            requestElementFocus(selected.id);
            const primaryBox = boxesById[selected.id] ?? selected.box;
            announce(
              announceResize(
                elementAccessibleName(selected, slide?.elements),
                primaryBox.w,
                primaryBox.h,
              ),
            );
          }
          return;
        }

        const step = event.shiftKey ? 5 : 1;
        let dx = 0;
        let dy = 0;
        if (event.key === "ArrowLeft") dx = -step;
        else if (event.key === "ArrowRight") dx = step;
        else if (event.key === "ArrowUp") dy = -step;
        else if (event.key === "ArrowDown") dy = step;
        if (dx !== 0 || dy !== 0) {
          event.preventDefault();
          doCommitAndChange(kDeck, {
            type: "NUDGE_ELEMENTS",
            slideId,
            elementIds: selectedIds,
            dx,
            dy,
          });
          // Keep focus on the moved element and announce the new position
          // (#532, #533). The displayed coords mirror NUDGE_ELEMENTS clamping.
          requestElementFocus(selected.id);
          announce(
            announceMove(
              elementAccessibleName(selected, slide?.elements),
              Math.max(0, Math.min(100 - selected.box.w, selected.box.x + dx)),
              Math.max(0, Math.min(100 - selected.box.h, selected.box.y + dy)),
            ),
          );
          return;
        }
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedIndex((i) =>
          Math.min(keydownStateRef.current.deck.slides.length - 1, i + 1),
        );
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    announce,
    copyElementsToClipboard,
    doCommitAndChange,
    handleRequestClose,
    handleRedo,
    handleUndo,
    inspectorSheetOpen,
    keyboardHelpOpen,
    onDeckChange,
    pasteClipboardElements,
    requestElementFocus,
  ]);

  const handleNotesChange = useCallback(
    (index: number, notes: string, coalesceKey?: string) => {
      const slideId = deck.slides[index]?.id;
      if (!slideId) return;
      const result = executeCommand(deck, {
        type: "UPDATE_SLIDE_NOTES",
        slideId,
        notes,
        ...(coalesceKey !== undefined ? { coalesceKey } : {}),
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, result.patches);
      onDeckChange(
        result.deck,
        coalesceKey !== undefined
          ? { coalesceKey }
          : result.historyKey !== undefined
            ? { coalesceKey: result.historyKey }
            : undefined,
      );
    },
    [deck, onDeckChange],
  );

  // ── Pointer-based thumbnail reorder (issue #209) ───────────────────────────
  // Uses the same Pointer API as the stage editor so reordering works with
  // touch. Keyboard ↑/↓ reorder (the move buttons, issue #212) and the
  // reorderSlides mutation are unchanged.
  const beginReorder = useCallback(
    (event: React.PointerEvent, index: number) => {
      // Only react to the primary button / a touch or pen contact.
      if (event.button != null && event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // Cache item rects once so pointermove reuses them instead of querying
      // layout on every frame. Capture the pointer to keep receiving events
      // even when the pointer leaves the viewport (#306).
      const list = railListRef.current;
      const items = list
        ? Array.from(list.querySelectorAll<HTMLElement>("[data-slide-thumb]"))
        : [];
      const cachedRects = items.map((item) => item.getBoundingClientRect());
      const sourceRect = cachedRects[index];
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      reorderRef.current = {
        fromIndex: index,
        overIndex: index,
        capturedPointerId: event.pointerId,
        cachedRects,
        startClientX: event.clientX,
        startClientY: event.clientY,
        offsetX: sourceRect ? event.clientX - sourceRect.left : 0,
        offsetY: sourceRect ? event.clientY - sourceRect.top : 0,
        moved: false,
      };
      setDragPreview(null);
      setDragIndex(index);
      setDragOverIndex(index);
    },
    [],
  );

  useEffect(() => {
    if (dragIndex === null) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = reorderRef.current;
      // Ignore events from a second touch; only the captured pointer drives the
      // reorder so a concurrent contact cannot corrupt dragOverIndex (#306).
      if (!drag || event.pointerId !== drag.capturedPointerId) {
        return;
      }
      const movement = Math.hypot(
        event.clientX - drag.startClientX,
        event.clientY - drag.startClientY,
      );
      if (!drag.moved && movement < 4) {
        return;
      }
      drag.moved = true;
      // Reuse the rects cached at pointerdown — no per-frame layout reads (#306).
      const rects = drag.cachedRects;
      if (rects.length === 0) {
        return;
      }
      // The rail is vertical (desktop/tablet) or a horizontal strip (phone);
      // pick the axis from how the first two thumbnails are laid out.
      const vertical =
        rects.length < 2 ||
        Math.abs(rects[1].top - rects[0].top) >=
          Math.abs(rects[1].left - rects[0].left);
      const pointer = vertical ? event.clientY : event.clientX;
      const extents = rects.map((rect) =>
        vertical
          ? { start: rect.top, end: rect.bottom }
          : { start: rect.left, end: rect.right },
      );
      const target = reorderTargetIndex(pointer, extents);
      drag.overIndex = target;
      setDragOverIndex(target);
      setDragPreview((preview) =>
        preview
          ? {
              ...preview,
              x: event.clientX - preview.offsetX,
              y: event.clientY - preview.offsetY,
            }
          : rects[drag.fromIndex]
            ? {
                index: drag.fromIndex,
                x: event.clientX - drag.offsetX,
                y: event.clientY - drag.offsetY,
                width: rects[drag.fromIndex].width,
                offsetX: drag.offsetX,
                offsetY: drag.offsetY,
              }
            : null,
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = reorderRef.current;
      if (!drag || event.pointerId !== drag.capturedPointerId) {
        return;
      }
      reorderRef.current = null;
      if (event.type === "pointercancel") {
        // Clean up visual state only; a cancelled gesture should not select or reorder.
      } else if (!drag.moved) {
        setVisualPickerOpen(false);
        setSelectedIndex(drag.fromIndex);
      } else if (drag.overIndex !== drag.fromIndex) {
        const slideId = deck.slides[drag.fromIndex]?.id;
        if (slideId) {
          const { result, commitOptions, patches } = commitCommand(deck, {
            type: "REORDER_SLIDE",
            slideId,
            toIndex: drag.overIndex,
          });
          if (result.ok) {
            appendPendingPatches(pendingPatchesRef, patches);
            onDeckChange(result.deck, commitOptions);
            setSelectedIndex(drag.overIndex);
          }
        }
      }
      setDragIndex(null);
      setDragOverIndex(null);
      setDragPreview(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragIndex, deck, onDeckChange]);

  const handleSave = useCallback(() => {
    void flushSave();
  }, [flushSave]);

  // The document deck is available to merge from when the host provided it.
  const canSyncFromDocument = freshDeck != null;
  const showStaleBanner = isDeckStale && !staleResolved && canSyncFromDocument;

  // Compute the merge and open the summary dialog. The merge preserves each
  // slide's free-form elements; nothing is applied until the user confirms. The
  // merged deck adopts the live document's content hash so, once applied and
  // saved, it is no longer flagged as stale on reopen.
  const handleRequestSync = useCallback(() => {
    if (!freshDeck) return;
    const result = mergeDeckFromDocument(deck, freshDeck);
    const syncedDeck: Deck = {
      ...result.deck,
      ...(freshDeck.deckContentHash !== undefined
        ? { deckContentHash: freshDeck.deckContentHash }
        : {}),
    };
    setMergePreview({ deck: syncedDeck, summary: result.summary });
  }, [deck, freshDeck]);

  const handleCancelSync = useCallback(() => {
    setMergePreview(null);
  }, []);

  const handleApplySync = useCallback(() => {
    if (!mergePreview) return;
    clearPendingPatches(pendingPatchesRef);
    onDeckChange(mergePreview.deck);
    setMergePreview(null);
    setStaleResolved(true);
  }, [mergePreview, onDeckChange]);

  const handleDismissStale = useCallback(() => {
    setStaleResolved(true);
  }, []);

  const accentForSelected = selectedSlide?.accent ?? selectedTheme.accentColor;

  const handleSelectElement = useCallback(
    (id: string | null, mode: SelectionMode = "replace") => {
      if (id == null) {
        setSelectedElementId(null);
        setSelectedElementIds((current) =>
          current.size === 0 ? current : new Set(),
        );
        closeRightPanel();
        return;
      }
      if (mode === "toggle") {
        // Add/remove from the multi-selection. Removing the primary promotes
        // another remaining member (or clears the primary when none remain).
        const next = new Set(selectedElementIds);
        if (next.has(id)) {
          next.delete(id);
          setSelectedElementId((primary) =>
            primary === id ? ([...next][0] ?? null) : primary,
          );
        } else {
          next.add(id);
          setSelectedElementId(id);
        }
        setSelectedElementIds(next);
        if (next.size > 0) {
          openSelectionPanel();
        } else {
          closeRightPanel();
        }
      } else if (mode === "keep") {
        // Make `id` the primary without disturbing an existing multi-selection
        // (used when starting a drag on an already-selected element).
        setSelectedElementId(id);
        setSelectedElementIds((current) =>
          current.has(id) ? current : new Set([id]),
        );
        openSelectionPanel();
      } else {
        // "replace": plain single selection.
        setSelectedElementId(id);
        setSelectedElementIds(new Set([id]));
        openSelectionPanel();
      }
    },
    [closeRightPanel, openSelectionPanel, selectedElementIds],
  );

  // Replaces (or, when `additive`, unions) the multi-selection with `ids` — used
  // by the marquee/rubber-band selection (issue #245). The primary stays put
  // when it is still in the resulting set, otherwise the first id becomes
  // primary (or the selection clears when `ids` is empty).
  const handleSelectElements = useCallback(
    (ids: string[], additive = false) => {
      const next = additive ? new Set(selectedElementIds) : new Set<string>();
      for (const id of ids) {
        next.add(id);
      }
      setSelectedElementIds(next);
      setSelectedElementId((primary) =>
        primary && next.has(primary) ? primary : ([...next][0] ?? null),
      );
      if (next.size > 0) {
        openSelectionPanel();
      } else {
        closeRightPanel();
      }
    },
    [closeRightPanel, openSelectionPanel, selectedElementIds],
  );

  const handleUpdateElement = useCallback(
    (id: string, patch: ElementPatch, coalesceKey?: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const result = executeCommand(deck, {
        type: "UPDATE_ELEMENT",
        slideId,
        elementId: id,
        patch,
        ...(coalesceKey !== undefined ? { coalesceKey } : {}),
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, result.patches);
      onDeckChange(
        result.deck,
        coalesceKey !== undefined
          ? { coalesceKey }
          : result.historyKey !== undefined
            ? { coalesceKey: result.historyKey }
            : undefined,
      );
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleSetElementBoxes = useCallback(
    (boxesById: Record<string, ElementBox>, coalesceKey?: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const result = executeCommand(deck, {
        type: "SET_ELEMENT_BOXES",
        slideId,
        boxesById,
        ...(coalesceKey !== undefined ? { coalesceKey } : {}),
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, result.patches);
      onDeckChange(
        result.deck,
        coalesceKey !== undefined
          ? { coalesceKey }
          : result.historyKey !== undefined
            ? { coalesceKey: result.historyKey }
            : undefined,
      );
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleSetElementPatches = useCallback(
    (patchesById: Record<string, ElementPatch>, coalesceKey?: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const result = executeCommand(deck, {
        type: "SET_ELEMENT_PATCHES",
        slideId,
        patchesById,
        ...(coalesceKey !== undefined ? { coalesceKey } : {}),
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, result.patches);
      onDeckChange(
        result.deck,
        coalesceKey !== undefined
          ? { coalesceKey }
          : result.historyKey !== undefined
            ? { coalesceKey: result.historyKey }
            : undefined,
      );
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleGroupElements = useCallback(
    (ids: string[]) => {
      if (ids.length < 2) return;
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "GROUP_ELEMENTS",
        slideId,
        elementIds: ids,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleUngroupElements = useCallback(
    (groupId: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, { type: "UNGROUP_ELEMENTS", slideId, groupId });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleRemoveElement = useCallback(
    (id: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      const ordered = orderedElementIds(
        deck.slides[safeSelected]?.elements ?? [],
      );
      const focusTarget = focusTargetAfterDelete(ordered, new Set([id]));
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "REMOVE_ELEMENT",
        slideId,
        elementId: id,
      });
      setSelectedElementId(focusTarget);
      setSelectedElementIds(focusTarget ? new Set([focusTarget]) : new Set());
      requestElementFocus(focusTarget);
    },
    [deck, doCommitAndChange, requestElementFocus, safeSelected],
  );

  const handleDuplicateElement = useCallback(
    (id: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "DUPLICATE_ELEMENT",
        slideId,
        elementId: id,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      const newId = result.affectedElementIds.find(
        (elementId) => elementId !== id,
      );
      if (newId) handleSelectElement(newId);
    },
    [deck, onDeckChange, safeSelected, handleSelectElement],
  );

  const handleBringToFront = useCallback(
    (id: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "BRING_ELEMENT_TO_FRONT",
        slideId,
        elementId: id,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleSendToBack = useCallback(
    (id: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SEND_ELEMENT_TO_BACK",
        slideId,
        elementId: id,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  // ── Layer panel: visibility, lock, z-order step, rename, drag-reorder (#639)
  const handleSetElementHidden = useCallback(
    (id: string, hidden: boolean) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_ELEMENT_HIDDEN",
        slideId,
        elementId: id,
        hidden,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleSetElementLocked = useCallback(
    (id: string, locked: boolean) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_ELEMENT_LOCKED",
        slideId,
        elementId: id,
        locked,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleMoveElementZOrder = useCallback(
    (id: string, direction: "up" | "down") => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "MOVE_ELEMENT_ZORDER",
        slideId,
        elementId: id,
        direction,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleRenameElement = useCallback(
    (id: string, name: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "RENAME_ELEMENT",
        slideId,
        elementId: id,
        name,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleReorderElement = useCallback(
    (id: string, targetId: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId || id === targetId) return;
      doCommitAndChange(deck, {
        type: "REORDER_ELEMENT",
        slideId,
        elementId: id,
        targetElementId: targetId,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  // ── Multi-select: align, distribute, match-size, arrange (issue #328) ────

  const handleAlign = useCallback(
    (ids: string[], mode: AlignMode) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "ALIGN_ELEMENTS",
        slideId,
        elementIds: ids,
        mode,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleDistribute = useCallback(
    (ids: string[], mode: DistributeMode) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "DISTRIBUTE_ELEMENTS",
        slideId,
        elementIds: ids,
        mode,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleMatchSize = useCallback(
    (ids: string[], mode: MatchSizeMode) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "MATCH_SIZE_ELEMENTS",
        slideId,
        elementIds: ids,
        mode,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleArrange = useCallback(
    (ids: string[], mode: ArrangeMode) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "ARRANGE_ELEMENTS",
        slideId,
        elementIds: ids,
        mode,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  // Insert ▸ Image: accept callback for the shared upload hook (#299).
  const handleInsertImageAccept = useCallback(
    (src: string, assetId?: string) => {
      const id = insertImagePendingIdRef.current;
      if (!id) return;
      insertImagePendingIdRef.current = null;
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const element = {
        ...buildDefaultElement("image", accentForSelected, id),
        src,
        ...(assetId ? { assetId } : {}),
      };
      doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
      handleSelectElement(id);
      setInsertImageError(null);
      setInsertMenuOpen(false);
    },
    [
      accentForSelected,
      deck,
      doCommitAndChange,
      handleSelectElement,
      safeSelected,
    ],
  );

  const { handleFile: handleInsertImageFile } = useImageUpload({
    deck,
    currentSrc: "",
    onAccept: handleInsertImageAccept,
    onError: (message) => {
      // Validation failure — suppress the cancel-fallback and surface the error.
      insertImagePendingIdRef.current = null;
      setInsertImageError(message);
    },
    documentId,
    uploadFn: documentId ? uploadSlideAsset : undefined,
  });

  const handleAddElement = useCallback(
    (kind: AddElementKind, shapeKind?: ShapeKind) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      if (kind === "image") {
        const id = makeElementId();
        insertImagePendingIdRef.current = id;
        setInsertImageError(null);

        const input = insertImageFileInputRef.current;
        if (!input) {
          // No input ref yet (rare); fall back to empty placeholder.
          const element = buildDefaultElement("image", accentForSelected, id);
          doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
          handleSelectElement(id);
          setInsertMenuOpen(false);
          return;
        }

        // Insert empty placeholder when the user dismisses the picker without
        // choosing a file. Two mechanisms for cross-browser coverage:
        //   1. `cancel` event (Chrome 113+, Firefox 91+, Safari 16.4+)
        //   2. window `focus` + 300 ms grace period (older browsers)
        // The idempotency guard on `insertImagePendingIdRef.current === id`
        // ensures only one path runs even when both fire.
        const doFallback = () => {
          if (insertImagePendingIdRef.current !== id) return;
          insertImagePendingIdRef.current = null;
          const element = buildDefaultElement("image", accentForSelected, id);
          doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
          handleSelectElement(id);
          setInsertMenuOpen(false);
        };

        const handleCancel = () => {
          input.removeEventListener("cancel", handleCancel);
          window.removeEventListener("focus", handleWindowFocus);
          doFallback();
        };

        const handleWindowFocus = () => {
          window.removeEventListener("focus", handleWindowFocus);
          setTimeout(() => {
            input.removeEventListener("cancel", handleCancel);
            doFallback();
          }, 300);
        };

        input.addEventListener("cancel", handleCancel);
        window.addEventListener("focus", handleWindowFocus);
        input.click();
        return;
      }

      const id = makeElementId();
      const rawElement = buildDefaultElement(
        kind,
        accentForSelected,
        id,
        shapeKind,
      );
      const element =
        rawElement.kind === "text" || rawElement.kind === "bullets"
          ? fitInsertedTextElement(rawElement, "top-left")
          : rawElement;
      doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
      handleSelectElement(id);
      setInsertMenuOpen(false);
    },
    [
      accentForSelected,
      deck,
      doCommitAndChange,
      fitInsertedTextElement,
      handleSelectElement,
      safeSelected,
    ],
  );

  // Double-click-to-add-text callback (#298). Builds a text element at the
  // given box, commits it as a single undoable step, selects it, and returns
  // the new id so the stage can enter inline editing immediately.
  const handleAddTextElement = useCallback(
    (box: ElementBox): string | null => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!selectedSlide || !slideId) return null;
      const id = makeElementId();
      const element: TextLikeElement = {
        ...(buildDefaultElement(
          "text",
          accentForSelected,
          id,
        ) as TextLikeElement),
        box,
      };
      const fitted = fitInsertedTextElement(element, "center");
      doCommitAndChange(deck, {
        type: "ADD_ELEMENT",
        slideId,
        element: fitted,
      });
      handleSelectElement(id);
      return id;
    },
    [
      accentForSelected,
      deck,
      doCommitAndChange,
      fitInsertedTextElement,
      handleSelectElement,
      safeSelected,
      selectedSlide,
    ],
  );

  const handleAddVisual = useCallback(
    (visualId: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const element = buildVisualElement(visualId);
      doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
      handleSelectElement(element.id);
      setVisualPickerOpen(false);
      setInsertMenuOpen(false);
    },
    [deck, doCommitAndChange, handleSelectElement, safeSelected],
  );

  // "From document" panel inserts. These keep the panel open so the user can
  // place several items in a row; each insert is a single undoable step.
  const handleInsertDocumentVisual = useCallback(
    (item: Extract<Insertable, { kind: "visual" }>) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      // Stamp sourceRef when documentId is available (issue #424).
      const element = insertableVisualElement(item, { documentId });
      doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
      handleSelectElement(element.id);
    },
    [deck, doCommitAndChange, documentId, handleSelectElement, safeSelected],
  );

  const handleInsertDocumentText = useCallback(
    (item: Extract<Insertable, { kind: "text" }>) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const element = fitInsertedTextElement(
        insertableTextElement(item, { documentId }),
        "top-left",
      );
      doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
      handleSelectElement(element.id);
    },
    [
      deck,
      doCommitAndChange,
      documentId,
      fitInsertedTextElement,
      handleSelectElement,
      safeSelected,
    ],
  );

  // Inserts every document visual onto the current slide in one undoable step,
  // cascading each by a small offset so they don't perfectly stack.
  const handleAddAllVisuals = useCallback(() => {
    const ids = [...visuals.keys()];
    if (ids.length === 0) return;
    let next = deck;
    ids.forEach((visualId, i) => {
      const offset = Math.min(i, 8) * 2;
      const element = buildVisualElement(visualId, {
        box: {
          x: DEFAULT_VISUAL_BOX.x + offset,
          y: DEFAULT_VISUAL_BOX.y + offset,
          w: DEFAULT_VISUAL_BOX.w,
          h: DEFAULT_VISUAL_BOX.h,
        },
      });
      next = addElement(next, safeSelected, element);
    });
    clearPendingPatches(pendingPatchesRef);
    onDeckChange(next);
  }, [deck, onDeckChange, safeSelected, visuals]);

  // Click-to-insert text entries derived from the document's text blocks.
  const documentTextInsertables = useMemo(
    () =>
      buildInsertables(documentTextBlocks as DocumentTextBlock[]).filter(
        (item): item is Extract<Insertable, { kind: "text" }> =>
          item.kind === "text",
      ),
    [documentTextBlocks],
  );

  // All visual insertables from the document (for use in relink pickers).
  const documentVisualInsertables = useMemo(
    () =>
      buildInsertables(documentBlocks).filter(
        (item): item is Extract<Insertable, { kind: "visual" }> =>
          item.kind === "visual",
      ),
    [documentBlocks],
  );

  // Compute stale links from the full current document block list.
  const staleLinks = useMemo<StaleSourceLink[]>(() => {
    if (documentBlocks.length === 0 && staleSourceLinkCount === 0) return [];
    return findStaleSourceLinks(deck, documentBlocks);
  }, [deck, documentBlocks, staleSourceLinkCount]);

  // Stale-link action: update element content from fresh source block.
  const handleUpdateFromSource = useCallback(
    (link: StaleSourceLink) => {
      const slideIndex = deck.slides.findIndex((s) => s.id === link.slideId);
      if (slideIndex < 0) return;
      const slide = deck.slides[slideIndex];
      const element = (slide.elements ?? []).find(
        (el) => el.id === link.elementId,
      );
      if (!element?.sourceRef) return;

      const linkedAt = new Date().toISOString();
      if (link.blockKind === "text") {
        if (element.kind !== "text") return;
        const fresh = documentBlocks.find(
          (b): b is DocumentTextBlock =>
            b.kind === "text" && b.blockId === link.blockId,
        );
        if (!fresh) return;
        const newRef = buildRefreshSourceRef(
          element.sourceRef,
          link.blockId,
          hashDocumentBlock(fresh),
          linkedAt,
          "text",
        );
        const updated = updateTextElementFromBlock(element, fresh, newRef);
        doCommitAndChange(deck, {
          type: "REFRESH_ELEMENT_FROM_SOURCE",
          slideId: link.slideId,
          elementId: link.elementId,
          sourceRef: newRef,
          text: updated.text,
          ...(updated.runs !== undefined ? { runs: updated.runs } : {}),
        });
      } else {
        // Visual: update the contentHash; visualId stays the same.
        const fresh = documentBlocks.find(
          (b) => b.kind === "visual" && b.visualId === link.blockId,
        );
        if (!fresh) return;
        const newRef = buildRefreshSourceRef(
          element.sourceRef,
          link.blockId,
          hashDocumentBlock(fresh),
          linkedAt,
          "visual",
        );
        doCommitAndChange(deck, {
          type: "REFRESH_ELEMENT_FROM_SOURCE",
          slideId: link.slideId,
          elementId: link.elementId,
          sourceRef: newRef,
        });
      }
    },
    [deck, doCommitAndChange, documentBlocks],
  );

  // Stale-link action: unlink element from its source (keep as manual).
  const handleUnlinkSource = useCallback(
    (link: StaleSourceLink) => {
      const slideIndex = deck.slides.findIndex((s) => s.id === link.slideId);
      if (slideIndex < 0) return;
      const slide = deck.slides[slideIndex];
      const element = (slide.elements ?? []).find(
        (el) => el.id === link.elementId,
      );
      if (!element?.sourceRef) return;
      doCommitAndChange(deck, {
        type: "UNLINK_ELEMENT_SOURCE",
        slideId: link.slideId,
        elementId: link.elementId,
      });
    },
    [deck, doCommitAndChange],
  );

  // Stale-link action: relink element to a different document block.
  const handleRelinkSource = useCallback(
    (link: StaleSourceLink, newBlockId: string, newContentHash: string) => {
      const slideIndex = deck.slides.findIndex((s) => s.id === link.slideId);
      if (slideIndex < 0) return;
      const slide = deck.slides[slideIndex];
      const element = (slide.elements ?? []).find(
        (el) => el.id === link.elementId,
      );
      if (!element?.sourceRef) return;
      const newRef: SourceRef = {
        documentId: element.sourceRef.documentId,
        blockId: newBlockId,
        contentHash: newContentHash,
        linkedAt: new Date().toISOString(),
        blockKind: link.blockKind,
      };
      doCommitAndChange(deck, {
        type: "RELINK_ELEMENT_SOURCE",
        slideId: link.slideId,
        elementId: link.elementId,
        sourceRef: newRef,
      });
    },
    [deck, doCommitAndChange],
  );

  // Per-element Source panel actions (#644): drive the same source commands as
  // the stale-links banner, but keyed on a selected element id so the inspector
  // can offer update / unlink / relink for the current selection.
  const staleReasonByElementId = useMemo(
    () =>
      new Map(staleLinks.map((link) => [link.elementId, link.reason] as const)),
    [staleLinks],
  );
  const handlePanelUpdateFromSource = useCallback(
    (elementId: string) => {
      const link = staleLinks.find((l) => l.elementId === elementId);
      if (link) handleUpdateFromSource(link);
    },
    [staleLinks, handleUpdateFromSource],
  );
  const handlePanelUnlinkElementSource = useCallback(
    (elementId: string) => {
      for (const slide of deck.slides) {
        const el = (slide.elements ?? []).find((e) => e.id === elementId);
        if (el?.sourceRef) {
          doCommitAndChange(deck, {
            type: "UNLINK_ELEMENT_SOURCE",
            slideId: slide.id,
            elementId,
          });
          return;
        }
      }
    },
    [deck, doCommitAndChange],
  );
  const handlePanelRelinkElementSource = useCallback(
    (elementId: string) => {
      for (const slide of deck.slides) {
        const el = (slide.elements ?? []).find((e) => e.id === elementId);
        if (el?.sourceRef) {
          const ref = el.sourceRef;
          const newRef: SourceRef = {
            documentId: ref.documentId,
            blockId: ref.blockId,
            ...(ref.contentHash !== undefined
              ? { contentHash: ref.contentHash }
              : {}),
            linkedAt: new Date().toISOString(),
            blockKind: ref.blockKind,
          };
          doCommitAndChange(deck, {
            type: "RELINK_ELEMENT_SOURCE",
            slideId: slide.id,
            elementId,
            sourceRef: newRef,
          });
          return;
        }
      }
    },
    [deck, doCommitAndChange],
  );

  // Stale-link action: remove an orphaned element from the slide (#410).
  // Only offered for orphaned elements (block_missing); never auto-invoked.
  const handleRemoveOrphaned = useCallback(
    (link: StaleSourceLink) => {
      doCommitAndChange(deck, {
        type: "REMOVE_SOURCE_ELEMENT",
        slideId: link.slideId,
        elementId: link.elementId,
      });
    },
    [deck, doCommitAndChange],
  );

  const documentVisualEntries = useMemo(
    () => [...visuals.entries()],
    [visuals],
  );

  const handleBackgroundChange = useCallback(
    (color: string | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_BACKGROUND",
        slideId,
        background: color,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleAccentChange = useCallback(
    (color: string | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_ACCENT",
        slideId,
        accent: color,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  // ── Global deck template editing (#613/#612/#614) ───────────────────────────
  const handleUpdateDeckTemplate = useCallback(
    (patch: DeckTemplatePatch) => {
      doCommitAndChange(deck, { type: "UPDATE_DECK_TEMPLATE", patch });
    },
    [deck, doCommitAndChange],
  );

  const handleResetDeckTemplate = useCallback(() => {
    doCommitAndChange(deck, {
      type: "UPDATE_DECK_TEMPLATE",
      patch: {},
      reset: true,
    });
  }, [deck, doCommitAndChange]);

  const handleBackgroundGradientChange = useCallback(
    (gradient: { from: string; to: string; angle?: number } | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_BACKGROUND_GRADIENT",
        slideId,
        gradient,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleBackgroundImageChange = useCallback(
    (image: string | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_BACKGROUND_IMAGE",
        slideId,
        image,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleBackgroundAssetChange = useCallback(
    (opts: { url: string; assetId: string } | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_BACKGROUND_ASSET",
        slideId,
        opts,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  // Shared inspector props, rendered into the desktop right panel (`lg+`) and the
  // mobile bottom sheet (below `lg`) so both surfaces edit the same slide with
  // identical behaviour. Issue #209.
  const inspectorProps = selectedSlide
    ? {
        slide: selectedSlide,
        slideIndex: safeSelected,
        deck,
        visuals,
        selectedElementId: effectiveSelectedElementId,
        onSelectElement: handleSelectElement,
        canDelete: deck.slides.length > 1,
        onDuplicateSlide: () => handleDuplicate(safeSelected),
        onRemoveSlide: () => handleRemove(safeSelected),
        onApplyLayout: handleApplyReusableLayout,
        onResetLayout: handleResetReusableLayout,
        onUpdateNotes: (value: string, coalesceKey?: string) =>
          handleNotesChange(safeSelected, value, coalesceKey),
        onUpdateElement: handleUpdateElement,
        onRemoveElement: handleRemoveElement,
        onDuplicateElement: handleDuplicateElement,
        onBringToFront: handleBringToFront,
        onSendToBack: handleSendToBack,
        onSetElementHidden: handleSetElementHidden,
        onSetElementLocked: handleSetElementLocked,
        onMoveElementZOrder: handleMoveElementZOrder,
        onRenameElement: handleRenameElement,
        onReorderElement: handleReorderElement,
        selectedElementIds: effectiveSelectedElementIds,
        onAlign: handleAlign,
        onDistribute: handleDistribute,
        onMatchSize: handleMatchSize,
        onArrange: handleArrange,
        onBackgroundChange: handleBackgroundChange,
        onBackgroundGradientChange: handleBackgroundGradientChange,
        onBackgroundImageChange: handleBackgroundImageChange,
        onBackgroundAssetChange: handleBackgroundAssetChange,
        onAccentChange: handleAccentChange,
        brandSwatches,
        sourceStaleReasonById: staleReasonByElementId,
        onUpdateElementFromSource: handlePanelUpdateFromSource,
        onUnlinkElementSource: handlePanelUnlinkElementSource,
        onRelinkElementSource: handlePanelRelinkElementSource,
      }
    : null;
  const selectedElementForToolbar =
    selectedSlide?.elements?.find(
      (element) => element.id === effectiveSelectedElementId,
    ) ?? null;
  const deckTemplateTokenSet =
    deck.customTokenSet ?? resolveThemeTokens(deck.themeId ?? deck.theme);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Slide editor"
      className="fixed inset-0 z-modal flex flex-col bg-ds-surface-base"
    >
      {/* Hidden file input for Insert ▸ Image one-step picker (#299). */}
      <input
        ref={insertImageFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          handleInsertImageFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 border-b border-ds-border-subtle bg-ds-surface-chrome px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-ds-text-primary">
            Slide editor
          </h2>
          <span className="shrink-0 text-xs text-ds-text-muted">
            {deck.slides.length} {deck.slides.length === 1 ? "slide" : "slides"}
          </span>
        </div>

        {selectedSlide ? (
          <div
            role="toolbar"
            aria-label="Slide editing tools"
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain whitespace-nowrap px-1 py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <Popover
              open={addTemplateOpen || spotlightPickerOpen}
              onClose={() => {
                setAddTemplateOpen(false);
                setSpotlightPickerOpen(false);
              }}
              aria-label="Add slide"
              align="start"
              portal
              layer="tooltip"
              className="w-[300px] p-3"
              trigger={
                <button
                  type="button"
                  aria-label="Add slide"
                  aria-haspopup="dialog"
                  aria-expanded={addTemplateOpen || spotlightPickerOpen}
                  onClick={() => {
                    setSpotlightPickerOpen(false);
                    setAddTemplateOpen((open) => !open);
                  }}
                  className={`flex h-7 shrink-0 items-center gap-1.5 rounded-ds-sm border border-transparent bg-ds-accent px-2 text-xs font-semibold text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover ${FOCUS_RING}`}
                >
                  <Plus size={14} aria-hidden="true" />
                  Add
                </button>
              }
            >
              {spotlightPickerOpen ? (
                <VisualPicker
                  className="w-full"
                  visuals={visuals}
                  onPick={handleSpotlightPick}
                  onClose={() => setSpotlightPickerOpen(false)}
                />
              ) : (
                <SlideTemplatePicker onPick={handleAddTemplate} />
              )}
            </Popover>
            <div
              className="hidden h-5 w-px shrink-0 bg-ds-border-subtle sm:block"
              aria-hidden="true"
            />
            <Popover
              open={insertMenuOpen}
              onClose={() => {
                setInsertMenuOpen(false);
                setVisualPickerOpen(false);
              }}
              aria-label="Insert element"
              align="start"
              portal
              layer="tooltip"
              className="w-[300px] p-3"
              trigger={
                <button
                  type="button"
                  aria-label="Insert element"
                  aria-haspopup="dialog"
                  aria-expanded={insertMenuOpen}
                  onClick={() => setInsertMenuOpen((open) => !open)}
                  className={`flex h-7 shrink-0 items-center gap-1.5 rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-2 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                >
                  <Plus size={14} aria-hidden="true" />
                  Insert
                </button>
              }
            >
              <div className="mb-3 flex items-center gap-2">
                <Plus
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-ds-text-primary"
                />
                <h4 className="text-sm font-bold leading-none text-ds-text-primary">
                  Insert element
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <InsertMenuButton
                  icon={<Type size={14} aria-hidden="true" />}
                  label="Text"
                  onClick={() => handleAddElement("text")}
                />
                <InsertMenuButton
                  icon={<List size={14} aria-hidden="true" />}
                  label="Bullets"
                  onClick={() => handleAddElement("bullets")}
                />
                <InsertMenuButton
                  icon={<ImageIcon size={14} aria-hidden="true" />}
                  label="Image"
                  onClick={() => handleAddElement("image")}
                />
                <InsertMenuButton
                  icon={<Square size={14} aria-hidden="true" />}
                  label="Rectangle"
                  onClick={() => handleAddElement("shape", "rect")}
                />
                <InsertMenuButton
                  icon={<Circle size={14} aria-hidden="true" />}
                  label="Ellipse"
                  onClick={() => handleAddElement("shape", "ellipse")}
                />
                <InsertMenuButton
                  icon={<Triangle size={14} aria-hidden="true" />}
                  label="Triangle"
                  onClick={() => handleAddElement("shape", "triangle")}
                />
                <InsertMenuButton
                  icon={<Minus size={14} aria-hidden="true" />}
                  label="Line"
                  onClick={() => handleAddElement("shape", "line")}
                />
              </div>
              {insertImageError ? (
                <p role="alert" className="mt-1 text-xs text-ds-danger-text">
                  {insertImageError}
                </p>
              ) : null}
              <div className="mt-2 border-t border-ds-border-subtle pt-2">
                {visualPickerOpen ? (
                  <VisualPicker
                    className="w-full"
                    visuals={visuals}
                    onPick={handleAddVisual}
                    onClose={() => setVisualPickerOpen(false)}
                  />
                ) : (
                  <InsertMenuButton
                    icon={<Sparkles size={14} aria-hidden="true" />}
                    label="Visual"
                    onClick={() => setVisualPickerOpen(true)}
                  />
                )}
              </div>
            </Popover>
            <Popover
              open={fromDocOpen}
              onClose={() => setFromDocOpen(false)}
              aria-label="Insert from document"
              align="start"
              portal
              layer="tooltip"
              className="w-[300px] p-0"
              trigger={
                <Tooltip label="Insert from document" side="bottom">
                  <button
                    type="button"
                    aria-label={
                      staleSourceLinkCount > 0
                        ? `From document — ${staleSourceLinkCount} stale link${staleSourceLinkCount === 1 ? "" : "s"}`
                        : "From document"
                    }
                    aria-haspopup="dialog"
                    aria-expanded={fromDocOpen}
                    onClick={() => setFromDocOpen((open) => !open)}
                    className={`relative flex h-7 shrink-0 items-center gap-1.5 rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-2 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                  >
                    <FileText size={14} aria-hidden="true" />
                    From document
                    {staleSourceLinkCount > 0 ? (
                      <span
                        aria-hidden="true"
                        className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ds-warning-surface px-1 text-[10px] font-semibold leading-none text-ds-warning-text"
                      >
                        {staleSourceLinkCount > 99
                          ? "99+"
                          : staleSourceLinkCount}
                      </span>
                    ) : null}
                  </button>
                </Tooltip>
              }
            >
              <FromDocumentPanel
                visuals={documentVisualEntries}
                textItems={documentTextInsertables}
                staleLinks={staleLinks}
                onAddAllVisuals={handleAddAllVisuals}
                onInsertVisual={handleInsertDocumentVisual}
                onInsertText={handleInsertDocumentText}
                onUpdateFromSource={handleUpdateFromSource}
                onUnlinkSource={handleUnlinkSource}
                onRelinkSource={handleRelinkSource}
                onRemoveOrphaned={handleRemoveOrphaned}
                documentTextInsertables={documentTextInsertables}
                documentVisualInsertables={documentVisualInsertables}
              />
            </Popover>
            <div
              className="h-5 w-px shrink-0 bg-ds-border-subtle"
              aria-hidden="true"
            />
            <SlideSizeControl
              value={resolveSlideFormat(deck.slideFormat)}
              onChange={handleSlideFormatChange}
            />
            <Popover
              open={themeMenuOpen}
              onClose={() => setThemeMenuOpen(false)}
              aria-label="Choose deck background"
              portal
              layer="tooltip"
              className="w-[300px] p-3"
              trigger={
                <Tooltip label="Deck background" side="bottom">
                  <button
                    type="button"
                    aria-label="Choose deck background"
                    aria-haspopup="dialog"
                    aria-expanded={themeMenuOpen}
                    onClick={() => setThemeMenuOpen((open) => !open)}
                    className={`flex h-7 shrink-0 items-center gap-1.5 rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-2 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                  >
                    <Palette aria-hidden className="h-3.5 w-3.5" />
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 rounded-full border border-ds-border-subtle"
                      style={backgroundPreviewStyle}
                    />
                  </button>
                </Tooltip>
              }
            >
              <BackgroundThemePanel
                activeSolidId={activeSolidBackground}
                activeGradientId={activeGradientBackground}
                onPickSolid={applyDeckSolidBackground}
                onPickGradient={applyDeckGradientBackground}
              />
            </Popover>
            <Popover
              open={deckTemplateOpen}
              onClose={() => setDeckTemplateOpen(false)}
              aria-label="Edit deck theme"
              portal
              layer="tooltip"
              className="p-3"
              trigger={
                <Tooltip label="Deck theme" side="bottom">
                  <button
                    type="button"
                    aria-label="Edit deck theme"
                    aria-haspopup="dialog"
                    aria-expanded={deckTemplateOpen}
                    onClick={() => setDeckTemplateOpen((open) => !open)}
                    className={`flex h-7 shrink-0 items-center gap-1.5 rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-2 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                  >
                    <Type aria-hidden className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Theme</span>
                  </button>
                </Tooltip>
              }
            >
              <DeckTemplatePanel
                tokenSet={deckTemplateTokenSet}
                isCustom={deck.customTokenSet !== undefined}
                onUpdate={handleUpdateDeckTemplate}
                onReset={handleResetDeckTemplate}
              />
            </Popover>
            <span className="hidden min-w-0 shrink truncate text-xs text-ds-text-muted 2xl:inline">
              Slide {safeSelected + 1} of {deck.slides.length} ·{" "}
              {selectionSummary}
            </span>
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Undo / redo deck history */}
          <div
            role="group"
            aria-label="Undo and redo"
            className="flex items-center"
          >
            <Tooltip label={`Undo (${undoShortcut})`} side="bottom">
              <IconButton
                aria-label={`Undo (${undoShortcut})`}
                size="sm"
                variant="plain"
                disabled={!canUndo}
                onClick={handleUndo}
              >
                <Undo2 aria-hidden className="h-3.5 w-3.5" />
              </IconButton>
            </Tooltip>
            <Tooltip label={`Redo (${redoShortcut})`} side="bottom">
              <IconButton
                aria-label={`Redo (${redoShortcut})`}
                size="sm"
                variant="plain"
                disabled={!canRedo}
                onClick={handleRedo}
              >
                <Redo2 aria-hidden className="h-3.5 w-3.5" />
              </IconButton>
            </Tooltip>
          </div>

          <div
            className="hidden h-5 w-px bg-ds-border-subtle sm:block"
            aria-hidden="true"
          />

          {canSyncFromDocument ? (
            <Tooltip label="Re-sync slides from the document" side="bottom">
              <button
                type="button"
                onClick={handleRequestSync}
                className={`flex h-8 items-center gap-1.5 rounded-ds-md border px-2 text-sm font-medium transition-colors ${
                  showStaleBanner
                    ? "border-ds-warning-border bg-ds-warning-surface text-ds-warning-text hover:opacity-90"
                    : "border-ds-border-subtle text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
                } ${FOCUS_RING}`}
              >
                <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Sync</span>
              </button>
            </Tooltip>
          ) : null}

          <span
            role="status"
            aria-live="polite"
            className="hidden text-xs text-ds-text-muted xl:inline"
          >
            {saveStatus !== "error" ? SAVE_STATUS_LABEL[saveStatus] : null}
          </span>

          {saveStatus === "error" ? (
            <button
              type="button"
              onClick={handleSave}
              title={resolveSaveErrorMessage(saveErrorMessage)}
              aria-label={`${resolveSaveErrorMessage(saveErrorMessage)} — Retry`}
              className={`flex h-8 items-center rounded-ds-md border border-ds-danger-border bg-ds-danger-surface px-2.5 text-sm font-medium text-ds-danger-text transition-opacity hover:opacity-90 ${FOCUS_RING}`}
            >
              {SAVE_STATUS_LABEL.error}
            </button>
          ) : null}

          {saveStatus === "error" && saveErrorMessage ? (
            <span
              role="status"
              aria-live="assertive"
              className="hidden max-w-xs truncate text-xs text-ds-danger-text xl:inline"
            >
              {saveErrorMessage}
            </span>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`flex h-8 shrink-0 items-center rounded-ds-md bg-ds-accent px-3 text-sm font-medium text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:opacity-60 ${FOCUS_RING}`}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          {/* Keyboard shortcuts help (#535) */}
          <Tooltip label="Keyboard shortcuts" side="bottom">
            <IconButton
              aria-label="Keyboard shortcuts"
              size="sm"
              variant="plain"
              active={keyboardHelpOpen}
              onClick={() => setKeyboardHelpOpen(true)}
            >
              <Keyboard aria-hidden className="h-3.5 w-3.5" />
            </IconButton>
          </Tooltip>

          <Tooltip
            label={snapToGrid ? "Snap to grid: on" : "Snap to grid: off"}
            side="bottom"
          >
            <IconButton
              aria-label="Toggle snap to grid"
              size="sm"
              variant="plain"
              active={snapToGrid}
              onClick={() => setSnapToGrid((on) => !on)}
            >
              <Grid3x3 aria-hidden className="h-3.5 w-3.5" />
            </IconButton>
          </Tooltip>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Close slide editor"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-md border border-ds-border-subtle text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ── Staleness banner (non-blocking) ──────────────────────────────── */}
      {showStaleBanner ? (
        <div
          role="status"
          className="flex items-center gap-3 border-b border-ds-warning-border bg-ds-warning-surface px-4 py-2 text-sm text-ds-warning-text"
        >
          <RefreshCw aria-hidden className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Document changed since this deck was built.
          </span>
          <button
            type="button"
            onClick={handleRequestSync}
            className={`shrink-0 rounded-ds-md border border-ds-warning-border bg-ds-surface-base px-2.5 py-1 text-xs font-semibold text-ds-warning-text transition-opacity hover:opacity-90 ${FOCUS_RING}`}
          >
            Refresh from document
          </button>
          <button
            type="button"
            onClick={handleDismissStale}
            aria-label="Dismiss"
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-ds-md text-ds-warning-text transition-opacity hover:opacity-80 ${FOCUS_RING}`}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* ── Merge summary dialog (before applying a sync) ────────────────── */}
      {mergePreview ? (
        <MergeSummaryDialog
          summary={mergePreview.summary}
          onApply={handleApplySync}
          onCancel={handleCancelSync}
        />
      ) : null}

      <KeyboardShortcutHelpDialog
        open={keyboardHelpOpen}
        isMac={isMac}
        onClose={() => setKeyboardHelpOpen(false)}
      />

      {dragPreview && deck.slides[dragPreview.index] ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-dropdown rotate-1 opacity-95"
          style={{
            left: dragPreview.x,
            top: dragPreview.y,
            width: dragPreview.width,
          }}
        >
          <div className="rounded-ds-md border border-ds-accent-border bg-ds-surface-base p-1 shadow-ds-overlay ring-2 ring-ds-accent-border">
            <div
              className="relative overflow-hidden rounded-ds-sm border border-ds-border-subtle"
              style={{ aspectRatio: activeSlideAspectRatio }}
            >
              <SlideCanvas
                slide={deck.slides[dragPreview.index]}
                visuals={visuals}
                preview
              />
              <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-ds-sm bg-ds-surface-overlay px-1 text-[11px] font-semibold tabular-nums text-ds-text-secondary shadow-sm ring-1 ring-ds-border-subtle">
                {dragPreview.index + 1}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Body: stage · floating inspector · bottom thumbnail strip ───── */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Stage — large live preview of the selected slide */}
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-ds-surface-sunken">
            {selectedSlide ? (
              <SlideSelectionToolbar
                selectedElement={selectedElementForToolbar}
                selectedCount={effectiveSelectedElementIds.size}
                theme={selectedTheme}
                brandSwatches={brandSwatches}
                onUpdateElement={handleUpdateElement}
                onOpenPosition={() => openRightPanel("position")}
                onOpenText={() => openRightPanel("text")}
                onOpenEffects={() => openRightPanel("effects")}
                onOpenMedia={() => openRightPanel("media")}
                onOpenSource={() => openRightPanel("source")}
                onDuplicateElement={handleDuplicateElement}
                onRemoveElement={handleRemoveElement}
                onBringToFront={handleBringToFront}
                onSendToBack={handleSendToBack}
                compact={shouldCollapseToolbar(stageBounds.width)}
              />
            ) : null}
            <div
              ref={stageRef}
              className="relative min-h-0 flex-1 overflow-auto px-4 py-2 sm:px-5 sm:py-3"
            >
              <div
                className="relative shrink-0 transition-[padding] duration-200 ease-out motion-reduce:transition-none"
                style={{
                  boxSizing: "border-box",
                  width: scrollContentWidth,
                  height: scrollContentHeight,
                  paddingLeft: scrollInsetX,
                  paddingTop: scrollInsetY,
                }}
              >
                {selectedSlide ? (
                  <div
                    className="transition-transform duration-200 ease-out motion-reduce:transition-none"
                    style={{ transform: `translateX(${panelSlideShiftX}px)` }}
                  >
                    <SlideStageEditor
                      slide={selectedSlide}
                      deck={deck}
                      visuals={visuals}
                      width={renderedStageWidth}
                      height={renderedStageHeight}
                      selectedElementId={effectiveSelectedElementId}
                      selectedElementIds={effectiveSelectedElementIds}
                      onSelectElement={handleSelectElement}
                      onSelectElements={handleSelectElements}
                      onUpdateElement={handleUpdateElement}
                      onDuplicateElement={handleDuplicateElement}
                      onRemoveElement={handleRemoveElement}
                      onBringToFront={handleBringToFront}
                      onSendToBack={handleSendToBack}
                      onCopyElements={handleCopyElements}
                      onCutElements={handleCutElements}
                      onPasteElements={handlePasteElements}
                      onSetElementBoxes={handleSetElementBoxes}
                      onSetElementPatches={handleSetElementPatches}
                      onGroupElements={handleGroupElements}
                      onUngroupElements={handleUngroupElements}
                      snapToGrid={snapToGrid}
                      brandSwatches={brandSwatches}
                      onAddTextElement={handleAddTextElement}
                      focusRequest={focusRequest}
                      liveMessage={liveMessage}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </main>

          {/* Floating inspector — desktop overlay (`lg+`). Below `lg` it is
            opened as a bottom sheet via the FAB below. The desktop panel does
            not participate in flex layout, so opening it never resizes the
            slide stage. */}
          {/* eslint-disable-next-line react-hooks/refs -- handler props only run on user events. */}
          {inspectorProps && inspectorOpen ? (
            <SlideInspector
              key={`panel-${rightPanelTab}`}
              {...inspectorProps}
              documentId={documentId}
              initialTab={rightPanelTab}
              onClose={closeRightPanel}
              className="absolute bottom-4 right-4 top-4 z-panel hidden w-80 flex-col overflow-y-auto overflow-x-hidden rounded-ds-lg border border-ds-border-subtle bg-ds-surface-overlay shadow-ds-overlay lg:flex"
            />
          ) : null}
        </div>

        <aside
          aria-hidden={!railOpen}
          onTransitionEnd={(event) => {
            if (event.currentTarget === event.target && !railOpen) {
              setRailContentMounted(false);
            }
          }}
          className={`shrink-0 overflow-hidden bg-ds-surface-sunken transition-[max-height,opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
            railOpen
              ? "max-h-32 translate-y-0 opacity-100"
              : "max-h-0 translate-y-1 opacity-0"
          }`}
        >
          {railContentMounted ? (
            <div
              className={`overflow-x-auto px-2 py-1 transition-opacity duration-150 ${
                railOpen ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <ul ref={railListRef} className="flex flex-row gap-1.5">
                {deck.slides.map((slide, index) => {
                  const selected = index === safeSelected;
                  const dropTarget =
                    dragOverIndex === index && dragIndex !== index;
                  const dragging = dragIndex === index && dragPreview !== null;
                  const title = deriveSlideTitle(slide, index);
                  const canDelete = deck.slides.length > 1;
                  return (
                    <li
                      key={slide.id}
                      data-slide-thumb
                      className={`group relative w-28 shrink-0 transition-transform sm:w-32 ${
                        dragging ? "scale-[0.98] opacity-30" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setVisualPickerOpen(false);
                          setSelectedIndex(index);
                        }}
                        onPointerDown={(event) => beginReorder(event, index)}
                        onKeyDown={(event) => {
                          const direction = slideReorderKeyDirection(
                            event.key,
                            event.altKey,
                          );
                          if (direction === null) return;
                          const nextIndex = index + direction;
                          if (
                            nextIndex < 0 ||
                            nextIndex >= deck.slides.length
                          ) {
                            return;
                          }
                          event.preventDefault();
                          const list = event.currentTarget.closest("ul");
                          handleMove(index, direction);
                          // Keep focus on the slide as it moves so repeated
                          // nudges work without re-tabbing (#654).
                          requestAnimationFrame(() => {
                            const buttons =
                              list?.querySelectorAll<HTMLButtonElement>(
                                "li[data-slide-thumb] > button",
                              );
                            buttons?.[nextIndex]?.focus();
                          });
                        }}
                        aria-label={`Slide ${index + 1}: ${title}`}
                        aria-current={selected}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                        title={title}
                        className={`flex w-full rounded-ds-md border p-1 text-left transition-all ${
                          selected
                            ? "border-ds-accent-border bg-ds-accent-surface"
                            : "border-transparent hover:bg-ds-state-hover"
                        } ${
                          dropTarget
                            ? "border-ds-accent-border bg-ds-accent-surface shadow-ds-overlay ring-2 ring-ds-accent-border"
                            : ""
                        } ${dragging ? "cursor-grabbing" : "cursor-grab"} ${FOCUS_RING}`}
                      >
                        <span
                          className="pointer-events-none relative block min-w-0 flex-1 overflow-hidden rounded-ds-sm border border-ds-border-subtle"
                          style={{ aspectRatio: activeSlideAspectRatio }}
                        >
                          <SlideCanvas
                            slide={slide}
                            visuals={visuals}
                            preview
                          />
                          <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-ds-sm bg-ds-surface-overlay px-1 text-[11px] font-semibold tabular-nums text-ds-text-secondary shadow-sm ring-1 ring-ds-border-subtle">
                            {index + 1}
                          </span>
                        </span>
                      </button>

                      <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <ThumbnailAction
                          icon={<ChevronUp size={13} aria-hidden="true" />}
                          label={`Move slide ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => handleMove(index, -1)}
                        />
                        <ThumbnailAction
                          icon={<ChevronDown size={13} aria-hidden="true" />}
                          label={`Move slide ${index + 1} down`}
                          disabled={index === deck.slides.length - 1}
                          onClick={() => handleMove(index, 1)}
                        />
                        <ThumbnailAction
                          icon={<Copy size={13} aria-hidden="true" />}
                          label={`Duplicate slide ${index + 1}`}
                          onClick={() => handleDuplicate(index)}
                        />
                        <ThumbnailAction
                          icon={<Trash2 size={13} aria-hidden="true" />}
                          label={`Delete slide ${index + 1}`}
                          disabled={!canDelete}
                          onClick={() => handleRemove(index)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </aside>

        {selectedSlide ? (
          <SlideBottomDock
            railOpen={railOpen}
            notesOpen={
              rightPanelTab === "notes" && (inspectorOpen || inspectorSheetOpen)
            }
            zoom={zoom}
            zoomMenuOpen={zoomMenuOpen}
            slideLabel={`Slide ${safeSelected + 1} of ${deck.slides.length}`}
            onToggleRail={handleToggleRail}
            onOpenNotes={() => openRightPanel("notes")}
            onZoomChange={handleZoomChange}
            onZoomMenuOpenChange={setZoomMenuOpen}
          />
        ) : null}
      </div>

      {/* ── Mobile inspector bottom sheet (below `lg`) ───────────────────── */}
      {/* Reuses the document editor's MobileEditingSheet pattern: a FAB toggles
          a bottom sheet that hosts the same inspector. Hidden at `lg+` where the
          inspector is a permanent right panel. Issue #209. */}
      {/* eslint-disable-next-line react-hooks/refs -- handler props only run on user events. */}
      {inspectorProps ? (
        <div className="lg:hidden">
          <button
            type="button"
            data-floating-panel="true"
            aria-label="Edit slide"
            aria-haspopup="dialog"
            aria-expanded={inspectorSheetOpen}
            onClick={openInspectorSurface}
            className={`fixed bottom-6 right-6 z-modal flex h-12 w-12 items-center justify-center rounded-full bg-ds-accent text-ds-text-on-accent shadow-ds-overlay transition-colors hover:bg-ds-accent-hover ${FOCUS_RING}`}
          >
            <Edit3 aria-hidden="true" className="h-5 w-5" />
          </button>

          {inspectorSheetOpen ? (
            <>
              <div
                data-floating-panel="true"
                aria-hidden="true"
                onClick={() => setInspectorSheetOpen(false)}
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
                      setInspectorSheetOpen(false);
                    }
                  }}
                  className="fixed inset-x-0 bottom-0 z-modal flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border-t border-ds-border-subtle bg-ds-surface-base shadow-ds-popover"
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
                      onClick={() => setInspectorSheetOpen(false)}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <SlideInspector
                    key={`sheet-panel-${rightPanelTab}`}
                    {...inspectorProps}
                    documentId={documentId}
                    initialTab={rightPanelTab}
                    className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden"
                  />
                </div>
              </FocusTrapped>
            </>
          ) : null}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/**
 * Template picker shown from the top-toolbar Add popover. Lists each
 * {@link SLIDE_TEMPLATES} option; picking one inserts an authored slide via the
 * caller (routed through the undo/redo `commit` path).
 */
function BackgroundThemePanel({
  activeSolidId,
  activeGradientId,
  onPickSolid,
  onPickGradient,
}: {
  activeSolidId?: string;
  activeGradientId?: string;
  onPickSolid: (color: string) => void;
  onPickGradient: (gradient: BackgroundGradient) => void;
}) {
  const [view, setView] = useState<"presets" | "customize">("presets");
  const [customMode, setCustomMode] = useState<"solid" | "gradient">("solid");
  const [customSolid, setCustomSolid] = useState("#2563eb");
  const [customGradientFrom, setCustomGradientFrom] = useState("#6366f1");
  const [customGradientTo, setCustomGradientTo] = useState("#ec4899");
  const [customGradientAngle, setCustomGradientAngle] = useState(135);
  const [activeGradientStop, setActiveGradientStop] = useState<"from" | "to">(
    "from",
  );

  const openCustomize = (mode: "solid" | "gradient") => {
    setCustomMode(mode);
    setView("customize");
  };

  if (view === "customize") {
    const solidPreview = swatchColor(customSolid, "#2563eb");
    const gradientFromPreview = swatchColor(customGradientFrom, "#6366f1");
    const gradientToPreview = swatchColor(customGradientTo, "#ec4899");
    const customGradient = {
      from: gradientFromPreview,
      to: gradientToPreview,
      angle: customGradientAngle,
    };

    return (
      <div className="flex w-[272px] flex-col gap-4 p-1">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setView("presets")}
            className={`flex h-7 items-center gap-1 rounded-ds-sm px-1.5 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-xs font-bold uppercase tracking-wide text-ds-text-muted">
            Customize
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Custom background type"
          className="grid grid-cols-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={customMode === "solid"}
            onClick={() => setCustomMode("solid")}
            className={`rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
              customMode === "solid"
                ? "bg-ds-accent-surface text-ds-accent-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            } ${FOCUS_RING}`}
          >
            Solid
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={customMode === "gradient"}
            onClick={() => setCustomMode("gradient")}
            className={`rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
              customMode === "gradient"
                ? "bg-ds-accent-surface text-ds-accent-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            } ${FOCUS_RING}`}
          >
            Gradient
          </button>
        </div>

        {customMode === "solid" ? (
          <div className="flex flex-col gap-3">
            <InlineColorPalette
              value={customSolid}
              fallback="#2563eb"
              label="Custom solid color"
              onChange={setCustomSolid}
            />
            <button
              type="button"
              onClick={() => onPickSolid(solidPreview)}
              disabled={!isCompleteHexColor(customSolid)}
              className={`h-8 rounded-ds-md bg-ds-accent px-3 text-xs font-semibold text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              Apply solid color
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <span
              aria-hidden="true"
              className="block h-14 rounded-ds-md border border-ds-border-subtle shadow-sm"
              style={{ background: gradientCss(customGradient) }}
            />
            <div className="grid grid-cols-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-0.5">
              <button
                type="button"
                aria-pressed={activeGradientStop === "from"}
                onClick={() => setActiveGradientStop("from")}
                className={`flex items-center justify-center gap-1.5 rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
                  activeGradientStop === "from"
                    ? "bg-ds-accent-surface text-ds-accent-text"
                    : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
                } ${FOCUS_RING}`}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full border border-ds-border-subtle"
                  style={{ backgroundColor: gradientFromPreview }}
                />
                From
              </button>
              <button
                type="button"
                aria-pressed={activeGradientStop === "to"}
                onClick={() => setActiveGradientStop("to")}
                className={`flex items-center justify-center gap-1.5 rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
                  activeGradientStop === "to"
                    ? "bg-ds-accent-surface text-ds-accent-text"
                    : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
                } ${FOCUS_RING}`}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full border border-ds-border-subtle"
                  style={{ backgroundColor: gradientToPreview }}
                />
                To
              </button>
            </div>
            <InlineColorPalette
              value={
                activeGradientStop === "from"
                  ? customGradientFrom
                  : customGradientTo
              }
              fallback={activeGradientStop === "from" ? "#6366f1" : "#ec4899"}
              label={
                activeGradientStop === "from"
                  ? "Gradient start color"
                  : "Gradient end color"
              }
              onChange={
                activeGradientStop === "from"
                  ? setCustomGradientFrom
                  : setCustomGradientTo
              }
            />
            <label className="flex items-center gap-3 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5">
              <span className="w-10 text-xs font-medium text-ds-text-secondary">
                Angle
              </span>
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={customGradientAngle}
                onChange={(event) =>
                  setCustomGradientAngle(Number(event.target.value))
                }
                className="min-w-0 flex-1 accent-ds-accent"
                aria-label="Gradient angle"
              />
              <span className="w-9 text-right text-xs tabular-nums text-ds-text-muted">
                {customGradientAngle}°
              </span>
            </label>
            <button
              type="button"
              onClick={() => onPickGradient(customGradient)}
              disabled={
                !isCompleteHexColor(customGradientFrom) ||
                !isCompleteHexColor(customGradientTo)
              }
              className={`h-8 rounded-ds-md bg-ds-accent px-3 text-xs font-semibold text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              Apply gradient
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-[272px] flex-col gap-5 p-1">
      <section aria-label="Solid color backgrounds">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Palette
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-ds-text-primary"
            />
            <h4 className="text-sm font-bold leading-none text-ds-text-primary">
              Default solid colors
            </h4>
          </div>
          <button
            type="button"
            onClick={() => openCustomize("solid")}
            className={`rounded-ds-sm px-1.5 py-1 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Customize
          </button>
        </div>
        <div className="grid grid-cols-7 gap-x-2 gap-y-3">
          {SOLID_BACKGROUND_OPTIONS.map((option) => {
            const active = activeSolidId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-label={`Apply ${option.label} solid background to deck`}
                aria-pressed={active}
                onClick={() => onPickSolid(option.color)}
                title={option.label}
                className={`h-8 w-8 rounded-full border shadow-sm transition-transform hover:scale-105 ${
                  active
                    ? "border-ds-accent ring-2 ring-ds-accent ring-offset-2 ring-offset-ds-surface-overlay"
                    : "border-ds-border-subtle"
                } ${FOCUS_RING}`}
                style={{ backgroundColor: option.color }}
              />
            );
          })}
        </div>
      </section>

      <section aria-label="Gradient backgrounds">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-5 w-5 shrink-0 rounded-ds-sm border border-ds-text-primary p-0.5"
            >
              <span
                className="block h-full w-full rounded-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, #111827 0 33%, #737373 33% 66%, #f8fafc 66% 100%)",
                }}
              ></span>
            </span>
            <h4 className="text-sm font-bold leading-none text-ds-text-primary">
              Default gradient colors
            </h4>
          </div>
          <button
            type="button"
            onClick={() => openCustomize("gradient")}
            className={`rounded-ds-sm px-1.5 py-1 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Customize
          </button>
        </div>
        <div className="grid grid-cols-7 gap-x-2 gap-y-3">
          {GRADIENT_BACKGROUND_OPTIONS.map((option) => {
            const active = activeGradientId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-label={`Apply ${option.label} gradient background to deck`}
                aria-pressed={active}
                onClick={() => onPickGradient(option.gradient)}
                title={option.label}
                className={`h-8 w-8 rounded-full border shadow-sm transition-transform hover:scale-105 ${
                  active
                    ? "border-ds-accent ring-2 ring-ds-accent ring-offset-2 ring-offset-ds-surface-overlay"
                    : "border-ds-border-subtle"
                } ${FOCUS_RING}`}
                style={{ background: gradientCss(option.gradient) }}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function InlineColorPalette({
  value,
  fallback,
  label,
  onChange,
}: {
  value: string;
  fallback: string;
  label: string;
  onChange: (color: string) => void;
}) {
  const preview = swatchColor(value, fallback);
  const hsv = hexToHsv(preview, fallback);
  const hueColor = hsvToHex(hsv.h, 1, 1);

  function setFromHsv(next: { h?: number; s?: number; v?: number }) {
    onChange(
      hsvToHex(next.h ?? hsv.h, next.s ?? hsv.s, next.v ?? hsv.v).toUpperCase(),
    );
  }

  function updateSaturationValue(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = Math.max(
      0,
      Math.min(rect.width, event.clientX - rect.left),
    );
    const pointerY = Math.max(
      0,
      Math.min(rect.height, event.clientY - rect.top),
    );
    setFromHsv({ s: pointerX / rect.width, v: 1 - pointerY / rect.height });
  }

  return (
    <div className="rounded-ds-lg border border-ds-border-subtle bg-ds-surface p-2 shadow-sm">
      <div
        aria-label={`${label} saturation and brightness`}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`}
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateSaturationValue(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          updateSaturationValue(event);
        }}
        className={`relative h-28 cursor-crosshair overflow-hidden rounded-ds-md border border-ds-border-subtle ${FOCUS_RING}`}
        style={{ backgroundColor: hueColor }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, #fff, transparent), linear-gradient(0deg, #000, transparent)",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_4px_12px_rgba(0,0,0,0.25)]"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: preview,
          }}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-8 w-8 shrink-0 rounded-full border border-ds-border-subtle shadow-sm"
          style={{ backgroundColor: preview }}
        />
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.round(hsv.h)}
          onChange={(event) => setFromHsv({ h: Number(event.target.value) })}
          className="min-w-0 flex-1 accent-ds-accent"
          style={{
            background:
              "linear-gradient(90deg, #ef4444, #f97316, #facc15, #22c55e, #06b6d4, #2563eb, #7c3aed, #ec4899, #ef4444)",
          }}
          aria-label={`${label} hue`}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-ds-text-muted">HEX</span>
        <input
          type="text"
          inputMode="text"
          spellCheck={false}
          value={value.toUpperCase()}
          onChange={(event) => onChange(normalizeHexInput(event.target.value))}
          className={`h-8 min-w-0 flex-1 rounded-ds-sm border bg-ds-surface px-2 text-xs font-semibold uppercase tabular-nums text-ds-text-primary outline-none ${
            isCompleteHexColor(value)
              ? "border-ds-border-subtle"
              : "border-ds-warning-border"
          } ${FOCUS_RING}`}
          aria-label={`${label} hex color`}
        />
      </div>
    </div>
  );
}

function SlideTemplatePicker({
  onPick,
}: {
  onPick: (kind: SlideTemplateKind) => void;
}) {
  return (
    <div
      role="menu"
      aria-label="Slide templates"
      className="rounded-ds-md bg-ds-surface-raised"
    >
      <div className="mb-3 flex items-center gap-2">
        <Plus
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-ds-text-primary"
        />
        <h4 className="text-sm font-bold leading-none text-ds-text-primary">
          Add slide
        </h4>
      </div>
      <div className="flex flex-col gap-1.5">
        {SLIDE_TEMPLATES.map((template) => (
          <button
            key={template.kind}
            type="button"
            role="menuitem"
            onClick={() => onPick(template.kind)}
            title={template.description}
            className={`group flex items-center gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-1.5 text-left transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover ${FOCUS_RING}`}
          >
            <TemplatePreview kind={template.kind} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-semibold leading-tight text-ds-text-primary">
                {template.label}
              </span>
              <span className="truncate text-[10px] leading-tight text-ds-text-muted">
                {template.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Bar used inside {@link TemplatePreview} to mock a line of slide content. */
function PreviewBar({ className = "" }: { className?: string }) {
  return (
    <span className={`block rounded-[1px] bg-ds-text-muted/40 ${className}`} />
  );
}

/**
 * A tiny 16:9 mock of each slide-template layout, shown in the gallery so the
 * user recognises the structure at a glance instead of reading labels alone.
 */
function TemplatePreview({ kind }: { kind: SlideTemplateKind }) {
  return (
    <span
      aria-hidden
      className="block aspect-video w-14 shrink-0 overflow-hidden rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised"
    >
      {kind === "title" ? (
        <span className="flex h-full flex-col items-center justify-center gap-1 px-3">
          <PreviewBar className="h-1.5 w-3/4" />
          <PreviewBar className="h-1 w-1/2 bg-ds-text-muted/25" />
        </span>
      ) : null}
      {kind === "content" ? (
        <span className="flex h-full flex-col gap-1 p-2">
          <PreviewBar className="h-1.5 w-1/2" />
          <PreviewBar className="mt-0.5 h-1 w-full bg-ds-text-muted/25" />
          <PreviewBar className="h-1 w-5/6 bg-ds-text-muted/25" />
          <PreviewBar className="h-1 w-3/4 bg-ds-text-muted/25" />
        </span>
      ) : null}
      {kind === "visual" ? (
        <span className="flex h-full flex-col gap-1 p-1.5">
          <span className="block flex-1 rounded-[2px] bg-ds-text-muted/30" />
          <PreviewBar className="h-1 w-1/2 self-center bg-ds-text-muted/25" />
        </span>
      ) : null}
      {kind === "two-column" ? (
        <span className="flex h-full flex-col gap-1 p-2">
          <PreviewBar className="h-1.5 w-1/2" />
          <span className="flex flex-1 gap-1.5">
            <span className="flex flex-1 flex-col gap-1">
              <PreviewBar className="h-1 w-full bg-ds-text-muted/25" />
              <PreviewBar className="h-1 w-5/6 bg-ds-text-muted/25" />
            </span>
            <span className="flex flex-1 flex-col gap-1">
              <PreviewBar className="h-1 w-full bg-ds-text-muted/25" />
              <PreviewBar className="h-1 w-5/6 bg-ds-text-muted/25" />
            </span>
          </span>
        </span>
      ) : null}
      {kind === "blank" ? (
        <span className="flex h-full items-center justify-center">
          <span className="block h-3/4 w-5/6 rounded-[2px] border border-dashed border-ds-border-strong" />
        </span>
      ) : null}
    </span>
  );
}

function InsertMenuButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-left text-xs font-semibold text-ds-text-secondary transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-ds-sm bg-ds-accent-surface text-ds-accent-text">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** Short accessible label for a document visual card. */
function fromDocVisualLabel(id: string, visual: Visual): string {
  const title = visual.title?.trim();
  if (title) return title;
  const kind = visual.type
    ? visual.type.charAt(0).toUpperCase() + visual.type.slice(1)
    : "Visual";
  return `${kind} · ${id.slice(0, 6)}`;
}

/**
 * The "From document" quick-insert panel (issue #293). Lists the document's
 * visuals and text as click-to-insert cards plus an "Add all visuals" action.
 * Each insert is routed through the editor's undoable `addElement` path; the
 * panel stays open after an insert so several items can be placed in a row.
 *
 * Issue #408/#410: When `staleLinks` is non-empty, a "Source links" section
 * is shown above the insert cards, listing each stale element with its reason
 * (changed vs orphaned/missing) and per-element actions (update, unlink/keep,
 * relink, remove). The panel never auto-deletes elements (#410).
 */
function FromDocumentPanel({
  visuals,
  textItems,
  staleLinks = [],
  onAddAllVisuals,
  onInsertVisual,
  onInsertText,
  onUpdateFromSource,
  onUnlinkSource,
  onRelinkSource,
  onRemoveOrphaned,
  documentTextInsertables = [],
  documentVisualInsertables = [],
}: {
  visuals: readonly (readonly [string, Visual])[];
  textItems: readonly Extract<Insertable, { kind: "text" }>[];
  staleLinks?: StaleSourceLink[];
  onAddAllVisuals: () => void;
  onInsertVisual: (item: Extract<Insertable, { kind: "visual" }>) => void;
  onInsertText: (item: Extract<Insertable, { kind: "text" }>) => void;
  onUpdateFromSource?: (link: StaleSourceLink) => void;
  onUnlinkSource?: (link: StaleSourceLink) => void;
  onRelinkSource?: (
    link: StaleSourceLink,
    newBlockId: string,
    newContentHash: string,
  ) => void;
  onRemoveOrphaned?: (link: StaleSourceLink) => void;
  documentTextInsertables?: readonly Extract<Insertable, { kind: "text" }>[];
  documentVisualInsertables?: readonly Extract<
    Insertable,
    { kind: "visual" }
  >[];
}) {
  const hasVisuals = visuals.length > 0;
  const hasText = textItems.length > 0;
  const hasStale = staleLinks.length > 0;
  const changedLinks = staleLinks.filter((l) => l.reason === "content_changed");
  const missingLinks = staleLinks.filter((l) => l.reason === "block_missing");

  return (
    <div className="flex max-h-[70vh] flex-col rounded-ds-md bg-ds-surface-raised">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-ds-text-primary"
          />
          <h4 className="truncate text-sm font-bold leading-none text-ds-text-primary">
            From document
          </h4>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Stale source links section (#408 / #410) */}
        {hasStale ? (
          <section
            aria-label="Stale source links"
            className="border-b border-ds-border-subtle p-3"
          >
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ds-warning-text">
              Source links
            </h3>
            {changedLinks.length > 0 && (
              <div className="mb-2">
                <p className="mb-1.5 text-[11px] text-ds-text-muted">
                  Content changed
                </p>
                <ul className="flex flex-col gap-1">
                  {changedLinks.map((link) => (
                    <li
                      key={link.elementId}
                      className="flex items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ds-text-secondary">
                        {link.blockKind === "visual" ? "Visual" : "Text"} ·{" "}
                        {link.blockId.slice(0, 8)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateFromSource?.(link)}
                        aria-label="Update element from source"
                        title="Update from source"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        onClick={() => onUnlinkSource?.(link)}
                        aria-label="Unlink element from source"
                        title="Keep as manual (unlink)"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                      >
                        Unlink
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {missingLinks.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] text-ds-text-muted">
                  Orphaned (source deleted)
                </p>
                <ul className="flex flex-col gap-1">
                  {missingLinks.map((link) => (
                    <li
                      key={link.elementId}
                      className="flex items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ds-text-secondary">
                        {link.blockKind === "visual" ? "Visual" : "Text"} ·{" "}
                        {link.blockId.slice(0, 8)}
                      </span>
                      {/* Relink to a new block (visual or text) */}
                      {link.blockKind === "visual" &&
                        documentVisualInsertables.length > 0 && (
                          <select
                            aria-label="Relink to visual"
                            defaultValue=""
                            onChange={(e) => {
                              const item = documentVisualInsertables.find(
                                (i) => i.visualId === e.target.value,
                              );
                              if (item)
                                onRelinkSource?.(
                                  link,
                                  item.visualId,
                                  item.contentHash,
                                );
                            }}
                            className={`shrink-0 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1 py-0.5 text-[11px] text-ds-text-secondary ${FOCUS_RING}`}
                          >
                            <option value="" disabled>
                              Relink…
                            </option>
                            {documentVisualInsertables.map((i) => (
                              <option key={i.visualId} value={i.visualId}>
                                {i.visualId.slice(0, 8)}
                              </option>
                            ))}
                          </select>
                        )}
                      {link.blockKind === "text" &&
                        documentTextInsertables.length > 0 && (
                          <select
                            aria-label="Relink to text block"
                            defaultValue=""
                            onChange={(e) => {
                              const item = documentTextInsertables.find(
                                (i) => i.blockId === e.target.value,
                              );
                              if (item)
                                onRelinkSource?.(
                                  link,
                                  item.blockId!,
                                  item.contentHash,
                                );
                            }}
                            className={`shrink-0 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1 py-0.5 text-[11px] text-ds-text-secondary ${FOCUS_RING}`}
                          >
                            <option value="" disabled>
                              Relink…
                            </option>
                            {documentTextInsertables
                              .filter((i) => i.blockId !== undefined)
                              .map((i) => (
                                <option key={i.blockId} value={i.blockId}>
                                  {i.label}
                                </option>
                              ))}
                          </select>
                        )}
                      <button
                        type="button"
                        onClick={() => onUnlinkSource?.(link)}
                        aria-label="Keep element as manual (unlink from source)"
                        title="Keep as manual"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveOrphaned?.(link)}
                        aria-label="Remove orphaned element"
                        title="Remove element"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-error-text transition-colors hover:bg-ds-error-surface ${FOCUS_RING}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : null}

        {!hasVisuals && !hasText && !hasStale ? (
          <p className="px-3 py-8 text-center text-xs text-ds-text-muted">
            This document has no text or visuals yet. Add content in the
            document to reuse it on a slide.
          </p>
        ) : (
          <div className="p-3">
            {hasVisuals ? (
              <section aria-label="Document visuals">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ds-text-muted">
                    Visuals
                  </h3>
                  <button
                    type="button"
                    onClick={onAddAllVisuals}
                    className={`flex h-6 items-center gap-1 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2 text-[11px] font-semibold text-ds-text-secondary transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                  >
                    <Plus size={12} aria-hidden="true" />
                    Add all visuals
                  </button>
                </div>
                <ul className="grid grid-cols-2 gap-1.5">
                  {visuals.map(([id, visual]) => {
                    const insertable = documentVisualInsertables.find(
                      (i) => i.visualId === id,
                    ) ?? {
                      kind: "visual" as const,
                      visualId: id,
                      contentHash: "",
                    };
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => onInsertVisual(insertable)}
                          aria-label={`Insert ${fromDocVisualLabel(id, visual)}`}
                          title={fromDocVisualLabel(id, visual)}
                          className={`group flex w-full flex-col gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-1.5 text-left transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover ${FOCUS_RING}`}
                        >
                          <span className="flex aspect-video items-center justify-center overflow-hidden rounded-ds-sm bg-ds-surface-base">
                            <VisualRenderer
                              visual={visual}
                              className="h-full w-full object-contain"
                              transparentBackground
                            />
                          </span>
                          <span className="truncate text-[11px] text-ds-text-muted">
                            {fromDocVisualLabel(id, visual)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {hasText ? (
              <section
                aria-label="Document text"
                className={hasVisuals ? "mt-4" : ""}
              >
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ds-text-muted">
                  Text
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {textItems.map((item, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => onInsertText(item)}
                        aria-label={`Insert ${item.heading ? "heading" : "text"}: ${item.label}`}
                        title={item.text}
                        className={`flex w-full items-center gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-left transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover ${FOCUS_RING}`}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-ds-sm bg-ds-accent-surface text-ds-accent-text">
                          <Type size={13} aria-hidden="true" />
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate text-xs ${
                            item.heading
                              ? "font-semibold text-ds-text-primary"
                              : "text-ds-text-secondary"
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function SlideSelectionToolbar({
  selectedElement,
  selectedCount,
  theme,
  brandSwatches,
  onUpdateElement,
  onOpenPosition,
  onOpenText,
  onOpenEffects,
  onOpenMedia,
  onOpenSource,
  onDuplicateElement,
  onRemoveElement,
  onBringToFront,
  onSendToBack,
  compact,
}: {
  selectedElement: SlideElement | null;
  selectedCount: number;
  theme: ThemeConfig;
  brandSwatches: readonly string[];
  onUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
  onOpenPosition: () => void;
  onOpenText: () => void;
  onOpenEffects: () => void;
  onOpenMedia: () => void;
  onOpenSource: () => void;
  onDuplicateElement: (id: string) => void;
  onRemoveElement: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  compact: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  if (
    !isSelectionToolbarVisible({
      hasSelectedElement: selectedElement !== null,
      selectedCount,
    })
  ) {
    return null;
  }
  const showRich =
    selectedElement !== null &&
    shouldShowRichToolbarControls({
      hasSelectedElement: selectedElement !== null,
      selectedCount,
    });
  const panelEntries = toolbarPanelEntries({
    kind:
      selectedElement !== null
        ? toToolbarSelectionKind(
            selectedElement.kind,
            selectedElement.kind === "shape"
              ? selectedElement.shape
              : undefined,
          )
        : null,
    hasSourceRef: selectedElement?.sourceRef !== undefined,
    selectedCount,
  });
  const canOpenTextPanel = panelEntries.text;
  const canOpenMediaPanel = panelEntries.media;
  const canOpenEffectsPanel = panelEntries.effects;
  const canOpenSourcePanel = panelEntries.source;
  const panelEntry = (label: string, icon: ReactNode, onClick: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
    >
      {icon}
    </button>
  );
  return (
    <div
      role="toolbar"
      data-floating-panel="true"
      aria-label="Selected slide element tools"
      className="pointer-events-auto absolute left-1/2 top-3 z-sticky flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 overflow-visible rounded-ds-lg border border-ds-border-subtle bg-ds-surface-raised p-1 shadow-ds-popover"
    >
      {showRich && selectedElement ? (
        <ElementToolbarContent
          element={selectedElement}
          tc={theme}
          brandSwatches={brandSwatches}
          onUpdateElement={onUpdateElement}
          onDuplicate={() => onDuplicateElement(selectedElement.id)}
          onBringToFront={() => onBringToFront(selectedElement.id)}
          onSendToBack={() => onSendToBack(selectedElement.id)}
          onRemove={() => onRemoveElement(selectedElement.id)}
          compact={compact}
        />
      ) : null}
      {compact && showRich && selectedElement ? (
        <Popover
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          aria-label="More element actions"
          placement="bottom"
          className="w-44 p-1"
          trigger={
            <button
              type="button"
              aria-label="More actions"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-md text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
          }
        >
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => {
                onBringToFront(selectedElement.id);
                setMoreOpen(false);
              }}
              className={`flex items-center gap-2 rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              <BringToFront size={14} aria-hidden="true" />
              Bring to front
            </button>
            <button
              type="button"
              onClick={() => {
                onSendToBack(selectedElement.id);
                setMoreOpen(false);
              }}
              className={`flex items-center gap-2 rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              <SendToBack size={14} aria-hidden="true" />
              Send to back
            </button>
          </div>
        </Popover>
      ) : null}
      {showRich ? (
        <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />
      ) : null}
      {canOpenTextPanel
        ? panelEntry(
            "Text settings",
            <Type size={14} aria-hidden="true" />,
            onOpenText,
          )
        : null}
      {canOpenMediaPanel
        ? selectedElement?.kind === "connector"
          ? panelEntry(
              "Line settings",
              <Minus size={14} aria-hidden="true" />,
              onOpenMedia,
            )
          : panelEntry(
              "Media settings",
              <ImageIcon size={14} aria-hidden="true" />,
              onOpenMedia,
            )
        : null}
      {canOpenEffectsPanel
        ? panelEntry(
            "Effects settings",
            <Sparkles size={14} aria-hidden="true" />,
            onOpenEffects,
          )
        : null}
      {canOpenSourcePanel
        ? panelEntry(
            "Source settings",
            <FileText size={14} aria-hidden="true" />,
            onOpenSource,
          )
        : null}
      {panelEntry(
        "Position settings",
        <Grid3x3 size={14} aria-hidden="true" />,
        onOpenPosition,
      )}
    </div>
  );
}

function SlideBottomDock({
  railOpen,
  notesOpen,
  zoom,
  zoomMenuOpen,
  slideLabel,
  onToggleRail,
  onOpenNotes,
  onZoomChange,
  onZoomMenuOpenChange,
}: {
  railOpen: boolean;
  notesOpen: boolean;
  zoom: number;
  zoomMenuOpen: boolean;
  slideLabel: string;
  onToggleRail: () => void;
  onOpenNotes: () => void;
  onZoomChange: (zoom: number) => void;
  onZoomMenuOpenChange: (open: boolean) => void;
}) {
  const zoomPercent = zoomToPercent(zoom);
  const setZoomPercent = (percent: number) => {
    onZoomChange(percent / 100);
    onZoomMenuOpenChange(false);
  };
  // Descending order (largest first) to match the zoom menu in the mockup.
  const presets = [...ZOOM_PERCENT_PRESETS].sort((a, b) => b - a);

  return (
    <div className="shrink-0 bg-ds-surface-sunken">
      <div className="flex min-h-10 items-center justify-center gap-1.5 px-2 py-1">
        <Tooltip
          label={railOpen ? "Hide slide thumbnails" : "Show slide thumbnails"}
          side="top"
        >
          <button
            type="button"
            aria-label={
              railOpen ? "Hide slide thumbnails" : "Show slide thumbnails"
            }
            aria-pressed={railOpen}
            onClick={onToggleRail}
            className={`flex h-8 items-center gap-1.5 rounded-ds-md px-2 text-xs font-semibold transition-colors ${
              railOpen
                ? "bg-ds-accent-surface text-ds-accent-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            } ${FOCUS_RING}`}
          >
            <LayoutPanelLeft size={14} aria-hidden="true" />
            Slides
          </button>
        </Tooltip>
        <button
          type="button"
          aria-pressed={notesOpen}
          onClick={onOpenNotes}
          className={`flex h-8 items-center rounded-ds-md px-2 text-xs font-semibold transition-colors ${
            notesOpen
              ? "bg-ds-accent-surface text-ds-accent-text"
              : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
          } ${FOCUS_RING}`}
        >
          Notes
        </button>
        <span className="hidden truncate text-xs font-medium text-ds-text-muted sm:inline">
          {slideLabel}
        </span>
        <div className="mx-1 h-5 w-px bg-ds-border-subtle" aria-hidden="true" />
        <input
          type="range"
          min={25}
          max={200}
          step={5}
          value={zoomPercent}
          onChange={(event) => onZoomChange(Number(event.target.value) / 100)}
          aria-label="Slide zoom"
          className="w-32 accent-ds-accent"
        />
        <Popover
          open={zoomMenuOpen}
          onClose={() => onZoomMenuOpenChange(false)}
          aria-label="Zoom presets"
          placement="top"
          className="w-16 p-1"
          trigger={
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={zoomMenuOpen}
              onClick={() => onZoomMenuOpenChange(!zoomMenuOpen)}
              className={`h-8 min-w-14 rounded-ds-md px-2 text-xs font-semibold tabular-nums text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              {zoomPercent}%
            </button>
          }
        >
          <div className="flex flex-col">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setZoomPercent(preset)}
                className={`rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${
                  preset === zoomPercent
                    ? "bg-ds-state-hover text-ds-text-primary"
                    : "text-ds-text-secondary"
                } ${FOCUS_RING}`}
              >
                {preset}%
              </button>
            ))}
            <div className="my-1 border-t border-ds-border-subtle" />
            <button
              type="button"
              onClick={() => setZoomPercent(100)}
              className={`rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              Fit
            </button>
          </div>
        </Popover>
      </div>
    </div>
  );
}

function SlideSizeControl({
  value,
  onChange,
}: {
  value: SlideFormat;
  onChange: (format: SlideFormat) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-1">
      <span className="px-1 text-xs font-medium text-ds-text-muted">Size</span>
      <div role="radiogroup" aria-label="Slide size" className="flex gap-0.5">
        {SLIDE_FORMATS.map((format) => {
          const active = value === format;
          const config = slideFormatConfig(format);
          return (
            <button
              key={format}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={config.label}
              onClick={() => onChange(format)}
              className={`rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              } ${FOCUS_RING}`}
            >
              {format}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A single icon button in a thumbnail's hover/focus action cluster
 * (move ↑/↓, duplicate, delete). Reuses the `VisualCard` hover-action pattern —
 * a round glass button revealed on group hover — but each is a real `<button>`
 * with an `aria-label` and a focus-visible ring so the rail's slide-management
 * actions are fully keyboard-accessible (issue #212).
 */
function ThumbnailAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-6 w-6 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-glass text-ds-text-muted shadow-sm backdrop-blur-sm transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:pointer-events-none disabled:opacity-40 ${FOCUS_RING}`}
    >
      {icon}
    </button>
  );
}

/**
 * Modal summary shown before a "Sync from document" merge is applied. Lists the
 * per-slide before/after effect (updated / appended / preserved) so the user
 * sees exactly what will change — and that no manual element work is discarded —
 * before confirming. Pure presentation: all merge logic lives in `deck-merge`.
 */
function MergeSummaryDialog({
  summary,
  onApply,
  onCancel,
}: {
  summary: MergeSummary;
  onApply: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const KIND_LABEL: Record<string, string> = {
    updated: "Updated",
    appended: "New",
    preserved: "Kept",
  };
  const hasChanges = summary.updatedCount > 0 || summary.appendedCount > 0;

  return createPortal(
    <div
      ref={dialogRef}
      data-floating-panel="true"
      role="dialog"
      aria-modal="true"
      aria-label="Sync from document"
      className="fixed inset-0 z-modal flex items-center justify-center bg-ds-backdrop p-4"
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-ds-lg border border-ds-border-subtle bg-ds-surface-base shadow-lg">
        <div className="flex items-center justify-between border-b border-ds-border-subtle px-5 py-4">
          <h3 className="text-sm font-semibold text-ds-text-primary">
            Sync from document
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel sync"
            className={`flex h-7 w-7 items-center justify-center rounded-ds-md text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-ds-border-subtle px-5 py-3 text-xs text-ds-text-secondary">
          <p>
            {summary.updatedCount} updated · {summary.appendedCount} new ·{" "}
            {summary.preservedCount} kept · {summary.preservedElementCount}{" "}
            element{summary.preservedElementCount === 1 ? "" : "s"} preserved
          </p>
          {!hasChanges ? (
            <p className="mt-1 text-ds-text-muted">
              This deck already matches the document.
            </p>
          ) : null}
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-ds-border-subtle overflow-y-auto px-5 py-2 text-xs">
          {summary.changes.map((change) => (
            <li
              key={`${change.kind}-${change.index}`}
              className="flex items-center gap-3 py-2"
            >
              <span
                className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  change.kind === "updated"
                    ? "bg-ds-warning-surface text-ds-warning-text"
                    : change.kind === "appended"
                      ? "bg-ds-success-surface text-ds-success-text"
                      : "bg-ds-state-hover text-ds-text-muted"
                }`}
              >
                {KIND_LABEL[change.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-ds-text-primary">
                {change.after.title || "(untitled slide)"}
              </span>
              <span className="shrink-0 text-ds-text-muted">
                {change.after.bulletCount} bullet
                {change.after.bulletCount === 1 ? "" : "s"}
                {change.elementsPreserved > 0
                  ? ` · ${change.elementsPreserved} kept`
                  : ""}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2 border-t border-ds-border-subtle px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className={`flex h-8 items-center rounded-ds-md border border-ds-border-subtle px-3 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!hasChanges}
            className={`flex h-8 items-center rounded-ds-md bg-ds-accent px-3 text-sm font-medium text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:opacity-60 ${FOCUS_RING}`}
          >
            Apply changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
