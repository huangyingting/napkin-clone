import assert from "node:assert/strict";
import { test } from "node:test";

import type { SlideElement } from "./deck";
import { arrangeElements } from "./element-arrange";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal SlideElement with the relevant fields for z-order tests. */
function el(
  id: string,
  zIndex: number,
  extra: Partial<SlideElement> = {},
): SlideElement {
  return {
    id,
    kind: "shape",
    content: { kind: "shape", shape: "rect" },
    zIndex,
    box: { x: 0, y: 0, w: 10, h: 10 },
    ...extra,
  } as unknown as SlideElement;
}

/** Returns the stacking order (bottom-to-top) as an array of ids. */
function stackOrder(elements: SlideElement[]): string[] {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex).map((e) => e.id);
}

// Five-element stack: a(0) b(1) c(2) d(3) e(4)
function fiveStack(): SlideElement[] {
  return [el("a", 0), el("b", 1), el("c", 2), el("d", 3), el("e", 4)];
}

// ── bring to front ───────────────────────────────────────────────────────────

test("arrangeElements front moves selected elements to top, preserving relative order", () => {
  const result = arrangeElements(fiveStack(), new Set(["b", "d"]), "front");
  const order = stackOrder(result);
  // Non-selected (a, c, e) come first, then selected (b, d) in their original
  // relative order.
  assert.deepEqual(order, ["a", "c", "e", "b", "d"]);
});

test("arrangeElements front with all elements selected is a no-op on the ordering", () => {
  const elements = fiveStack();
  const result = arrangeElements(
    elements,
    new Set(["a", "b", "c", "d", "e"]),
    "front",
  );
  assert.deepEqual(stackOrder(result), ["a", "b", "c", "d", "e"]);
});

test("arrangeElements front with single element moves it to top", () => {
  const result = arrangeElements(fiveStack(), new Set(["b"]), "front");
  const order = stackOrder(result);
  assert.equal(order[order.length - 1], "b");
  assert.equal(order.includes("a"), true);
  assert.equal(order.includes("c"), true);
});

// ── send to back ─────────────────────────────────────────────────────────────

test("arrangeElements back moves selected elements to bottom, preserving relative order", () => {
  const result = arrangeElements(fiveStack(), new Set(["b", "d"]), "back");
  const order = stackOrder(result);
  // Selected (b, d) come first, then non-selected (a, c, e).
  assert.deepEqual(order, ["b", "d", "a", "c", "e"]);
});

test("arrangeElements back with single element moves it to bottom", () => {
  const result = arrangeElements(fiveStack(), new Set(["d"]), "back");
  const order = stackOrder(result);
  assert.equal(order[0], "d");
});

// ── bring forward ─────────────────────────────────────────────────────────────

test("arrangeElements forward moves each selected element one step up", () => {
  // Stack: a(0) b(1,sel) c(2) d(3,sel) e(4)
  // After forward: a c b e d
  const result = arrangeElements(fiveStack(), new Set(["b", "d"]), "forward");
  const order = stackOrder(result);
  assert.deepEqual(order, ["a", "c", "b", "e", "d"]);
});

test("arrangeElements forward does not move a selected element already at the top", () => {
  // e is at the top (index 4) — it has no room to move up.
  const result = arrangeElements(fiveStack(), new Set(["e"]), "forward");
  const order = stackOrder(result);
  assert.equal(order[order.length - 1], "e");
});

test("arrangeElements forward when all are selected is a no-op on the ordering", () => {
  const result = arrangeElements(
    fiveStack(),
    new Set(["a", "b", "c", "d", "e"]),
    "forward",
  );
  assert.deepEqual(stackOrder(result), ["a", "b", "c", "d", "e"]);
});

// ── send backward ─────────────────────────────────────────────────────────────

test("arrangeElements backward moves each selected element one step down", () => {
  // Stack: a(0) b(1,sel) c(2) d(3,sel) e(4)
  // After backward: b a d c e
  const result = arrangeElements(fiveStack(), new Set(["b", "d"]), "backward");
  const order = stackOrder(result);
  assert.deepEqual(order, ["b", "a", "d", "c", "e"]);
});

test("arrangeElements backward does not move a selected element already at the bottom", () => {
  const result = arrangeElements(fiveStack(), new Set(["a"]), "backward");
  const order = stackOrder(result);
  assert.equal(order[0], "a");
});

// ── locked elements ──────────────────────────────────────────────────────────

test("arrangeElements silently skips locked elements even if in selectedIds", () => {
  const elements = [el("a", 0), el("b", 1, { locked: true }), el("c", 2)];
  // b is locked; selecting it should change nothing.
  const result = arrangeElements(elements, new Set(["b"]), "front");
  assert.deepEqual(stackOrder(result), ["a", "b", "c"]);
});

test("arrangeElements includes locked elements in z-order calculation", () => {
  const elements = [el("a", 0), el("b", 1, { locked: true }), el("c", 2)];
  // Move a to front: it should pass over the locked b.
  const result = arrangeElements(elements, new Set(["a"]), "front");
  const order = stackOrder(result);
  assert.equal(order[order.length - 1], "a");
  // b stays in the middle (unchanged relative position among non-moved elements).
  assert.equal(order.indexOf("b") < order.indexOf("a"), true);
});

// ── immutability ──────────────────────────────────────────────────────────────

test("arrangeElements does not mutate the input array or elements", () => {
  const input = fiveStack();
  const snapshots = input.map((e) => ({ ...e }));
  arrangeElements(input, new Set(["b", "d"]), "front");
  // Input elements and their zIndex values unchanged.
  assert.deepEqual(
    input.map((e) => ({ id: e.id, zIndex: e.zIndex })),
    snapshots.map((e) => ({ id: e.id, zIndex: e.zIndex })),
  );
});

test("arrangeElements returns new element objects (no mutation)", () => {
  const input = fiveStack();
  const result = arrangeElements(input, new Set(["b"]), "front");
  result.forEach((r, i) => assert.notStrictEqual(r, input[i]));
});

// ── zIndex re-stamping ────────────────────────────────────────────────────────

test("arrangeElements stamps contiguous zIndex values starting from the original minimum", () => {
  // Use non-contiguous starting zIndexes.
  const elements = [el("a", 10), el("b", 20), el("c", 30)];
  const result = arrangeElements(elements, new Set(["a"]), "front");
  const zIndexes = [...result]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((e) => e.zIndex);
  // Contiguous from 10.
  assert.deepEqual(zIndexes, [10, 11, 12]);
  // a is now at top.
  const order = stackOrder(result);
  assert.equal(order[order.length - 1], "a");
});
