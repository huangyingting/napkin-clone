import type {
  DeckV7,
  PresentationDiagnostic,
  ThemePackageV1,
} from "@/lib/presentation-vnext";
import {
  createBlankDeckV7,
  openDeckFromJson,
  resolveThemePackageForDeck,
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
  themePackage: ThemePackageV1;
  diagnostics: PresentationDiagnostic[];
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
  const deckV7 = opened.ok
    ? opened.deck
    : createBlankDeckV7({ title: document.title });
  const themeResolution = resolveThemePackageForDeck(deckV7);

  return {
    title: document.title,
    deckV7,
    themePackage: themeResolution.package,
    diagnostics: [
      ...(opened.ok ? opened.diagnostics : opened.diagnostics),
      ...themeResolution.diagnostics,
    ],
    attribution: buildPublicAttribution(document.owner),
  };
}
