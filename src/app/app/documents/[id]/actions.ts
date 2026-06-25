"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { requireDocumentActionContext } from "@/lib/actions/document-action-context";
import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import { stampBlockIds } from "@/lib/lexical/block-id";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { logInfo, logError } from "@/lib/log";
import {
  atomicSaveDocumentLexical,
  rebuildMirror,
  persistDeck,
  patchDeck,
  persistDeckCommand,
  restoreVersion,
  setDocumentSharing,
  regenerateDocumentShareLink,
  updateDocumentSharePolicyData,
  type VisualMirrorOutcome,
} from "@/lib/document/persistence-service";
import type {
  DocumentVersionSummary,
  RestoredDocumentVersion,
  SaveDeckPatchResult,
  SaveDeckResult,
  ShareSettings,
} from "@/lib/document/persistence-types";
import type { DeckPatch } from "@/lib/presentation/slide-commands";
import type { SlideCommand } from "@/lib/presentation/slide-commands";
import { normalizePersistedDeckJson } from "@/lib/presentation/persisted-deck";
import {
  acceptDeckCommandEnvelope,
  type CommandEnvelope,
} from "@/lib/commands/command-envelope";
import {
  LEXICAL_STATE_MAX_LENGTH,
  formatLexicalStateTooLargeError,
} from "@/lib/limits";

/**
 * Saves the serialized Lexical editor state for a document.
 *
 * Permission-checked (edit access required). Delegates all persistence
 * orchestration — atomic contentJson write + visual mirror rebuild — to
 * {@link atomicSaveDocumentLexical} in the persistence service (#474, #470).
 */
export async function saveDocumentLexical(
  id: string,
  stateJson: string,
): Promise<ActionResult<VisualMirrorOutcome>> {
  const user = await requireUser();

  if (stateJson.length > LEXICAL_STATE_MAX_LENGTH) {
    return actionError(formatLexicalStateTooLargeError());
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stateJson);
  } catch {
    return actionError("Invalid editor state.");
  }

  parsed = stampBlockIds(parsed);

  await requireDocumentCapability(user.id, id, "edit");

  const outcome = await atomicSaveDocumentLexical(id, parsed, user.id);

  revalidatePath("/app");
  return actionOk(outcome);
}

/**
 * Idempotent server action that rebuilds all `Visual` rows for a document
 * purely from its current `contentJson` (issue #451).
 *
 * Delegates to {@link rebuildMirror} in the persistence service after
 * permission checks. Does NOT snapshot, update `contentJson`, or touch any
 * other document fields. Running it twice without intermediate edits is a
 * no-op. Permission-checked: requires edit access to the document.
 */
export async function rebuildVisualMirror(
  documentId: string,
): Promise<ActionResult<VisualMirrorOutcome>> {
  await requireDocumentActionContext(documentId, "edit");

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { contentJson: true },
  });

  if (!doc) {
    return actionError("Document not found.");
  }

  if (doc.contentJson == null) {
    const empty: VisualMirrorOutcome = {
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      invalid: 0,
    };
    logInfo("visual.rebuild", "rebuild skipped: no contentJson", {
      documentId,
    });
    return actionOk(empty);
  }

  try {
    const outcome = await rebuildMirror(documentId, doc.contentJson);
    revalidatePath("/app");
    return actionOk(outcome);
  } catch (err) {
    logError(
      "visual.rebuild",
      err instanceof Error ? err : new Error(String(err)),
      { documentId },
    );
    return actionError("Failed to rebuild visual mirror.");
  }
}

// Furthest-out expiry a caller may set, guarding against absurd dates.
const MAX_SHARE_EXPIRY_MS = 5 * 365 * 24 * 60 * 60 * 1000; // ~5 years

