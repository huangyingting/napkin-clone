"use client";

/**
 * Toolbar button that opens the SlideEditor panel for the current document.
 *
 * Reads the current Lexical editor state to derive a base deck via
 * buildDeckFromBlocks, then merges the persisted deckJson (if any) as the
 * starting deck. Mutations flow back through React state; saves go through the
 * owner-scoped `saveDeckJson` server action.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LayoutPanelLeft } from "lucide-react";
import { useCallback, useState } from "react";

import { saveDeckJson } from "@/app/app/documents/[id]/actions";
import { FOCUS_RING } from "@/components/motion/control-styles";
import { SlideEditor } from "@/components/presentation/slide-editor";
import { buildDeckFromBlocks, type Deck } from "@/lib/presentation/deck";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { collectDocumentBlocks } from "@/lib/visual/document-export";

interface SlideEditorButtonProps {
  documentId: string;
  initialDeckJson: unknown;
}

export function SlideEditorButton({
  documentId,
  initialDeckJson,
}: SlideEditorButtonProps) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpen = useCallback(() => {
    // Build base deck from current editor state.
    const json = JSON.stringify(editor.getEditorState().toJSON());
    const blocks = collectDocumentBlocks(json);
    const baseDeck = buildDeckFromBlocks(blocks);

    // If there's a persisted deck, use it; else use the derived deck.
    const parsed = safeParseDeck(initialDeckJson);
    const startDeck = parsed.success ? parsed.data : baseDeck;

    setDeck(startDeck);
    setOpen(true);
  }, [editor, initialDeckJson]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setDeck(null);
  }, []);

  const handleSave = useCallback(
    async (updatedDeck: Deck) => {
      setIsSaving(true);
      try {
        await saveDeckJson(documentId, updatedDeck);
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
        className={`flex h-9 items-center gap-1.5 rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised px-3 text-sm font-medium text-ds-text-primary shadow-ds-raised transition-colors hover:bg-ds-state-hover active:bg-ds-state-active ${FOCUS_RING}`}
      >
        <LayoutPanelLeft size={15} aria-hidden="true" />
        Slides
      </button>

      {open && deck ? (
        <SlideEditor
          deck={deck}
          onDeckChange={setDeck}
          onClose={handleClose}
          onSave={handleSave}
          isSaving={isSaving}
        />
      ) : null}
    </>
  );
}
