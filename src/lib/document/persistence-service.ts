/**
 * Document persistence/domain service (#474, #470).
 *
 * Owns all persistence orchestration for documents:
 *  - Lexical contentJson save + visual mirror rebuild — atomically in ONE
 *    transaction so they can never diverge (#470).
 *  - Deck JSON save / patch-apply with optimistic revision token.
 *  - Version restore with pre-restore checkpoint + post-mirror deck
 *    reconciliation.
 *  - Belt-and-suspenders deck reconciliation after a mirror rebuild.
 *  - Share-path cache revalidation.
 *
 * Server actions in `actions.ts` own session / permission / argument validation
 * and call this service as a thin boundary. This separation makes transaction
 * boundaries, logging, and future audit behavior explicit and testable without
 * React or route fixtures.
 *
 * All structured logging follows the `logInfo`/`logError` contract: ids and
 * counts only — no PII, no document content.
 */

import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";

import { Prisma } from "@/generated/prisma/client";
import { app as appEnv } from "@/lib/env";
import { collectVisualNodes } from "@/lib/lexical/visual-nodes";
import { lexicalStateToPlainText } from "@/lib/content";
import {
  MAX_DOCUMENT_VERSIONS,
  SNAPSHOT_MIN_INTERVAL_MS,
  shouldSnapshot,
  staleVersionIds,
} from "@/lib/document-versions";
import { prisma } from "@/lib/prisma";
import { buildShareSegment, buildSlugCandidate } from "@/lib/slug";
import type {
  RestoredDocumentVersion,
  SaveDeckPatchResult,
  SaveDeckResult,
  ShareSettings,
} from "@/lib/document/persistence-types";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { reconcileDocumentDeckDependencies } from "@/lib/document/source-ref-model";
import { reportSchemaFailure } from "@/lib/diagnostics/schema-telemetry";
import { generateRevisionToken } from "@/lib/presentation/deck-revision-token";
import {
  DOCUMENT_CONTENT_MAX_LENGTH,
  MAX_DECK_JSON_BYTES,
  formatDeckTooLargeError,
} from "@/lib/limits";
import {
  applyPatch,
  executeCommand,
  type DeckPatch,
  type SlideCommand,
} from "@/lib/presentation/slide-commands";
import { VISUAL_KIND_TO_PRISMA, safeParseVisual } from "@/lib/visual/schema";
import {
  diffVisualMirror,
  mirrorOutcomeFromDiff,
  type LiveVisualNode,
  type VisualMirrorOutcome,
} from "@/lib/visual/mirror-diff";
import { logInfo, logError } from "@/lib/log";
import type { CommandEnvelope } from "@/lib/commands/command-envelope";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ANCHOR_BLOCK_ID_LENGTH = 200;
const MAX_VISUAL_REVISIONS = 10;
const MAX_SLUG_WRITE_ATTEMPTS = 5;

const generateShareId = customAlphabet(
  "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ",
  12,
);
const generateSlugSuffix = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 4);

// ---------------------------------------------------------------------------
// Public result types (re-exported so actions.ts can forward them)
// ---------------------------------------------------------------------------

export type { VisualMirrorOutcome, DeckPatch };
export type { RestoredDocumentVersion, SaveDeckPatchResult, SaveDeckResult };

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a caller-supplied anchor block id. A non-empty trimmed string
 * (clamped to a sane length) anchors the visual to that Markdown block; any
 * empty/whitespace value or non-string collapses to `null`.
 */
function normalizeAnchorBlockId(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_ANCHOR_BLOCK_ID_LENGTH);
}

function stableJsonString(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${(value as unknown[]).map(stableJsonString).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonString(record[key])}`)
    .join(",")}}`;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return stableJsonString(a) === stableJsonString(b);
}

function buildShareUrl(
  slug: string | null,
  shareId: string | null,
): string | null {
  if (!slug || !shareId) {
    return null;
  }
  const base = appEnv.url();
  return `${base}/share/${buildShareSegment(slug, shareId)}`;
}

function toShareSettings(row: {
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareExpiresAt: Date | null;
  shareEmbedEnabled: boolean;
  sharePresentEnabled: boolean;
}): ShareSettings {
  const shared = row.isShared && row.shareId !== null && row.slug !== null;
  return {
    isShared: row.isShared,
    shareId: row.shareId,
    slug: row.slug,
    shareUrl: shared ? buildShareUrl(row.slug, row.shareId) : null,
    expiresAt: row.shareExpiresAt ? row.shareExpiresAt.toISOString() : null,
    embedEnabled: row.shareEmbedEnabled,
    presentEnabled: row.sharePresentEnabled,
  };
}

