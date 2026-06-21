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
import { FOCUS_RING } from "@/components/motion/control-styles";
import { SlideEditor } from "@/components/presentation/slide-editor";
import { buildDeckFromBlocks, type Deck } from "@/lib/presentation/deck";
import { pickFreshestDeck } from "@/lib/presentation/fresh-deck";
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
    const baseDeck = buildDeckFromBlocks(blocks);

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

    const startDeck = pickFreshestDeck(
      fetchedRaw,
      lastSavedRef.current,
      baseDeck,
    );

    setVisuals(visualMap);
    setDeck(startDeck);
    setOpen(true);
    openSlideEditor();
  }, [editor, documentId, openSlideEditor]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setDeck(null);
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
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Open slide editor"
        title="Edit slides"
        className={`flex h-8 items-center justify-center gap-1.5 rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised text-sm font-medium text-ds-text-primary shadow-ds-raised transition-colors hover:bg-ds-state-hover active:bg-ds-state-active ${iconOnly ? "w-8 px-0" : "px-3"} ${FOCUS_RING}`}
      >
        <LayoutPanelLeft size={15} aria-hidden="true" />
        <span className={iconOnly ? "sr-only" : undefined}>Slides</span>
      </button>

      {open && deck ? (
        <SlideEditor
          deck={deck}
          visuals={visuals}
          onDeckChange={setDeck}
          onClose={handleClose}
          onSave={handleSave}
          isSaving={isSaving}
        />
      ) : null}
    </>
  );
}
