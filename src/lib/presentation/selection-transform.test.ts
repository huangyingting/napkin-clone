import assert from "node:assert/strict";
import { test } from "node:test";

import type { ElementBox, SlideElement } from "./deck";
import {
  rotateElementsAroundCenter,
  scaleElementsInBoundingBox,
  selectionBoundingBox,
} from "./selection-transform";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function box(x: number, y: number, w: number, h: number): ElementBox {
  return { x, y, w, h };
}

function textEl(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation?: number,
): SlideElement {
  return {
    id,
    kind: "text",
    box: box(x, y, w, h),
    zIndex: 1,
    text: id,
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
    role: "body",
    ...(rotation !== undefined ? { rotation } : {}),
  } as SlideElement;
}

// ---------------------------------------------------------------------------
// selectionBoundingBox
// ---------------------------------------------------------------------------

test("selectionBoundingBox: empty array returns zero box", () => {
  const result = selectionBoundingBox([]);
  assert.deepEqual(result, { x: 0, y: 0, w: 0, h: 0 });
});

test("selectionBoundingBox: single box returns itself", () => {
  const result = selectionBoundingBox([box(10, 20, 30, 40)]);
  assert.deepEqual(result, { x: 10, y: 20, w: 30, h: 40 });
});

test("selectionBoundingBox: two non-overlapping boxes", () => {
  // box1: x=10, y=10, right=30, bottom=20
  // box2: x=40, y=5, right=60, bottom=25
  // union: x=10, y=5, right=60, bottom=25 → w=50, h=20
  const result = selectionBoundingBox([
    box(10, 10, 20, 10),
    box(40, 5, 20, 20),
  ]);
  assert.deepEqual(result, { x: 10, y: 5, w: 50, h: 20 });
});

test("selectionBoundingBox: overlapping boxes", () => {
  const result = selectionBoundingBox([box(0, 0, 50, 50), box(25, 25, 50, 50)]);
  assert.deepEqual(result, { x: 0, y: 0, w: 75, h: 75 });
});

test("selectionBoundingBox: three boxes spread out", () => {
  // minX=5, minY=2, maxX=70, maxY=60
  const result = selectionBoundingBox([
    box(5, 10, 15, 10),
    box(20, 2, 30, 30),
    box(55, 40, 15, 20),
  ]);
  assert.deepEqual(result, { x: 5, y: 2, w: 65, h: 58 });
});

// ---------------------------------------------------------------------------
// scaleElementsInBoundingBox
// ---------------------------------------------------------------------------

test("scaleElementsInBoundingBox: returns same elements when oldBbox is zero-width", () => {
  const els = [textEl("a", 10, 10, 20, 10)];
  const result = scaleElementsInBoundingBox(
    els,
    box(10, 10, 0, 10),
    box(10, 10, 30, 10),
  );
  assert.deepEqual(result[0].box, els[0].box);
});

test("scaleElementsInBoundingBox: uniform 2× scale from top-left", () => {
  // oldBbox: 0,0 50×40 → newBbox: 0,0 100×80 (double each)
  const els = [textEl("a", 0, 0, 20, 10), textEl("b", 30, 20, 20, 20)];
  const result = scaleElementsInBoundingBox(
    els,
    box(0, 0, 50, 40),
    box(0, 0, 100, 80),
  );
  assert.deepEqual(result[0].box, { x: 0, y: 0, w: 40, h: 20 });
  assert.deepEqual(result[1].box, { x: 60, y: 40, w: 40, h: 40 });
});

test("scaleElementsInBoundingBox: scale with bbox origin offset", () => {
  // oldBbox: x=10, y=10 w=20 h=20 → newBbox: x=10, y=10 w=40 h=40 (2× size, same origin)
  const els = [textEl("a", 10, 10, 10, 10)]; // fills the left-top quadrant of bbox
  const result = scaleElementsInBoundingBox(
    els,
    box(10, 10, 20, 20),
    box(10, 10, 40, 40),
  );
  assert.deepEqual(result[0].box, { x: 10, y: 10, w: 20, h: 20 });
});

test("scaleElementsInBoundingBox: element in bottom-right corner", () => {
  // oldBbox: 0,0 100×100; element at 80,80 10×10 (10% from each edge)
  // newBbox: 0,0 50×50 → element at 40,40 5×5
  const els = [textEl("a", 80, 80, 10, 10)];
  const result = scaleElementsInBoundingBox(
    els,
    box(0, 0, 100, 100),
    box(0, 0, 50, 50),
  );
  assert.deepEqual(result[0].box, { x: 40, y: 40, w: 5, h: 5 });
});

