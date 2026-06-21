"use client";

/**
 * Slide Editor — a full-page presentation editing surface.
 *
 * Opens over the whole viewport (portaled to `document.body`, `z-modal`) with a
 * three-pane layout: a thumbnail rail (reorder via HTML5 drag-and-drop, add /
 * duplicate / delete), a large live stage that renders the selected slide with
 * the shared {@link SlideCanvas}, and an inspector for editing the slide's
 * title, bullets, notes and layout. A theme picker lives in the top bar; arrow
 * keys page between slides (unless a field is focused), Escape closes.
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
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Copy,
  GripVertical,
  Image as ImageIcon,
  LayoutPanelLeft,
  List,
  Plus,
  Redo2,
  RefreshCw,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { FOCUS_RING } from "@/components/motion/control-styles";
import type { ActionResult } from "@/lib/action-result";
import {
  DECK_THEMES,
  SlideCanvas,
} from "@/components/presentation/slide-canvas";
import {
  SlideInspector,
  type AddElementKind,
} from "@/components/presentation/slide-inspector";
import { SlideStageEditor } from "@/components/presentation/slide-stage-editor";
import { VisualPicker } from "@/components/presentation/visual-picker";
import { IconButton, Tooltip } from "@/components/ui";
import {
  buildVisualElement,
  makeElementId,
  type Deck,
  type DeckTheme,
  type SlideElement,
  type SlideLayout,
} from "@/lib/presentation/deck";
import {
  mergeDeckFromDocument,
  type MergeSummary,
} from "@/lib/presentation/deck-merge";
import type { Visual } from "@/lib/visual/schema";
import {
  buildTemplateSlide,
  SLIDE_TEMPLATES,
  type SlideTemplateKind,
} from "@/lib/presentation/slide-templates";
import {
  SAVE_STATUS_LABEL,
  SLIDE_SAVE_DEBOUNCE_MS,
  resolveSaveStatus,
  shouldScheduleAutosave,
} from "@/lib/presentation/save-status";
import {
  addElement,
  addSlide,
  bringElementToFront,
  duplicateElement,
  duplicateSlide,
  insertSlide,
  materializeSlide,
  moveSlide,
  removeElement,
  removeSlide,
  reorderSlides,
  sendElementToBack,
  setDeckTheme,
  setSlideAccent,
  setSlideBackground,
  updateElement,
  updateSlide,
  type DistributiveOmit,
  type ElementPatch,
} from "@/lib/presentation/deck-mutations";
import { deriveSlideTitle } from "@/lib/presentation/slide-title";
import { useDeckHistory } from "@/lib/presentation/use-deck-history";

interface SlideEditorProps {
  deck: Deck;
  visuals: ReadonlyMap<string, Visual>;
  onDeckChange: (deck: Deck) => void;
  onClose: () => void;
  /**
   * Persists the deck through the owner-scoped save action. Returns the
   * {@link ActionResult} so the editor can surface success/failure in its
   * save-status badge and offer a working Retry on error. Used by both the
   * debounced autosave and the explicit Save button (a single save path).
   */
  onSave: (deck: Deck) => Promise<ActionResult>;
  /**
   * The deck freshly derived from the live document (`buildDeckFromBlocks`),
   * carrying the current document content hash. Drives the "Sync from document"
   * merge. Absent when the document state is unavailable — the sync action is
   * then hidden.
   */
  freshDeck?: Deck | null;
  /** Whether the document changed since this deck was last built/synced. */
  isDeckStale?: boolean;
}

const THEME_OPTIONS: { value: DeckTheme; label: string; color: string }[] = [
  { value: "indigo", label: "Indigo", color: "#818cf8" },
  { value: "ocean", label: "Ocean", color: "#38bdf8" },
  { value: "forest", label: "Forest", color: "#4ade80" },
  { value: "sunset", label: "Sunset", color: "#fb923c" },
  { value: "grape", label: "Grape", color: "#c084fc" },
  { value: "default", label: "Default", color: "#a1a1aa" },
];

type Size = { width: number; height: number };

const DEFAULT_SCREEN_SIZE: Size = { width: 16, height: 9 };

function getViewportSize(): Size {
  if (typeof window === "undefined") {
    return DEFAULT_SCREEN_SIZE;
  }
  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  };
}

