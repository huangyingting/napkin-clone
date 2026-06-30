import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inscribedElementBox,
  inscribedSquareBox,
  relativeBox,
} from "./shape-geometry";

test("inscribedSquareBox centers the largest square inside a numeric box", () => {
  assert.deepEqual(inscribedSquareBox({ x: 1, y: 2, w: 8, h: 4 }), {
    x: 3,
    y: 2,
    w: 4,
    h: 4,
  });
});

test("inscribedElementBox accounts for slide aspect ratio for circle and square", () => {
  const box = { x: 10, y: 10, w: 20, h: 20 };
  const canvas = { width: 16, height: 9 };

  assert.deepEqual(inscribedElementBox("circle", box, canvas), {
    x: 14.375,
    y: 10,
    w: 11.25,
    h: 20,
  });
  assert.deepEqual(inscribedElementBox("square", box, canvas), {
    x: 14.375,
    y: 10,
    w: 11.25,
    h: 20,
  });
  assert.deepEqual(inscribedElementBox("ellipse", box, canvas), box);
});

test("relativeBox converts an inscribed element box to parent percentages", () => {
  assert.deepEqual(
    relativeBox(
      { x: 14.375, y: 10, w: 11.25, h: 20 },
      { x: 10, y: 10, w: 20, h: 20 },
    ),
    { x: 21.875, y: 0, w: 56.25, h: 100 },
  );
});
