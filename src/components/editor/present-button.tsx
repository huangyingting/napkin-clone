"use client";

/**
 * Present button rendered in the document editor toolbar.
 *
 * Reads the current Lexical editor state, builds a {@link Deck} via
 * {@link buildDeckFromBlocks}, assembles a `visualId → Visual` map from the
 * same block list, and opens {@link PresentMode} as a fullscreen overlay.
 *
 * The present mode is READ-ONLY — it never mutates Lexical/Yjs state.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MonitorPlay } from "lucide-react";
import { useCallback, useState } from "react";

import { PresentMode } from "@/components/presentation/present-mode";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import { buildDeckFromBlocks, type Deck } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";
import { collectDocumentBlocks } from "@/lib/visual/document-export";

interface PresentButtonProps {
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
 * Placed in the editor header alongside Export and Share. On click it
 * synchronously reads the Lexical editor state, derives a {@link Deck} from the
 * block list, and renders {@link PresentMode} as a fixed fullscreen overlay.
 */
export function PresentButton({
  documentTitle,
  iconOnly = false,
}: PresentButtonProps) {
  const [editor] = useLexicalComposerContext();
  const [presentData, setPresentData] = useState<PresentData | null>(null);

  const handlePresent = useCallback(() => {
    const json = JSON.stringify(editor.getEditorState().toJSON());
    const blocks = collectDocumentBlocks(json);

    // Build visual lookup map from the block list so PresentMode never touches Lexical.
    const visualMap = new Map<string, Visual>();
    for (const block of blocks) {
      if (block.kind === "visual") {
        visualMap.set(block.visualId, block.visual);
      }
    }

    // Build the deck (pure, synchronous) and open the overlay.
    const deck = buildDeckFromBlocks(blocks);
    setPresentData({ deck, visuals: visualMap });
  }, [editor]);

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
