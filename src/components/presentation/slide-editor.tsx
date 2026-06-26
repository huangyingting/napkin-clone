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
  Copy,
  Edit3,
  Grid3x3,
  Image as ImageIcon,
  Keyboard,
  List,
  Plus,
  Redo2,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
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
import { type SelectionMode } from "@/components/presentation/slide-stage-editor";
import {
  SlideEditorContext,
  type SlideEditorContextValue,
  SlideInspectorFromContext,
  SlideSelectionToolbarFromContext,
  SlideStageEditorFromContext,
} from "@/components/presentation/slide-editor/slide-editor-context";
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
  defaultLayouts,
  type Deck,
  type SlideElement,
} from "@/lib/presentation/deck";
import {
  resolveSlideFormat,
  slideAspectRatio,
} from "@/lib/presentation/slide-format";
import type { Visual } from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { resolveSlideThemeColors } from "@/lib/presentation/style-cascade";
import { resolveSaveErrorMessage } from "@/lib/presentation/save-status";
import {
  commitCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import { DeckTemplatePanel } from "@/components/presentation/deck-template-panel";
import { resolveDeckThemeTokens } from "@/lib/presentation/deck-theme-tokens";
import {
  canvasShortcutHelp,
  focusTargetAfterDelete,
  orderedElementIds,
} from "@/lib/presentation/canvas-a11y";
import { deriveSlideTitle } from "@/lib/presentation/slide-title";
import { isSlideToolbarVisible } from "@/lib/presentation/slide-panel-ui";
import { slideReorderKeyDirection } from "@/lib/presentation/slide-reorder";
import { useDeckHistory } from "@/lib/presentation/use-deck-history";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
import { useSlideSourceLinkCommands } from "@/components/presentation/slide-editor/use-slide-source-link-commands";
import type { DocumentBlock, DocumentTextBlock } from "@/lib/content";
import {
  createTextResizeMeasurer,
  fitTextElementToContent,
} from "@/lib/presentation/text-element-fit";
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
import { useSlideElementCommands } from "@/components/presentation/slide-editor/use-slide-element-commands";
import { useSlideBackgroundCommands } from "@/components/presentation/slide-editor/use-slide-background-commands";
import { useSlideInsertCommands } from "@/components/presentation/slide-editor/use-slide-insert-commands";
import { useSlideManagementCommands } from "@/components/presentation/slide-editor/use-slide-management-commands";
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
   * #377). Drives the stale-count badge on the sync action. Absent or zero
   * means no badge is rendered.
   */
  staleSourceLinkCount?: number;
}

const FLOATING_PANEL_STAGE_RESERVE_PX = 352;

