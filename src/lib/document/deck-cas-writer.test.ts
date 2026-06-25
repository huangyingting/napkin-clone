import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";

import { writeDeckWithCas, type DeckCasDb } from "./deck-cas-writer";

const VALID_DECK = {
  slides: [
    {
      id: "s1",
      title: "Slide 1",
      bullets: [],
      index: 0,
      visualIds: [],
      layout: "content",
      notes: "",
      elements: [],
    },
  ],
  themeId: "indigo",
  schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
};

function makeDb({
  updateCount,
  serverToken = "server-token",
  exists = true,
}: {
  updateCount: number;
  serverToken?: string | null;
  exists?: boolean;
}) {
  const calls: unknown[] = [];
  const db = {
    document: {
      async updateMany(args: unknown) {
        calls.push(args);
        return { count: updateCount };
      },
      async findUnique() {
        return exists ? { deckRevisionToken: serverToken } : null;
      },
    },
  } as DeckCasDb;
  return { db, calls };
}

describe("writeDeckWithCas", () => {
  test("guards writes with the supplied revision token", async () => {
    const { db, calls } = makeDb({ updateCount: 1 });
    const result = await writeDeckWithCas({
      documentId: "doc-1",
      deckJson: VALID_DECK,
      clientToken: "client-token",
      telemetryArea: "test",
      db,
    });

    assert.equal(result.ok, true);
    assert.deepEqual((calls[0] as { where: unknown }).where, {
      id: "doc-1",
      deckRevisionToken: "client-token",
    });
  });

  test("returns a conflict with the latest server token when CAS misses", async () => {
    const { db } = makeDb({ updateCount: 0, serverToken: "new-server-token" });
    const result = await writeDeckWithCas({
      documentId: "doc-1",
      deckJson: VALID_DECK,
      clientToken: "stale-token",
      telemetryArea: "test",
      db,
    });

    assert.deepEqual(result, {
      ok: "conflict",
      serverRevisionToken: "new-server-token",
    });
  });

  test("returns document-not-found when the conflict reread misses", async () => {
    const { db } = makeDb({ updateCount: 0, exists: false });
    const result = await writeDeckWithCas({
      documentId: "missing",
      deckJson: VALID_DECK,
      clientToken: "stale-token",
      telemetryArea: "test",
      db,
    });

    assert.deepEqual(result, { ok: false, error: "Document not found." });
  });

  test("rejects invalid decks before writing", async () => {
    const { db, calls } = makeDb({ updateCount: 1 });
    const result = await writeDeckWithCas({
      documentId: "doc-1",
      deckJson: { slides: "bad" },
      clientToken: "client-token",
      telemetryArea: "test",
      db,
    });

    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /Invalid deck:/);
    assert.equal(calls.length, 0);
  });
});
