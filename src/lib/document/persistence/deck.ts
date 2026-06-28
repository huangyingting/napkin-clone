/**
 * Deck persistence operations.
 *
 * Owns full-deck save (`persistDeck`), patch-based save (`patchDeck`), and
 * command-based save (`persistDeckCommand`) with optimistic revision tokens.
 */

import { prisma } from "@/lib/prisma";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { writeDeckWithCas } from "@/lib/document/deck-cas-writer";
import { reportSchemaFailure } from "@/lib/diagnostics/schema-telemetry";
import {
  applyPatch,
  executeCommand,
  type DeckPatch,
  type SlideCommand,
} from "@/lib/presentation/slide-commands";
import type {
  SaveDeckPatchResult,
  SaveDeckResult,
} from "@/lib/document/persistence-types";
import type { CommandEnvelope } from "@/lib/commands/command-envelope";
import { logInfo, logError } from "@/lib/log";
import { snapshotDocumentVersion } from "./helpers";

// Re-export so the barrel can surface them via `export *`
export type { DeckPatch, SaveDeckPatchResult, SaveDeckResult };

// ---------------------------------------------------------------------------
// Exported service operations
// ---------------------------------------------------------------------------

/**
 * Persists an edited Deck for a document with an optimistic revision token.
 * Returns a discriminated result:
 * - `{ ok: true, revisionToken }` — write accepted.
 * - `{ ok: "conflict", serverRevisionToken }` — token mismatch.
 * - `{ ok: false, error }` — validation or server error.
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
  patches: DeckPatch[],
  clientToken: string | null | undefined,
  options: { userId?: string | null } = {},
): Promise<SaveDeckPatchResult> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { deckJson: true, deckRevisionToken: true },
  });
  if (!document) return { ok: false, error: "Document not found." };

  if (clientToken != null && document.deckRevisionToken !== clientToken) {
    return {
      ok: "conflict",
      serverRevisionToken: document.deckRevisionToken,
    };
  }

  const baseResult = safeParseDeck(
    document.deckJson,
  ); /* node:coverage disable */
  if (!baseResult.success) {
    reportSchemaFailure("deck-parse-failed", {
      area: "patchDeck.storedDeck",
      documentId,
      reason: baseResult.error,
    });
    return { ok: false, error: `Stored deck is invalid: ${baseResult.error}` };
  }

  let deck = baseResult.data;
  for (const patch of patches) {
    const next = applyPatch(deck, patch);
    if (next === null) return { ok: "fallback" };
    deck = next;
  }
  /* node:coverage enable */

  const writeResult = await writeDeckWithCas({
    documentId,
    deckJson: deck,
    clientToken,
    telemetryArea: "patchDeck.result",
    onSuccess: () => snapshotDocumentVersion(documentId, options),
  });

  if (!writeResult.ok && writeResult.error.startsWith("Invalid deck: ")) {
    return {
      ok: false,
      error: writeResult.error.replace(
        "Invalid deck: ",
        "Patch result is invalid: ",
      ),
    };
  }

  return writeResult;
}

export async function persistDeckCommand(
  documentId: string,
  envelope: CommandEnvelope<SlideCommand>,
  options: { userId?: string | null } = {},
): Promise<SaveDeckResult> {
  /* node:coverage disable */
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { deckJson: true },
  });
  if (!document) {
    return { ok: false, error: "Document not found." };
  }
  const parsed = safeParseDeck(document.deckJson); /* node:coverage enable */
  /* node:coverage disable */ if (!parsed.success) {
    logError("deck.command.stored_deck_invalid", new Error(parsed.error), {
      documentId,
      envelopeId: envelope.id,
    });
    return { ok: false, error: `Stored deck is invalid: ${parsed.error}` };
  }
  /* node:coverage enable */

  const result = executeCommand(parsed.data, envelope.payload);
  if (!result.ok) {
    logInfo("deck.command.execution_failed", "Deck command failed to execute", {
      documentId,
      envelopeId: envelope.id,
      type: envelope.payload.type,
      error: result.error,
    });
    return { ok: false, error: result.error ?? "Command failed to execute." };
  }

  return persistDeck(
    documentId,
    result.deck,
    envelope.target.expectedRevision ?? null,
    options,
  );
}
