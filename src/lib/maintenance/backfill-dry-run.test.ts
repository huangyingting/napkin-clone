/**
 * Tests for the backfill dry-run helper (issue #457).
 *
 * Covers all fixture categories from the dry-run plan:
 *  - No bids (all missing) → safe to auto-migrate
 *  - All bids present → no changes needed
 *  - Duplicate bids → unsafe
 *  - Invalid visual payload → unsafe
 *  - Orphaned deck visual refs → unsafe
 *  - Empty / null contentJson → unsafe (missing-content-json)
 *  - Mirror diff: creates, updates, deletes
 *
 * All tests are pure (no DB, no network).
 */
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  analyseDocumentForMigration,
  summariseDryRun,
} from "./backfill-dry-run";

import type { ExistingVisualRow } from "@/lib/visual/mirror-diff";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DOC_ID = "doc-test-migration";

/** Minimal Lexical JSON with no bids. */
function lexicalNoBids(): unknown {
  return {
    root: {
      type: "root",
      children: [
        {
          type: "paragraph",
          key: "key-1",
          children: [{ type: "text", text: "Hello" }],
        },
        { type: "heading", key: "key-2", tag: "h1", children: [] },
      ],
    },
  };
}

/** Minimal Lexical JSON with bids on all block nodes. */
function lexicalWithBids(): unknown {
  return {
    root: {
      type: "root",
      children: [
        { type: "paragraph", bid: "bid-aaa", children: [] },
        { type: "heading", bid: "bid-bbb", tag: "h1", children: [] },
      ],
    },
  };
}

/** Lexical JSON with duplicate bids. */
function lexicalDuplicateBids(): unknown {
  return {
    root: {
      type: "root",
      children: [
        { type: "paragraph", bid: "bid-dup", children: [] },
        { type: "heading", bid: "bid-dup", tag: "h1", children: [] },
      ],
    },
  };
}

function makeVisualRow(
  id: string,
  anchorBlockId: string,
  orderIndex = 0,
  dataKey = '{"type":"chart"}',
): ExistingVisualRow {
  return { id, anchorBlockId, orderIndex, dataKey, createdAt: Date.now() };
}

function makeDeckJson(visualIds: string[]): unknown {
  return {
    theme: "default",
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Slide",
        bullets: [],
        visualIds,
        layout: "content",
        notes: "",
        theme: "default",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Fixture category 1: No bids (all missing) — safe to auto-migrate
// ---------------------------------------------------------------------------

describe("dry-run: no bids (all missing) (#457)", () => {
  test("reports missingBidCount for pre-#430 content", () => {
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalNoBids(),
      existingVisualRows: [],
    });
    assert.equal(report.missingBidCount, 2, "two block nodes lack bids");
    assert.equal(report.existingBidCount, 0);
  });

  test("safeToAutoMigrate is true when only bids are missing", () => {
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalNoBids(),
      existingVisualRows: [],
    });
    assert.equal(report.safeToAutoMigrate, true);
    assert.deepEqual(report.unsafeReasons, []);
  });
});

// ---------------------------------------------------------------------------
// Fixture category 2: All bids present — no changes needed
// ---------------------------------------------------------------------------

describe("dry-run: all bids present (#457)", () => {
  test("missingBidCount = 0 and existingBidCount = block count", () => {
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalWithBids(),
      existingVisualRows: [],
    });
    assert.equal(report.missingBidCount, 0);
    assert.equal(report.existingBidCount, 2);
  });

  test("safeToAutoMigrate is true when nothing needs changing", () => {
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalWithBids(),
      existingVisualRows: [],
    });
    assert.equal(report.safeToAutoMigrate, true);
  });
});

// ---------------------------------------------------------------------------
// Fixture category 3: Duplicate bids — unsafe
// ---------------------------------------------------------------------------

describe("dry-run: duplicate bids (#457)", () => {
  test("hasDuplicateBids = true and duplicateBids lists the bid", () => {
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalDuplicateBids(),
      existingVisualRows: [],
    });
    assert.equal(report.hasDuplicateBids, true);
    assert.ok(report.duplicateBids.includes("bid-dup"));
  });

  test("safeToAutoMigrate = false with reason 'duplicate-bids'", () => {
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalDuplicateBids(),
      existingVisualRows: [],
    });
    assert.equal(report.safeToAutoMigrate, false);
    assert.ok(report.unsafeReasons.includes("duplicate-bids"));
  });
});

// ---------------------------------------------------------------------------
// Fixture category 4: Invalid visual payload — unsafe
// ---------------------------------------------------------------------------

describe("dry-run: invalid visual payload (#457)", () => {
  test("safeToAutoMigrate = false with reason 'invalid-visual-payload'", () => {
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalWithBids(),
      existingVisualRows: [],
      invalidVisualPayloads: 2,
    });
    assert.equal(report.safeToAutoMigrate, false);
    assert.ok(report.unsafeReasons.includes("invalid-visual-payload"));
    assert.equal(report.mirrorInvalidPayloads, 2);
  });
});

// ---------------------------------------------------------------------------
// Fixture category 5: Orphaned deck visual refs — unsafe
// ---------------------------------------------------------------------------

