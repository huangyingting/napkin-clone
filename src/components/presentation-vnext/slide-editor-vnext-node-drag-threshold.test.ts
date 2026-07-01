import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createNodeMovePreview } from "./slide-editor-vnext";

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
});
