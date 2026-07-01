"use server";

import { revalidatePath } from "next/cache";

import { requireDocumentActionContext } from "./document-context";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/log";
import {
  persistDeck,
  patchDeck,
  persistDeckCommand,
} from "@/lib/document/persistence-service";
import type {
  FetchDeckResult,
  SaveDeckFailureResult,
  SaveDeckPatchResult,
  SaveDeckResult,
} from "@/lib/document/persistence-types";
import type { DeckPatch } from "@/lib/presentation/slide-commands";
import type { SlideCommand } from "@/lib/presentation/slide-commands";
import {
  acceptDeckCommandEnvelope,
  type CommandEnvelope,
} from "@/lib/commands/command-envelope";

function fail(
  error: string,
  code: SaveDeckFailureResult["failure"]["code"],
  retryable: boolean,
): SaveDeckFailureResult {
  return { ok: false, error, failure: { code, retryable } };
}

/**
 * Returns `{ deckJson, revisionToken }` for a document so the slide editor can
 * seed itself from the freshest server state rather than the stale page-load
 * prop (issue #155). `deckJson` is `null` when no deck has been saved yet;
 * `revisionToken` is `null` for documents that have not yet received a token
 * (first save). Returns a structured `{ ok: false, failure }` result for
 * missing documents and storage faults instead of throwing.
 */
export async function fetchDeckJson(id: string): Promise<FetchDeckResult> {
  await requireDocumentActionContext(id, "view");

  try {
    const document = await prisma.document.findUnique({
      where: { id },
      select: { deckJson: true, deckRevisionToken: true },
    });
    if (!document) {
      return {
        ok: false,
        deckJson: null,
        revisionToken: null,
        error: "Document not found.",
        failure: { code: "document_not_found", retryable: false },
      };
    }

    return {
      ok: true,
      deckJson: document.deckJson,
      revisionToken: document.deckRevisionToken,
    };
  } catch (error) {
    logError("deck.fetch", error, { documentId: id });
    return {
      ok: false,
      deckJson: null,
      revisionToken: null,
      error: "Failed to load deck. Please try again.",
      failure: { code: "storage_unavailable", retryable: true },
    };
  }
}

/**
 * Persists an edited Deck for a document. Requires edit access (owner or
 * workspace editor), authorized via `requireDocumentCapability` so a viewer or
 * unrelated user is rejected with a clear error (issue #89).
 *
 * Delegates persistence orchestration to {@link persistDeck} in the persistence
 * service (#474).
 *
 * ## Mutation entry-point boundaries (Epic #494)
 *
 * The deck has three write entry points, each with a distinct input contract:
 *  - {@link saveDeckJson} — accepts a **full deck JSON** snapshot.
 *  - {@link saveDeckPatch} — accepts **`DeckPatch[]`** records but currently
 *    returns a compatibility `{ ok: "fallback" }` response for v7 runtime
 *    callers, which then use {@link saveDeckJson}.
 *  - {@link saveDeckCommand} — accepts a **`CommandEnvelope<SlideCommand>`**,
 *    validates it with `acceptDeckCommandEnvelope` (schema version / target /
 *    document checks) BEFORE persistence, then executes it server-side.
 *
 * Active v7 writes use optimistic revision-token CAS via `saveDeckJson`
 * (`clientToken`) and command envelopes (`expectedRevision`).
 *
 * @param clientToken - The revision token last received from `fetchDeckJson` or
 *   a prior successful save. When supplied the write uses an atomic CAS.
 */
export async function saveDeckJson(
  id: string,
  deckJson: unknown,
  clientToken?: string | null,
): Promise<SaveDeckResult> {
  const { user } = await requireDocumentActionContext(id, "edit");

  let result: SaveDeckResult;
  try {
    result = await persistDeck(id, deckJson, clientToken, {
      userId: user.id,
    });
  } catch (error) {
    logError("deck.save", error, { documentId: id });
    return fail(
      "Failed to save deck. Please try again.",
      "storage_unavailable",
      true,
    );
  }

  if (result.ok === true) {
    revalidatePath(`/app/documents/${id}`);
  }
  return result;
}

/**
 * Compatibility patch endpoint for non-v7 callers.
 *
 * Patch replay is currently disabled for the v7 runtime. Delegates to
 * {@link patchDeck}, which validates document availability and returns
 * `{ ok: "fallback" }` for replay attempts so callers can save a full deck via
 * {@link saveDeckJson}.
 *
 * Input contract: pre-built `DeckPatch[]` (typically produced by `commitCommand`
 * on the client). For the validated command-envelope entry point see
 * {@link saveDeckCommand}.
 */
export async function saveDeckPatch(
  id: string,
  patches: DeckPatch[],
  clientToken: string | null | undefined,
): Promise<SaveDeckPatchResult> {
  const { user } = await requireDocumentActionContext(id, "edit");

  let result: SaveDeckPatchResult;
  try {
    result = await patchDeck(id, patches, clientToken, { userId: user.id });
  } catch (error) {
    logError("deck.patch", error, { documentId: id });
    return fail(
      "Failed to save deck patches. Please try again.",
      "storage_unavailable",
      true,
    );
  }

  if (result.ok === true) {
    revalidatePath(`/app/documents/${id}`);
  }
  return result;
}

/**
 * Validated command-envelope write path for deck mutations (Epic #494, #508).
 *
 * Accepts a serializable {@link CommandEnvelope} carrying a {@link SlideCommand}
 * payload and enforces, in order:
 *  1. authorization — `requireDocumentCapability(..., "edit")`;
 *  2. envelope acceptance — `acceptDeckCommandEnvelope` rejects malformed,
 *     unsupported-schema-version, wrong-target-surface, and wrong-document
 *     envelopes BEFORE any persistence, with structured + safely-logged errors;
 *  3. server-side execution — runs the pure `executeCommand` against the stored
 *     deck;
 *  4. persistence — writes the result via `persistDeck` under the optimistic
 *     revision-token CAS (using `target.expectedRevision` as the client token).
 *
 * This keeps the existing CAS behavior intact while giving callers a single,
 * server-validated command surface that never trusts a client-provided patch
 * shape.
 */
export async function saveDeckCommand(
  id: string,
  envelope: CommandEnvelope<SlideCommand>,
): Promise<SaveDeckResult> {
  const { user } = await requireDocumentActionContext(id, "edit");

  const acceptance = acceptDeckCommandEnvelope(envelope, { documentId: id });
  if (!acceptance.ok) {
    logInfo("deck.command.rejected", "Rejected deck command envelope", {
      documentId: id,
      code: acceptance.code,
      errors: acceptance.errors,
      envelopeId: typeof envelope?.id === "string" ? envelope.id : "(unknown)",
    });
    return {
      ok: false,
      error: `Rejected command (${acceptance.code}): ${acceptance.errors.join("; ")}`,
      failure: { code: "command_rejected", retryable: false },
    };
  }

  let persisted: SaveDeckResult;
  try {
    persisted = await persistDeckCommand(id, envelope, { userId: user.id });
  } catch (error) {
    logError("deck.command", error, { documentId: id });
    return fail(
      "Failed to save deck command. Please try again.",
      "storage_unavailable",
      true,
    );
  }

  if (persisted.ok === true) {
    revalidatePath(`/app/documents/${id}`);
  }
  return persisted;
}