function fitAspectRatio(bounds: Size, aspectRatio: number): Size {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return DEFAULT_SCREEN_SIZE;
  }

  const boundsAspect = bounds.width / bounds.height;
  if (boundsAspect > aspectRatio) {
    return { width: bounds.height * aspectRatio, height: bounds.height };
  }

  return { width: bounds.width, height: bounds.width / aspectRatio };
}

/** Builds a freshly-positioned element for the "Add" buttons. */
function buildDefaultElement(
  kind: AddElementKind,
  accent: string,
  id: string,
): DistributiveOmit<SlideElement, "id" | "zIndex"> & { id: string } {
  switch (kind) {
    case "text":
      return {
        id,
        kind: "text",
        role: "body",
        text: "New text",
        box: { x: 20, y: 40, w: 60, h: 16 },
        style: { fontSize: 5, bold: false, italic: false, align: "left" },
      };
    case "bullets":
      return {
        id,
        kind: "bullets",
        bullets: ["First point", "Second point"],
        box: { x: 14, y: 28, w: 72, h: 48 },
        style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
      };
    case "image":
      return {
        id,
        kind: "image",
        src: "",
        alt: "",
        box: { x: 25, y: 22, w: 50, h: 56 },
      };
    case "shape":
      return {
        id,
        kind: "shape",
        shape: "rect",
        color: accent,
        box: { x: 30, y: 34, w: 40, h: 32 },
      };
  }
}