/**
 * Toggles sharing for a document owned by the current user.
 *
 * - When enabling sharing (isShared: true), generates a unique shareId and a
 *   decorative slug.
 * - When disabling sharing (isShared: false), clears the shareId, slug, and any
 *   expiry so a re-enable starts from a clean policy.
 * - Returns the full {@link ShareSettings} (link + lifecycle policy).
 *
 * Requires manage access (owner-level); a viewer, editor, or unrelated user is
 * rejected with a clear error via `requireDocumentCapability` (issue #89) so it
 * never modifies a document the user may not manage.
 */
export async function toggleDocumentSharing(
  id: string,
  isShared: boolean,
): Promise<ActionResult<ShareSettings>> {
  await requireDocumentActionContext(id, "manage");
  const settings = await setDocumentSharing(id, isShared);

  revalidatePath(`/app/documents/${id}`);
  revalidatePath("/app");

  return actionOk(settings);
}

/**
 * Rotates the share link: generates a brand-new `shareId` (and refreshes the
 * decorative slug) so the OLD link immediately stops resolving on every public
 * route (issue #101 AC #1). Sharing must already be enabled; the lifecycle
 * policy (expiry, embed/present flags) is preserved.
 *
 * Requires manage access (owner-level) via `requireDocumentCapability`.
 */
export async function regenerateShareLink(
  id: string,
): Promise<ActionResult<ShareSettings>> {
  await requireDocumentActionContext(id, "manage");
  const settings = await regenerateDocumentShareLink(id);
  if (!settings) {
    return actionError("Enable sharing before regenerating the link.");
  }

  revalidatePath(`/app/documents/${id}`);
  revalidatePath("/app");

  return actionOk(settings);
}

/**
 * Updates the share-link lifecycle/access policy (issue #101 AC #2 & #3):
 * link expiry, and whether the embed and presentation modes are reachable for
 * the shared document. Each field is optional — omitted fields are left
 * unchanged; passing `expiresAt: null` clears the expiry.
 *
 * `expiresAt` is accepted as an ISO-8601 string (or `null`) and validated: it
 * must parse to a real date and may not be set absurdly far in the future.
 *
 * Requires manage access (owner-level) via `requireDocumentCapability`.
 */
export async function updateSharePolicy(
  id: string,
  policy: {
    expiresAt?: string | null;
    embedEnabled?: boolean;
    presentEnabled?: boolean;
  },
): Promise<ActionResult<ShareSettings>> {
  await requireDocumentActionContext(id, "manage");

  const data: {
    shareExpiresAt?: Date | null;
    shareEmbedEnabled?: boolean;
    sharePresentEnabled?: boolean;
  } = {};

  if ("expiresAt" in policy) {
    if (policy.expiresAt === null || policy.expiresAt === "") {
      data.shareExpiresAt = null;
    } else {
      const parsed = new Date(policy.expiresAt as string);
      if (Number.isNaN(parsed.getTime())) {
        return actionError("Invalid expiry date.");
      }
      if (parsed.getTime() - Date.now() > MAX_SHARE_EXPIRY_MS) {
        return actionError("Expiry date is too far in the future.");
      }
      data.shareExpiresAt = parsed;
    }
  }

  if (typeof policy.embedEnabled === "boolean") {
    data.shareEmbedEnabled = policy.embedEnabled;
  }
  if (typeof policy.presentEnabled === "boolean") {
    data.sharePresentEnabled = policy.presentEnabled;
  }

  const settings = await updateDocumentSharePolicyData(id, data);

  revalidatePath(`/app/documents/${id}`);
  revalidatePath("/app");

  return actionOk(settings);
}

/**
 * Returns `{ deckJson, revisionToken }` for a document so the slide editor can
 * seed itself from the freshest server state rather than the stale page-load
 * prop (issue #155). `deckJson` is `null` when no deck has been saved yet;
 * `revisionToken` is `null` for documents that have not yet received a token
 * (first save). Requires at least view access.
 */
