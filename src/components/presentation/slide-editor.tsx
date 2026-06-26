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
  ChevronUp,
  ChevronDown,
  Circle,
  Copy,
  Edit3,
  FileText,
  Grid3x3,
  Image as ImageIcon,
  Keyboard,
  List,
  Minus,
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
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { FOCUS_RING } from "@/components/ui/tokens";
import type { ActionResult } from "@/lib/action-result";
import { useFocusTrap } from "@/lib/presentation/use-focus-trap";
import { SlideCanvas } from "@/components/presentation/slide-canvas";
import {
  SlideInspector,
  type AddElementKind,
} from "@/components/presentation/slide-inspector";
import {
  SlideStageEditor,
  type SelectionMode,
} from "@/components/presentation/slide-stage-editor";
import { VisualPicker } from "@/components/presentation/visual-picker";
import { IconButton, Tooltip } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Popover } from "@/components/ui/popover";
import {
  DEFAULT_SCREEN_SIZE,
  fitAspectRatio,
  type Size,
} from "@/lib/presentation/stage-fit";
import {
  buildVisualElement,
  DEFAULT_VISUAL_BOX,
  makeElementId,
  type Deck,
  type DeckTheme,
  type ElementBox,
  type ShapeKind,
  type SlideElement,
  type SlideLayout as ReusableSlideLayout,
} from "@/lib/presentation/deck";
import {
  resolveSlideFormat,
  slideAspectRatio,
  type SlideFormat,
} from "@/lib/presentation/slide-format";
import type { Visual } from "@/lib/visual/schema";
import {
  buildTemplateSlide,
  TEMPLATE_IMAGE_PLACEHOLDER_SRC,
  type SlideTemplateKind,
} from "@/lib/presentation/slide-templates";
import { resolveSlideThemeColors } from "@/lib/presentation/style-cascade";
import { resolveSaveErrorMessage } from "@/lib/presentation/save-status";
import {
  commitCommand,
  executeCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import { DeckTemplatePanel } from "@/components/presentation/deck-template-panel";
import { resolveDeckThemeTokens } from "@/lib/presentation/deck-theme-tokens";
import type { DeckTemplatePatch } from "@/lib/presentation/deck-mutations";
import {
  canvasShortcutHelp,
  focusTargetAfterDelete,
  orderedElementIds,
} from "@/lib/presentation/canvas-a11y";
import {
  addElement,
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
import { shouldCollapseToolbar } from "@/lib/presentation/slide-panel-ui";
import { slideReorderKeyDirection } from "@/lib/presentation/slide-reorder";
import { useDeckHistory } from "@/lib/presentation/use-deck-history";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
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
import type { DocumentBlock, DocumentTextBlock } from "@/lib/content";
import {
  createTextResizeMeasurer,
  fitTextElementToContent,
  type TextLikeElement,
} from "@/lib/presentation/text-element-fit";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";
import { assertNever } from "@/lib/assert-never";
import { useSlideSelection } from "@/components/presentation/slide-editor/use-slide-selection";
import { useSlideClipboard } from "@/components/presentation/slide-editor/use-slide-clipboard";
import type { SlideAssetActionPort } from "@/lib/action-ports";
import {
  appendPendingPatches,
  clearPendingPatches,
  useSlideEditorCommit,
} from "@/components/presentation/slide-editor/use-slide-editor-commit";
import { useSlideEditorAutosaveQueue } from "@/components/presentation/slide-editor/use-slide-editor-autosave-queue";
import { useSlideEditorShell } from "@/components/presentation/slide-editor/use-slide-editor-shell";
import { useSlideRailController } from "@/components/presentation/slide-editor/use-slide-rail-controller";
import { useSlideEditorKeyboardController } from "@/components/presentation/slide-editor/use-slide-keyboard-controller";
import {
  bucketCount,
  bucketDurationMs,
  emitProductTelemetry,
} from "@/lib/telemetry/product";
import {
  BackgroundThemePanel,
  FromDocumentPanel,
  InsertMenuButton,
  MergeSummaryDialog,
  SlideBottomDock,
  SlideEditorTopToolbar,
  SlideRail,
  SlideSelectionToolbar,
  SlideSizeControl,
  SlideTemplatePicker,
  ThumbnailAction,
} from "@/components/presentation/slide-editor/shell-components";

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
  slideAssetPort?: SlideAssetActionPort;
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

const FLOATING_PANEL_STAGE_RESERVE_PX = 352;

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
    default:
      return assertNever(element);
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

function CloseConfirmDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onCancel}
      aria-labelledby="slide-editor-close-confirm-title"
      className="max-w-sm"
    >
      <h2
        id="slide-editor-close-confirm-title"
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
          className="flex h-9 items-center justify-center rounded-full border border-ds-border-strong px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex h-9 items-center justify-center rounded-full bg-ds-danger px-4 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90"
        >
          Discard changes
        </button>
      </div>
    </Dialog>
  );
}

