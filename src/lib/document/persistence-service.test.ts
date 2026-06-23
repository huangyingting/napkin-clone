/**
 * Tests for the document persistence service (#470, #474).
 *
 * Covers:
 *  - Atomicity: `mirrorVisualNodesInTx` runs inside the same transaction as
 *    the `contentJson` write, so a mirror failure rolls back both.
 *  - `sanitizeRestoredDeck` strips orphaned visual refs.
 *  - Service boundary: `mirrorVisualNodesInTx` accepts a caller-supplied tx.
 *
 * All tests are pure (no real DB) — they use in-memory stubs for the
 * `Prisma.TransactionClient` interface to verify transaction boundaries.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { Prisma } from "@/generated/prisma/client";

import {
  mirrorVisualNodesInTx,
  sanitizeRestoredDeck,
} from "./persistence-service";
import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";

// ---------------------------------------------------------------------------
// mirrorVisualNodesInTx — shared transaction boundary
// ---------------------------------------------------------------------------

/**
 * Builds a minimal stub that satisfies the `Prisma.TransactionClient` shape
 * used by `mirrorVisualNodesInTx`.  We record every call so tests can assert
 * that the function ran against this specific tx and NOT a fresh prisma client.
 */
function makeStubTx() {
  const calls: string[] = [];

  const tx = {
    visual: {
      findMany: async () => {
        calls.push("visual.findMany");
        return [];
      },
      upsert: async () => {
        calls.push("visual.upsert");
        return {};
      },
      update: async () => {
        calls.push("visual.update");
        return {};
      },
      deleteMany: async () => {
        calls.push("visual.deleteMany");
        return {};
      },
    },
    visualRevision: {
      create: async () => {
        calls.push("visualRevision.create");
        return {};
      },
      findMany: async () => {
        calls.push("visualRevision.findMany");
        return [];
      },
      deleteMany: async () => {
        calls.push("visualRevision.deleteMany");
        return {};
      },
    },
    _calls: calls,
  } as unknown as Prisma.TransactionClient & { _calls: string[] };

  return tx;
}

/** Minimal serialized Lexical state with no visual nodes. */
const EMPTY_LEXICAL_STATE = {
  root: {
    children: [],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
};

describe("mirrorVisualNodesInTx: uses the caller-supplied tx", () => {
  test("calls visual.findMany on the provided tx, not a separate client", async () => {
    const tx = makeStubTx();
    await mirrorVisualNodesInTx(tx, "doc-test-1", EMPTY_LEXICAL_STATE);
    assert.ok(
      tx._calls.includes("visual.findMany"),
      "findMany should have been called on the stub tx",
    );
  });

  test("returns zero outcome for an empty Lexical state", async () => {
    const tx = makeStubTx();
    const outcome = await mirrorVisualNodesInTx(
      tx,
      "doc-test-2",
      EMPTY_LEXICAL_STATE,
    );
    assert.equal(outcome.created, 0);
    assert.equal(outcome.updated, 0);
    assert.equal(outcome.deleted, 0);
    assert.equal(outcome.skipped, 0);
    assert.equal(outcome.invalid, 0);
  });
});

describe("mirrorVisualNodesInTx: rollback simulation", () => {
  test("mirror failure on a throwing tx propagates the error (atomicity)", async () => {
    const throwingTx = {
      visual: {
        findMany: async () => {
          throw new Error("Simulated DB failure");
        },
      },
    } as unknown as Prisma.TransactionClient;

    await assert.rejects(
      () => mirrorVisualNodesInTx(throwingTx, "doc-fail", EMPTY_LEXICAL_STATE),
      (err: Error) => {
        assert.equal(err.message, "Simulated DB failure");
        return true;
      },
      "mirror error should propagate so the outer transaction rolls back",
    );
  });
});

// ---------------------------------------------------------------------------
// sanitizeRestoredDeck
// ---------------------------------------------------------------------------

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
      theme: "indigo",
      elements: [
        {
          id: "e1",
          kind: "visual",
          visualId: "vis-keep",
          box: { x: 0, y: 0, w: 400, h: 300 },
          zIndex: 0,
        },
        {
          id: "e2",
          kind: "visual",
          visualId: "vis-drop",
          box: { x: 0, y: 0, w: 400, h: 300 },
          zIndex: 1,
        },
      ],
    },
  ],
  theme: "indigo",
  schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
};

/** Minimal Lexical state carrying a single visual node with the given visualId. */
function lexicalStateWithVisual(visualId: string): unknown {
  return {
    root: {
      children: [
        {
          type: "visual",
          visualId,
          visual: {
            version: 1,
            type: "flowchart",
            width: 760,
            height: 480,
            nodes: [{ id: "n1", label: "Start" }],
            edges: [],
          },
        },
      ],
      direction: "ltr",
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}

describe("sanitizeRestoredDeck", () => {
  test("returns Prisma.DbNull when rawDeckJson is null", () => {
    const result = sanitizeRestoredDeck(null, EMPTY_LEXICAL_STATE);
    assert.equal(result, Prisma.DbNull);
  });

  test("strips orphaned visual element from restored deck", () => {
    // Restored content only has vis-keep; vis-drop is orphaned.
    const restoredContent = lexicalStateWithVisual("vis-keep");
    const result = sanitizeRestoredDeck(
      VALID_DECK as unknown as Prisma.JsonValue,
      restoredContent,
    );
    // The result should be a Prisma.InputJsonValue (not DbNull)
    assert.notEqual(result, Prisma.DbNull);
    const deck = result as typeof VALID_DECK;
    const elements = deck.slides[0].elements ?? [];
    const visIds = elements
      .filter((e) => e.kind === "visual")
      .map((e) => (e as { visualId: string }).visualId);
    assert.ok(visIds.includes("vis-keep"), "vis-keep should remain");
    assert.ok(!visIds.includes("vis-drop"), "vis-drop should be stripped");
  });

  test("returns all visuals intact when all are known", () => {
    // Build a content with both vis-keep AND vis-drop.
    const restoredContent = {
      root: {
        children: [
          {
            type: "visual",
            visualId: "vis-keep",
            visual: {
              version: 1,
              type: "flowchart",
              width: 760,
              height: 480,
              nodes: [{ id: "n1", label: "A" }],
              edges: [],
            },
          },
          {
            type: "visual",
            visualId: "vis-drop",
            visual: {
              version: 1,
              type: "flowchart",
              width: 760,
              height: 480,
              nodes: [{ id: "n2", label: "B" }],
              edges: [],
            },
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };
    const result = sanitizeRestoredDeck(
      VALID_DECK as unknown as Prisma.JsonValue,
      restoredContent,
    );
    assert.notEqual(result, Prisma.DbNull);
    const deck = result as typeof VALID_DECK;
    const elements = deck.slides[0].elements ?? [];
    // Both vis-keep and vis-drop are in the restored content, so both should remain.
    const visualElements = elements.filter((e) => e.kind === "visual");
    assert.equal(
      visualElements.length,
      2,
      "both visual elements should remain",
    );
  });

  test("falls back to raw value when deckJson cannot be parsed", () => {
    const malformed = { not: "a valid deck" } as unknown as Prisma.JsonValue;
    const result = sanitizeRestoredDeck(malformed, EMPTY_LEXICAL_STATE);
    // Falls back to the raw value since safeParseDeck fails.
    assert.deepEqual(result, malformed);
  });
});
