"use client";

/**
 * Toolbar button that opens the SlideEditor panel for the current document.
 *
 * Reads the current Lexical editor state to derive a base deck via
 * buildDeckFromBlocks, then seeds the editor from the freshest available deck:
 * 1. Re-fetches deckJson from the server on every open (catches remote edits).
 * 2. Falls back to the last locally-saved deck (updated after each save).
 * 3. Falls back to the base deck derived from the Lexical editor state.
 * Saves go through the owner-scoped `saveDeckJson` server action.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LayoutPanelLeft } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { fetchDeckJson, saveDeckJson } from "@/app/app/documents/[id]/actions";
import { SlideEditor } from "@/components/presentation/slide-editor";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import { buildDeckFromBlocks, type Deck } from "@/lib/presentation/deck";
import {
  computeDeckContentHash,
  isDeckStale,
  stampDeckContentHash,
} from "@/lib/presentation/deck-hash";
import { pickFreshestDeck } from "@/lib/presentation/fresh-deck";
import { stripOrphanedVisuals } from "@/lib/presentation/strip-orphans";
import { collectDocumentBlocks } from "@/lib/visual/document-export";
import type { Visual } from "@/lib/visual/schema";
import { useRightSurface } from "@/app/app/documents/[id]/right-surface-context";

interface SlideEditorButtonProps {
  documentId: string;
  initialDeckJson: unknown;
  iconOnly?: boolean;
}

export function SlideEditorButton({
  documentId,
  initialDeckJson,
  iconOnly = false,
}: SlideEditorButtonProps) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const [deck, setDeck] = useState<Deck | null>(null);
  // The freshly-derived deck and its content hash, captured at open from the
  // live Lexical state. Drives the "Sync from document" merge and the
  // staleness banner without ever reaching back into Lexical from the editor.
  const [freshDeck, setFreshDeck] = useState<Deck | null>(null);
  const [stale, setStale] = useState(false);
  const [visuals, setVisuals] = useState<ReadonlyMap<string, Visual>>(
    () => new Map(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const { openSlideEditor, closeSlideEditor } = useRightSurface();

  // Tracks the most recently saved deck so subsequent opens use fresh data
  // even without a server round-trip succeeding (e.g. offline).
  const lastSavedRef = useRef<unknown>(initialDeckJson);

  const handleOpen = useCallback(async () => {
    // Build base deck from current editor state.
    const json = JSON.stringify(editor.getEditorState().toJSON());
    const blocks = collectDocumentBlocks(json);
    // Stamp the freshly-derived deck with the *current* document content hash so
    // a deck saved from it is never falsely flagged as stale on reopen.
    const derived = buildDeckFromBlocks(blocks);
    const currentContentHash = computeDeckContentHash(derived);
    const baseDeck = stampDeckContentHash(derived, currentContentHash);

    // Map every embedded visual so the slide previews can render real content
    // without ever reaching back into Lexical/Yjs state.
    const visualMap = new Map<string, Visual>();
    for (const block of blocks) {
      if (block.kind === "visual") {
        visualMap.set(block.visualId, block.visual);
      }
    }

    // Fetch the freshest deckJson from the server; fall back gracefully.
    let fetchedRaw: unknown = null;
    try {
      fetchedRaw = await fetchDeckJson(documentId);
    } catch {
      // Network/auth error — proceed with lastSavedRef as fallback.
    }

    const knownVisualIds = new Set(visualMap.keys());
    const startDeck = stripOrphanedVisuals(
      pickFreshestDeck(fetchedRaw, lastSavedRef.current, baseDeck),
      knownVisualIds,
    );

    setVisuals(visualMap);
    setDeck(startDeck);
    // freshDeck (current document) drives the merge; strip orphans so synced
    // visualIds always resolve to a renderable visual.
    setFreshDeck(stripOrphanedVisuals(baseDeck, knownVisualIds));
    setStale(isDeckStale(startDeck, currentContentHash));
    setOpen(true);
    openSlideEditor();
  }, [editor, documentId, openSlideEditor]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setDeck(null);
    setFreshDeck(null);
    setStale(false);
    closeSlideEditor();
  }, [closeSlideEditor]);

  const handleSave = useCallback(
    async (updatedDeck: Deck) => {
      setIsSaving(true);
      try {
        const res = await saveDeckJson(documentId, updatedDeck);
        if (!res.ok) {
          console.error(res.error);
          return;
        }
        // Keep lastSavedRef current so subsequent opens don't regress.
        lastSavedRef.current = updatedDeck;
      } finally {
        setIsSaving(false);
      }
    },
    [documentId],
  );

  return (
    <>
      <EditorToolbarButton
        label="Slides"
        tooltip="Edit slides"
        icon={<LayoutPanelLeft size={15} aria-hidden="true" />}
        iconOnly={iconOnly}
        onClick={handleOpen}
        aria-label="Open slide editor"
      />

      {open && deck ? (
        <SlideEditor
          deck={deck}
          visuals={visuals}
          onDeckChange={setDeck}
          onClose={handleClose}
          onSave={handleSave}
          isSaving={isSaving}
          freshDeck={freshDeck}
          isDeckStale={stale}
        />
      ) : null}
    </>
  );
}