export function SlideEditor({
  deck: deckProp,
  visuals,
  onDeckChange: onDeckChangeProp,
  onClose,
  onSave,
  freshDeck = null,
  isDeckStale = false,
}: SlideEditorProps) {
  // Snapshot-based undo/redo over the plain Deck object. Every mutation routes
  // through `onDeckChange` (the history `commit`), which records the previous
  // present and notifies the parent. This never touches contentJson / Yjs state.
  const {
    present: deck,
    commit: onDeckChange,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDeckHistory(deckProp, onDeckChangeProp);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [viewportSize, setViewportSize] = useState<Size>(getViewportSize);
  const [stageBounds, setStageBounds] = useState<Size>(DEFAULT_SCREEN_SIZE);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  // Whether the stage "Add → Visual" picker popover is open.
  const [visualPickerOpen, setVisualPickerOpen] = useState(false);
  // Whether the thumbnail rail "+ Add slide" template picker popover is open.
  const [addTemplateOpen, setAddTemplateOpen] = useState(false);
  // Pending sync from the live document: a computed merge awaiting the user's
  // confirmation. `null` when no merge dialog is open.
  const [mergePreview, setMergePreview] = useState<{
    deck: Deck;
    summary: MergeSummary;
  } | null>(null);
  // Whether the staleness banner has been resolved (synced or dismissed) for
  // this editing session, so it does not keep nagging after the user acts.
  const [staleResolved, setStaleResolved] = useState(false);
  // Slide indices the user has interacted with this session. Drives the subtle
  // "click to start editing" hint, which is hidden once a slide is touched.
  const [touchedSlides, setTouchedSlides] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const stageRef = useRef<HTMLDivElement>(null);

  // ── Autosave + save-status feedback (issue #208) ───────────────────────────
  // Mirrors the document editor: a debounced autosave persists deck edits a
  // short while after the user stops editing, the Save button flushes
  // immediately, and a badge reflects the current persistence state.
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  // Pending autosave debounce timer.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The freshest deck to persist; a save in flight reads this so a flush always
  // writes the newest edits, not a stale snapshot captured when it was queued.
  const latestDeckRef = useRef<Deck>(deck);
  // The last deck reference the autosave effect observed. `null` until the
  // initial deck is seen, so the first render is never autosaved.
  const lastSeenDeckRef = useRef<Deck | null>(null);

  // Persists the latest deck immediately, cancelling any pending debounce. Both
  // the autosave timer and the manual Save / Retry buttons route through here so
  // there is a single save path.
  const flushSave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const deckToSave = latestDeckRef.current;
    setIsSaving(true);
    setHasSaveError(false);
    try {
      const res = await onSave(deckToSave);
      if (res.ok) {
        // Only clear the dirty flag if no newer edit was queued mid-save.
        if (latestDeckRef.current === deckToSave) {
          setIsDirty(false);
        }
      } else {
        setHasSaveError(true);
      }
    } catch {
      setHasSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }, [onSave]);

  // Schedule a debounced autosave on each real user edit. The present deck only
  // changes reference on a genuine action (mutation / undo / redo / applied
  // sync); the initial load, legacy materialization (done before this editor)
  // and the staleness banner never reach here, so no spurious autosave fires.
  useEffect(() => {
    latestDeckRef.current = deck;
    const lastSeen = lastSeenDeckRef.current;
    lastSeenDeckRef.current = deck;
    if (!shouldScheduleAutosave({ current: deck, lastSeen })) {
      return;
    }
    setIsDirty(true);
    setHasSaveError(false);
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
  const viewportAspectRatio = viewportSize.width / viewportSize.height;
  const fittedStageSize = fitAspectRatio(stageBounds, viewportAspectRatio);

  useEffect(() => {
    function onResize() {
      setViewportSize(getViewportSize());
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) {
      return;
    }

    const updateBounds = () => {
      const rect = node.getBoundingClientRect();
      setStageBounds({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Auto-materialization of legacy slides happens BEFORE the deck reaches this
  // editor (in SlideEditorButton, before useDeckHistory), so the materialized
  // deck is the history baseline: `canUndo` stays false until the user edits and
  // the first undo never reverts to the legacy form.

  const handleThemeChange = useCallback(
    (theme: DeckTheme) => {
      onDeckChange(setDeckTheme(deck, theme));
    },
    [deck, onDeckChange],
  );

  const handleAddTemplate = useCallback(
    (kind: SlideTemplateKind) => {
      const slide = buildTemplateSlide(kind, { theme: deck.theme });
      const next = insertSlide(deck, deck.slides.length - 1, slide);
      onDeckChange(next);
      setSelectedIndex(next.slides.length - 1);
      setAddTemplateOpen(false);
    },
    [deck, onDeckChange],
  );

  const handleAddSlide = useCallback(
    (afterIndex: number) => {
      const next = addSlide(deck, afterIndex);
      onDeckChange(next);
      setSelectedIndex(Math.min(afterIndex + 1, next.slides.length - 1));
    },
    [deck, onDeckChange],
  );

  const handleMove = useCallback(
    (index: number, direction: number) => {
      const next = moveSlide(deck, index, direction);
      if (next === deck) {
        return;
      }
      onDeckChange(next);
      setSelectedIndex(index + (direction > 0 ? 1 : -1));
    },
    [deck, onDeckChange],
  );

  const handleDuplicate = useCallback(
    (index: number) => {
      onDeckChange(duplicateSlide(deck, index));
      setSelectedIndex(index + 1);
    },
    [deck, onDeckChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onDeckChange(removeSlide(deck, index));
      setSelectedIndex((current) =>
        Math.max(0, Math.min(current, deck.slides.length - 2)),
      );
    },
    [deck, onDeckChange],
  );

  const handleTitleChange = useCallback(
    (index: number, title: string) => {
      onDeckChange(updateSlide(deck, index, { title }));
    },
    [deck, onDeckChange],
  );

  const handleLayoutChange = useCallback(
    (index: number, layout: SlideLayout) => {
      onDeckChange(updateSlide(deck, index, { layout }));
    },
    [deck, onDeckChange],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "Escape") {
        event.preventDefault();
        if (effectiveSelectedElementId) {
          setSelectedElementId(null);
        } else {
          handleRequestClose();
        }
        return;
      }

      if (typing) {
        return;
      }

      // Undo / redo over deck history. Ctrl/⌘+Z = undo,
      // Ctrl/⌘+Shift+Z (or Ctrl+Y) = redo. The `typing` guard above keeps
      // these from hijacking field-level undo while editing text.
      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (mod && !event.shiftKey && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        redo();
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
          // otherwise fall back to slide-duplicate (#212). Inlined (not via
          // `handleDuplicateElement`) so this effect needs no extra dep and
          // avoids a temporal-dead-zone with handlers declared further down.
          if (effectiveSelectedElementId) {
            const { deck: nextDeck, newElementId } = duplicateElement(
              deck,
              safeSelected,
              effectiveSelectedElementId,
            );
            if (newElementId != null) {
              onDeckChange(nextDeck);
              setSelectedElementId(newElementId);
            }
          } else {
            handleDuplicate(safeSelected);
          }
          return;
        }
        if (key === "n") {
          event.preventDefault();
          handleAddSlide(safeSelected);
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          handleRemove(safeSelected);
          return;
        }
      }

      // With an element selected, arrow keys nudge it and Delete removes it.
      const slide = deck.slides[safeSelected];
      const selected =
        effectiveSelectedElementId && slide?.elements
          ? slide.elements.find((el) => el.id === effectiveSelectedElementId)
          : undefined;

      if (selected) {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onDeckChange(removeElement(deck, safeSelected, selected.id));
          setSelectedElementId(null);
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
          const { w, h } = selected.box;
          const x = Math.max(0, Math.min(100 - w, selected.box.x + dx));
          const y = Math.max(0, Math.min(100 - h, selected.box.y + dy));
          onDeckChange(
            updateElement(deck, safeSelected, selected.id, {
              box: { ...selected.box, x, y },
            }),
          );
          return;
        }
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedIndex((i) => Math.min(deck.slides.length - 1, i + 1));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleRequestClose,
    deck,
    safeSelected,
    effectiveSelectedElementId,
    onDeckChange,
    undo,
    redo,
    handleDuplicate,
    handleRemove,
    handleAddSlide,
  ]);

  const handleBulletsChange = useCallback(
    (index: number, value: string) => {
      const bullets = value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      onDeckChange(updateSlide(deck, index, { bullets }));
    },
    [deck, onDeckChange],
  );

  const handleNotesChange = useCallback(
    (index: number, notes: string) => {
      onDeckChange(updateSlide(deck, index, { notes }));
    },
    [deck, onDeckChange],
  );

  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragIndex !== null && dragIndex !== toIndex) {
        onDeckChange(reorderSlides(deck, dragIndex, toIndex));
        setSelectedIndex(toIndex);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [deck, dragIndex, onDeckChange],
  );

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
    onDeckChange(mergePreview.deck);
    setMergePreview(null);
    setStaleResolved(true);
  }, [mergePreview, onDeckChange]);

  const handleDismissStale = useCallback(() => {
    setStaleResolved(true);
  }, []);

  const goPrev = useCallback(() => {
    setVisualPickerOpen(false);
    setSelectedIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setVisualPickerOpen(false);
    setSelectedIndex((i) => Math.min(deck.slides.length - 1, i + 1));
  }, [deck.slides.length]);

  const accentForSelected = selectedSlide?.accent ?? selectedTheme.accentColor;

  const handleSelectElement = useCallback(
    (id: string | null) => {
      setSelectedElementId(id);
      if (id != null) {
        setTouchedSlides((current) => {
          if (current.has(safeSelected)) {
            return current;
          }
          const next = new Set(current);
          next.add(safeSelected);
          return next;
        });
      }
    },
    [safeSelected],
  );

  const handleUpdateElement = useCallback(
    (id: string, patch: ElementPatch) => {
      onDeckChange(updateElement(deck, safeSelected, id, patch));
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleRemoveElement = useCallback(
    (id: string) => {
      onDeckChange(removeElement(deck, safeSelected, id));
      setSelectedElementId((current) => (current === id ? null : current));
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleDuplicateElement = useCallback(
    (id: string) => {
      const { deck: next, newElementId } = duplicateElement(
        deck,
        safeSelected,
        id,
      );
      if (newElementId == null) {
        return;
      }
      onDeckChange(next);
      handleSelectElement(newElementId);
    },
    [deck, onDeckChange, safeSelected, handleSelectElement],
  );

  const handleBringToFront = useCallback(
    (id: string) => {
      onDeckChange(bringElementToFront(deck, safeSelected, id));
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleSendToBack = useCallback(
    (id: string) => {
      onDeckChange(sendElementToBack(deck, safeSelected, id));
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleMaterialize = useCallback(() => {
    onDeckChange(materializeSlide(deck, safeSelected));
  }, [deck, onDeckChange, safeSelected]);

  const handleAddElement = useCallback(
    (kind: AddElementKind) => {
      const id = makeElementId();
      const element = buildDefaultElement(kind, accentForSelected, id);
      onDeckChange(addElement(deck, safeSelected, element));
      handleSelectElement(id);
    },
    [accentForSelected, deck, handleSelectElement, onDeckChange, safeSelected],
  );

  const handleAddVisual = useCallback(
    (visualId: string) => {
      const element = buildVisualElement(visualId);
      onDeckChange(addElement(deck, safeSelected, element));
      handleSelectElement(element.id);
      setVisualPickerOpen(false);
    },
    [deck, handleSelectElement, onDeckChange, safeSelected],
  );

  const handleBackgroundChange = useCallback(
    (color: string | undefined) => {
      onDeckChange(setSlideBackground(deck, safeSelected, color));
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleAccentChange = useCallback(
    (color: string | undefined) => {
      onDeckChange(setSlideAccent(deck, safeSelected, color));
    },
    [deck, onDeckChange, safeSelected],
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Slide editor"
      className="fixed inset-0 z-modal flex flex-col bg-ds-surface-base"
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-3 border-b border-ds-border-subtle px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <LayoutPanelLeft
            size={18}
            aria-hidden="true"
            className="shrink-0 text-ds-text-secondary"
          />
          <h2 className="text-sm font-semibold text-ds-text-primary">
            Slide editor
          </h2>
          <span className="text-xs text-ds-text-muted">
            {deck.slides.length} {deck.slides.length === 1 ? "slide" : "slides"}
          </span>
        </div>

        <div className="flex items-center gap-3">
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
                onClick={undo}
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
                onClick={redo}
              >
                <Redo2 aria-hidden className="h-3.5 w-3.5" />
              </IconButton>
            </Tooltip>
          </div>

          <div
            className="hidden h-5 w-px bg-ds-border-subtle sm:block"
            aria-hidden="true"
          />

          {/* Theme swatches */}
          <div className="hidden items-center gap-1.5 sm:flex">
            {THEME_OPTIONS.map((option) => {
              const active = deck.theme === option.value;
              return (
                <Tooltip key={option.value} label={option.label} side="bottom">
                  <button
                    type="button"
                    onClick={() => handleThemeChange(option.value)}
                    aria-label={`${option.label} theme`}
                    aria-pressed={active}
                    className={`h-6 w-6 rounded-full border transition-shadow ${
                      active
                        ? "ring-2 ring-ds-focus-ring ring-offset-1 ring-offset-ds-focus-offset"
                        : "border-ds-border-subtle"
                    } ${FOCUS_RING}`}
                    style={{ backgroundColor: option.color }}
                  />
                </Tooltip>
              );
            })}
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
                className={`flex h-8 items-center gap-1.5 rounded-ds-md border px-2.5 text-sm font-medium transition-colors ${
                  showStaleBanner
                    ? "border-ds-warning-border bg-ds-warning-surface text-ds-warning-text hover:opacity-90"
                    : "border-ds-border-subtle text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
                } ${FOCUS_RING}`}
              >
                <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Sync from document</span>
              </button>
            </Tooltip>
          ) : null}

          <span
            role="status"
            aria-live="polite"
            className="hidden text-xs text-ds-text-muted sm:inline"
          >
            {saveStatus !== "error" ? SAVE_STATUS_LABEL[saveStatus] : null}
          </span>

          {saveStatus === "error" ? (
            <button
              type="button"
              onClick={handleSave}
              className={`flex h-8 items-center rounded-ds-md border border-ds-danger-border bg-ds-danger-surface px-2.5 text-sm font-medium text-ds-danger-text transition-opacity hover:opacity-90 ${FOCUS_RING}`}
            >
              {SAVE_STATUS_LABEL.error}
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`flex h-8 items-center rounded-ds-md bg-ds-control px-3 text-sm font-medium text-ds-control-text transition-colors hover:bg-ds-control-hover disabled:opacity-60 ${FOCUS_RING}`}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Close slide editor"
            className={`flex h-8 w-8 items-center justify-center rounded-ds-md border border-ds-border-subtle text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
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

      {/* ── Body: thumbnail rail · stage · inspector ────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Slide thumbnail rail */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-ds-border-subtle">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ul className="flex flex-col gap-2">
              {deck.slides.map((slide, index) => {
                const selected = index === safeSelected;
                const dropTarget =
                  dragOverIndex === index && dragIndex !== index;
                const title = deriveSlideTitle(slide, index);
                const canDelete = deck.slides.length > 1;
                return (
                  <li
                    key={index}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverIndex(index);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(index);
                    }}
                    className="group relative"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setVisualPickerOpen(false);
                        setSelectedIndex(index);
                      }}
                      aria-label={`Slide ${index + 1}: ${title}`}
                      aria-current={selected}
                      className={`flex w-full flex-col gap-1 rounded-ds-md border p-1.5 text-left transition-colors ${
                        selected
                          ? "border-ds-control bg-ds-state-hover"
                          : "border-transparent hover:bg-ds-state-hover"
                      } ${dropTarget ? "border-ds-control" : ""} ${FOCUS_RING}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex w-4 shrink-0 flex-col items-center gap-1 text-xs tabular-nums text-ds-text-muted">
                          {index + 1}
                          <GripVertical
                            size={12}
                            aria-hidden="true"
                            className="cursor-grab opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </span>
                        <span className="pointer-events-none block aspect-video min-w-0 flex-1 overflow-hidden rounded-ds-sm border border-ds-border-subtle">
                          <SlideCanvas
                            slide={slide}
                            visuals={visuals}
                            preview
                          />
                        </span>
                      </span>
                      <span
                        className="block truncate pl-6 text-xs text-ds-text-secondary"
                        title={title}
                      >
                        {title}
                      </span>
                    </button>

                    {/* Hover/focus action cluster — reveals on group hover or
                        keyboard focus so the rail stays clean but every action
                        is keyboard-reachable (issue #212). */}
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

            <div className="relative mt-3">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={addTemplateOpen}
                onClick={() => setAddTemplateOpen((open) => !open)}
                className={`flex w-full items-center justify-center gap-1.5 rounded-ds-md border border-dashed border-ds-border-subtle px-3 py-2 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
              >
                <Plus size={15} aria-hidden="true" />
                Add slide
              </button>
              {addTemplateOpen ? (
                <SlideTemplatePicker
                  onPick={handleAddTemplate}
                  onClose={() => setAddTemplateOpen(false)}
                />
              ) : null}
            </div>
          </div>
        </aside>

        {/* Stage — large live preview of the selected slide */}
        <main
          className="flex min-w-0 flex-1 flex-col"
          style={{ backgroundColor: selectedTheme.bgColor }}
        >
          {/* On-stage element toolbar */}
          {selectedSlide ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-ds-border-subtle bg-ds-surface-base px-3 py-2">
              <span className="mr-0.5 text-xs font-medium text-ds-text-muted">
                Add
              </span>
              <StageAddButton
                icon={<Type size={14} aria-hidden="true" />}
                label="Text"
                onClick={() => handleAddElement("text")}
              />
              <StageAddButton
                icon={<List size={14} aria-hidden="true" />}
                label="Bullets"
                onClick={() => handleAddElement("bullets")}
              />
              <StageAddButton
                icon={<ImageIcon size={14} aria-hidden="true" />}
                label="Image"
                onClick={() => handleAddElement("image")}
              />
              <StageAddButton
                icon={<Shapes size={14} aria-hidden="true" />}
                label="Shape"
                onClick={() => handleAddElement("shape")}
              />
              <div className="relative">
                <StageAddButton
                  icon={<Sparkles size={14} aria-hidden="true" />}
                  label="Visual"
                  aria-haspopup="dialog"
                  aria-expanded={visualPickerOpen}
                  onClick={() => setVisualPickerOpen((open) => !open)}
                />
                {visualPickerOpen ? (
                  <div className="absolute left-0 top-full z-modal mt-1">
                    <VisualPicker
                      visuals={visuals}
                      onPick={handleAddVisual}
                      onClose={() => setVisualPickerOpen(false)}
                    />
                  </div>
                ) : null}
              </div>
              <div
                className="mx-1 hidden h-5 w-px bg-ds-border-subtle sm:block"
                aria-hidden="true"
              />
              <span className="hidden text-xs text-ds-text-muted lg:inline">
                Double-click text to edit · drag to move · handles to resize
              </span>
            </div>
          ) : null}

          <div
            ref={stageRef}
            className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6"
          >
            {selectedSlide ? (
              <SlideStageEditor
                slide={selectedSlide}
                visuals={visuals}
                width={fittedStageSize.width}
                height={fittedStageSize.height}
                selectedElementId={effectiveSelectedElementId}
                onSelectElement={handleSelectElement}
                onUpdateElement={handleUpdateElement}
                onRemoveElement={handleRemoveElement}
                onDuplicateElement={handleDuplicateElement}
                onBringToFront={handleBringToFront}
                onSendToBack={handleSendToBack}
              />
            ) : null}
            {selectedSlide &&
            (selectedSlide.elements?.length ?? 0) > 0 &&
            !effectiveSelectedElementId &&
            !touchedSlides.has(safeSelected) ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ds-inverse-surface/80 px-3 py-1 text-xs font-medium text-ds-inverse-text shadow"
              >
                Click any element to start editing
              </div>
            ) : null}
          </div>

          {/* Slide navigation */}
          <div className="flex items-center justify-center gap-4 border-t border-ds-border-subtle bg-ds-surface-base px-4 py-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={safeSelected <= 0}
              aria-label="Previous slide"
              className={`flex h-8 w-8 items-center justify-center rounded-ds-md text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-40 ${FOCUS_RING}`}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="text-xs tabular-nums text-ds-text-secondary">
              Slide {safeSelected + 1} of {deck.slides.length}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={safeSelected >= deck.slides.length - 1}
              aria-label="Next slide"
              className={`flex h-8 w-8 items-center justify-center rounded-ds-md text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-40 ${FOCUS_RING}`}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </main>

        {/* Inspector — edit the selected slide */}
        {selectedSlide ? (
          <SlideInspector
            slide={selectedSlide}
            slideIndex={safeSelected}
            visuals={visuals}
            selectedElementId={effectiveSelectedElementId}
            onSelectElement={handleSelectElement}
            canDelete={deck.slides.length > 1}
            onDuplicateSlide={() => handleDuplicate(safeSelected)}
            onRemoveSlide={() => handleRemove(safeSelected)}
            onTitleChange={(title) => handleTitleChange(safeSelected, title)}
            onLayoutChange={(layout) =>
              handleLayoutChange(safeSelected, layout)
            }
            onBulletsChange={(value) =>
              handleBulletsChange(safeSelected, value)
            }
            onMaterialize={handleMaterialize}
            onAddElement={handleAddElement}
            onAddVisual={handleAddVisual}
            onUpdateElement={handleUpdateElement}
            onRemoveElement={handleRemoveElement}
            onBringToFront={handleBringToFront}
            onSendToBack={handleSendToBack}
            onBackgroundChange={handleBackgroundChange}
            onAccentChange={handleAccentChange}
            onNotesChange={(notes) => handleNotesChange(safeSelected, notes)}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Template picker popover shown by the thumbnail rail's "+ Add slide" button.
 * Lists each {@link SLIDE_TEMPLATES} option; picking one inserts an authored
 * slide via the caller (routed through the undo/redo `commit` path). Closes on
 * Escape or outside click so it behaves like the other editor popovers.
 */
function SlideTemplatePicker({
  onPick,
  onClose,
}: {
  onPick: (kind: SlideTemplateKind) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Slide templates"
      className="absolute bottom-full left-0 right-0 z-modal mb-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised p-1 shadow-lg"
    >
      {SLIDE_TEMPLATES.map((template) => (
        <button
          key={template.kind}
          type="button"
          role="menuitem"
          onClick={() => onPick(template.kind)}
          className={`flex w-full flex-col items-start gap-0.5 rounded-ds-sm px-2.5 py-1.5 text-left transition-colors hover:bg-ds-state-hover ${FOCUS_RING}`}
        >
          <span className="text-sm font-medium text-ds-text-primary">
            {template.label}
          </span>
          <span className="text-[11px] text-ds-text-muted">
            {template.description}
          </span>
        </button>
      ))}
    </div>
  );
}

function StageAddButton({
  icon,
  label,
  onClick,
  ...rest
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
} & Omit<ComponentPropsWithoutRef<"button">, "onClick" | "children">) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-2 py-1 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
      {...rest}
    >
      {icon}
      {label}
    </button>
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
  const KIND_LABEL: Record<string, string> = {
    updated: "Updated",
    appended: "New",
    preserved: "Kept",
  };
  const hasChanges = summary.updatedCount > 0 || summary.appendedCount > 0;

  return createPortal(
    <div
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
            className={`flex h-8 items-center rounded-ds-md bg-ds-control px-3 text-sm font-medium text-ds-control-text transition-colors hover:bg-ds-control-hover disabled:opacity-60 ${FOCUS_RING}`}
          >
            Apply changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
