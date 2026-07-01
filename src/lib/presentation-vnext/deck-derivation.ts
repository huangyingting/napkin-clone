import type { PresentationDiagnostic } from "./diagnostics";
import { createBlankDeckV7 } from "./empty-deck";
import type { DeckV7 } from "./schema";
import {
  buildDocumentSourcePlanV1,
  compileDocumentSlidePlanToDeckV7,
  deriveDocumentSlidePlanDeterministic,
} from "./document-slide-plan";

export type DeriveDeckV7Result =
  | {
      ok: true;
      deck: DeckV7;
      diagnostics: PresentationDiagnostic[];
    }
  | {
      ok: false;
      error: string;
      diagnostics: PresentationDiagnostic[];
      validationErrors?: string[];
    };

export function deriveDeckV7FromDocumentContent({
  contentJson,
  documentId,
  linkedAt = new Date().toISOString(),
  themePackageId = "neutral",
}: {
  contentJson: unknown;
  documentId?: string;
  linkedAt?: string;
  themePackageId?: string;
}): DeriveDeckV7Result {
  const fallbackDeck = createBlankDeckV7({ documentId });
  const source = buildDocumentSourcePlanV1({ contentJson, documentId });
  if (source.blocks.length === 0) {
    return { ok: true, deck: fallbackDeck, diagnostics: [] };
  }

  const plan = deriveDocumentSlidePlanDeterministic(source);
  if (plan.slides.length === 0) {
    return { ok: true, deck: fallbackDeck, diagnostics: [] };
  }

  const compiled = compileDocumentSlidePlanToDeckV7({
    plan,
    blockMap: source.blockMap,
    linkedAt,
    themePackageId,
  });
  if (!compiled.ok) {
    return {
      ok: false,
      error: compiled.error,
      diagnostics: compiled.diagnostics,
      validationErrors: compiled.validationErrors,
    };
  }
  return compiled;
}
