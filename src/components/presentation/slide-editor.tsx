"use client";

/**
 * Slide Editor — a full-page presentation editing surface.
 *
 * Opens over the whole viewport (portaled to `document.body`, `z-modal`) with a
 * current-object layout: a top toolbar for global actions, a slide rail
 * (reorder via HTML5 drag-and-drop, add / duplicate / delete), a large live
 * stage that renders the selected slide with the shared {@link SlideCanvas}, a
 * selected-object context toolbar, a right task panel (Slide / Text / Label /
 * Shape / Image / Adjust / Line / Arrange / Effects / Source / Notes / Layers), and a bottom dock (zoom /
 * notes / status). A theme picker lives in the top bar; arrow keys page between
 * slides (unless a field is focused), Escape closes.
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
  Copy,
  Edit3,
  FileText,
  Frame,
  Grid3x3,
  Keyboard,
  Plus,
  SwatchBook,
  RectangleHorizontal,
  Redo2,
  RefreshCw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { FOCUS_RING } from "@/components/ui/tokens";
import type { ActionResult } from "@/lib/action-result";
import { useFocusTrap } from "@/lib/presentation/use-focus-trap";
import { SlideCanvas } from "@/components/presentation/slide-canvas";
import { type SelectionMode } from "@/components/presentation/slide-stage-editor";
import {
  SlideEditorContext,
  type SlideEditorContextValue,
  SlideInspectorFromContext,
  SlideSelectionToolbarFromContext,
  SlideStageEditorFromContext,
} from "@/components/presentation/slide-editor/slide-editor-context";
import { VisualPicker } from "@/components/presentation/visual-picker";
import { IconButton, SelectMenu, Tooltip } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Popover } from "@/components/ui/popover";
import {
  computeStageLayout,
  DEFAULT_SCREEN_SIZE,
  type Size,
} from "@/lib/presentation/stage-fit";
import { makeElementId, type Deck } from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import {
  SLIDE_FORMATS,
  slideAspectRatio,
  slideFormatConfig,
} from "@/lib/presentation/slide-format";
import type { Visual } from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { resolveSlideThemeColors } from "@/lib/presentation/style-cascade";
import { resolveSaveErrorMessage } from "@/lib/presentation/save-status";
import {
  commitCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import { PresentationThemePanel } from "@/components/presentation/presentation-theme-panel";
import { GlobalMasterChromePanel } from "@/components/presentation/global-master-chrome-panel";
import { resolvePresentationThemeTokens } from "@/lib/presentation/presentation-theme";
import {
  applyGlobalMasterChromeUpdate,
  getGlobalMaster,
  readGlobalMasterChromeState,
  type GlobalMasterChromeUpdate,
} from "@/lib/presentation/global-master-chrome";
import {
  buildConnectorBetween,
  focusTargetAfterDelete,
  orderedElementIds,
  selectedConnectablePair,
} from "@/lib/presentation/canvas-a11y";
import { deriveSlideTitle } from "@/lib/presentation/slide-title";
import {
  isPanelAvailable,
  isSlideToolbarVisible,
  toToolbarSelectionKind,
} from "@/lib/presentation/slide-panel-ui";
import { slideReorderKeyDirection } from "@/lib/presentation/slide-reorder";
import { useDeckHistory } from "@/lib/presentation/use-deck-history";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
import { useSlideSourceLinkCommands } from "@/components/presentation/slide-editor/use-slide-source-link-commands";
import type { DocumentBlock, DocumentTextBlock } from "@/lib/content";
import {
  createTextResizeMeasurer,
  fitTextElementToContent,
} from "@/lib/presentation/text-element-fit";
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
import { useSlideElementCommands } from "@/components/presentation/slide-editor/use-slide-element-commands";
import { useSlideBackgroundCommands } from "@/components/presentation/slide-editor/use-slide-background-commands";
import { useSlideInsertCommands } from "@/components/presentation/slide-editor/use-slide-insert-commands";
import { useSlideManagementCommands } from "@/components/presentation/slide-editor/use-slide-management-commands";
import { KeyboardShortcutHelpDialog } from "@/components/presentation/slide-editor/keyboard-shortcut-help-dialog";
import { getThemePackage } from "@/lib/presentation/theme-packages";
import {
  bucketCount,
  bucketDurationMs,
  emitProductTelemetry,
} from "@/lib/telemetry/product";
import {
  MergeSummaryDialog,
  SlideBottomDock,
  SlideEditorTopToolbar,
  SlideRail,
  SlideToolbar,
  SlideTemplatePicker,
  ThumbnailAction,
} from "@/components/presentation/slide-editor/shell-components";
import {
  deckCanvasFormat,
  deckHasThemeOverrides,
  deckPresentationThemeId,
  slideAccentValue,
} from "@/components/presentation/v6-deck-ui";
import {
  elementContent,
  elementDesignOverrides,
  imageContent,
  shapeContent,
  visualContent,
} from "@/components/presentation/slide-canvas/v6-model";
import {
  buildInsertables,
  type Insertable,
} from "@/lib/presentation/document-insertable";

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
   * `source` link (issue #377); and passed to {@link useImageUpload} so uploaded
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
   * #377). Drives the stale-count badge on the sync action. Absent or zero
   * means no badge is rendered.
   */
  staleSourceLinkCount?: number;
}

const FLOATING_PANEL_STAGE_SHIFT_PX = 352;

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

