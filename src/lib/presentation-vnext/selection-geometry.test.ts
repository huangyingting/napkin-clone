import assert from "node:assert/strict";
import { test } from "node:test";

import type { SlideChildNode } from "./schema";
import {
  normalizeSelectionFrame,
  selectNodesInFrame,
} from "./selection-geometry";

function textNode(
  id: string,
  frame: { x: number; y: number; w: number; h: number },
): SlideChildNode {
  return {
    id,
    type: "text",
    layout: { frame, zIndex: 1 },
    style: { ref: "text.body" },
    content: { paragraphs: [{ id: `${id}-p`, text: id }] },
  };
}

test("normalizeSelectionFrame returns positive dimensions from any drag direction", () => {
  assert.deepEqual(
    normalizeSelectionFrame({ x: 80, y: 70 }, { x: 20, y: 10 }),
    { x: 20, y: 10, w: 60, h: 60 },
  );
});

test("selectNodesInFrame returns intersecting node ids", () => {
  const nodes = [
    textNode("a", { x: 10, y: 10, w: 10, h: 10 }),
    textNode("b", { x: 50, y: 50, w: 10, h: 10 }),
  ];

  assert.deepEqual(selectNodesInFrame(nodes, { x: 5, y: 5, w: 20, h: 20 }), [
    "a",
  ]);
});

test("selectNodesInFrame includes nested group children", () => {
  const nodes: SlideChildNode[] = [
    {
      id: "group-1",
      type: "group",
      component: "custom",
      layout: { frame: { x: 0, y: 0, w: 100, h: 100 }, zIndex: 1 },
      children: [textNode("child", { x: 35, y: 35, w: 10, h: 10 })],
    },
  ];

  assert.deepEqual(selectNodesInFrame(nodes, { x: 30, y: 30, w: 20, h: 20 }), [
    "group-1",
    "child",
  ]);
});
