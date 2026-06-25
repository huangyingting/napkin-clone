import { buildDeckFromBlocks, type Deck } from "@/lib/presentation/deck";
import { pickFreshestDeck } from "@/lib/presentation/fresh-deck";
import type { DocumentBlock } from "@/lib/content";
import type { Visual } from "@/lib/visual/schema";

export interface DeckExportContext {
  deck: Deck;
  visuals: Map<string, Visual>;
}

export function buildDeckVisualMap(
  blocks: ReadonlyArray<DocumentBlock>,
): Map<string, Visual> {
  const visuals = new Map<string, Visual>();
  for (const block of blocks) {
    if (block.kind === "visual") {
      visuals.set(block.visualId, block.visual);
    }
  }
  return visuals;
}

export function resolveDeckExportContext(
  blocks: ReadonlyArray<DocumentBlock>,
  freshestDeckJson: unknown,
  initialDeckJson: unknown,
): DeckExportContext {
  const baseDeck = buildDeckFromBlocks([...blocks]);
  return {
    deck: pickFreshestDeck(freshestDeckJson, initialDeckJson, baseDeck),
    visuals: buildDeckVisualMap(blocks),
  };
}
