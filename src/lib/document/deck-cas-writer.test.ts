import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";

import { writeDeckWithCas, type DeckCasDb } from "./deck-cas-writer";

const VALID_DECK = {
  schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  canvas: { format: "16:9" },
  design: { themeId: "indigo" },
  masters: [{ id: "master-default", name: "Default", elements: [] }],
  defaultMasterId: "master-default",
  slides: [
    {
      id: "s1",
      title: "Slide 1",
      index: 0,
      notes: "",
      elements: [],
    },
  ],
};

const VALID_DECK_V7 = {
  schemaVersion: 7,
  canvas: { format: "16:9", width: 100, height: 56.25, unit: "percent" },
  theme: { packageId: "neutral" },
  assets: { images: {} },
  slides: [
    {
      id: "slide-0001",
      type: "slide",
      template: { kind: "cover" },
      style: { ref: "slide.cover" },
      children: [],
    },
  ],
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

describe("writeDeckWithCas — v7 deck persistence", () => {
  test("accepts a valid v7 deck and writes it", async () => {
    const { db, calls } = makeDb({ updateCount: 1 });
    const result = await writeDeckWithCas({
      documentId: "doc-v7",
      deckJson: VALID_DECK_V7,
      clientToken: "client-token",
      telemetryArea: "test",
      db,
    });

    assert.equal(result.ok, true);
    // Verify the write happened with the correct CAS predicate.
    assert.deepEqual((calls[0] as { where: unknown }).where, {
      id: "doc-v7",
      deckRevisionToken: "client-token",
    });
  });

  test("rejects a structurally invalid v7 deck before writing", async () => {
    const { db, calls } = makeDb({ updateCount: 1 });
    const badV7 = { schemaVersion: 7, slides: "not-an-array" };
    const result = await writeDeckWithCas({
      documentId: "doc-v7",
      deckJson: badV7,
      clientToken: "client-token",
      telemetryArea: "test",
      db,
    });

    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /Invalid deck:/);
    assert.equal(
      calls.length,
      0,
      "DB should not be called for an invalid deck",
    );
  });

  test("v7 deck survives a CAS conflict correctly", async () => {
    const { db } = makeDb({
      updateCount: 0,
      serverToken: "server-v7-token",
    });
    const result = await writeDeckWithCas({
      documentId: "doc-v7",
      deckJson: VALID_DECK_V7,
      clientToken: "stale-v7-token",
      telemetryArea: "test",
      db,
    });

    assert.deepEqual(result, {
      ok: "conflict",
      serverRevisionToken: "server-v7-token",
    });
  });
});