function slideElementTypeLabel(element: SlideElement): string {
  switch (element.kind) {
    case "text":
      return element.textRole === "h1" ? "Title" : "Text";
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
    inspectorMode,
    setInspectorMode,
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
    visualPickerOpen,
    setVisualPickerOpen,
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
  const [canvasAddOpen, setCanvasAddOpen] = useState(false);
  const [canvasAddVisualOpen, setCanvasAddVisualOpen] = useState(false);
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

  const {
    pendingResetLayout,
    setPendingResetLayout,
    handleMove,
    handleDuplicate,
    handleRemove,
    handleNotesChange,
    handleApplyReusableLayout,
    handleResetReusableLayout,
    handleConfirmResetLayout,
  } = useSlideManagementCommands({
    deck,
    safeSelected,
    pendingPatchesRef,
    onDeckChange,
    doCommitAndChange,
    clearSelection,
    setSelectedIndex,
  });

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
    [
      closeRightPanel,
      openSelectionPanel,
      selectedElementIds,
      setSelectedElementId,
      setSelectedElementIds,
    ],
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
    [
      closeRightPanel,
      openSelectionPanel,
      selectedElementIds,
      setSelectedElementId,
      setSelectedElementIds,
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
      handleUpdateElement(target.id, {
        src,
        assetId: assetId ?? undefined,
      });
      setReplaceImageError(null);
    },
    [handleUpdateElement],
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
      const target = { id: image.id, currentSrc: image.src };
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
      const visualIds = [...visuals.keys()];
      if (visualIds.length < 2) return;
      const visual = (deck.slides[safeSelected]?.elements ?? []).find(
        (element) => element.id === elementId && element.kind === "visual",
      );
      if (!visual || visual.kind !== "visual") return;
      const currentIndex = Math.max(0, visualIds.indexOf(visual.visualId));
      const nextVisualId = visualIds[(currentIndex + 1) % visualIds.length];
      if (!nextVisualId || nextVisualId === visual.visualId) return;
      handleUpdateElement(visual.id, { visualId: nextVisualId });
    },
    [deck.slides, handleUpdateElement, safeSelected, visuals],
  );

  const handleRestyleSelectedVisual = useCallback(
    (elementId: string) => {
      const visual = (deck.slides[safeSelected]?.elements ?? []).find(
        (element) => element.id === elementId && element.kind === "visual",
      );
      if (!visual || visual.kind !== "visual") return;
      const currentIndex = visual.styleThemeId
        ? STYLE_THEMES.findIndex((theme) => theme.id === visual.styleThemeId)
        : -1;
      const nextTheme = STYLE_THEMES[(currentIndex + 1) % STYLE_THEMES.length];
      handleUpdateElement(visual.id, { styleThemeId: nextTheme?.id });
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
    setInsertMenuOpen: () => undefined,
    setSpotlightPickerOpen,
    setAddTemplateOpen,
    setVisualPickerOpen,
    setSelectedIndex,
  });

  const {
    staleReasonByElementId,
    handlePanelUpdateFromSource,
    handlePanelUnlinkElementSource,
    handlePanelRelinkElementSource,
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
    handleUpdateDeckTemplate,
    handleResetDeckTemplate,
    handleApplyDeckTheme,
  } = useSlideBackgroundCommands({
    deck,
    safeSelected,
    pendingPatchesRef,
    onDeckChange,
    doCommitAndChange,
    setThemeMenuOpen: () => undefined,
  });

  const deckTemplateTokenSet = resolveDeckThemeTokens(deck);
  const toolbarLayouts = useMemo(() => {
    const source =
      deck.layouts && deck.layouts.length > 0 ? deck.layouts : defaultLayouts();
    const format = resolveSlideFormat(deck.slideFormat);
    const filtered = source.filter((layout) => layout.format === format);
    return filtered.length > 0 ? filtered : source;
  }, [deck.layouts, deck.slideFormat]);
  const activeSlideToolbarLayoutId = useMemo(() => {
    const preferredName =
      selectedSlide?.layout === "title" || selectedSlide?.layout === "section"
        ? "title-slide"
        : selectedSlide?.layout === "content"
          ? "title-content"
          : selectedSlide?.layout === "blank"
            ? "blank"
            : "title-content";
    return (
      toolbarLayouts.find((layout) => layout.name === preferredName)?.id ??
      toolbarLayouts[0]?.id ??
      ""
    );
  }, [selectedSlide?.layout, toolbarLayouts]);
  const showSlideToolbar = selectedSlide
    ? isSlideToolbarVisible({
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
    effectiveSelectedElementId,
    effectiveSelectedElementIds,
    handleSelectElement,
    handleSelectElements,
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
    handleApplyReusableLayout,
    handleResetReusableLayout,
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
    inspectorMode,
    setInspectorMode: (mode) => setInspectorMode(mode),
    openRightPanel,
    closeRightPanel,
  };

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
              <SlideSizeControl
                value={resolveSlideFormat(deck.slideFormat)}
                onChange={handleSlideFormatChange}
              />
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
                      className="relative transition-transform duration-200 ease-out motion-reduce:transition-none"
                      style={{
                        width: renderedStageWidth,
                        height: renderedStageHeight,
                        transform: `translateX(${panelSlideShiftX}px)`,
                      }}
                    >
                      {showSlideToolbar ? (
                        <SlideToolbar
                          slide={selectedSlide}
                          slideLabel={deriveSlideTitle(
                            selectedSlide,
                            safeSelected,
                          )}
                          layouts={toolbarLayouts}
                          selectedLayoutId={activeSlideToolbarLayoutId}
                          canDelete={deck.slides.length > 1}
                          onSelectLayout={handleApplyReusableLayout}
                          onBackgroundChange={handleBackgroundChange}
                          onBackgroundGradientChange={
                            handleBackgroundGradientChange
                          }
                          onAddElement={handleAddElement}
                          visuals={visuals}
                          visualPickerOpen={visualPickerOpen}
                          imageError={insertImageError ?? replaceImageError}
                          onVisualPickerOpenChange={setVisualPickerOpen}
                          onPickVisual={handleAddVisual}
                          onDuplicateSlide={() => handleDuplicate(safeSelected)}
                          onRemoveSlide={() => handleRemove(safeSelected)}
                          onOpenPanel={() => openRightPanel("slide")}
                        />
                      ) : null}
                      <Popover
                        open={canvasAddOpen || canvasAddVisualOpen}
                        onClose={() => {
                          setCanvasAddOpen(false);
                          setCanvasAddVisualOpen(false);
                        }}
                        aria-label="Add element"
                        placement="bottom"
                        className="w-[280px] p-3"
                        trigger={
                          <Tooltip label="Add element" side="bottom">
                            <button
                              type="button"
                              data-floating-panel="true"
                              aria-label="Add element"
                              aria-haspopup="dialog"
                              aria-expanded={
                                canvasAddOpen || canvasAddVisualOpen
                              }
                              onClick={() => {
                                setCanvasAddVisualOpen(false);
                                setCanvasAddOpen((open) => !open);
                              }}
                              className={`absolute right-3 top-3 z-sticky flex h-9 w-9 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-raised text-ds-text-secondary shadow-ds-popover transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                            >
                              <Plus size={18} aria-hidden="true" />
                            </button>
                          </Tooltip>
                        }
                      >
                        {canvasAddVisualOpen ? (
                          <VisualPicker
                            className="w-full"
                            visuals={visuals}
                            onPick={(visualId) => {
                              handleAddVisual(visualId);
                              setCanvasAddVisualOpen(false);
                              setCanvasAddOpen(false);
                            }}
                            onClose={() => setCanvasAddVisualOpen(false)}
                          />
                        ) : (
                          <div className="grid grid-cols-2 gap-1.5">
                            {(
                              [
                                ["text", Type, "Text"],
                                ["bullets", List, "List"],
                                ["image", ImageIcon, "Image"],
                                ["shape", Square, "Shape"],
                              ] as const
                            ).map(([kind, Icon, label]) => (
                              <button
                                key={kind}
                                type="button"
                                onClick={() => {
                                  handleAddElement(kind);
                                  setCanvasAddOpen(false);
                                }}
                                className={`flex items-center gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                              >
                                <Icon size={14} aria-hidden="true" />
                                {label}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setCanvasAddVisualOpen(true)}
                              className={`col-span-2 flex items-center gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                            >
                              <Sparkles size={14} aria-hidden="true" />
                              Visual
                            </button>
                            {(insertImageError ?? replaceImageError) ? (
                              <p
                                role="alert"
                                className="col-span-2 text-xs text-ds-danger-text"
                              >
                                {insertImageError ?? replaceImageError}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </Popover>
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
        {pendingResetLayout && (
          <ResetLayoutConfirmDialog
            layoutName={pendingResetLayout.name}
            onCancel={() => setPendingResetLayout(null)}
            onConfirm={handleConfirmResetLayout}
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
