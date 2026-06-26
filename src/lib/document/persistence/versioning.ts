/**
 * Version snapshot and restore persistence operations.
 *
 * Owns `sanitizeRestoredDeck` (strips orphaned visual refs from a restored
 * deck) and `restoreVersion` (the full snapshot restore flow).
 */

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { collectVisualNodes } from "@/lib/lexical/visual-nodes";
import { lexicalStateToPlainText } from "@/lib/content";
import { DOCUMENT_CONTENT_MAX_LENGTH } from "@/lib/limits";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { reconcileDocumentDeckDependencies } from "@/lib/document/source-ref-model";
import { reportSchemaFailure } from "@/lib/diagnostics/schema-telemetry";
import type { RestoredDocumentVersion } from "@/lib/document/persistence-types";
import { snapshotDocumentVersion } from "./helpers";
import { mirrorVisualNodesInTx, reconcileDeckAfterMirror } from "./visual";
import { revalidateSharePaths } from "./sharing";

// Re-export so the barrel can surface it via `export *`
export type { RestoredDocumentVersion };

// ---------------------------------------------------------------------------
// Exported service operations
// ---------------------------------------------------------------------------

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
