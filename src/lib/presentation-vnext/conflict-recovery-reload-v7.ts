import type { DeckFetchPort } from "@/lib/action-ports";
import { openDeckFromJson } from "@/lib/presentation-vnext/open-deck";
import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";

export const CONFLICT_USE_SERVER_RELOAD_FAILED_MESSAGE =
  "Couldn't load the server version. Check your connection and retry.";

export type ConflictReloadFailureReasonV7 =
  | "fetch_failed"
  | "invalid_server_deck";

export type ConflictReloadServerResultV7 =
  | {
      ok: true;
      deck: DeckV7;
      deckJson: unknown;
      diagnostics: PresentationDiagnostic[];
      revisionToken: string | null;
    }
  | {
      ok: false;
      reason: ConflictReloadFailureReasonV7;
      error: string;
      diagnostics: PresentationDiagnostic[];
      validationErrors?: string[];
    };

export async function reloadConflictServerDeckV7({
  deckPort,
  documentId,
}: {
  deckPort: Pick<DeckFetchPort, "fetchDeckJson">;
  documentId: string;
}): Promise<ConflictReloadServerResultV7> {
  let fetchedDeck: Awaited<ReturnType<DeckFetchPort["fetchDeckJson"]>>;
  try {
    fetchedDeck = await deckPort.fetchDeckJson(documentId);
  } catch {
    return {
      ok: false,
      reason: "fetch_failed",
      error: CONFLICT_USE_SERVER_RELOAD_FAILED_MESSAGE,
      diagnostics: [],
    };
  }

  const openResult = openDeckFromJson(fetchedDeck.deckJson);
  if (!openResult.ok) {
    return {
      ok: false,
      reason: "invalid_server_deck",
      error: openResult.error,
      diagnostics: openResult.diagnostics,
      validationErrors: openResult.errors,
    };
  }

  return {
    ok: true,
    deck: openResult.deck,
    deckJson: fetchedDeck.deckJson,
    diagnostics: openResult.diagnostics,
    revisionToken: fetchedDeck.revisionToken,
  };
}