export async function fetchDeckJson(
  id: string,
): Promise<{ deckJson: unknown; revisionToken: string | null }> {
  await requireDocumentActionContext(id, "view");

  const document = await prisma.document.findUniqueOrThrow({
    where: { id },
    select: { deckJson: true, deckRevisionToken: true },
  });

  return {
    deckJson: normalizePersistedDeckJson(document.deckJson),
    revisionToken: document.deckRevisionToken,
  };
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
 *  - {@link saveDeckPatch} — accepts **`DeckPatch[]`** records (already produced
 *    by `commitCommand` on the client) and applies them under CAS.
 *  - {@link saveDeckCommand} — accepts a **`CommandEnvelope<SlideCommand>`**,
 *    validates it with `acceptDeckCommandEnvelope` (schema version / target /
 *    document checks) BEFORE persistence, then executes it server-side.
 *
 * All three preserve the optimistic revision-token CAS via `clientToken` /
 * `expectedRevision`.
 *
 * @param clientToken - The revision token last received from `fetchDeckJson` or
 *   a prior successful save. When supplied the write uses an atomic CAS.
 */
export async function saveDeckJson(
  id: string,
  deckJson: unknown,
  clientToken?: string | null,
): Promise<SaveDeckResult> {
  await requireDocumentActionContext(id, "edit");

  const result = await persistDeck(id, deckJson, clientToken);

  if (result.ok === true) {
    revalidatePath(`/app/documents/${id}`);
  }
  return result;
}

/**
 * Applies a list of {@link DeckPatch} records to the stored deck, guarded by
 * the optimistic revision token. Delegates to {@link patchDeck} in the
 * persistence service (#474).
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
  await requireDocumentActionContext(id, "edit");

  const result = await patchDeck(id, patches, clientToken);

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
  await requireDocumentActionContext(id, "edit");

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
    };
  }

  const persisted = await persistDeckCommand(id, envelope);

  if (persisted.ok === true) {
    revalidatePath(`/app/documents/${id}`);
  }
  return persisted;
}

/**
 * Lists a document's version-history snapshots, newest first. Requires view
 * access (owner, workspace member, or otherwise permitted), authorized via
 * `requireDocumentCapability` so an unrelated user is rejected (issue #158).
 */
export async function listDocumentVersions(
  documentId: string,
): Promise<DocumentVersionSummary[]> {
  await requireDocumentActionContext(documentId, "view");

  const versions = await prisma.documentVersion.findMany({
    where: { documentId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      createdAt: true,
      label: true,
      deckJson: true,
      createdBy: { select: { name: true, email: true } },
    },
  });

  return versions.map((version) => ({
    id: version.id,
    createdAt: version.createdAt.toISOString(),
    label: version.label,
    authorName: version.createdBy
      ? (version.createdBy.name ?? version.createdBy.email ?? null)
      : null,
    hasDeck: version.deckJson != null,
  }));
}

/**
 * Restores a document to an earlier snapshot. Requires edit access.
 *
 * Delegates persistence orchestration (pre-restore checkpoint, atomic
 * contentJson+mirror write, deck sanitize+reconcile, cache revalidation) to
 * {@link restoreVersion} in the persistence service (#474).
 */
export async function restoreDocumentVersion(
  versionId: string,
): Promise<ActionResult<RestoredDocumentVersion>> {
  const user = await requireUser();

  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: { documentId: true },
  });
  if (!version) {
    return actionError("Version not found.");
  }

  const { documentId } = version;
  await requireDocumentCapability(user.id, documentId, "edit");

  try {
    const restored = await restoreVersion(documentId, versionId, user.id);
    revalidatePath(`/app/documents/${documentId}`);
    revalidatePath("/app");
    return actionOk(restored);
  } catch (err) {
    logError(
      "document.restore",
      err instanceof Error ? err : new Error(String(err)),
      { documentId, versionId },
    );
    return actionError("Failed to restore document version.");
  }
}
