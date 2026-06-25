import { reconcileDocumentDeckDependencies } from "@/lib/document/source-ref-model";
import { buildDeckFromBlocks } from "@/lib/presentation/deck";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { buildPresentationBlocks } from "@/lib/presentation/present-blocks";
import type { Deck } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";

import { buildPublicAttribution, type PublicAttribution } from "./attribution";

export interface PublicPresentationDocument {
  title: string;
  contentJson: unknown;
  deckJson: unknown;
  owner: {
    name: string | null;
    plan: string;
  };
}

export interface PublicPresentationModel {
  title: string;
  deck: Deck;
  visuals: Record<string, Visual>;
  attribution: PublicAttribution;
}

export function buildPublicPresentationModel(
  document: PublicPresentationDocument,
): PublicPresentationModel {
  const blocks = buildPresentationBlocks(document.contentJson);
  const visuals: Record<string, Visual> = {};

  for (const block of blocks) {
    if (block.kind === "visual") {
      visuals[block.visualId] = block.visual;
    }
  }

  const parsed = document.deckJson ? safeParseDeck(document.deckJson) : null;
  const { deck } = reconcileDocumentDeckDependencies({
    deck: parsed && parsed.success ? parsed.data : buildDeckFromBlocks(blocks),
    visualsById: new Set(Object.keys(visuals)),
  });

  return {
    title: document.title,
    deck,
    visuals,
    attribution: buildPublicAttribution(document.owner),
  };
}
