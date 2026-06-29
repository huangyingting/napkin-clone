import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import {
  createBlankDeckV7,
  openDeckFromJson,
} from "@/lib/presentation-vnext";

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
  deckV7: DeckV7;
  attribution: PublicAttribution;
}

export function buildPublicPresentationModelAny(
  document: PublicPresentationDocument,
): PublicPresentationModel {
  return buildPublicPresentationModel(document);
}

export function buildPublicPresentationModel(
  document: PublicPresentationDocument,
): PublicPresentationModel {
  const opened = openDeckFromJson(document.deckJson);

  return {
    title: document.title,
    deckV7: opened.ok
      ? opened.deck
      : createBlankDeckV7({ title: document.title }),
    attribution: buildPublicAttribution(document.owner),
  };
}
