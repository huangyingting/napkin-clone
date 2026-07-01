import { Prisma } from "@/generated/prisma/client";
import { reportSchemaFailure } from "@/lib/diagnostics/schema-telemetry";
import type { SaveDeckResult } from "@/lib/document/persistence-types";
import { MAX_DECK_JSON_BYTES, formatDeckTooLargeError } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { generateRevisionToken } from "@/lib/presentation/deck-revision-token";
import { safeParseDeckV7 } from "@/lib/presentation-vnext/validation";

export type DeckCasDb = {
  document: {
    updateMany(args: Prisma.DocumentUpdateManyArgs): Promise<{ count: number }>;
    findUnique(args: {
      where: { id: string };
      select: { deckRevisionToken: true };
    }): Promise<{ deckRevisionToken: string | null } | null>;
  };
};

export type DeckCasWriteOptions = {
  documentId: string;
  deckJson: unknown;
  clientToken?: string | null;
  telemetryArea: string;
  db?: DeckCasDb;
  onSuccess?: () => Promise<void>;
};

export async function writeDeckWithCas({
  documentId,
  deckJson,
  clientToken,
  telemetryArea,
  db = prisma,
  onSuccess,
}: DeckCasWriteOptions): Promise<SaveDeckResult> {
  const v7Result = safeParseDeckV7(deckJson);
  if (!v7Result.success) {
    const reason = v7Result.errors.join("; ");
    reportSchemaFailure("deck-parse-failed", {
      area: telemetryArea,
      documentId,
      reason,
    });
    return { ok: false, error: `Invalid deck: ${reason}` };
  }

  const parsedData = v7Result.data;
  const serialized = JSON.stringify(parsedData);
  const serializedBytes = Buffer.byteLength(serialized, "utf8");
  if (serializedBytes > MAX_DECK_JSON_BYTES) {
    return { ok: false, error: formatDeckTooLargeError() };
  }

  const newToken = generateRevisionToken();
  const { count } = await db.document.updateMany({
    where:
      /* Coverage rationale: CAS/no-CAS update predicates are asserted; tsx maps ternary rows as uncovered. */
      /* node:coverage ignore next 3 */
      clientToken != null
        ? { id: documentId, deckRevisionToken: clientToken }
        : { id: documentId },
    data: {
      deckJson: parsedData as unknown as Prisma.InputJsonValue,
      deckRevisionToken: newToken,
    },
  });

  if (count === 0) {
    const latest = await db.document.findUnique({
      where: { id: documentId },
      select: { deckRevisionToken: true },
    });
    if (!latest) return { ok: false, error: "Document not found." };
    return {
      ok: "conflict",
      serverRevisionToken: latest.deckRevisionToken,
    };
  }

  await onSuccess?.();

  /* node:coverage ignore next -- CAS success return is asserted; tsx maps the tail as uncovered. */
  return { ok: true, revisionToken: newToken };
}
