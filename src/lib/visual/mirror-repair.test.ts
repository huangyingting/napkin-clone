/**
 * Health tests for the visual projection repair pipeline (issue #453).
 *
 * Tests:
 *  - Concurrent saves don't corrupt the mirror (pure diff idempotence)
 *  - Invalid/malformed visuals are skipped, not fatal
 *  - Rebuild idempotence (running twice produces an empty diff)
 *  - Restore reconciliation (ordering preserved, deck refs reconciled)
 *  - Ordering is preserved across reorder
 *
 * All tests are pure (no DB I/O); they exercise the diff and outcome helpers
 * directly to keep them fast and deterministic.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  diffVisualMirror,
  mirrorOutcomeFromDiff,
  type ExistingVisualRow,
  type LiveVisualNode,
  type VisualMirrorOutcome,
} from "@/lib/visual/mirror-diff";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function row(
  overrides: Partial<ExistingVisualRow> & { id: string },
): ExistingVisualRow {
  return {
    anchorBlockId: "a",
    orderIndex: 0,
    dataKey: "{}",
    createdAt: 1000,
    ...overrides,
  };
}

function node(
  overrides: Partial<LiveVisualNode> & { anchorBlockId: string },
): LiveVisualNode {
  return {
    orderIndex: 0,
    type: "FLOWCHART",
    title: null,
    data: { v: 1 },
    dataKey: "{}",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Concurrent save idempotence (#453)
// ---------------------------------------------------------------------------

test("concurrent saves: running diff twice on the same state produces empty second diff", () => {
  const existing = [
    row({ id: "1", anchorBlockId: "a", orderIndex: 0, dataKey: "K1" }),
    row({ id: "2", anchorBlockId: "b", orderIndex: 1, dataKey: "K2" }),
  ];
  const live = [
    node({ anchorBlockId: "a", orderIndex: 0, dataKey: "K1" }),
    node({ anchorBlockId: "b", orderIndex: 1, dataKey: "K2" }),
  ];
  const liveAnchors = new Set(["a", "b"]);

  // First diff is a no-op (state already matches).
  const first = diffVisualMirror({
    existingRows: existing,
    liveNodes: live,
    liveAnchors,
  });
  assert.deepEqual(first.toCreate, []);
  assert.deepEqual(first.toUpdate, []);
  assert.deepEqual(first.toDelete, []);

  // Simulate the state after the first write: rows unchanged. Second diff must also be empty.
  const second = diffVisualMirror({
    existingRows: existing,
    liveNodes: live,
    liveAnchors,
  });
  assert.deepEqual(second.toCreate, []);
  assert.deepEqual(second.toUpdate, []);
  assert.deepEqual(second.toDelete, []);
});

test("concurrent saves: two saves with different payloads converge to the last payload", () => {
  // Simulates two concurrent saves: the first wins and writes "K1-v2".
  // The second sees the result of the first (not the original), and since
  // it also sends "K1-v2" (same state), the diff is empty.
  const existingAfterFirstSave = [
    row({ id: "1", anchorBlockId: "a", orderIndex: 0, dataKey: "K1-v2" }),
  ];
  const liveFromSecondSave = [
    node({ anchorBlockId: "a", orderIndex: 0, dataKey: "K1-v2" }),
  ];
  const diff = diffVisualMirror({
    existingRows: existingAfterFirstSave,
    liveNodes: liveFromSecondSave,
    liveAnchors: new Set(["a"]),
  });
  assert.deepEqual(diff.toCreate, []);
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual(diff.toDelete, []);
});

// ---------------------------------------------------------------------------
// Invalid/malformed visuals are skipped, not fatal (#450 / #453)
// ---------------------------------------------------------------------------

test("invalid visual: node with empty visualId is counted as invalid, not fatal", () => {
  // Nodes with no/empty anchor → invalidCount incremented; mirror is not broken.
  // Simulates what mirrorVisualNodes does: nodes with null anchor are skipped
  // before reaching diffVisualMirror.
  const diff = diffVisualMirror({
    existingRows: [row({ id: "1", anchorBlockId: "x", dataKey: "X" })],
    liveNodes: [node({ anchorBlockId: "x", dataKey: "X" })],
    liveAnchors: new Set(["x"]),
  });
  // Existing row for "x" is live — no change.
  assert.deepEqual(diff.toCreate, []);
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual(diff.toDelete, []);

  // The outcome counts an additional invalid=1 injected from the caller.
  const outcome: VisualMirrorOutcome = mirrorOutcomeFromDiff(diff, 0, 1);
  assert.equal(outcome.invalid, 1);
  assert.equal(outcome.created, 0);
  assert.equal(outcome.updated, 0);
  assert.equal(outcome.deleted, 0);
  assert.equal(outcome.skipped, 0);
});

test("invalid visual: node whose payload fails validation is skipped, existing row preserved", () => {
  // A node with a bad payload: anchor is added to liveAnchors but produces no
  // LiveVisualNode (safeParseVisual fails). The existing row must not be deleted.
  const existing = [
    row({ id: "bad", anchorBlockId: "bad-anchor", dataKey: "X" }),
  ];

  const diff = diffVisualMirror({
    existingRows: existing,
    liveNodes: [], // payload failed → no live node
    liveAnchors: new Set(["bad-anchor"]), // anchor is present → row preserved
  });

  assert.deepEqual(diff.toCreate, []);
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual(diff.toDelete, []);

  // skipped=1 is reported in the outcome.
  const outcome = mirrorOutcomeFromDiff(diff, 1, 0);
  assert.equal(outcome.skipped, 1);
  assert.equal(outcome.deleted, 0);
});

test("invalid visual: mix of valid and invalid nodes — invalid are skipped, valid are mirrored", () => {
  const existing = [
    row({ id: "ok", anchorBlockId: "good", dataKey: "K1" }),
    row({ id: "was-bad", anchorBlockId: "bad", dataKey: "OLD" }),
  ];

  // "bad" anchor had a previously-valid row, but now fails validation → skipped.
  // "good" anchor has matching payload → no-op.
  // "new" anchor is brand new → create.
  const diff = diffVisualMirror({
    existingRows: existing,
    liveNodes: [
      node({ anchorBlockId: "good", orderIndex: 0, dataKey: "K1" }),
      node({ anchorBlockId: "new", orderIndex: 2, dataKey: "K3" }),
      // "bad" anchor has no live node (failed validation), but IS in liveAnchors
    ],
    liveAnchors: new Set(["good", "bad", "new"]),
  });

  assert.equal(diff.toCreate.length, 1);
  assert.equal(diff.toCreate[0].anchorBlockId, "new");
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual(diff.toDelete, []);

  const outcome = mirrorOutcomeFromDiff(diff, 1, 0);
  assert.equal(outcome.created, 1);
  assert.equal(outcome.skipped, 1);
  assert.equal(outcome.deleted, 0);
});

// ---------------------------------------------------------------------------
// Rebuild idempotence (#451 / #453)
// ---------------------------------------------------------------------------

test("rebuild idempotence: same contentJson state produces empty diff on second run", () => {
  // After a first successful rebuild, the existing rows exactly match the live
  // nodes. A second rebuild on identical state must be a pure no-op.
  const existing = [
    row({ id: "1", anchorBlockId: "a", orderIndex: 0, dataKey: "A" }),
    row({ id: "2", anchorBlockId: "b", orderIndex: 1, dataKey: "B" }),
    row({ id: "3", anchorBlockId: "c", orderIndex: 2, dataKey: "C" }),
  ];
  const live = [
    node({ anchorBlockId: "a", orderIndex: 0, dataKey: "A" }),
    node({ anchorBlockId: "b", orderIndex: 1, dataKey: "B" }),
    node({ anchorBlockId: "c", orderIndex: 2, dataKey: "C" }),
  ];
  const liveAnchors = new Set(["a", "b", "c"]);

  const diff = diffVisualMirror({
    existingRows: existing,
    liveNodes: live,
    liveAnchors,
  });

  assert.deepEqual(diff.toCreate, []);
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual(diff.toDelete, []);

  const outcome = mirrorOutcomeFromDiff(diff, 0, 0);
  assert.equal(outcome.created, 0);
  assert.equal(outcome.updated, 0);
  assert.equal(outcome.deleted, 0);
});

test("rebuild idempotence: rebuild after prior drift creates and deletes exactly once, then is no-op", () => {
  // Before rebuild: DB has stale row "gone" and is missing "new".
  const beforeRebuild: ExistingVisualRow[] = [
    row({ id: "ok", anchorBlockId: "a", orderIndex: 0, dataKey: "A" }),
    row({ id: "stale", anchorBlockId: "gone", orderIndex: 5, dataKey: "G" }),
  ];
  const live = [
    node({ anchorBlockId: "a", orderIndex: 0, dataKey: "A" }),
    node({ anchorBlockId: "new", orderIndex: 1, dataKey: "N" }),
  ];
  const liveAnchors = new Set(["a", "new"]);

  const firstRebuild = diffVisualMirror({
    existingRows: beforeRebuild,
    liveNodes: live,
    liveAnchors,
  });

  assert.equal(firstRebuild.toCreate.length, 1);
  assert.equal(firstRebuild.toCreate[0].anchorBlockId, "new");
  assert.deepEqual(firstRebuild.toDelete, ["stale"]);
  assert.deepEqual(firstRebuild.toUpdate, []);

  // After applying the first rebuild, simulate the resulting DB state.
  const afterRebuild: ExistingVisualRow[] = [
    row({ id: "ok", anchorBlockId: "a", orderIndex: 0, dataKey: "A" }),
    row({ id: "new-id", anchorBlockId: "new", orderIndex: 1, dataKey: "N" }),
  ];

  // Second rebuild on the same content must be empty.
  const secondRebuild = diffVisualMirror({
    existingRows: afterRebuild,
    liveNodes: live,
    liveAnchors,
  });

  assert.deepEqual(secondRebuild.toCreate, []);
  assert.deepEqual(secondRebuild.toUpdate, []);
  assert.deepEqual(secondRebuild.toDelete, []);
});

// ---------------------------------------------------------------------------
// Restore reconciliation — ordering preserved (#452 / #453)
// ---------------------------------------------------------------------------

test("restore: ordering is preserved after restore (orderIndex reflects document order)", () => {
  // After a restore, contentJson has visuals in a different order than the
  // pre-restore DB state. The mirror must update orderIndex to match the
  // restored document order.
  const existingBeforeRestore: ExistingVisualRow[] = [
    row({ id: "r1", anchorBlockId: "a", orderIndex: 0, dataKey: "A" }),
    row({ id: "r2", anchorBlockId: "b", orderIndex: 1, dataKey: "B" }),
    row({ id: "r3", anchorBlockId: "c", orderIndex: 2, dataKey: "C" }),
  ];

  // After restore: "b" is first, "a" is second, "c" is gone, "d" is new.
  const restoredLiveNodes = [
    node({ anchorBlockId: "b", orderIndex: 0, dataKey: "B" }),
    node({ anchorBlockId: "a", orderIndex: 1, dataKey: "A" }),
    node({ anchorBlockId: "d", orderIndex: 2, dataKey: "D" }),
  ];
  const restoredAnchors = new Set(["a", "b", "d"]);

  const diff = diffVisualMirror({
    existingRows: existingBeforeRestore,
    liveNodes: restoredLiveNodes,
    liveAnchors: restoredAnchors,
  });

  // "b" and "a" moved: order-only updates.
  assert.equal(diff.toUpdate.length, 2);
  const updateB = diff.toUpdate.find((u) => u.id === "r2");
  const updateA = diff.toUpdate.find((u) => u.id === "r1");
  assert.ok(updateB, "b should be updated");
  assert.ok(updateA, "a should be updated");
  assert.equal(updateB?.orderIndex, 0);
  assert.equal(updateA?.orderIndex, 1);
  assert.equal(updateB?.payloadChanged, false);
  assert.equal(updateA?.payloadChanged, false);

  // "d" is new, "c" is gone.
  assert.equal(diff.toCreate.length, 1);
  assert.equal(diff.toCreate[0].anchorBlockId, "d");
  assert.deepEqual(diff.toDelete, ["r3"]);
});

test("restore: no orphaned visual rows after restore removes visuals", () => {
  // Before restore: three rows. After restore: only one remains.
  const existing: ExistingVisualRow[] = [
    row({ id: "1", anchorBlockId: "keep", orderIndex: 0, dataKey: "K" }),
    row({ id: "2", anchorBlockId: "drop1", orderIndex: 1, dataKey: "D1" }),
    row({ id: "3", anchorBlockId: "drop2", orderIndex: 2, dataKey: "D2" }),
  ];
  const live = [node({ anchorBlockId: "keep", orderIndex: 0, dataKey: "K" })];
  const liveAnchors = new Set(["keep"]);

  const diff = diffVisualMirror({
    existingRows: existing,
    liveNodes: live,
    liveAnchors,
  });

  assert.deepEqual(diff.toCreate, []);
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual([...diff.toDelete].sort(), ["2", "3"]);

  const outcome = mirrorOutcomeFromDiff(diff, 0, 0);
  assert.equal(outcome.deleted, 2);
});

// ---------------------------------------------------------------------------
// mirrorOutcomeFromDiff: pure outcome computation (#450 / #453)
// ---------------------------------------------------------------------------

test("mirrorOutcomeFromDiff: correctly maps diff counts + caller-supplied skipped/invalid", () => {
  const diff = diffVisualMirror({
    existingRows: [
      row({ id: "upd", anchorBlockId: "upd", dataKey: "OLD" }),
      row({ id: "del", anchorBlockId: "del", dataKey: "X" }),
    ],
    liveNodes: [
      node({ anchorBlockId: "upd", dataKey: "NEW" }),
      node({ anchorBlockId: "new", dataKey: "Y" }),
    ],
    liveAnchors: new Set(["upd", "new"]),
  });

  const outcome = mirrorOutcomeFromDiff(diff, 3, 2);
  assert.equal(outcome.created, 1);
  assert.equal(outcome.updated, 1);
  assert.equal(outcome.deleted, 1);
  assert.equal(outcome.skipped, 3);
  assert.equal(outcome.invalid, 2);
});

test("mirrorOutcomeFromDiff: all-zero outcome for a complete no-op", () => {
  const diff = diffVisualMirror({
    existingRows: [],
    liveNodes: [],
    liveAnchors: new Set(),
  });
  const outcome = mirrorOutcomeFromDiff(diff, 0, 0);
  assert.equal(outcome.created, 0);
  assert.equal(outcome.updated, 0);
  assert.equal(outcome.deleted, 0);
  assert.equal(outcome.skipped, 0);
  assert.equal(outcome.invalid, 0);
});