function generateShareSlugCandidate(title: string): string | null {
  const suffix = generateSlugSuffix();
  const candidate = buildSlugCandidate(title, suffix);
  return candidate || null;
}

async function writeShareData(
  id: string,
  isShared: boolean,
  shareId: string | null,
  title: string | null,
): Promise<{
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareExpiresAt: Date | null;
  shareEmbedEnabled: boolean;
  sharePresentEnabled: boolean;
}> {
  if (!isShared) {
    return prisma.document.update({
      where: { id },
      data: { isShared, shareId: null, slug: null, shareExpiresAt: null },
      select: {
        isShared: true,
        shareId: true,
        slug: true,
        shareExpiresAt: true,
        shareEmbedEnabled: true,
        sharePresentEnabled: true,
      },
    });
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SLUG_WRITE_ATTEMPTS; attempt++) {
    const slug = title ? generateShareSlugCandidate(title) : null;
    try {
      return await prisma.document.update({
        where: { id },
        data: { isShared, shareId, slug },
        select: {
          isShared: true,
          shareId: true,
          slug: true,
          shareExpiresAt: true,
          shareEmbedEnabled: true,
          sharePresentEnabled: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Failed to generate a unique share slug after ${MAX_SLUG_WRITE_ATTEMPTS} attempts. Please try again.`,
    { cause: lastError },
  );
}

/**
 * Records a snapshot of a visual's current persisted state into
 * `VisualRevision`, then prunes that visual's history to the most recent
 * `MAX_VISUAL_REVISIONS` entries. Called with the *previous* row before it is
 * overwritten, so each edit is restorable (US-016).
 */
async function snapshotVisualRevision(
  tx: Prisma.TransactionClient,
  previous: {
    id: string;
    data: Prisma.JsonValue;
    type: string;
    title: string | null;
  },
): Promise<void> {
  await tx.visualRevision.create({
    data: {
      visualId: previous.id,
      data: previous.data as unknown as Prisma.InputJsonValue,
      type: previous.type,
      title: previous.title,
    },
  });

  const stale = await tx.visualRevision.findMany({
    where: { visualId: previous.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: MAX_VISUAL_REVISIONS,
    select: { id: true },
  });

  if (stale.length > 0) {
    await tx.visualRevision.deleteMany({
      where: { id: { in: stale.map((r) => r.id) } },
    });
  }
}

/**
 * Records a point-in-time snapshot of a document's current persisted editable
 * state into `DocumentVersion`, then prunes to the most recent
 * `MAX_DOCUMENT_VERSIONS` entries. Snapshots are throttled by
 * `shouldSnapshot`; failures are swallowed so they never break the caller.
 */
async function snapshotDocumentVersion(
  documentId: string,
  options: {
    userId?: string | null;
    force?: boolean;
    label?: string | null;
  } = {},
): Promise<void> {
  try {
    const now = new Date();

    const last = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, contentJson: true, deckJson: true },
    });

    if (
      !shouldSnapshot(
        last?.createdAt ?? null,
        now,
        SNAPSHOT_MIN_INTERVAL_MS,
        options.force ?? false,
      )
    ) {
      return;
    }

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { contentJson: true, deckJson: true },
    });
    if (!doc || doc.contentJson == null) return;

    if (
      !(options.force ?? false) &&
      last &&
      jsonEqual(doc.contentJson, last.contentJson) &&
      jsonEqual(doc.deckJson, last.deckJson)
    ) {
      return;
    }

    await prisma.documentVersion.create({
      data: {
        documentId,
        contentJson: (doc.contentJson ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        deckJson:
          doc.deckJson == null
            ? Prisma.DbNull
            : (doc.deckJson as Prisma.InputJsonValue),
        label: options.label ?? null,
        createdById: options.userId ?? null,
      },
    });

    const existing = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const stale = staleVersionIds(
      existing.map((v) => v.id),
      MAX_DOCUMENT_VERSIONS,
    );
    if (stale.length > 0) {
      await prisma.documentVersion.deleteMany({
        where: { id: { in: stale } },
      });
    }
  } catch {
    // A failed snapshot must never surface to the caller's save.
  }
}

/**
 * Core mirror logic that runs entirely inside a caller-supplied Prisma
 * transaction client. Accepting `tx` as a parameter is what makes the
 * contentJson write + mirror atomic in a single transaction (#470): when the
 * caller passes the same `tx` as was used to write `contentJson`, Postgres /
 * SQLite sees a single atomic unit — a mirror failure rolls the whole thing
 * back so `contentJson` is never left committed with stale `Visual` rows.
 *
 * Also usable standalone (e.g. `rebuildVisualMirror`) by wrapping in its own
 * `prisma.$transaction(async tx => mirrorVisualNodesInTx(tx, ...))`.
 */
export async function mirrorVisualNodesInTx(
  tx: Prisma.TransactionClient,
  documentId: string,
  parsedState: unknown,
): Promise<VisualMirrorOutcome> {
  const nodes = collectVisualNodes(parsedState);

  const liveAnchors = new Set<string>();
  const liveNodes: Array<LiveVisualNode<Prisma.InputJsonValue>> = [];
  let invalidCount = 0;
  let skippedCount = 0;

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const anchor = normalizeAnchorBlockId(node.visualId);
    if (!anchor) {
      invalidCount += 1;
      continue;
    }
    liveAnchors.add(anchor);

    const result = safeParseVisual(node.visual);
    if (!result.success) {
      skippedCount += 1;
      reportSchemaFailure("content-visual-parse-failed", {
        area: "Document.contentJson:visual",
        documentId,
        anchorBlockId: anchor,
        reason: result.error,
      });
      continue;
    }
    const visual = result.data;
    liveNodes.push({
      anchorBlockId: anchor,
      orderIndex: index,
      type: VISUAL_KIND_TO_PRISMA[visual.type],
      title: visual.title ?? null,
      data: visual as unknown as Prisma.InputJsonValue,
      dataKey: JSON.stringify(visual),
    });
  }

  const existingRows = await tx.visual.findMany({
    where: { documentId },
    select: {
      id: true,
      anchorBlockId: true,
      orderIndex: true,
      data: true,
      type: true,
      title: true,
      createdAt: true,
    },
  });

  const existingById = new Map(existingRows.map((row) => [row.id, row]));

  const diff = diffVisualMirror<Prisma.InputJsonValue>({
    existingRows: existingRows.map((row) => {
      const parsed = safeParseVisual(row.data);
      if (!parsed.success) {
        reportSchemaFailure("visual-parse-failed", {
          area: "Visual.data",
          documentId,
          rowId: row.id,
          ...(row.anchorBlockId ? { anchorBlockId: row.anchorBlockId } : {}),
          reason: parsed.error,
        });
      }
      return {
        id: row.id,
        anchorBlockId: row.anchorBlockId,
        orderIndex: row.orderIndex,
        dataKey: parsed.success ? JSON.stringify(parsed.data) : null,
        createdAt: row.createdAt.getTime(),
      };
    }),
    liveNodes,
    liveAnchors,
  });

  for (const create of diff.toCreate) {
    await tx.visual.upsert({
      where: {
        documentId_anchorBlockId: {
          documentId,
          anchorBlockId: create.anchorBlockId,
        },
      },
      create: {
        documentId,
        anchorBlockId: create.anchorBlockId,
        orderIndex: create.orderIndex,
        type: create.type,
        title: create.title,
        data: create.data,
      },
      update: {
        orderIndex: create.orderIndex,
        type: create.type,
        title: create.title,
        data: create.data,
      },
    });
  }

  for (const update of diff.toUpdate) {
    if (update.payloadChanged) {
      const previous = existingById.get(update.id);
      if (previous) {
        await snapshotVisualRevision(tx, previous);
      }
      await tx.visual.update({
        where: { id: update.id },
        data: {
          type: update.type,
          title: update.title,
          data: update.data,
          orderIndex: update.orderIndex,
        },
      });
    } else {
      await tx.visual.update({
        where: { id: update.id },
        data: { orderIndex: update.orderIndex },
      });
    }
  }

  if (diff.toDelete.length > 0) {
    await tx.visual.deleteMany({ where: { id: { in: diff.toDelete } } });
  }

  return mirrorOutcomeFromDiff(diff, skippedCount, invalidCount);
}

// ---------------------------------------------------------------------------
// Exported service operations
// ---------------------------------------------------------------------------

export async function setDocumentSharing(
  id: string,
  isShared: boolean,
): Promise<ShareSettings> {
  const shareId = isShared ? generateShareId() : null;

  let docTitle: string | null = null;
  if (isShared) {
    const doc = await prisma.document.findFirst({
      where: { id },
      select: { title: true },
    });
    if (doc) docTitle = doc.title;
  }

  return toShareSettings(await writeShareData(id, isShared, shareId, docTitle));
}

export async function regenerateDocumentShareLink(
  id: string,
): Promise<ShareSettings | null> {
  const doc = await prisma.document.findFirst({
    where: { id },
    select: { title: true, isShared: true },
  });

  if (!doc || !doc.isShared) {
    return null;
  }

  const shareId = generateShareId();
  return toShareSettings(await writeShareData(id, true, shareId, doc.title));
}

export async function updateDocumentSharePolicyData(
  id: string,
  data: {
    shareExpiresAt?: Date | null;
    shareEmbedEnabled?: boolean;
    sharePresentEnabled?: boolean;
  },
): Promise<ShareSettings> {
  const updated = await prisma.document.update({
    where: { id },
    data,
    select: {
      isShared: true,
      shareId: true,
      slug: true,
      shareExpiresAt: true,
      shareEmbedEnabled: true,
      sharePresentEnabled: true,
    },
  });

  return toShareSettings(updated);
}

/**
 * Atomically saves the Lexical editor state and rebuilds the Visual mirror
 * projection inside a **single** Prisma transaction (#470).
 *
 * A mirror failure rolls back the `contentJson` write so downstream readers
 * can never observe a committed `contentJson` with stale/missing `Visual` rows.
 *
 * @param documentId   The document to save.
 * @param parsedState  The already-parsed (and block-id-stamped) Lexical state.
 * @param userId       Optional: author for the version snapshot.
 */
export async function atomicSaveDocumentLexical(
  documentId: string,
  parsedState: unknown,
  userId?: string | null,
): Promise<VisualMirrorOutcome> {
  const content = lexicalStateToPlainText(parsedState).slice(
    0,
    DOCUMENT_CONTENT_MAX_LENGTH,
  );

  await snapshotDocumentVersion(documentId, { userId });

  let outcome: VisualMirrorOutcome;

  await prisma.$transaction(async (tx) => {
    await tx.document.updateMany({
      where: { id: documentId },
      data: {
        contentJson: parsedState as Prisma.InputJsonValue,
        content,
      },
    });

    outcome = await mirrorVisualNodesInTx(tx, documentId, parsedState);
  });

  // TypeScript requires the assignment to flow through — outcome is set in tx.
  const finalOutcome = outcome!;

  logInfo("visual.mirror", "mirror complete", {
    documentId,
    created: finalOutcome.created,
    updated: finalOutcome.updated,
    deleted: finalOutcome.deleted,
    skipped: finalOutcome.skipped,
    invalid: finalOutcome.invalid,
  });

  return finalOutcome;
}

/**
 * Rebuilds all `Visual` rows for a document purely from its current
 * `contentJson` (repair / standalone path). Does NOT snapshot, update
 * `contentJson`, or touch other document fields. Idempotent.
 */
export async function rebuildMirror(
  documentId: string,
  parsedState: unknown,
): Promise<VisualMirrorOutcome> {
  let outcome: VisualMirrorOutcome;
  await prisma.$transaction(async (tx) => {
    outcome = await mirrorVisualNodesInTx(tx, documentId, parsedState);
  });
  const finalOutcome = outcome!;
  logInfo("visual.rebuild", "rebuild complete", {
    documentId,
    ...finalOutcome,
  });
  return finalOutcome;
}

/**
 * Sanitizes a restored snapshot's `deckJson` against its restored content.
 * Orphaned visual references are stripped so a restore never re-introduces
 * silently blank slides. Returns `Prisma.DbNull` when there is no deck.
 */
export function sanitizeRestoredDeck(
  rawDeckJson: Prisma.JsonValue | null,
  restoredContent: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (rawDeckJson == null) return Prisma.DbNull;

  const parsed = safeParseDeck(rawDeckJson);
  if (!parsed.success) {
    reportSchemaFailure("deck-parse-failed", {
      area: "DocumentVersion.deckJson",
      reason: parsed.error,
    });
    return rawDeckJson as Prisma.InputJsonValue;
  }

  const knownVisualIds = new Set(
    collectVisualNodes(restoredContent).map((n) => n.visualId),
  );
  const { deck: sanitized } = reconcileDocumentDeckDependencies({
    deck: parsed.data,
    visualsById: knownVisualIds,
  });
  return sanitized as unknown as Prisma.InputJsonValue;
}

/**
 * Belt-and-suspenders post-mirror deck reconciliation.
 *
 * Re-reads the document's `deckJson` and current Visual rows from the DB,
 * strips deck visual references that no longer have a corresponding Visual row.
 * No-ops when there is no deck or when every deck reference is still valid.
 */
export async function reconcileDeckAfterMirror(
  documentId: string,
): Promise<void> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { deckJson: true },
    });
    if (!doc?.deckJson) return;

    const parsed = safeParseDeck(doc.deckJson);
    if (!parsed.success) {
      reportSchemaFailure("deck-parse-failed", {
        area: "Document.deckJson",
        documentId,
        reason: parsed.error,
      });
      return;
    }

    const visualRows = await prisma.visual.findMany({
      where: { documentId, anchorBlockId: { not: null } },
      select: { anchorBlockId: true },
    });
    const knownVisualIds = new Set(
      visualRows
        .map((r) => r.anchorBlockId)
        .filter((id): id is string => id !== null),
    );

    const { deck: reconciled, changed } = reconcileDocumentDeckDependencies({
      deck: parsed.data,
      visualsById: knownVisualIds,
    });

    if (!changed) return;

    await prisma.document.updateMany({
      where: { id: documentId },
      data: { deckJson: reconciled as unknown as Prisma.InputJsonValue },
    });

    logInfo("visual.reconcile", "deck reconciled after mirror", {
      documentId,
      knownVisualCount: knownVisualIds.size,
    });
  } catch (err) {
    logError(
      "visual.reconcile",
      err instanceof Error ? err : new Error(String(err)),
      { documentId },
    );
  }
}

/**
 * Revalidates the Next.js cache for all public share/embed/present paths
 * associated with a document. Called after restore so cached public pages
 * reflect the restored content.
 */
export async function revalidateSharePaths(documentId: string): Promise<void> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { shareId: true, slug: true, isShared: true },
    });
    if (!doc?.isShared || !doc.shareId) return;

    const segment = buildShareSegment(doc.slug, doc.shareId);
    revalidatePath(`/share/${segment}`);
    revalidatePath(`/embed/${segment}`);
    revalidatePath(`/present/${segment}`);
  } catch {
    // Cache revalidation failures must never surface to the caller.
  }
}

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
): Promise<SaveDeckResult> {
  const result = safeParseDeck(deckJson);
  if (!result.success) {
    reportSchemaFailure("deck-parse-failed", {
      area: "persistDeck.input",
      documentId,
      reason: result.error,
    });
    return { ok: false, error: `Invalid deck: ${result.error}` };
  }

  const serialized = JSON.stringify(result.data);
  if (serialized.length > MAX_DECK_JSON_BYTES) {
    return { ok: false, error: formatDeckTooLargeError() };
  }

  const newToken = generateRevisionToken();

  if (clientToken != null) {
    const { count } = await prisma.document.updateMany({
      where: { id: documentId, deckRevisionToken: clientToken },
      data: {
        deckJson: result.data as unknown as Prisma.InputJsonValue,
        deckRevisionToken: newToken,
      },
    });
    if (count === 0) {
      const latest = await prisma.document.findUnique({
        where: { id: documentId },
        select: { deckRevisionToken: true },
      });
      if (!latest) return { ok: false, error: "Document not found." };
      return {
        ok: "conflict",
        serverRevisionToken: latest.deckRevisionToken,
      };
    }
  } else {
    const { count } = await prisma.document.updateMany({
      where: { id: documentId },
      data: {
        deckJson: result.data as unknown as Prisma.InputJsonValue,
        deckRevisionToken: newToken,
      },
    });
    if (count === 0) return { ok: false, error: "Document not found." };
  }

  await snapshotDocumentVersion(documentId);

  return { ok: true, revisionToken: newToken };
}

/**
 * Applies a list of `DeckPatch` records to the stored deck, guarded by the
 * optimistic revision token. Falls back when any patch is un-replayable.
 */
export async function patchDeck(
  documentId: string,
  patches: DeckPatch[],
  clientToken: string | null | undefined,
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

  const baseResult = safeParseDeck(document.deckJson);
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

  const resultParsed = safeParseDeck(deck);
  if (!resultParsed.success) {
    reportSchemaFailure("deck-parse-failed", {
      area: "patchDeck.result",
      documentId,
      reason: resultParsed.error,
    });
    return {
      ok: false,
      error: `Patch result is invalid: ${resultParsed.error}`,
    };
  }

  const serialized = JSON.stringify(resultParsed.data);
  if (serialized.length > MAX_DECK_JSON_BYTES) {
    return { ok: false, error: formatDeckTooLargeError() };
  }

  const newToken = generateRevisionToken();

  if (clientToken != null) {
    const { count } = await prisma.document.updateMany({
      where: { id: documentId, deckRevisionToken: clientToken },
      data: {
        deckJson: resultParsed.data as unknown as Prisma.InputJsonValue,
        deckRevisionToken: newToken,
      },
    });
    if (count === 0) {
      const latest = await prisma.document.findUnique({
        where: { id: documentId },
        select: { deckRevisionToken: true },
      });
      if (!latest) return { ok: false, error: "Document not found." };
      return {
        ok: "conflict",
        serverRevisionToken: latest.deckRevisionToken,
      };
    }
  } else {
    const { count } = await prisma.document.updateMany({
      where: { id: documentId },
      data: {
        deckJson: resultParsed.data as unknown as Prisma.InputJsonValue,
        deckRevisionToken: newToken,
      },
    });
    if (count === 0) return { ok: false, error: "Document not found." };
  }

  await snapshotDocumentVersion(documentId);

  return { ok: true, revisionToken: newToken };
}

export async function persistDeckCommand(
  documentId: string,
  envelope: CommandEnvelope<SlideCommand>,
): Promise<SaveDeckResult> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { deckJson: true },
  });
  if (!document) {
    return { ok: false, error: "Document not found." };
  }

  const parsed = safeParseDeck(document.deckJson);
  if (!parsed.success) {
    logError("deck.command.stored_deck_invalid", new Error(parsed.error), {
      documentId,
      envelopeId: envelope.id,
    });
    return { ok: false, error: `Stored deck is invalid: ${parsed.error}` };
  }

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
  );
}

/**
 * Restores a document to an earlier snapshot.
 *
 *  1. Snapshots the pre-restore state (forced, labelled "Before restore").
 *  2. Writes restored contentJson + deckJson (deck sanitized against restored
 *     content to strip orphaned visual refs).
 *  3. Atomically rebuilds Visual rows from the restored contentJson.
 *  4. Belt-and-suspenders deck reconciliation against actual DB Visual rows.
 *  5. Revalidates share/embed/present cache paths.
 */
export async function restoreVersion(
  documentId: string,
  versionId: string,
  userId?: string | null,
): Promise<RestoredDocumentVersion> {
  const version = await prisma.documentVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: {
      documentId: true,
      contentJson: true,
      deckJson: true,
      createdAt: true,
    },
  });

  // Verify the version belongs to the expected document.
  if (version.documentId !== documentId) {
    throw new Error(
      `Version ${versionId} does not belong to document ${documentId}.`,
    );
  }

  await snapshotDocumentVersion(documentId, {
    userId,
    force: true,
    label: "Before restore",
  });

  const restoredContent = version.contentJson;
  const content = lexicalStateToPlainText(restoredContent).slice(
    0,
    DOCUMENT_CONTENT_MAX_LENGTH,
  );
  const restoredDeck = sanitizeRestoredDeck(version.deckJson, restoredContent);

  // Write the restored document state + atomically rebuild the Visual mirror.
  await prisma.$transaction(async (tx) => {
    await tx.document.updateMany({
      where: { id: documentId },
      data: {
        contentJson: restoredContent as Prisma.InputJsonValue,
        content,
        deckJson: restoredDeck,
      },
    });

    await mirrorVisualNodesInTx(tx, documentId, restoredContent);
  });

  await reconcileDeckAfterMirror(documentId);
  await revalidateSharePaths(documentId);

  return { documentId, contentJson: restoredContent };
}
