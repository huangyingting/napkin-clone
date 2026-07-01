import type { DeckFetchPort } from "@/lib/action-ports";
import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";
import { decideDeckOpen } from "@/lib/presentation-vnext/open-deck";
import type { DeckV7 } from "@/lib/presentation-vnext/schema";

export const DECK_OPEN_FETCH_REJECTED_MESSAGE_V7 =
  "Couldn't load the latest deck. Check your connection and retry.";

export type DeckOpenFetchFailureReasonV7 = "result_error" | "rejected";

export type DeckOpenFetchFailureV7 = {
  reason: DeckOpenFetchFailureReasonV7;
  error: string;
};

export type PreparedDeckForOpenV7 =
  | {
      ok: true;
      deck: DeckV7;
      diagnostics: PresentationDiagnostic[];
      revisionToken: string | null;
    }
  | {
      ok: false;
      error: string;
      diagnostics: PresentationDiagnostic[];
      validationErrors?: string[];
    };

export type DeckOpenFallbackV7 =
  | DeckV7
  | { deck: DeckV7; diagnostics?: PresentationDiagnostic[] };

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim();
  }
  if (typeof error === "string") {
    return error.trim();
  }
  return "";
}

export function resolveDeckOpenFetchRejectionErrorV7(error: unknown): string {
  const details = stringifyError(error);
  if (!details) {
    return DECK_OPEN_FETCH_REJECTED_MESSAGE_V7;
  }
  return `${DECK_OPEN_FETCH_REJECTED_MESSAGE_V7} (${details})`;
}

function normalizeFallbackDeck(fallback: DeckOpenFallbackV7): {
  deck: DeckV7;
  diagnostics: PresentationDiagnostic[];
} {
  if ("schemaVersion" in fallback) {
    return { deck: fallback, diagnostics: [] };
  }
  return { deck: fallback.deck, diagnostics: fallback.diagnostics ?? [] };
}

export async function prepareDeckForOpenV7({
  documentId,
  deckPort,
  fallbackDeck,
  onFetchFailure,
}: {
  documentId: string;
  deckPort: Pick<DeckFetchPort, "fetchDeckJson">;
  fallbackDeck: () => DeckOpenFallbackV7;
  onFetchFailure?: (failure: DeckOpenFetchFailureV7) => void;
}): Promise<PreparedDeckForOpenV7> {
  let fetchedDeck: Awaited<ReturnType<DeckFetchPort["fetchDeckJson"]>>;
  try {
    fetchedDeck = await deckPort.fetchDeckJson(documentId);
  } catch (error) {
    const resolvedError = resolveDeckOpenFetchRejectionErrorV7(error);
    onFetchFailure?.({
      reason: "rejected",
      error: resolvedError,
    });
    return {
      ok: false,
      error: resolvedError,
      diagnostics: [],
    };
  }

  if (!fetchedDeck.ok) {
    onFetchFailure?.({
      reason: "result_error",
      error: fetchedDeck.error,
    });
    return {
      ok: false,
      error: fetchedDeck.error,
      diagnostics: [],
    };
  }

  const decision = decideDeckOpen(fetchedDeck.deckJson ?? null);
  if (decision.mode === "blank") {
    const fallback = normalizeFallbackDeck(fallbackDeck());
    return {
      ok: true,
      deck: fallback.deck,
      diagnostics: fallback.diagnostics,
      revisionToken: fetchedDeck.revisionToken,
    };
  }
  if (decision.mode === "open") {
    return {
      ok: true,
      deck: decision.deck,
      diagnostics: decision.diagnostics,
      revisionToken: fetchedDeck.revisionToken,
    };
  }
  return {
    ok: false,
    error: decision.error,
    diagnostics: decision.diagnostics,
    validationErrors: decision.errors,
  };
}