test("scaleElementsInBoundingBox: preserves other element fields", () => {
  const els = [textEl("a", 0, 0, 50, 40)];
  const result = scaleElementsInBoundingBox(
    els,
    box(0, 0, 50, 40),
    box(0, 0, 100, 80),
  );
  assert.equal(result[0].id, "a");
  assert.equal(result[0].kind, "text");
});

// ---------------------------------------------------------------------------
// rotateElementsAroundCenter
// ---------------------------------------------------------------------------

function approxEqual(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) < tol;
}

test("rotateElementsAroundCenter: 0° delta leaves element unchanged", () => {
  const els = [textEl("a", 10, 10, 20, 10)];
  const result = rotateElementsAroundCenter(els, 20, 15, 0);
  assert.deepEqual(result[0].box, { x: 10, y: 10, w: 20, h: 10 });
  assert.equal(result[0].rotation, undefined);
});

test("rotateElementsAroundCenter: 360° brings element back to origin", () => {
  const els = [textEl("a", 20, 10, 20, 10)];
  const center = { x: 30, y: 15 }; // center of element
  const result = rotateElementsAroundCenter(els, center.x, center.y, 360);
  assert.ok(approxEqual(result[0].box.x, 20));
  assert.ok(approxEqual(result[0].box.y, 10));
  assert.equal(result[0].rotation, undefined);
});

test("rotateElementsAroundCenter: 90° rotates element center correctly", () => {
  // Element at (0,0)–(10,10), center=(5,5). Pivot=(50,50).
  // dx=-45, dy=-45. After 90° CW: newCx=50+(-45)*0-(-45)*1=50+45=95, newCy=50+(-45)*1+(-45)*0=50-45=5
  const els = [textEl("a", 0, 0, 10, 10)];
  const result = rotateElementsAroundCenter(els, 50, 50, 90);
  const newBox = result[0].box;
  assert.ok(
    approxEqual(newBox.x + newBox.w / 2, 95),
    `cx: ${newBox.x + newBox.w / 2}`,
  );
  assert.ok(
    approxEqual(newBox.y + newBox.h / 2, 5),
    `cy: ${newBox.y + newBox.h / 2}`,
  );
  assert.ok(approxEqual(newBox.w, 10));
  assert.ok(approxEqual(newBox.h, 10));
  assert.equal(result[0].rotation, 90);
});

test("rotateElementsAroundCenter: accumulates onto existing rotation", () => {
  const els = [textEl("a", 0, 0, 10, 10, 45)]; // already 45°
  const result = rotateElementsAroundCenter(els, 5, 5, 45);
  assert.equal(result[0].rotation, 90);
});

test("rotateElementsAroundCenter: wraps rotation into (-180, 180]", () => {
  const els = [textEl("a", 0, 0, 10, 10, 150)];
  // 150 + 90 = 240 → 240 - 360 = -120
  const result = rotateElementsAroundCenter(els, 5, 5, 90);
  assert.equal(result[0].rotation, -120);
});

test("rotateElementsAroundCenter: rotation of exactly 180 is stored as 180 not -180", () => {
  const els = [textEl("a", 0, 0, 10, 10, 90)];
  const result = rotateElementsAroundCenter(els, 5, 5, 90);
  assert.equal(result[0].rotation, 180);
});

test("rotateElementsAroundCenter: preserves element dimensions", () => {
  const els = [textEl("a", 10, 20, 30, 15)];
  const result = rotateElementsAroundCenter(els, 50, 50, 45);
  assert.ok(approxEqual(result[0].box.w, 30));
  assert.ok(approxEqual(result[0].box.h, 15));
});

test("rotateElementsAroundCenter: multiple elements rotate independently", () => {
  // Two elements symmetric about center (50,50).
  // el1 center=(30,50), el2 center=(70,50).
  // After 90° CW about (50,50):
  //   el1 center: dx=-20,dy=0 → newCx=50+0=50, newCy=50-20=30 → el1 center (50,30)
  //   el2 center: dx=20,dy=0  → newCx=50+0=50, newCy=50+20=70 → el2 center (50,70)
  const els = [
    textEl("a", 25, 45, 10, 10), // center (30,50)
    textEl("b", 65, 45, 10, 10), // center (70,50)
  ];
  const result = rotateElementsAroundCenter(els, 50, 50, 90);
  assert.ok(approxEqual(result[0].box.x + result[0].box.w / 2, 50, 1e-8));
  assert.ok(approxEqual(result[0].box.y + result[0].box.h / 2, 30, 1e-8));
  assert.ok(approxEqual(result[1].box.x + result[1].box.w / 2, 50, 1e-8));
  assert.ok(approxEqual(result[1].box.y + result[1].box.h / 2, 70, 1e-8));
});
