"use client";

/**
 * Shell state controller for SlideEditor.
 *
 * Owns all panel/popover/zoom/open-state that have no direct effect on the
 * deck data model: rail open/close, desktop inspector panel, mobile inspector
 * sheet, right panel tab routing, zoom level, and the seven toolbar popovers
 * (insert, from-document, add-slide template, spotlight picker, background,
 * deck theme, insert-menu visual picker).  Also owns the merge-sync dialog
 * state and the session-scoped staleness-resolved flag, which are purely
 * dialog open/close concerns even though their confirmation handler touches
 * the deck (the deck mutation callback is passed in as a stable dep).
 *
 * Nothing in this module alters the deck, triggers autosave, or changes
 * keyboard / pointer / focus behavior.  It is intentionally inert with respect
 * to those domains.
 */

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

import type { Deck } from "@/lib/presentation/deck";
import {
  mergeDeckFromDocument,
  type MergeSummary,
} from "@/lib/presentation/deck-merge";
import type { DeckPatch } from "@/lib/presentation/slide-commands";
import { clampZoom } from "@/lib/presentation/stage-fit";
import {
  defaultInspectorMode,
  type InspectorMode,
  type RightPanelTab,
} from "@/lib/presentation/slide-panel-ui";
import { clearPendingPatches } from "@/components/presentation/slide-editor/use-slide-editor-commit";

interface SlideEditorShellOptions {
  deck: Deck;
  freshDeck: Deck | null;
  isDeckStale: boolean;
  pendingPatchesRef: { current: DeckPatch[] };
  onDeckChange: (deck: Deck) => void;
}

const INSPECTOR_OPEN_STORAGE_KEY = "textiq.slideInspectorOpen";
const INSPECTOR_MODE_STORAGE_KEY = "textiq.slideInspectorMode";

function isNarrowInspectorViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1023px)").matches
  );
}

function defaultInspectorOpen(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(INSPECTOR_OPEN_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}

function persistInspectorOpen(open: boolean) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(INSPECTOR_OPEN_STORAGE_KEY, String(open));
  }
}

export function useSlideEditorShell({
  deck,
  freshDeck,
  isDeckStale,
  pendingPatchesRef,
  onDeckChange,
}: SlideEditorShellOptions) {
  // ── Rail ──────────────────────────────────────────────────────────────────
  const [railOpen, setRailOpen] = useState(true);
  // Keep content mounted through the close animation so the exit transition
  // plays; unmount only after the transition ends.
  const [railContentMounted, setRailContentMounted] = useState(true);

  const handleToggleRail = useCallback(() => {
    setRailContentMounted(true);
    setRailOpen((open) => !open);
  }, []);

  // ── Inspector panel (desktop) / sheet (mobile) ───────────────────────────
  const [inspectorOpen, setInspectorOpenState] = useState(
    () => defaultInspectorOpen() && !isNarrowInspectorViewport(),
  );
  // Mobile bottom-sheet variant (below `lg`). Issue #209.
  const [inspectorSheetOpen, setInspectorSheetOpenState] = useState(
    () => defaultInspectorOpen() && isNarrowInspectorViewport(),
  );

  const setInspectorOpen: Dispatch<SetStateAction<boolean>> = useCallback(
    (value) => {
      setInspectorOpenState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        persistInspectorOpen(next || inspectorSheetOpen);
        return next;
      });
    },
    [inspectorSheetOpen],
  );

  const setInspectorSheetOpen: Dispatch<SetStateAction<boolean>> = useCallback(
    (value) => {
      setInspectorSheetOpenState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        persistInspectorOpen(inspectorOpen || next);
        return next;
      });
    },
    [inspectorOpen],
  );

  const openInspectorSurface = useCallback(() => {
    if (isNarrowInspectorViewport()) {
      setInspectorOpenState(false);
      setInspectorSheetOpen(true);
      return;
    }
    setInspectorSheetOpenState(false);
    setInspectorOpen(true);
  }, []);

  const closeRightPanel = useCallback(() => {
    setInspectorOpen(false);
    setInspectorSheetOpen(false);
  }, []);

  // ── Right-panel tab routing ───────────────────────────────────────────────
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("position");
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>(() => {
    if (typeof window === "undefined") return defaultInspectorMode();
    return window.localStorage.getItem(INSPECTOR_MODE_STORAGE_KEY) === "layers"
      ? "layers"
      : "properties";
  });

  const openRightPanel = useCallback(
    (tab: RightPanelTab) => {
      setRightPanelTab(tab);
      setInspectorMode("properties");
      openInspectorSurface();
    },
    [openInspectorSurface],
  );

  const openSelectionPanel = useCallback(() => {
    openInspectorSurface();
  }, [openInspectorSurface]);

  // ── Zoom ─────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  const handleZoomChange = useCallback((nextZoom: number) => {
    setZoom(clampZoom(nextZoom));
  }, []);

  // ── Toolbar popovers ─────────────────────────────────────────────────────
  // Add-slide template picker (top-bar "Add" button).
  const [addTemplateOpen, setAddTemplateOpen] = useState(false);
  // Visual-spotlight picker, shown inside the add-slide popover when the user
  // selects the "Visual spotlight" template and the document has visuals.
  const [spotlightPickerOpen, setSpotlightPickerOpen] = useState(false);
  // Insert-element menu (top-bar "Insert" button).
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  // Visual picker nested inside the insert menu.
  const [visualPickerOpen, setVisualPickerOpen] = useState(false);
  // "From document" quick-insert panel.
  const [fromDocOpen, setFromDocOpen] = useState(false);
  // Deck background / color theme popover.
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  // Deck typography / token theme popover.
  const [deckTemplateOpen, setDeckTemplateOpen] = useState(false);

  // ── Merge / sync dialog ──────────────────────────────────────────────────
  // Pending sync from the live document: a computed merge awaiting user
  // confirmation.  `null` when the dialog is closed.
  const [mergePreview, setMergePreview] = useState<{
    deck: Deck;
    summary: MergeSummary;
  } | null>(null);
  // Whether the staleness banner has been resolved (synced or dismissed) for
  // this editing session.
  const [staleResolved, setStaleResolved] = useState(false);

  const canSyncFromDocument = freshDeck != null;
  const showStaleBanner = isDeckStale && !staleResolved && canSyncFromDocument;

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
  }, [mergePreview, onDeckChange, pendingPatchesRef]);

  const handleDismissStale = useCallback(() => {
    setStaleResolved(true);
  }, []);

  return {
    // Rail
    railOpen,
    railContentMounted,
    setRailContentMounted,
    handleToggleRail,
    // Inspector panel / sheet
    inspectorOpen,
    setInspectorOpen,
    inspectorSheetOpen,
    setInspectorSheetOpen,
    openInspectorSurface,
    closeRightPanel,
    // Right-panel tab
    rightPanelTab,
    inspectorMode,
    setInspectorMode,
    openRightPanel,
    openSelectionPanel,
    // Zoom
    zoom,
    zoomMenuOpen,
    setZoomMenuOpen,
    handleZoomChange,
    // Popovers
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
    // Merge / sync dialog
    mergePreview,
    canSyncFromDocument,
    showStaleBanner,
    handleRequestSync,
    handleCancelSync,
    handleApplySync,
    handleDismissStale,
  };
}