function ToolbarIconTrigger({
  icon,
  label,
  open,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onClick: () => void;
  badge?: boolean;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onClick}
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-md border transition-colors ${
          open
            ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
            : "border-transparent text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
        } ${FOCUS_RING}`}
      >
        {icon}
        {badge ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ds-warning-text"
          />
        ) : null}
      </button>
    </Tooltip>
  );
}

/**
 * Shared shell for the deck-context controls in the top toolbar (Theme and
 * Deck chrome). Both read as outlined siblings of equal height so the row feels
 * like one cohesive group, while the primary "Add slide" action stays the only
 * filled button. `label` is optional so the same shell renders a labelled pill
 * (Theme) or a compact icon button (Deck chrome).
 */
function DeckContextButton({
  icon,
  label,
  srLabel,
  tooltip,
  open,
  onClick,
  badge,
  showChevron = false,
}: {
  icon: React.ReactNode;
  label?: string;
  srLabel: string;
  tooltip: string;
  open: boolean;
  onClick: () => void;
  badge?: boolean;
  showChevron?: boolean;
}) {
  return (
    <Tooltip label={tooltip} side="bottom">
      <button
        type="button"
        aria-label={srLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onClick}
        className={`relative flex h-9 shrink-0 items-center gap-1.5 rounded-ds-md border text-xs font-semibold transition-colors ${
          label ? "px-2.5" : "px-2"
        } ${
          open
            ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
            : "border-ds-border-subtle bg-ds-surface text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
        } ${FOCUS_RING}`}
      >
        {icon}
        {label ? <span className="max-w-[10rem] truncate">{label}</span> : null}
        {showChevron ? <ChevronDown size={13} aria-hidden="true" /> : null}
        {badge ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ds-warning-text"
          />
        ) : null}
      </button>
    </Tooltip>
  );
}

function TopToolbarMenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ds-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function TopToolbarMenuAction({
  icon,
  label,
  detail,
  onClick,
  disabled,
  active,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: "default" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-ds-danger-text hover:bg-ds-danger-surface"
      : tone === "warning"
        ? "text-ds-warning-text hover:bg-ds-warning-surface"
        : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex w-full items-center gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${FOCUS_RING}`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ds-sm bg-ds-accent-surface text-ds-accent-text">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{label}</span>
        {detail ? (
          <span className="block truncate text-[11px] font-normal text-ds-text-muted">
            {detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * Panel header row (icon chip + title + optional trailing note) shown at the
 * top of a toolbar popover, matching the prototype's `.phead`. Assumes the
 * parent panel uses `p-3`; the negative margins let the header span full width
 * with a divider below.
 */
function TopToolbarPanelHeader({
  icon,
  title,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  note?: React.ReactNode;
}) {
  return (
    <div className="-mx-3 -mt-3 mb-1 flex items-center gap-2.5 border-b border-ds-border-subtle px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ds-sm bg-ds-accent-surface text-ds-accent-text">
        {icon}
      </span>
      <span className="text-[13px] font-semibold text-ds-text-primary">
        {title}
      </span>
      {note ? (
        <span className="ml-auto truncate text-[11px] text-ds-text-muted">
          {note}
        </span>
      ) : null}
    </div>
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
  const [selectedSlideFrameId, setSelectedSlideFrameId] = useState<
    string | null
  >(null);
  // Keep the selection within bounds as slides are added/removed.
  const safeSelected = Math.min(selectedIndex, deck.slides.length - 1);
  const selectedSlide = deck.slides[safeSelected];
  const slideSelectionActive =
    selectedSlideFrameId !== null && selectedSlideFrameId === selectedSlide?.id;
  const selectedTheme = selectedSlide
    ? resolveSlideThemeColors(deck, selectedSlide)
    : resolveSlideThemeColors(deck, {
        id: "fallback",
        index: 0,
        title: "",
        notes: "",
        elements: [],
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
    setRightPanelTab,
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
    setInsertMenuOpen,
    setVisualPickerOpen,
    setThemeMenuOpen,
    themeOverridesOpen,
    setThemeOverridesOpen,
    sourceMenuOpen,
    setSourceMenuOpen,
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
  const [masterChromeOpen, setMasterChromeOpen] = useState(false);
  const [stageBounds, setStageBounds] = useState<Size>(DEFAULT_SCREEN_SIZE);
  const [stageInsets, setStageInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  const stageRef = useRef<HTMLDivElement>(null);
  // Focus-trap ref for the main editor dialog.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const replaceImageFileInputRef = useRef<HTMLInputElement>(null);
  const replaceImagePendingRef = useRef<{
    id: string;
    currentSrc: string;
  } | null>(null);
  const [replaceImagePending, setReplaceImagePending] = useState<{
    id: string;
    currentSrc: string;
  } | null>(null);
  const [replaceImageError, setReplaceImageError] = useState<string | null>(
    null,
  );
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
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

  // No fallback panel routing: when the selection changes so the active
  // right-panel tab no longer applies, close the panel instead of guessing a
  // replacement.
  useEffect(() => {
    if (!inspectorOpen && !inspectorSheetOpen) return;
    const elements = selectedSlide?.elements ?? [];
    const selectedElement =
      elements.find((element) => element.id === effectiveSelectedElementId) ??
      null;
    const selectedCount =
      effectiveSelectedElementIds.size > 0
        ? effectiveSelectedElementIds.size
        : selectedElement
          ? 1
          : 0;
    const kind =
      selectedCount >= 2 || !selectedElement
        ? null
        : toToolbarSelectionKind(
            selectedElement.kind,
            selectedElement.kind === "shape"
              ? shapeContent(selectedElement).shape
              : undefined,
          );
    if (
      !isPanelAvailable(rightPanelTab, {
        kind,
        selectedCount,
        hasSourceRef:
          (selectedElement as { source?: unknown } | null)?.source !==
          undefined,
      })
    ) {
      closeRightPanel();
    }
  }, [
    inspectorOpen,
    inspectorSheetOpen,
    rightPanelTab,
    effectiveSelectedElementId,
    effectiveSelectedElementIds,
    selectedSlide,
    closeRightPanel,
  ]);

  const deckFormat = deckCanvasFormat(deck);
  const activeSlideAspectRatio = slideAspectRatio(deckFormat);
  const stageLayout = computeStageLayout({
    stageBounds,
    stagePaddingTop: stageInsets.top,
    aspectRatio: activeSlideAspectRatio,
    zoom,
    inspectorOpen,
    inspectorShiftX: FLOATING_PANEL_STAGE_SHIFT_PX,
  });
  const renderedStageWidth = stageLayout.slide.width;
  const renderedStageHeight = stageLayout.slide.height;
  // Unzoomed fitted slide size, for hooks that map percent boxes to px.
  const fittedStageSize = {
    width: zoom > 0 ? renderedStageWidth / zoom : renderedStageWidth,
    height: zoom > 0 ? renderedStageHeight / zoom : renderedStageHeight,
  };

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
        const hasSourceLinkedElements = (slide.elements ?? []).some(
          (element) => (element as { source?: unknown }).source !== undefined,
        );
        if (!hasSourceLinkedElements || !slide.elements?.length) {
          return slide;
        }

        let slideChanged = false;
        const elements = slide.elements.map((element) => {
          if (element.kind !== "text") {
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
      const paddingTop = Number.parseFloat(style.paddingTop);
      const paddingRight = Number.parseFloat(style.paddingRight);
      const paddingBottom = Number.parseFloat(style.paddingBottom);
      const paddingLeft = Number.parseFloat(style.paddingLeft);
      const paddingX = paddingLeft + paddingRight;
      const paddingY = paddingTop + paddingBottom;
      setStageBounds({
        width: Math.max(1, rect.width - paddingX),
        height: Math.max(1, rect.height - paddingY),
      });
      setStageInsets((current) => {
        if (
          current.top === paddingTop &&
          current.right === paddingRight &&
          current.bottom === paddingBottom &&
          current.left === paddingLeft
        ) {
          return current;
        }
        return {
          top: paddingTop,
          right: paddingRight,
          bottom: paddingBottom,
          left: paddingLeft,
        };
      });
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { handleMove, handleDuplicate, handleRemove, handleNotesChange } =
    useSlideManagementCommands({
      deck,
      pendingPatchesRef,
      onDeckChange,
      setSelectedIndex,
    });

  const handleGlobalMasterChromeChange = useCallback(
    (update: GlobalMasterChromeUpdate) => {
      const master = getGlobalMaster(deck);
      if (!master) return;
      doCommitAndChange(deck, {
        type: "UPDATE_MASTER",
        masterId: master.id,
        patch: {
          elements: applyGlobalMasterChromeUpdate(master.elements, update),
        },
      });
    },
    [deck, doCommitAndChange],
  );

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
  }, [deck.slides.length, pendingPatchesRef, undo]);

  const handleRedo = useCallback(() => {
    clearPendingPatches(pendingPatchesRef);
    redo();
    emitProductTelemetry("product.editor.redo", {
      slideCount: deck.slides.length,
      surface: "slide-editor",
    });
  }, [deck.slides.length, pendingPatchesRef, redo]);

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

  const {
    dragIndex,
    dragOverIndex,
    dragPreview,
    railListRef,
    beginReorder,
    updateReorder,
    endReorder,
  } = useSlideRailController({
    deck,
    pendingPatchesRef,
    onDeckChange,
    setSelectedIndex,
    setVisualPickerOpen,
  });

  const handleSave = useCallback(() => {
    void flushSave();
  }, [flushSave]);

  const accentForSelected = selectedSlide
    ? (slideAccentValue(selectedSlide) ?? selectedTheme.accentColor)
    : selectedTheme.accentColor;

  const handleClearSelection = useCallback(() => {
    setSelectedSlideFrameId(null);
    setSelectedElementId(null);
    setSelectedElementIds((current) =>
      current.size === 0 ? current : new Set(),
    );
    closeRightPanel();
  }, [closeRightPanel, setSelectedElementId, setSelectedElementIds]);

  const syncSelectionPanelForIds = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) {
        closeRightPanel();
        return;
      }
      if (ids.size === 1) {
        const [id] = ids;
        const element = selectedSlide?.elements?.find(
          (candidate) => candidate.id === id,
        );
        if (element?.kind === "visual") {
          closeRightPanel();
          return;
        }
      }
      openSelectionPanel();
    },
    [closeRightPanel, openSelectionPanel, selectedSlide?.elements],
  );

  const handleSelectSlide = useCallback(() => {
    setSelectedSlideFrameId(selectedSlide?.id ?? null);
    setSelectedElementId(null);
    setSelectedElementIds((current) =>
      current.size === 0 ? current : new Set(),
    );
    closeRightPanel();
  }, [
    closeRightPanel,
    selectedSlide?.id,
    setSelectedElementId,
    setSelectedElementIds,
  ]);

  const handleSelectElement = useCallback(
    (id: string | null, mode: SelectionMode = "replace") => {
      if (id == null) {
        handleClearSelection();
        return;
      }
      setSelectedSlideFrameId(null);
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
        syncSelectionPanelForIds(next);
      } else if (mode === "keep") {
        // Make `id` the primary without disturbing an existing multi-selection
        // (used when starting a drag on an already-selected element).
        const next = selectedElementIds.has(id)
          ? selectedElementIds
          : new Set([id]);
        setSelectedElementId(id);
        setSelectedElementIds(next);
        syncSelectionPanelForIds(next);
      } else {
        // "replace": plain single selection.
        const next = new Set([id]);
        setSelectedElementId(id);
        setSelectedElementIds(next);
        syncSelectionPanelForIds(next);
      }
    },
    [
      handleClearSelection,
      selectedElementIds,
      setSelectedElementId,
      setSelectedElementIds,
      syncSelectionPanelForIds,
    ],
  );

  const selectedConnectorsPair = useMemo(
    () =>
      selectedSlide
        ? selectedConnectablePair(
            selectedSlide.elements ?? [],
            effectiveSelectedElementIds,
          )
        : null,
    [effectiveSelectedElementIds, selectedSlide],
  );

  const selectedElement = useMemo(() => {
    if (
      effectiveSelectedElementIds.size > 1 ||
      !effectiveSelectedElementId ||
      !selectedSlide?.elements
    ) {
      return null;
    }
    return (
      selectedSlide.elements.find(
        (element) => element.id === effectiveSelectedElementId,
      ) ?? null
    );
  }, [effectiveSelectedElementId, effectiveSelectedElementIds, selectedSlide]);

  const selectedSource =
    (
      selectedElement as {
        source?: { blockId?: string; blockKind?: string };
      } | null
    )?.source ?? null;

  const handleAddConnector = useCallback(() => {
    const slideId = selectedSlide?.id;
    if (!slideId || !selectedConnectorsPair) return;
    const id = makeElementId();
    doCommitAndChange(deck, {
      type: "ADD_ELEMENT",
      slideId,
      element: { ...buildConnectorBetween(...selectedConnectorsPair), id },
    });
    handleSelectElement(id);
    setInsertMenuOpen(false);
  }, [
    deck,
    doCommitAndChange,
    handleSelectElement,
    selectedConnectorsPair,
    selectedSlide?.id,
    setInsertMenuOpen,
  ]);

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
      setSelectedSlideFrameId(null);
      setSelectedElementIds(next);
      setSelectedElementId((primary) =>
        primary && next.has(primary) ? primary : ([...next][0] ?? null),
      );
      syncSelectionPanelForIds(next);
    },
    [
      selectedElementIds,
      setSelectedElementId,
      setSelectedElementIds,
      syncSelectionPanelForIds,
    ],
  );

  const {
    handleUpdateElement,
    handleSetElementBoxes,
    handleSetElementPatches,
    handleGroupElements,
    handleUngroupElements,
    handleRemoveElement,
    handleDuplicateElement,
    handleBringToFront,
    handleSendToBack,
    handleSetElementHidden,
    handleSetElementLocked,
    handleMoveElementZOrder,
    handleRenameElement,
    handleReorderElement,
    handleAlign,
    handleDistribute,
    handleMatchSize,
    handleArrange,
  } = useSlideElementCommands({
    deck,
    safeSelected,
    pendingPatchesRef,
    onDeckChange,
    doCommitAndChange,
    requestElementFocus,
    handleSelectElement,
    setSelectedElementId,
    setSelectedElementIds,
  });

  const handleDuplicateSelectedElements = useCallback(() => {
    const slideId = deck.slides[safeSelected]?.id;
    const elementIds = [...effectiveSelectedElementIds];
    if (!slideId || elementIds.length === 0) return;
    const { result, commitOptions, patches } = commitCommand(deck, {
      type: "DUPLICATE_ELEMENTS",
      slideId,
      elementIds,
    });
    if (!result.ok) return;
    appendPendingPatches(pendingPatchesRef, patches);
    onDeckChange(result.deck, commitOptions);
    const newIds = result.affectedElementIds.filter(
      (elementId) => !elementIds.includes(elementId),
    );
    if (newIds.length > 0) {
      setSelectedElementId(newIds[0] ?? null);
      setSelectedElementIds(new Set(newIds));
      requestElementFocus(newIds[0] ?? null);
    }
  }, [
    deck,
    effectiveSelectedElementIds,
    onDeckChange,
    pendingPatchesRef,
    requestElementFocus,
    safeSelected,
    setSelectedElementId,
    setSelectedElementIds,
  ]);

  const handleRemoveSelectedElements = useCallback(() => {
    const slideId = deck.slides[safeSelected]?.id;
    const elementIds = [...effectiveSelectedElementIds];
    if (!slideId || elementIds.length === 0) return;
    const ordered = orderedElementIds(
      deck.slides[safeSelected]?.elements ?? [],
    );
    const focusTarget = focusTargetAfterDelete(ordered, new Set(elementIds));
    const { result, commitOptions, patches } = commitCommand(deck, {
      type: "REMOVE_ELEMENTS",
      slideId,
      elementIds,
    });
    if (!result.ok) return;
    appendPendingPatches(pendingPatchesRef, patches);
    onDeckChange(result.deck, commitOptions);
    setSelectedElementId(focusTarget);
    setSelectedElementIds(focusTarget ? new Set([focusTarget]) : new Set());
    requestElementFocus(focusTarget);
  }, [
    deck,
    effectiveSelectedElementIds,
    onDeckChange,
    pendingPatchesRef,
    requestElementFocus,
    safeSelected,
    setSelectedElementId,
    setSelectedElementIds,
  ]);

  const handleReplaceImageAccept = useCallback(
    (src: string, assetId?: string) => {
      const target = replaceImagePendingRef.current;
      if (!target) return;
      replaceImagePendingRef.current = null;
      setReplaceImagePending(null);
      const image = (deck.slides[safeSelected]?.elements ?? []).find(
        (element) => element.id === target.id && element.kind === "image",
      );
      const currentContent =
        image?.kind === "image" ? elementContent(image) : {};
      handleUpdateElement(target.id, {
        content: {
          ...currentContent,
          kind: "image",
          src,
          ...(assetId ? { assetId } : {}),
        },
      } as ElementPatch);
      setReplaceImageError(null);
    },
    [deck.slides, handleUpdateElement, safeSelected],
  );

  const { handleFile: handleReplaceImageFile } = useImageUpload({
    deck,
    currentSrc: replaceImagePending?.currentSrc ?? "",
    onAccept: handleReplaceImageAccept,
    onError: (message) => {
      replaceImagePendingRef.current = null;
      setReplaceImagePending(null);
      setReplaceImageError(message);
    },
    documentId,
    uploadFn: documentId ? slideAssetPort?.uploadSlideAsset : undefined,
  });

  const handleReplaceSelectedImage = useCallback(
    (elementId: string) => {
      const image = (deck.slides[safeSelected]?.elements ?? []).find(
        (element) => element.id === elementId && element.kind === "image",
      );
      if (!image || image.kind !== "image") return;
      const target = {
        id: image.id,
        currentSrc: imageContent(image).src ?? "",
      };
      replaceImagePendingRef.current = target;
      setReplaceImagePending(target);
      setReplaceImageError(null);
      window.requestAnimationFrame(() =>
        replaceImageFileInputRef.current?.click(),
      );
    },
    [deck.slides, safeSelected],
  );

  const handleReplaceSelectedVisual = useCallback(
    (elementId: string) => {
      const visualRefs = [...visuals.keys()];
      const visual = (deck.slides[safeSelected]?.elements ?? []).find(
        (element) => element.id === elementId && element.kind === "visual",
      );
      if (!visual || visual.kind !== "visual") return;
      if (visualRefs.length < 2) {
        return;
      }
      const content = visualContent(visual);
      const currentIndex = Math.max(0, visualRefs.indexOf(content.visualId));
      const nextVisualId = visualRefs[(currentIndex + 1) % visualRefs.length];
      if (!nextVisualId || nextVisualId === content.visualId) return;
      handleUpdateElement(visual.id, {
        content: {
          ...elementContent(visual),
          kind: "visual",
          visualId: nextVisualId,
        },
      } as ElementPatch);
    },
    [deck.slides, handleUpdateElement, safeSelected, visuals],
  );

  const handleRestyleSelectedVisual = useCallback(
    (elementId: string) => {
      const visual = (deck.slides[safeSelected]?.elements ?? []).find(
        (element) => element.id === elementId && element.kind === "visual",
      );
      if (!visual || visual.kind !== "visual") return;
      const current = visualContent(visual);
      const currentIndex = current.styleThemeId
        ? STYLE_THEMES.findIndex((theme) => theme.id === current.styleThemeId)
        : -1;
      const nextTheme = STYLE_THEMES[(currentIndex + 1) % STYLE_THEMES.length];
      handleUpdateElement(visual.id, {
        designOverrides: {
          ...elementDesignOverrides(visual),
          ...(nextTheme?.id ? { styleThemeId: nextTheme.id } : {}),
        },
      } as ElementPatch);
    },
    [deck.slides, handleUpdateElement, safeSelected],
  );

  const {
    insertImageFileInputRef,
    handleInsertImageFile,
    insertImageError,
    handleAddTemplate,
    handleSpotlightPick,
    handleAddElement,
    handleAddTextElement,
    handleAddVisual,
    handleInsertDocumentVisual,
    handleInsertDocumentText,
    handleAddAllVisuals,
    documentTextInsertables,
  } = useSlideInsertCommands({
    deck,
    safeSelected,
    pendingPatchesRef,
    onDeckChange,
    doCommitAndChange,
    handleSelectElement,
    fittedStageSize,
    zoom,
    accentForSelected,
    visuals,
    documentTextBlocks,
    documentId,
    slideAssetPort,
    setInsertMenuOpen,
    setSpotlightPickerOpen,
    setAddTemplateOpen,
    setVisualPickerOpen,
    setSelectedIndex,
  });

  const documentVisualInsertables = useMemo(
    () =>
      buildInsertables(documentBlocks).filter(
        (item): item is Extract<Insertable, { kind: "visual" }> =>
          item.kind === "visual",
      ),
    [documentBlocks],
  );
  const documentVisualEntries = useMemo<readonly (readonly [string, Visual])[]>(
    () =>
      documentVisualInsertables.flatMap((item) => {
        const visual = visuals.get(item.visualId);
        return visual ? [[item.visualId, visual] as const] : [];
      }),
    [documentVisualInsertables, visuals],
  );
  const hasDocumentInsertables =
    documentTextInsertables.length > 0 || documentVisualEntries.length > 0;

  const {
    staleLinks,
    staleReasonByElementId,
    handleUpdateFromSource,
    handlePanelUpdateFromSource,
    handlePanelUnlinkElementSource,
    handlePanelRelinkElementSource,
    handleRemoveOrphaned,
  } = useSlideSourceLinkCommands({
    deck,
    doCommitAndChange,
    documentBlocks,
    staleSourceLinkCount,
  });

  const {
    handleBackgroundChange,
    handleAccentChange,
    handleBackgroundGradientChange,
    handleBackgroundImageChange,
    handleBackgroundAssetChange,
    handleSlideFormatChange,
    handleApplyPresentationTheme,
  } = useSlideBackgroundCommands({
    deck,
    safeSelected,
    pendingPatchesRef,
    onDeckChange,
    doCommitAndChange,
    setThemeMenuOpen,
  });

  const selectedStaleLink =
    effectiveSelectedElementId === null
      ? undefined
      : staleLinks.find(
          (link) => link.elementId === effectiveSelectedElementId,
        );
  const sourceStatusLabel =
    staleSourceLinkCount > 0
      ? `${staleSourceLinkCount} stale ${staleSourceLinkCount === 1 ? "link" : "links"}`
      : isDeckStale
        ? "Document changed"
        : canSyncFromDocument
          ? "Up to date"
          : "No live document source";

  const handleReviewStaleLinks = useCallback(() => {
    const [link] = staleLinks;
    if (!link) return;
    const slideIndex = deck.slides.findIndex(
      (slide) => slide.id === link.slideId,
    );
    if (slideIndex < 0) return;
    setSelectedIndex(slideIndex);
    setSelectedSlideFrameId(null);
    setSelectedElementId(link.elementId);
    setSelectedElementIds(new Set([link.elementId]));
    setRightPanelTab("source");
    openInspectorSurface();
    setSourceMenuOpen(false);
  }, [
    deck.slides,
    openInspectorSurface,
    setRightPanelTab,
    setSelectedElementId,
    setSelectedElementIds,
    setSourceMenuOpen,
    staleLinks,
  ]);

  const presentationThemeTokenSet = resolvePresentationThemeTokens(deck);
  const activeSlideKitName =
    getThemePackage(deckPresentationThemeId(deck))?.name ??
    presentationThemeTokenSet.name ??
    "Custom";
  const globalMasterChromeState = readGlobalMasterChromeState(deck);
  const hasGlobalMasterChrome =
    globalMasterChromeState.logo.enabled ||
    globalMasterChromeState.footer.enabled ||
    globalMasterChromeState.pageNumber.enabled ||
    globalMasterChromeState.watermark.enabled;
  const showSlideToolbar = selectedSlide
    ? slideSelectionActive &&
      isSlideToolbarVisible({
        selectedElementId: effectiveSelectedElementId,
        selectedCount: effectiveSelectedElementIds.size,
      })
    : false;

  const ctxValue: SlideEditorContextValue = {
    deck,
    visuals,
    safeSelected,
    selectedSlide,
    selectedTheme,
    slideSelected: slideSelectionActive,
    effectiveSelectedElementId,
    effectiveSelectedElementIds,
    handleSelectElement,
    handleSelectElements,
    handleSelectSlide,
    editingElementId,
    handleEditingElementChange: setEditingElementId,
    renderedStageWidth,
    renderedStageHeight,
    stageBounds,
    snapToGrid,
    focusRequest,
    liveMessage,
    brandSwatches,
    documentId,
    slideAssetPort,
    handleUpdateElement,
    handleSetElementBoxes,
    handleSetElementPatches,
    handleGroupElements,
    handleUngroupElements,
    handleRemoveElement,
    handleDuplicateElement,
    handleBringToFront,
    handleSendToBack,
    handleDuplicateSelectedElements,
    handleRemoveSelectedElements,
    handleReplaceSelectedImage,
    handleReplaceSelectedVisual,
    handleRestyleSelectedVisual,
    handleSetElementHidden,
    handleSetElementLocked,
    handleMoveElementZOrder,
    handleRenameElement,
    handleReorderElement,
    handleAlign,
    handleDistribute,
    handleMatchSize,
    handleArrange,
    handleCopyElements,
    handleCutElements,
    handlePasteElements,
    handleAddTextElement,
    canDelete: deck.slides.length > 1,
    handleDuplicateSlide: () => handleDuplicate(safeSelected),
    handleRemoveSlide: () => handleRemove(safeSelected),
    handleNotesChangeForSelected: (value, coalesceKey) =>
      handleNotesChange(safeSelected, value, coalesceKey),
    handleBackgroundChange,
    handleBackgroundGradientChange,
    handleBackgroundImageChange,
    handleBackgroundAssetChange,
    handleAccentChange,
    staleReasonByElementId,
    handlePanelUpdateFromSource,
    handlePanelUnlinkElementSource,
    handlePanelRelinkElementSource,
    rightPanelTab,
    setRightPanelTab,
    openRightPanel,
    closeRightPanel,
  };

  const handleStageAreaPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest('[data-slide-toolbar-anchor="true"]')
      ) {
        return;
      }
      handleClearSelection();
    },
    [handleClearSelection],
  );

  return createPortal(
    <SlideEditorContext.Provider value={ctxValue}>
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
        <input
          ref={replaceImageFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            handleReplaceImageFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <SlideEditorTopToolbar>
          <div className="hidden min-w-0 flex-1 sm:block" aria-hidden="true" />
          {selectedSlide ? (
            <div
              role="toolbar"
              aria-label="Slide editing tools"
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain whitespace-nowrap px-1 py-0 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-none [&::-webkit-scrollbar]:hidden"
            >
              <Popover
                open={themeOverridesOpen}
                onClose={() => setThemeOverridesOpen(false)}
                aria-label="Theme"
                align="start"
                portal
                layer="tooltip"
                className="w-auto p-2"
                trigger={
                  <DeckContextButton
                    icon={<SwatchBook size={15} aria-hidden="true" />}
                    label={activeSlideKitName}
                    srLabel="Choose theme"
                    tooltip="Choose theme"
                    open={themeOverridesOpen}
                    onClick={() => setThemeOverridesOpen((open) => !open)}
                    badge={deckHasThemeOverrides(deck)}
                    showChevron
                  />
                }
              >
                <PresentationThemePanel
                  themeId={deckPresentationThemeId(deck)}
                  onApplyThemePackage={(themePackageId) => {
                    handleApplyPresentationTheme(themePackageId);
                    setThemeOverridesOpen(false);
                  }}
                />
              </Popover>
              <Popover
                open={masterChromeOpen}
                onClose={() => setMasterChromeOpen(false)}
                aria-label="Deck chrome"
                align="start"
                portal
                layer="tooltip"
                className="w-auto p-0"
                trigger={
                  <DeckContextButton
                    icon={<Frame size={16} aria-hidden="true" />}
                    srLabel="Deck chrome"
                    tooltip="Deck chrome"
                    open={masterChromeOpen}
                    onClick={() => setMasterChromeOpen((open) => !open)}
                    badge={hasGlobalMasterChrome}
                  />
                }
              >
                <GlobalMasterChromePanel
                  deck={deck}
                  slide={selectedSlide}
                  visuals={visuals}
                  documentId={documentId}
                  slideAssetPort={slideAssetPort}
                  onChange={handleGlobalMasterChromeChange}
                />
              </Popover>
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
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-ds-md border border-transparent bg-ds-accent px-2.5 text-xs font-semibold text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover ${FOCUS_RING}`}
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add slide
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
                  <SlideTemplatePicker
                    deck={deck}
                    customTemplates={deck.customTemplates}
                    onPick={handleAddTemplate}
                  />
                )}
              </Popover>
              <div
                className="hidden h-5 w-px shrink-0 bg-ds-border-subtle sm:block"
                aria-hidden="true"
              />

              <SelectMenu
                aria-label="Slide ratio"
                tooltipLabel="Slide ratio"
                value={deckFormat}
                onChange={(next) =>
                  handleSlideFormatChange(
                    next as (typeof SLIDE_FORMATS)[number],
                  )
                }
                triggerIcon={
                  <RectangleHorizontal size={16} aria-hidden="true" />
                }
                buttonClassName="h-8"
                options={SLIDE_FORMATS.map((format) => ({
                  value: format,
                  label: format,
                  description: slideFormatConfig(format).label,
                  icon: <RectangleHorizontal size={15} aria-hidden="true" />,
                }))}
              />
              <div
                className="hidden h-5 w-px shrink-0 bg-ds-border-subtle sm:block"
                aria-hidden="true"
              />
              <Popover
                open={sourceMenuOpen}
                onClose={() => setSourceMenuOpen(false)}
                aria-label="Source"
                align="start"
                portal
                layer="tooltip"
                className="w-72 p-3"
                trigger={
                  <ToolbarIconTrigger
                    icon={<RefreshCw size={17} aria-hidden="true" />}
                    label="Document source"
                    open={sourceMenuOpen}
                    onClick={() => setSourceMenuOpen((open) => !open)}
                    badge={isDeckStale || staleLinks.length > 0}
                  />
                }
              >
                <div className="flex flex-col gap-3">
                  <TopToolbarPanelHeader
                    icon={<FileText size={16} aria-hidden="true" />}
                    title="Document source"
                  />
                  <TopToolbarMenuSection title="Document">
                    <div className="rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-secondary">
                      {sourceStatusLabel}
                    </div>
                    {canSyncFromDocument ? (
                      <TopToolbarMenuAction
                        icon={<RefreshCw size={15} aria-hidden="true" />}
                        label="Sync from document"
                        detail={
                          isDeckStale
                            ? "Merge the latest document changes"
                            : "Refresh the deck from the current document"
                        }
                        onClick={() => {
                          setSourceMenuOpen(false);
                          handleRequestSync();
                        }}
                        tone={isDeckStale ? "warning" : "default"}
                      />
                    ) : null}
                    {staleLinks.length > 0 ? (
                      <TopToolbarMenuAction
                        icon={<FileText size={15} aria-hidden="true" />}
                        label="Review stale links"
                        detail="Open the first stale source link"
                        onClick={handleReviewStaleLinks}
                        tone="warning"
                      />
                    ) : null}
                  </TopToolbarMenuSection>
                  {selectedSource && effectiveSelectedElementId ? (
                    <TopToolbarMenuSection title="Selected Source">
                      <div className="rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-secondary">
                        {selectedSource.blockKind === "visual"
                          ? "Visual"
                          : "Text"}{" "}
                        · {selectedSource.blockId?.slice(0, 8) ?? "linked"}
                      </div>
                      {selectedStaleLink?.reason === "content_changed" ? (
                        <TopToolbarMenuAction
                          icon={<RefreshCw size={15} aria-hidden="true" />}
                          label="Refresh selected source"
                          onClick={() => {
                            handleUpdateFromSource(selectedStaleLink);
                            setSourceMenuOpen(false);
                          }}
                        />
                      ) : null}
                      <TopToolbarMenuAction
                        icon={<FileText size={15} aria-hidden="true" />}
                        label="Open source panel"
                        onClick={() => {
                          openRightPanel("source");
                          setSourceMenuOpen(false);
                        }}
                      />
                      <TopToolbarMenuAction
                        icon={<FileText size={15} aria-hidden="true" />}
                        label="Unlink selected source"
                        onClick={() => {
                          handlePanelUnlinkElementSource(
                            effectiveSelectedElementId,
                          );
                          setSourceMenuOpen(false);
                        }}
                      />
                      {selectedStaleLink?.reason === "block_missing" ? (
                        <TopToolbarMenuAction
                          icon={<Trash2 size={15} aria-hidden="true" />}
                          label="Remove orphaned source element"
                          onClick={() => {
                            handleRemoveOrphaned(selectedStaleLink);
                            setSourceMenuOpen(false);
                          }}
                          tone="danger"
                        />
                      ) : null}
                    </TopToolbarMenuSection>
                  ) : null}
                </div>
              </Popover>
              <div
                className="hidden h-5 w-px shrink-0 bg-ds-border-subtle sm:block"
                aria-hidden="true"
              />
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
                  <Grid3x3 aria-hidden className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              <Tooltip label="Keyboard shortcuts" side="bottom">
                <IconButton
                  aria-label="Keyboard shortcuts"
                  size="sm"
                  variant="plain"
                  active={keyboardHelpOpen}
                  onClick={() => setKeyboardHelpOpen(true)}
                >
                  <Keyboard aria-hidden className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            </div>
          ) : null}

          <div className="flex shrink-0 items-center justify-end gap-1.5 sm:min-w-0 sm:flex-1">
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
              <div
                ref={stageRef}
                onPointerDown={handleStageAreaPointerDown}
                className={`relative min-h-0 flex-1 overscroll-contain px-4 py-2 sm:px-5 sm:py-3 ${
                  stageLayout.needsScroll ? "overflow-auto" : "overflow-hidden"
                }`}
              >
                <div
                  className="relative shrink-0"
                  style={{
                    boxSizing: "border-box",
                    width: stageLayout.scrollContentSize.width,
                    height: stageLayout.scrollContentSize.height,
                  }}
                >
                  {selectedSlide ? (
                    <div
                      data-slide-toolbar-anchor="true"
                      className="absolute transition-[left,top,width,height] duration-200 ease-out motion-reduce:transition-none"
                      style={{
                        left: stageLayout.slide.left,
                        top: stageLayout.slide.top,
                        width: renderedStageWidth,
                        height: renderedStageHeight,
                      }}
                    >
                      {showSlideToolbar ? (
                        <SlideToolbar
                          slide={selectedSlide}
                          canDelete={deck.slides.length > 1}
                          onBackgroundChange={handleBackgroundChange}
                          onBackgroundGradientChange={
                            handleBackgroundGradientChange
                          }
                          onAddElement={handleAddElement}
                          visuals={visuals}
                          imageError={insertImageError ?? replaceImageError}
                          onPickVisual={handleAddVisual}
                          canAddConnector={selectedConnectorsPair !== null}
                          onAddConnector={handleAddConnector}
                          documentVisualEntries={documentVisualEntries}
                          documentTextInsertables={documentTextInsertables}
                          documentVisualInsertables={documentVisualInsertables}
                          hasDocumentInsertables={hasDocumentInsertables}
                          onAddAllVisuals={handleAddAllVisuals}
                          onInsertDocumentVisual={handleInsertDocumentVisual}
                          onInsertDocumentText={handleInsertDocumentText}
                          onDuplicateSlide={() => handleDuplicate(safeSelected)}
                          onRemoveSlide={() => handleRemove(safeSelected)}
                          onOpenPanel={() => openRightPanel("slide")}
                          onOpenNotes={() => openRightPanel("notes")}
                          onOpenLayers={() => openRightPanel("layers")}
                        />
                      ) : null}
                      <SlideSelectionToolbarFromContext />
                      <SlideStageEditorFromContext
                        width={renderedStageWidth}
                        height={renderedStageHeight}
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
            {selectedSlide && inspectorOpen ? (
              <SlideInspectorFromContext
                key={`panel-${rightPanelTab}`}
                initialTab={rightPanelTab}
                onClose={closeRightPanel}
                className="absolute right-4 z-panel box-border hidden w-80 flex-col overflow-y-auto overflow-x-hidden rounded-ds-lg border border-ds-border-subtle bg-ds-surface-overlay shadow-ds-overlay lg:flex"
                style={{
                  top: stageLayout.inspectorPanel.top,
                  height: stageLayout.inspectorPanel.height,
                }}
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
                      onPointerMove={(event) => updateReorder(event)}
                      onPointerUp={(event) => endReorder(event)}
                      onPointerCancel={(event) => endReorder(event)}
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
                rightPanelTab === "notes" &&
                (inspectorOpen || inspectorSheetOpen)
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
        {selectedSlide ? (
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
                    <SlideInspectorFromContext
                      key={`sheet-panel-${rightPanelTab}`}
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
      </div>
    </SlideEditorContext.Provider>,
    document.body,
  );
}

/**
 * Template picker shown from the top-toolbar Add popover. Lists each
 * {@link SLIDE_TEMPLATES} option; picking one inserts an authored slide via the
 * caller (routed through the undo/redo `commit` path).
 */
