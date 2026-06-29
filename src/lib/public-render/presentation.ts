import { reconcileDocumentDeckDependencies } from "@/lib/document/source-ref-model";
import { buildDeckFromBlocks } from "@/lib/presentation/deck";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { buildPresentationBlocks } from "@/lib/presentation/present-blocks";
import type { Deck } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";
import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import {
  looksLikeDeckV7,
  openDeckFromJson,
} from "@/lib/presentation-vnext/open-deck";

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
  /**
   * When the persisted deck is a valid v7 deck, this field carries it so
   * render surfaces can route to the vNext render path without v6
   * materialisation.  Absent for v6 and legacy decks.
   */
  deckV7?: DeckV7;
}

/**
 * v7-specific public presentation model.
 *
 * Returned by `buildPublicPresentationModelAny` when `deckJson` is a valid
 * v7 deck. Consumers should render via `PublicPresentViewerVNext`.
 */
export interface PublicPresentationModelV7 {
  kind: "v7";
  title: string;
  deckV7: DeckV7;
  attribution: PublicAttribution;
}

export type AnyPublicPresentationModel =
  | ({ kind: "v6" } & PublicPresentationModel)
  | PublicPresentationModelV7;

/**
 * Builds a presentation model from persisted document JSON.
 *
 * When `deckJson` is a valid v7 deck, returns a `PublicPresentationModelV7`
 * so the caller can route to the vNext render surface without v6
 * materialisation. Falls back to the legacy v6 model otherwise.
 */
export function buildPublicPresentationModelAny(
  document: PublicPresentationDocument,
): AnyPublicPresentationModel {
  // Fast path: route v7 decks to the vNext surface
  if (looksLikeDeckV7(document.deckJson)) {
    const result = openDeckFromJson(document.deckJson);
    if (result.ok) {
      return {
        kind: "v7",
        title: document.title,
        deckV7: result.deck,
        attribution: buildPublicAttribution(document.owner),
      };
    }
    // Fall through to v6 path on validation failure
  }

  const model = buildPublicPresentationModel(document);
  return { kind: "v6", ...model };
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

  // When the persisted deck is v7, carry it through on the `deckV7` field so
  // the page can route to the vNext viewer without re-parsing.
  let deckV7: DeckV7 | undefined;
  if (looksLikeDeckV7(document.deckJson)) {
    const v7Result = openDeckFromJson(document.deckJson);
    if (v7Result.ok) deckV7 = v7Result.deck;
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
    ...(deckV7 ? { deckV7 } : {}),
  };
}
