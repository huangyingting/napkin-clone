import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";
import { createBlankDeckV7 } from "@/lib/presentation-vnext/empty-deck";
import { openDeckFromJson } from "@/lib/presentation-vnext/open-deck";
import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import type { ThemePackageV1 } from "@/lib/presentation-vnext/theme-package-schema";
import { resolveThemePackageForDeck } from "@/lib/presentation-vnext/theme-package-registry";

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
  recovery?: PublicPresentationRecovery;
  attribution: PublicAttribution;
}

export interface PublicPresentationRecovery {
  error: string;
  validationErrors?: string[];
  diagnostics: PresentationDiagnostic[];
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
  const recovery = opened.ok
    ? undefined
    : {
        error: opened.error,
        validationErrors: opened.errors,
        diagnostics: opened.diagnostics,
      };

  return {
    title: document.title,
    deckV7,
    themePackage: themeResolution.package,
    diagnostics: [
      ...(opened.ok ? opened.diagnostics : opened.diagnostics),
      ...themeResolution.diagnostics,
    ],
    ...(recovery ? { recovery } : {}),
    attribution: buildPublicAttribution(document.owner),
  };
}