describe("dry-run: orphaned deck visual refs (#457)", () => {
  test("safeToAutoMigrate = false with orphaned ref count", () => {
    const deckJson = makeDeckJson(["visual-gone-1", "visual-gone-2"]);
    const existingVisualIds = new Set<string>(); // none exist
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalWithBids(),
      existingVisualRows: [],
      deckJson,
      existingVisualIds,
    });
    assert.equal(report.orphanedDeckVisualRefs, 2);
    assert.equal(report.safeToAutoMigrate, false);
    assert.ok(report.unsafeReasons.includes("orphaned-deck-visual-ref"));
  });

  test("deck refs that exist in existingVisualIds are not flagged", () => {
    const deckJson = makeDeckJson(["visual-1", "visual-2"]);
    const existingVisualIds = new Set(["visual-1", "visual-2"]);
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalWithBids(),
      existingVisualRows: [],
      deckJson,
      existingVisualIds,
    });
    assert.equal(report.orphanedDeckVisualRefs, 0);
    assert.equal(report.safeToAutoMigrate, true);
  });

  test("partially orphaned deck: only missing ids are counted", () => {
    const deckJson = makeDeckJson(["visual-ok", "visual-gone"]);
    const existingVisualIds = new Set(["visual-ok"]);
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalWithBids(),
      existingVisualRows: [],
      deckJson,
      existingVisualIds,
    });
    assert.equal(report.orphanedDeckVisualRefs, 1);
  });
});

// ---------------------------------------------------------------------------
// Fixture category 6: Missing / null contentJson — unsafe
// ---------------------------------------------------------------------------

describe("dry-run: missing contentJson (#457)", () => {
  test("null contentJson → unsafe with 'missing-content-json'", () => {
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: null,
      existingVisualRows: [],
    });
    assert.equal(report.safeToAutoMigrate, false);
    assert.ok(report.unsafeReasons.includes("missing-content-json"));
    assert.equal(report.missingBidCount, 0);
    assert.equal(report.existingBidCount, 0);
  });

  test("undefined contentJson → unsafe with 'missing-content-json'", () => {
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: undefined,
      existingVisualRows: [],
    });
    assert.ok(report.unsafeReasons.includes("missing-content-json"));
  });
});

// ---------------------------------------------------------------------------
// Mirror diff integration
// ---------------------------------------------------------------------------

describe("dry-run: mirror diff (create / update / delete) (#457)", () => {
  test("no live nodes, existing rows → all scheduled for delete", () => {
    const existing = [
      makeVisualRow("row-1", "bid-aaa", 0),
      makeVisualRow("row-2", "bid-bbb", 1),
    ];
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalWithBids(),
      existingVisualRows: existing,
      liveVisualNodes: [],
      liveAnchors: new Set(),
    });
    assert.equal(report.mirrorWouldDelete, 2);
    assert.equal(report.mirrorWouldCreate, 0);
  });

  test("live node with no existing row → create scheduled", () => {
    const report = analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalWithBids(),
      existingVisualRows: [],
      liveVisualNodes: [
        {
          anchorBlockId: "bid-aaa",
          orderIndex: 0,
          type: "chart",
          title: null,
          data: { nodes: [] },
          dataKey: '{"nodes":[]}',
        },
      ],
      liveAnchors: new Set(["bid-aaa"]),
    });
    assert.equal(report.mirrorWouldCreate, 1);
    assert.equal(report.mirrorWouldDelete, 0);
  });

  test("dry-run is truly non-destructive (existingRows unchanged after call)", () => {
    const existing = [makeVisualRow("row-1", "bid-aaa", 0)];
    const originalLength = existing.length;
    analyseDocumentForMigration({
      documentId: DOC_ID,
      contentJson: lexicalWithBids(),
      existingVisualRows: existing,
    });
    // The original array must not be mutated by the dry-run
    assert.equal(
      existing.length,
      originalLength,
      "dry-run must not mutate existingRows",
    );
  });
});

// ---------------------------------------------------------------------------
// summariseDryRun
// ---------------------------------------------------------------------------

describe("dry-run: summariseDryRun (#457)", () => {
  test("empty reports → all zeros", () => {
    const s = summariseDryRun([]);
    assert.equal(s.scanned, 0);
    assert.equal(s.needsChange, 0);
    assert.equal(s.safeToAutoMigrate, 0);
    assert.equal(s.requiresReview, 0);
  });

  test("mix of safe and unsafe reports", () => {
    const safe = analyseDocumentForMigration({
      documentId: "d-safe",
      contentJson: lexicalNoBids(), // needs bid stamps but safe
      existingVisualRows: [],
    });
    const unsafe = analyseDocumentForMigration({
      documentId: "d-unsafe",
      contentJson: lexicalDuplicateBids(),
      existingVisualRows: [],
    });

    const s = summariseDryRun([safe, unsafe]);
    assert.equal(s.scanned, 2);
    assert.equal(s.safeToAutoMigrate, 1);
    assert.equal(s.requiresReview, 1);
    assert.ok(s.totalMissingBids >= 2); // safe doc has 2 missing bids
  });

  test("needsChange counts documents with any diff", () => {
    const noChange = analyseDocumentForMigration({
      documentId: "d-clean",
      contentJson: lexicalWithBids(),
      existingVisualRows: [],
    });
    const s = summariseDryRun([noChange]);
    assert.equal(s.needsChange, 0);
    assert.equal(s.totalMissingBids, 0);
  });
});

// ---------------------------------------------------------------------------
// Idempotency: running twice produces same result
// ---------------------------------------------------------------------------

describe("dry-run: idempotency (#457)", () => {
  test("calling analyseDocumentForMigration twice produces identical output", () => {
    const input = {
      documentId: DOC_ID,
      contentJson: lexicalNoBids(),
      existingVisualRows: [makeVisualRow("row-1", "bid-xyz", 0)],
    };
    const r1 = analyseDocumentForMigration(input);
    const r2 = analyseDocumentForMigration(input);
    assert.equal(r1.missingBidCount, r2.missingBidCount);
    assert.equal(r1.mirrorWouldDelete, r2.mirrorWouldDelete);
    assert.equal(r1.safeToAutoMigrate, r2.safeToAutoMigrate);
  });
});
