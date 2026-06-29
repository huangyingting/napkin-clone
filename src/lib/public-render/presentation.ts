import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import {
  createBlankDeckV7,
  openDeckFromJson,
  resolveThemePackage,
  type ThemeResolutionResult,
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
  themeResolution: ThemeResolutionResult;
  attribution: PublicAttribution;
  /**
   * Non-null when `deckJson` was present but could not be parsed as a valid
   * v7 deck.  Consumers may log or display this diagnostic.
   */
  openError?: string;
}

export function buildPublicPresentationModelAny(
  document: PublicPresentationDocument,
): PublicPresentationModel {
  return buildPublicPresentationModel(document);
}

export function buildPublicPresentationModel(
  document: PublicPresentationDocument,
): PublicPresentationModel {
  let deckV7: DeckV7;
  let openError: string | undefined;

  if (document.deckJson != null) {
    const opened = openDeckFromJson(document.deckJson);
    if (opened.ok) {
      deckV7 = opened.deck;
    } else {
      // Non-null but invalid/legacy: use blank deck and carry the error.
      deckV7 = createBlankDeckV7({ title: document.title });
      openError = opened.error;
    }
  } else {
    deckV7 = createBlankDeckV7({ title: document.title });
  }

  const themeResolution = resolveThemePackage(deckV7.theme.packageId);

  return {
    title: document.title,
    deckV7,
    themeResolution,
    attribution: buildPublicAttribution(document.owner),
    openError,
  };
}
