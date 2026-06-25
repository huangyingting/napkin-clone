import { Prisma } from "@/generated/prisma/client";
import { reportSchemaFailure } from "@/lib/diagnostics/schema-telemetry";
import type { SaveDeckResult } from "@/lib/document/persistence-types";
import { MAX_DECK_JSON_BYTES, formatDeckTooLargeError } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { generateRevisionToken } from "@/lib/presentation/deck-revision-token";
import { safeParseDeck } from "@/lib/presentation/deck-schema";

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
  const result = safeParseDeck(deckJson);
  if (!result.success) {
    reportSchemaFailure("deck-parse-failed", {
      area: telemetryArea,
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
  const { count } = await db.document.updateMany({
    where:
      clientToken != null
        ? { id: documentId, deckRevisionToken: clientToken }
        : { id: documentId },
    data: {
      deckJson: result.data as unknown as Prisma.InputJsonValue,
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

  return { ok: true, revisionToken: newToken };
}
