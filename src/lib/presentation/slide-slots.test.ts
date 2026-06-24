/**
 * Unit tests for slide-slots.ts — the semantic layout-slot model (#628).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundSlots,
  findSlotElement,
  freeFormElements,
  isBoundElement,
  isSlideSlotKind,
  sameSlot,
  SLIDE_SLOT_KINDS,
  slotIndex,
  slotKey,
  type LayoutSlotBinding,
} from "./slide-slots";

interface El {
  id: string;
  layoutSlot?: LayoutSlotBinding;
}

test("SLIDE_SLOT_KINDS exposes the canonical vocabulary", () => {
  assert.deepStrictEqual(SLIDE_SLOT_KINDS, [
    "title",
    "subtitle",
    "body",
    "visual",
    "image",
    "caption",
    "footer",
  ]);
});

test("isSlideSlotKind recognizes valid and rejects invalid kinds", () => {
  assert.strictEqual(isSlideSlotKind("title"), true);
  assert.strictEqual(isSlideSlotKind("image"), true);
  assert.strictEqual(isSlideSlotKind("header"), false);
  assert.strictEqual(isSlideSlotKind(undefined), false);
  assert.strictEqual(isSlideSlotKind(3), false);
});

test("slotIndex treats absent index as 0", () => {
  assert.strictEqual(slotIndex({ kind: "body" }), 0);
  assert.strictEqual(slotIndex({ kind: "body", index: 2 }), 2);
});

test("slotKey is stable and encodes kind + occurrence", () => {
  assert.strictEqual(slotKey({ kind: "body" }), "body#0");
  assert.strictEqual(slotKey({ kind: "body", index: 1 }), "body#1");
});

test("sameSlot compares kind and occurrence (absent index == 0)", () => {
  assert.strictEqual(
    sameSlot({ kind: "body" }, { kind: "body", index: 0 }),
    true,
  );
  assert.strictEqual(
    sameSlot({ kind: "body" }, { kind: "body", index: 1 }),
    false,
  );
  assert.strictEqual(sameSlot({ kind: "body" }, { kind: "title" }), false);
});

test("isBoundElement distinguishes bound from free-form", () => {
  const bound: El = { id: "a", layoutSlot: { kind: "title" } };
  const free: El = { id: "b" };
  assert.strictEqual(isBoundElement(bound), true);
  assert.strictEqual(isBoundElement(free), false);
});

test("findSlotElement returns the element filling a slot, supporting repeats", () => {
  const els: El[] = [
    { id: "title", layoutSlot: { kind: "title" } },
    { id: "body0", layoutSlot: { kind: "body", index: 0 } },
    { id: "body1", layoutSlot: { kind: "body", index: 1 } },
    { id: "free" },
  ];
  assert.strictEqual(findSlotElement(els, "title")?.id, "title");
  assert.strictEqual(findSlotElement(els, "body")?.id, "body0");
  assert.strictEqual(findSlotElement(els, "body", 1)?.id, "body1");
  assert.strictEqual(findSlotElement(els, "visual"), undefined);
});

test("freeFormElements returns only unbound elements, preserving order", () => {
  const els: El[] = [
    { id: "a", layoutSlot: { kind: "title" } },
    { id: "b" },
    { id: "c" },
    { id: "d", layoutSlot: { kind: "body" } },
  ];
  assert.deepStrictEqual(
    freeFormElements(els).map((e) => e.id),
    ["b", "c"],
  );
});

test("boundSlots pairs bound elements with their bindings", () => {
  const els: El[] = [
    { id: "a", layoutSlot: { kind: "title" } },
    { id: "b" },
    { id: "c", layoutSlot: { kind: "body", index: 1 } },
  ];
  const pairs = boundSlots(els);
  assert.strictEqual(pairs.length, 2);
  assert.strictEqual(pairs[0].element.id, "a");
  assert.strictEqual(slotKey(pairs[1].binding), "body#1");
});
