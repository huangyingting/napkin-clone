import assert from "node:assert/strict";
import test from "node:test";

import { flex, initializeLayoutEngine, layoutFlex } from "./layout-dsl";

test("flex compiles equal-width rows to slide percent boxes", async () => {
  await initializeLayoutEngine();

  const boxes = flex({
    box: { x: 8, y: 30, w: 84, h: 46 },
    direction: "row",
    gap: "3cqw",
    children: Array.from({ length: 3 }, () => ({ grow: 1 })),
  });

  assert.deepEqual(
    boxes.map((box) => ({
      x: Number(box.x.toFixed(4)),
      y: Number(box.y.toFixed(4)),
      w: Number(box.w.toFixed(4)),
      h: Number(box.h.toFixed(4)),
    })),
    [
      { x: 8, y: 30, w: 26, h: 46 },
      { x: 37, y: 30, w: 26, h: 46 },
      { x: 66, y: 30, w: 26, h: 46 },
    ],
  );
});

test("percent dimensions resolve against the immediate Yoga parent", async () => {
  await initializeLayoutEngine();

  const tree = layoutFlex({
    box: { x: 0, y: 0, w: 100, h: 100 },
    direction: "row",
    children: [
      {
        width: "50%",
        height: "100%",
        children: [{ width: "50%", height: "50%" }],
      },
    ],
  });

  const child = tree.children[0];
  const grandchild = child.children[0];
  assert.deepEqual(
    {
      childW: Number(child.box.w.toFixed(4)),
      grandchildW: Number(grandchild.box.w.toFixed(4)),
      grandchildH: Number(grandchild.box.h.toFixed(4)),
    },
    { childW: 50, grandchildW: 25, grandchildH: 50 },
  );
});
