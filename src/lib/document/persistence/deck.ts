/**
 * Deck persistence operations.
 *
 * Owns full-deck save (`persistDeck`), patch-based save (`patchDeck`), and
 * command-based save (`persistDeckCommand`) with optimistic revision tokens.
 */

import { prisma } from "@/lib/prisma";
import { writeDeckWithCas } from "@/lib/document/deck-cas-writer";
import { logError } from "@/lib/log";
import type {
  DeckPatch,
  SlideCommand,
} from "@/lib/presentation/slide-commands";
import type {
  SaveDeckFailureResult,
  SaveDeckPatchResult,
  SaveDeckResult,
} from "@/lib/document/persistence-types";
import type { CommandEnvelope } from "@/lib/commands/command-envelope";
import { snapshotDocumentVersion } from "./helpers";

// Re-export so the barrel can surface them via `export *`
export type { DeckPatch, SaveDeckPatchResult, SaveDeckResult };

function fail(
  error: string,
  code: SaveDeckFailureResult["failure"]["code"],
  retryable: boolean,
): SaveDeckFailureResult {
  return { ok: false, error, failure: { code, retryable } };
}

// ---------------------------------------------------------------------------
// Exported service operations
// ---------------------------------------------------------------------------

/**
 * Persists an edited Deck for a document with an optimistic revision token.
 * Returns a discriminated result:
 * - `{ ok: true, revisionToken }` — write accepted.
 * - `{ ok: "conflict", serverRevisionToken }` — token mismatch.
 * - `{ ok: false, error, failure }` — structured validation/storage failure.
 */
export async function persistDeck(
  documentId: string,
  deckJson: unknown,
  clientToken?: string | null,
  options: { userId?: string | null } = {},
): Promise<SaveDeckResult> {
  return writeDeckWithCas({
    documentId,
    deckJson,
    clientToken,
    telemetryArea: "persistDeck.input",
    onSuccess: () => snapshotDocumentVersion(documentId, options),
  });
}

/**
 * Applies a list of `DeckPatch` records to the stored deck, guarded by the
 * optimistic revision token. Falls back when any patch is un-replayable.
 */
export async function patchDeck(
  documentId: string,
  _patches: DeckPatch[],
  _clientToken: string | null | undefined,
  _options: { userId?: string | null } = {},
): Promise<SaveDeckPatchResult> {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true },
    });
    if (!document) {
      return fail("Document not found.", "document_not_found", false);
    }
  } catch (error) {
    logError("deck.patch", error, { documentId, operation: "findUnique" });
    return fail(
      "Failed to prepare deck patch save. Please try again.",
      "storage_unavailable",
      true,
    );
  }

  return { ok: "fallback" };
}

export async function persistDeckCommand(
  _documentId: string,
  _envelope: CommandEnvelope<SlideCommand>,
  _options: { userId?: string | null } = {},
): Promise<SaveDeckResult> {
  return fail(
    "Deck command persistence is disabled for v7-only slide editing.",
    "command_disabled",
    false,
  );
}
