import assert from "node:assert/strict";
import { test } from "node:test";

import {
  diffVisualMirror,
  type ExistingVisualRow,
  type LiveVisualNode,
} from "./mirror-diff";

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

test("creates a row for a new anchor with no existing row", () => {
  const diff = diffVisualMirror({
    existingRows: [],
    liveNodes: [node({ anchorBlockId: "a", orderIndex: 0, data: { v: 1 } })],
    liveAnchors: new Set(["a"]),
  });

  assert.equal(diff.toCreate.length, 1);
  assert.equal(diff.toCreate[0].anchorBlockId, "a");
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual(diff.toDelete, []);
});

test("no-op when nothing changed (same payload and order)", () => {
  const diff = diffVisualMirror({
    existingRows: [
      row({ id: "1", anchorBlockId: "a", orderIndex: 0, dataKey: "X" }),
    ],
    liveNodes: [node({ anchorBlockId: "a", orderIndex: 0, dataKey: "X" })],
    liveAnchors: new Set(["a"]),
  });

  assert.deepEqual(diff.toCreate, []);
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual(diff.toDelete, []);
});

test("payload change snapshots and updates (payloadChanged=true)", () => {
  const diff = diffVisualMirror({
    existingRows: [
      row({ id: "1", anchorBlockId: "a", orderIndex: 0, dataKey: "OLD" }),
    ],
    liveNodes: [node({ anchorBlockId: "a", orderIndex: 0, dataKey: "NEW" })],
    liveAnchors: new Set(["a"]),
  });

  assert.equal(diff.toUpdate.length, 1);
  assert.equal(diff.toUpdate[0].id, "1");
  assert.equal(diff.toUpdate[0].payloadChanged, true);
  assert.deepEqual(diff.toCreate, []);
  assert.deepEqual(diff.toDelete, []);
});

test("order-only change updates without snapshot (payloadChanged=false)", () => {
  const diff = diffVisualMirror({
    existingRows: [
      row({ id: "1", anchorBlockId: "a", orderIndex: 0, dataKey: "X" }),
    ],
    liveNodes: [node({ anchorBlockId: "a", orderIndex: 3, dataKey: "X" })],
    liveAnchors: new Set(["a"]),
  });

  assert.equal(diff.toUpdate.length, 1);
  assert.equal(diff.toUpdate[0].payloadChanged, false);
  assert.equal(diff.toUpdate[0].orderIndex, 3);
});

test("unparseable stored payload (dataKey null) forces an update", () => {
  const diff = diffVisualMirror({
    existingRows: [
      row({ id: "1", anchorBlockId: "a", orderIndex: 0, dataKey: null }),
    ],
    liveNodes: [node({ anchorBlockId: "a", orderIndex: 0, dataKey: "X" })],
    liveAnchors: new Set(["a"]),
  });

  assert.equal(diff.toUpdate.length, 1);
  assert.equal(diff.toUpdate[0].payloadChanged, true);
});

test("prunes rows whose anchor is no longer live", () => {
  const diff = diffVisualMirror({
    existingRows: [
      row({ id: "1", anchorBlockId: "a", dataKey: "X" }),
      row({ id: "2", anchorBlockId: "gone", dataKey: "Y" }),
    ],
    liveNodes: [node({ anchorBlockId: "a", dataKey: "X" })],
    liveAnchors: new Set(["a"]),
  });

  assert.deepEqual(diff.toDelete, ["2"]);
  assert.deepEqual(diff.toUpdate, []);
});

test("prunes null-anchor rows", () => {
  const diff = diffVisualMirror({
    existingRows: [row({ id: "doc", anchorBlockId: null, dataKey: "Z" })],
    liveNodes: [],
    liveAnchors: new Set(),
  });

  assert.deepEqual(diff.toCreate, []);
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual(diff.toDelete, ["doc"]);
});

test("invalid-payload anchor (live but absent from liveNodes) is not pruned", () => {
  // The node failed validation: its anchor is in liveAnchors but it produces no
  // liveNode, so the existing row must be left intact (not created/updated/deleted).
  const diff = diffVisualMirror({
    existingRows: [row({ id: "1", anchorBlockId: "a", dataKey: "X" })],
    liveNodes: [],
    liveAnchors: new Set(["a"]),
  });

  assert.deepEqual(diff.toCreate, []);
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual(diff.toDelete, []);
});

test("dedupes legacy duplicate anchors: keeps most recent, deletes the rest", () => {
  const diff = diffVisualMirror({
    existingRows: [
      row({
        id: "old",
        anchorBlockId: "a",
        orderIndex: 0,
        dataKey: "X",
        createdAt: 100,
      }),
      row({
        id: "new",
        anchorBlockId: "a",
        orderIndex: 0,
        dataKey: "X",
        createdAt: 200,
      }),
    ],
    liveNodes: [node({ anchorBlockId: "a", orderIndex: 0, dataKey: "X" })],
    liveAnchors: new Set(["a"]),
  });

  // Survivor is the most-recent row "new"; "old" is removed as a stale dupe.
  assert.deepEqual(diff.toDelete, ["old"]);
  assert.deepEqual(diff.toUpdate, []);
  assert.deepEqual(diff.toCreate, []);
});

test("duplicate anchors with equal createdAt keep the lowest id", () => {
  const diff = diffVisualMirror({
    existingRows: [
      row({ id: "b", anchorBlockId: "a", dataKey: "X", createdAt: 100 }),
      row({ id: "a", anchorBlockId: "a", dataKey: "X", createdAt: 100 }),
    ],
    liveNodes: [node({ anchorBlockId: "a", dataKey: "X" })],
    liveAnchors: new Set(["a"]),
  });

  // Tie on createdAt -> lowest id "a" survives, "b" is deleted.
  assert.deepEqual(diff.toDelete, ["b"]);
});

test("handles a mix of create, update, prune and dedupe together", () => {
  const diff = diffVisualMirror({
    existingRows: [
      row({
        id: "keep",
        anchorBlockId: "a",
        orderIndex: 0,
        dataKey: "OLD",
        createdAt: 100,
      }),
      row({
        id: "dupOld",
        anchorBlockId: "b",
        orderIndex: 1,
        dataKey: "B",
        createdAt: 100,
      }),
      row({
        id: "dupNew",
        anchorBlockId: "b",
        orderIndex: 1,
        dataKey: "B",
        createdAt: 200,
      }),
      row({
        id: "stale",
        anchorBlockId: "z",
        orderIndex: 9,
        dataKey: "Z",
        createdAt: 100,
      }),
    ],
    liveNodes: [
      node({ anchorBlockId: "a", orderIndex: 0, dataKey: "NEW" }),
      node({ anchorBlockId: "b", orderIndex: 1, dataKey: "B" }),
      node({ anchorBlockId: "c", orderIndex: 2, dataKey: "C" }),
    ],
    liveAnchors: new Set(["a", "b", "c"]),
  });

  assert.deepEqual(
    diff.toCreate.map((c) => c.anchorBlockId),
    ["c"],
  );
  assert.deepEqual(
    diff.toUpdate.map((u) => ({ id: u.id, changed: u.payloadChanged })),
    [{ id: "keep", changed: true }],
  );
  // "dupOld" is the stale duplicate of anchor b; "stale" is the orphaned anchor z.
  assert.deepEqual([...diff.toDelete].sort(), ["dupOld", "stale"]);
});
