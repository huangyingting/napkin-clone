import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createSingleCommitGesture } from "./single-commit-gesture";
import {
  createNodeMovePreview,
  nodeMovePreviewsEqual,
  type NodeMovePreview,
} from "./slide-editor-vnext";

describe("createNodeMovePreview", () => {
  test("keeps node drag press-pending under the click-move threshold", () => {
    const preview = createNodeMovePreview({
      startClientX: 100,
      startClientY: 100,
      nextClientX: 104,
      nextClientY: 103,
      rectWidth: 1000,
      rectHeight: 1000,
      originalFrames: new Map([["node-a", { x: 10, y: 10, w: 20, h: 20 }]]),
      alignmentGuides: [],
    });

    assert.equal(preview, null);
  });

  test("returns move patches and guides after crossing threshold", () => {
    const originalFrame = { x: 9.6, y: 89.4, w: 20, h: 10 };
    const preview = createNodeMovePreview({
      startClientX: 100,
      startClientY: 100,
      nextClientX: 105,
      nextClientY: 105,
      rectWidth: 1000,
      rectHeight: 1000,
      originalFrames: new Map([["node-a", originalFrame]]),
      alignmentGuides: [],
    });

    assert.ok(preview);
    assert.equal(preview.patches.size, 1);
    const patch = preview.patches.get("node-a");
    assert.ok(patch?.frame);
    assert.notDeepEqual(patch.frame, originalFrame);
    assert.ok(preview.guides.length > 0);
  });

  test("skips guide snapping when disabled", () => {
    const preview = createNodeMovePreview({
      startClientX: 100,
      startClientY: 100,
      nextClientX: 105,
      nextClientY: 105,
      rectWidth: 1000,
      rectHeight: 1000,
      originalFrames: new Map([["node-a", { x: 9.6, y: 89.4, w: 20, h: 10 }]]),
      alignmentGuides: [],
      snapToGuides: false,
    });

    assert.ok(preview);
    assert.deepEqual(preview.guides, []);
    const frame = preview.patches.get("node-a")?.frame;
    assert.ok(frame);
    assert.equal(Math.round(frame.x * 10), 101);
    assert.equal(Math.round(frame.y * 10), 899);
  });

  test("commits one final layout patch after multiple drag previews", () => {
    const commits: NodeMovePreview[] = [];
    const previews: Array<NodeMovePreview | null> = [];
    const gesture = createSingleCommitGesture<NodeMovePreview>({
      initialValue: {
        patches: new Map(),
        guides: [] as NodeMovePreview["guides"],
      },
      equals: nodeMovePreviewsEqual,
      onPreview: (preview) => previews.push(preview),
      onCommit: (preview) => commits.push(preview),
    });
    const originalFrames = new Map([
      ["node-a", { x: 10, y: 10, w: 20, h: 20 }],
    ]);
    const firstPreview = createNodeMovePreview({
      startClientX: 100,
      startClientY: 100,
      nextClientX: 110,
      nextClientY: 110,
      rectWidth: 1000,
      rectHeight: 1000,
      originalFrames,
      alignmentGuides: [],
    });
    const finalPreview = createNodeMovePreview({
      startClientX: 100,
      startClientY: 100,
      nextClientX: 135,
      nextClientY: 120,
      rectWidth: 1000,
      rectHeight: 1000,
      originalFrames,
      alignmentGuides: [],
    });

    assert.ok(firstPreview);
    assert.ok(finalPreview);
    gesture.update(firstPreview);
    gesture.update(finalPreview);
    gesture.finish();

    assert.equal(commits.length, 1);
    assert.ok(commits[0]);
    assert.ok(commits[0].patches.has("node-a"));
    assert.deepEqual(
      commits[0].patches.get("node-a"),
      finalPreview.patches.get("node-a"),
    );
    assert.equal(previews.at(-1), null);
  });
});
