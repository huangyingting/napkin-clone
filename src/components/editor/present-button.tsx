"use client";

/**
 * Present button rendered in the document editor toolbar.
 *
 * Reads the current Lexical editor state, builds a fallback {@link Deck} via
 * {@link buildDeckFromBlocks}, then prefers the freshest saved `deckJson` so
 * the toolbar presentation matches the Slides editor and public present route.
 *
 * The present mode is READ-ONLY — it never mutates Lexical/Yjs state.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MonitorPlay } from "lucide-react";
import { useCallback, useState } from "react";

import { fetchDeckJson } from "@/app/app/documents/[id]/actions";
import { PresentMode } from "@/components/presentation/present-mode";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import { buildDeckFromBlocks, type Deck } from "@/lib/presentation/deck";
import { pickFreshestDeck } from "@/lib/presentation/fresh-deck";
import { stripOrphanedVisuals } from "@/lib/presentation/strip-orphans";
import type { Visual } from "@/lib/visual/schema";
import { collectDocumentBlocks } from "@/lib/content";

interface PresentButtonProps {
  documentId: string;
  initialDeckJson: unknown;
  documentTitle?: string;
  iconOnly?: boolean;
}

type PresentData = {
  deck: Deck;
  visuals: Map<string, Visual>;
};

/**
 * A toolbar button that opens the in-app Present mode for the current document.
 *
 * Placed in the editor header alongside Export and Share. On click it reads the
 * current Lexical editor state for live visuals and a generated fallback deck,
 * then prefers the saved deck JSON before rendering {@link PresentMode}.
 */
export function PresentButton({
  documentId,
  initialDeckJson,
  documentTitle,
  iconOnly = false,
}: PresentButtonProps) {
  const [editor] = useLexicalComposerContext();
  const [presentData, setPresentData] = useState<PresentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePresent = useCallback(async () => {
    const json = JSON.stringify(editor.getEditorState().toJSON());
    const blocks = collectDocumentBlocks(json);

    // Build visual lookup map from the block list so PresentMode never touches Lexical.
    const visualMap = new Map<string, Visual>();
    for (const block of blocks) {
      if (block.kind === "visual") {
        visualMap.set(block.visualId, block.visual);
      }
    }

    const baseDeck = buildDeckFromBlocks(blocks);
    let fetchedRaw: unknown = null;
    setIsLoading(true);
    try {
      fetchedRaw = (await fetchDeckJson(documentId)).deckJson;
    } catch {
      // Network/auth error — fall back to page-load deckJson, then live blocks.
    } finally {
      setIsLoading(false);
    }

    const knownVisualIds = new Set(visualMap.keys());
    const deck = stripOrphanedVisuals(
      pickFreshestDeck(fetchedRaw, initialDeckJson, baseDeck),
      knownVisualIds,
    );
    setPresentData({ deck, visuals: visualMap });
  }, [documentId, editor, initialDeckJson]);

  const handleClose = useCallback(() => {
    setPresentData(null);
  }, []);

  return (
    <>
      <EditorToolbarButton
        label="Present"
        tooltip="Present fullscreen"
        icon={<MonitorPlay size={15} aria-hidden="true" />}
        iconOnly={iconOnly}
        onClick={handlePresent}
        disabled={isLoading}
        aria-label={`Present ${documentTitle ?? "document"}`}
      />

      {presentData ? (
        <PresentMode
          deck={presentData.deck}
          visuals={presentData.visuals}
          onClose={handleClose}
        />
      ) : null}
    </>
  );
}