function ResetLayoutConfirmDialog({
  layoutName,
  onCancel,
  onConfirm,
}: {
  layoutName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onCancel}
      aria-labelledby="slide-editor-reset-layout-confirm-title"
      className="max-w-sm"
    >
      <h2
        id="slide-editor-reset-layout-confirm-title"
        className="text-base font-semibold text-ds-text-primary"
      >
        Reset to &ldquo;{layoutName}&rdquo; layout?
      </h2>
      <p className="mt-2 text-sm text-ds-text-secondary">
        Slide positions will be reset. This will preserve slide content and
        element order.
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 items-center justify-center rounded-full border border-ds-border-strong px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex h-9 items-center justify-center rounded-full bg-ds-accent px-4 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90"
        >
          Reset layout
        </button>
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
  slideAssetPort,
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
  const openedAtRef = useRef(0);
  const loadReportedRef = useRef(false);
  const firstRenderReportedRef = useRef(false);

  const [selectedIndex, setSelectedIndex] = useState(0);
  // Keep the selection within bounds as slides are added/removed.
  const safeSelected = Math.min(selectedIndex, deck.slides.length - 1);
  const selectedSlide = deck.slides[safeSelected];
  const selectedTheme = selectedSlide
    ? resolveSlideThemeColors(deck, selectedSlide)
    : resolveSlideThemeColors(deck, {
        id: "fallback",
        index: 0,
        title: "",
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
      });
  const {
    selectedElementIds,
    setSelectedElementId,
    setSelectedElementIds,
    effectiveSelectedElementId,
    effectiveSelectedElementIds,
    clearSelection,
  } = useSlideSelection(selectedSlide?.elements);
  const { pendingPatchesRef, doCommitAndChange } =
    useSlideEditorCommit(onDeckChange);
  const {
    railOpen,
    railContentMounted,
    setRailContentMounted,
    handleToggleRail,
    inspectorOpen,
    inspectorSheetOpen,
    setInspectorSheetOpen,
    openInspectorSurface,
    closeRightPanel,
    rightPanelTab,
    openRightPanel,
    openSelectionPanel,
    zoom,
    zoomMenuOpen,
    setZoomMenuOpen,
    handleZoomChange,
    addTemplateOpen,
    setAddTemplateOpen,
    spotlightPickerOpen,
    setSpotlightPickerOpen,
    insertMenuOpen,
    setInsertMenuOpen,
    visualPickerOpen,
    setVisualPickerOpen,
    fromDocOpen,
    setFromDocOpen,
    themeMenuOpen,
    setThemeMenuOpen,
    deckTemplateOpen,
    setDeckTemplateOpen,
    mergePreview,
    canSyncFromDocument,
    showStaleBanner,
    handleRequestSync,
    handleCancelSync,
    handleApplySync,
    handleDismissStale,
  } = useSlideEditorShell({
    deck,
    freshDeck,
    isDeckStale,
    pendingPatchesRef,
    onDeckChange,
  });
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [stageBounds, setStageBounds] = useState<Size>(DEFAULT_SCREEN_SIZE);

  const stageRef = useRef<HTMLDivElement>(null);
  // Focus-trap ref for the main editor dialog.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  // Hidden file input for the Insert ▸ Image one-step picker flow (#299).
  const insertImageFileInputRef = useRef<HTMLInputElement>(null);
  // Element ID of the pending Insert ▸ Image pick session. Cleared by onAccept
  // (file chosen) and onError (validation failure) so the cancel-fallback
  // knows whether to insert the empty placeholder.
  const insertImagePendingIdRef = useRef<string | null>(null);
  const [insertImageError, setInsertImageError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [pendingResetLayout, setPendingResetLayout] =
    useState<ReusableSlideLayout | null>(null);
  const {
    flushSave,
    saveStatus,
    saveStatusLabel,
    saveErrorMessage,
    hasUnsavedWork,
  } = useSlideEditorAutosaveQueue({ deck, onSave, pendingPatchesRef });

  useEffect(() => {
    if (saveStatus !== "error") {
      return;
    }
    emitProductTelemetry("product.editor.error.visible", {
      errorCode: saveErrorMessage ? "SLIDE_SAVE_FAILED" : "UNKNOWN",
      surface: "slide-editor",
    });
  }, [saveErrorMessage, saveStatus]);

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

  // Confirm before closing with unsaved work so edits are never lost silently.
  const handleRequestClose = useCallback(() => {
    if (hasUnsavedWork) {
      setCloseConfirmOpen(true);
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

  useEffect(() => {
    if (loadReportedRef.current) {
      return;
    }
    loadReportedRef.current = true;
    openedAtRef.current = performance.now();
    emitProductTelemetry("product.editor.load.timing", {
      durationBucket: bucketDurationMs(performance.now() - openedAtRef.current),
      slideCount: deck.slides.length,
      surface: "slide-editor",
      visualCountBucket: bucketCount(visuals.size),
    });
  }, [deck.slides.length, visuals.size]);

  useEffect(() => {
    if (firstRenderReportedRef.current || !selectedSlide) {
      return;
    }
    firstRenderReportedRef.current = true;
    emitProductTelemetry("product.editor.render.timing", {
      durationBucket: bucketDurationMs(performance.now() - openedAtRef.current),
      elementCountBucket: bucketCount(selectedSlide.elements?.length ?? 0),
      slideCount: deck.slides.length,
      surface: "slide-editor",
    });
  }, [deck.slides.length, selectedSlide]);

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

  const handleSlideFormatChange = useCallback(
    (slideFormat: SlideFormat) => {
      const startedAt = performance.now();
      doCommitAndChange(deck, { type: "SET_DECK_FORMAT", slideFormat });
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "set_deck_format",
        durationBucket: bucketDurationMs(performance.now() - startedAt),
        slideCount: deck.slides.length,
        surface: "slide-editor",
      });
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
        emitProductTelemetry("product.editor.command.succeeded", {
          commandName: "apply_deck_solid_background",
          elementCountBucket: bucketCount(patches.length),
          slideCount: nextDeck.slides.length,
          surface: "slide-editor",
        });
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
        emitProductTelemetry("product.editor.command.succeeded", {
          commandName: "apply_deck_gradient_background",
          elementCountBucket: bucketCount(patches.length),
          slideCount: nextDeck.slides.length,
          surface: "slide-editor",
        });
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
        slideFormat: deck.slideFormat,
      });
      const next = insertSlide(deck, safeSelected, slide);
      clearPendingPatches(pendingPatchesRef);
      onDeckChange(next);
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "add_template_slide",
        slideCount: next.slides.length,
        surface: "slide-editor",
      });
      setSelectedIndex(Math.min(safeSelected + 1, next.slides.length - 1));
      setAddTemplateOpen(false);
    },
    [deck, onDeckChange, safeSelected, visuals],
  );

  const handleSpotlightPick = useCallback(
    (visualId: string) => {
      const slide = buildTemplateSlide("visual", {
        slideFormat: deck.slideFormat,
        visualId,
      });
      const next = insertSlide(deck, safeSelected, slide);
      clearPendingPatches(pendingPatchesRef);
      onDeckChange(next);
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "add_visual_spotlight_slide",
        slideCount: next.slides.length,
        surface: "slide-editor",
      });
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
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "move_slide",
        slideCount: result.deck.slides.length,
        surface: "slide-editor",
      });
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
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "duplicate_slide",
        slideCount: result.deck.slides.length,
        surface: "slide-editor",
      });
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
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "remove_slide",
        slideCount: result.deck.slides.length,
        surface: "slide-editor",
      });
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
      clearSelection();
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleResetReusableLayout = useCallback(
    (layout: ReusableSlideLayout) => {
      setPendingResetLayout(layout);
    },
    [],
  );

  const handleConfirmResetLayout = useCallback(() => {
    if (!pendingResetLayout) return;
    if (!deck.slides[safeSelected]) {
      setPendingResetLayout(null);
      return;
    }
    doCommitAndChange(deck, {
      type: "RESET_SLIDE_LAYOUT",
      slideIndex: safeSelected,
      layout: pendingResetLayout,
    });
    clearSelection();
    setPendingResetLayout(null);
  }, [
    pendingResetLayout,
    deck,
    doCommitAndChange,
    safeSelected,
    clearSelection,
  ]);

  const {
    copyElementsToClipboard,
    pasteClipboardElements,
    handleCopyElements,
    handleCutElements,
    handlePasteElements,
  } = useSlideClipboard({
    deck,
    safeSelected,
    effectiveSelectedElementId,
    effectiveSelectedElementIds,
    pendingPatchesRef,
    onDeckChange,
    doCommitAndChange,
    setSelectedElementId,
    setSelectedElementIds,
  });

  const handleUndo = useCallback(() => {
    clearPendingPatches(pendingPatchesRef);
    undo();
    emitProductTelemetry("product.editor.undo", {
      slideCount: deck.slides.length,
      surface: "slide-editor",
    });
  }, [deck.slides.length, undo]);

  const handleRedo = useCallback(() => {
    clearPendingPatches(pendingPatchesRef);
    redo();
    emitProductTelemetry("product.editor.redo", {
      slideCount: deck.slides.length,
      surface: "slide-editor",
    });
  }, [deck.slides.length, redo]);

  const {
    focusRequest,
    liveMessage,
    keyboardHelpOpen,
    setKeyboardHelpOpen,
    requestElementFocus,
  } = useSlideEditorKeyboardController({
    deck,
    safeSelected,
    effectiveSelectedElementId,
    effectiveSelectedElementIds,
    inspectorSheetOpen,
    setInspectorSheetOpen,
    setSelectedElementId,
    setSelectedElementIds,
    setSelectedIndex,
    clearSelection,
    copyElementsToClipboard,
    pasteClipboardElements,
    pendingPatchesRef,
    onDeckChange,
    doCommitAndChange,
    handleUndo,
    handleRedo,
    handleRequestClose,
  });

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

  const { dragIndex, dragOverIndex, dragPreview, railListRef, beginReorder } =
    useSlideRailController({
      deck,
      pendingPatchesRef,
      onDeckChange,
      setSelectedIndex,
      setVisualPickerOpen,
    });

  const handleSave = useCallback(() => {
    void flushSave();
  }, [flushSave]);

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
    uploadFn: documentId ? slideAssetPort?.uploadSlideAsset : undefined,
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

  // Applies a built-in theme preset cleanly. `SET_DECK_THEME` owns clearing any
  // custom token set, so built-in preset selection is one deck-theme command.
  const handleApplyDeckTheme = useCallback(
    (themeId: DeckTheme) => {
      doCommitAndChange(deck, { type: "SET_DECK_THEME", themeId });
    },
    [deck, doCommitAndChange],
  );

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
  const deckTemplateTokenSet = resolveDeckThemeTokens(deck);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Slide editor"
      className="tiq-full-viewport fixed inset-0 z-modal flex flex-col bg-ds-surface-base"
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
      <SlideEditorTopToolbar slideCount={deck.slides.length}>
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
                themeId={deck.themeId}
                onUpdate={handleUpdateDeckTemplate}
                onReset={handleResetDeckTemplate}
                onApplyTheme={handleApplyDeckTheme}
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
            {saveStatus !== "error" ? saveStatusLabel : null}
          </span>

          {saveStatus === "error" ? (
            <button
              type="button"
              onClick={handleSave}
              title={resolveSaveErrorMessage(saveErrorMessage)}
              aria-label={`${resolveSaveErrorMessage(saveErrorMessage)} — Retry`}
              className={`flex h-8 items-center rounded-ds-md border border-ds-danger-border bg-ds-danger-surface px-2.5 text-sm font-medium text-ds-danger-text transition-opacity hover:opacity-90 ${FOCUS_RING}`}
            >
              {saveStatusLabel}
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
            disabled={saveStatus === "saving"}
            className={`flex h-8 shrink-0 items-center rounded-ds-md bg-ds-accent px-3 text-sm font-medium text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:opacity-60 ${FOCUS_RING}`}
          >
            {saveStatus === "saving" ? "Saving…" : "Save"}
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
      </SlideEditorTopToolbar>

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
                deck={deck}
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
              className="relative min-h-0 flex-1 overscroll-contain overflow-auto px-4 py-2 sm:px-5 sm:py-3"
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
              slideAssetPort={slideAssetPort}
              initialTab={rightPanelTab}
              onClose={closeRightPanel}
              className="absolute bottom-4 right-4 top-4 z-panel hidden w-80 flex-col overflow-y-auto overflow-x-hidden rounded-ds-lg border border-ds-border-subtle bg-ds-surface-overlay shadow-ds-overlay lg:flex"
            />
          ) : null}
        </div>

        <SlideRail
          open={railOpen}
          contentMounted={railContentMounted}
          onClosedTransitionEnd={() => setRailContentMounted(false)}
        >
          <ul ref={railListRef} className="flex flex-row gap-1.5">
            {deck.slides.map((slide, index) => {
              const selected = index === safeSelected;
              const dropTarget = dragOverIndex === index && dragIndex !== index;
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
                      if (nextIndex < 0 || nextIndex >= deck.slides.length) {
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
                        deck={deck}
                        visuals={visuals}
                        preview
                      />
                      <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-ds-sm bg-ds-surface-overlay px-1 text-[11px] font-semibold tabular-nums text-ds-text-secondary shadow-sm ring-1 ring-ds-border-subtle">
                        {index + 1}
                      </span>
                    </span>
                  </button>

                  <div className="tiq-coarse-actions absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
        </SlideRail>

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
            className={`tiq-safe-fab fixed z-modal flex h-12 w-12 items-center justify-center rounded-full bg-ds-accent text-ds-text-on-accent shadow-ds-overlay transition-colors hover:bg-ds-accent-hover ${FOCUS_RING}`}
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
                  className="tiq-mobile-sheet fixed inset-x-0 bottom-0 z-modal flex flex-col overflow-hidden rounded-t-2xl border-t border-ds-border-subtle bg-ds-surface-base shadow-ds-popover"
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
                      className={`tiq-touch-target flex h-7 w-7 items-center justify-center rounded-full text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <SlideInspector
                    key={`sheet-panel-${rightPanelTab}`}
                    {...inspectorProps}
                    documentId={documentId}
                    slideAssetPort={slideAssetPort}
                    initialTab={rightPanelTab}
                    className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden"
                  />
                </div>
              </FocusTrapped>
            </>
          ) : null}
        </div>
      ) : null}
      {closeConfirmOpen && (
        <CloseConfirmDialog
          onCancel={() => setCloseConfirmOpen(false)}
          onConfirm={() => {
            setCloseConfirmOpen(false);
            onClose();
          }}
        />
      )}
      {pendingResetLayout && (
        <ResetLayoutConfirmDialog
          layoutName={pendingResetLayout.name}
          onCancel={() => setPendingResetLayout(null)}
          onConfirm={handleConfirmResetLayout}
        />
      )}
    </div>,
    document.body,
  );
}

/**
 * Template picker shown from the top-toolbar Add popover. Lists each
 * {@link SLIDE_TEMPLATES} option; picking one inserts an authored slide via the
 * caller (routed through the undo/redo `commit` path).
 */
