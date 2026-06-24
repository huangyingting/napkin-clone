/**
 * Unit tests for layout-apply.ts — content-preserving layout application (#630).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ElementBox,
  PlaceholderElement,
  SlideElement,
  SlideLayout,
  TextElement,
} from "./deck";
import { applyLayoutPreservingContent } from "./layout-apply";
import type { SlideSlotKind } from "./slide-slots";

let n = 0;
const id = () => `el-${++n}`;

function placeholder(
  placeholderType: PlaceholderElement["placeholderType"],
  box: ElementBox,
): PlaceholderElement {
  return { id: id(), kind: "placeholder", placeholderType, zIndex: 0, box };
}

function layout(placeholders: PlaceholderElement[]): SlideLayout {
  return {
    id: "L1",
    name: "title-content",
    format: "16:9",
    placeholders,
  };
}

function boundText(slot: SlideSlotKind, index = 0): TextElement {
  return {
    id: id(),
    kind: "text",
    role: slot === "title" ? "title" : "body",
    text: `${slot}${index}`,
    zIndex: 0,
    box: { x: 1, y: 1, w: 10, h: 10 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
    layoutSlot: { kind: slot, ...(index > 0 ? { index } : {}) },
  };
}

function freeShape(): SlideElement {
  return {
    id: id(),
    kind: "shape",
    shape: "rect",
    color: "#3366ff",
    zIndex: 0,
    box: { x: 70, y: 70, w: 20, h: 20 },
  };
}

const TITLE_BOX = { x: 8, y: 6, w: 84, h: 14 };
const BODY_BOX = { x: 8, y: 24, w: 84, h: 60 };

test("bound content moves into the matching placeholder geometry", () => {
  const title = boundText("title");
  const result = applyLayoutPreservingContent(
    [title],
    layout([placeholder("title", TITLE_BOX)]),
  );
  const moved = result.elements.find((e) => e.id === title.id);
  assert.deepStrictEqual(moved?.box, TITLE_BOX);
  assert.deepStrictEqual(result.moved, ["title#0"]);
  assert.deepStrictEqual(result.inserted, []);
  // content preserved
  assert.equal(moved?.kind === "text" ? moved.text : "", "title0");
});

test("preserves text, style, and runs when moving bound content", () => {
  const title: TextElement = {
    ...boundText("title"),
    runs: [{ text: "Hello" }],
    style: {
      fontSize: 7,
      bold: true,
      italic: false,
      align: "center",
      color: "#ff0000",
    },
  };
  const [moved] = applyLayoutPreservingContent(
    [title],
    layout([placeholder("title", TITLE_BOX)]),
  ).elements;
  if (moved.kind !== "text") throw new Error("kind changed");
  assert.deepStrictEqual(moved.runs, [{ text: "Hello" }]);
  assert.equal(moved.style.color, "#ff0000");
  assert.equal(moved.style.bold, true);
});

test("empty slots receive a fresh placeholder bound to the slot", () => {
  const result = applyLayoutPreservingContent(
    [],
    layout([placeholder("title", TITLE_BOX), placeholder("body", BODY_BOX)]),
  );
  assert.deepStrictEqual(result.inserted, ["title#0", "body#0"]);
  assert.equal(result.elements.length, 2);
  for (const el of result.elements) {
    assert.equal(el.kind, "placeholder");
    assert.ok(el.layoutSlot, "inserted placeholder should be slot-bound");
  }
});

test("free-form elements are never moved or deleted", () => {
  const free = freeShape();
  const result = applyLayoutPreservingContent(
    [free],
    layout([placeholder("title", TITLE_BOX)]),
  );
  const kept = result.elements.find((e) => e.id === free.id);
  assert.ok(kept, "free-form element preserved");
  assert.deepStrictEqual(kept?.box, { x: 70, y: 70, w: 20, h: 20 });
});

test("repeated same-kind slots map deterministically (body#0, body#1)", () => {
  const b0 = boundText("body", 0);
  const b1 = boundText("body", 1);
  const result = applyLayoutPreservingContent(
    [b1, b0], // order independent of slot index
    layout([
      placeholder("body", { x: 6, y: 26, w: 40, h: 60 }),
      placeholder("body", { x: 54, y: 26, w: 40, h: 60 }),
    ]),
  );
  const m0 = result.elements.find((e) => e.id === b0.id);
  const m1 = result.elements.find((e) => e.id === b1.id);
  assert.deepStrictEqual(m0?.box, { x: 6, y: 26, w: 40, h: 60 });
  assert.deepStrictEqual(m1?.box, { x: 54, y: 26, w: 40, h: 60 });
  assert.deepStrictEqual(result.moved.sort(), ["body#0", "body#1"]);
});

test("bound content whose slot is absent from the target is preserved in place", () => {
  const caption = boundText("caption");
  const result = applyLayoutPreservingContent(
    [caption],
    layout([placeholder("title", TITLE_BOX)]),
  );
  const kept = result.elements.find((e) => e.id === caption.id);
  assert.deepStrictEqual(kept?.box, { x: 1, y: 1, w: 10, h: 10 }); // unchanged
  assert.deepStrictEqual(result.moved, []);
  assert.deepStrictEqual(result.inserted, ["title#0"]); // title slot was empty
});

test("mixed slide: moves bound, inserts missing, preserves free-form", () => {
  const title = boundText("title");
  const free = freeShape();
  const result = applyLayoutPreservingContent(
    [title, free],
    layout([placeholder("title", TITLE_BOX), placeholder("body", BODY_BOX)]),
  );
  assert.deepStrictEqual(result.moved, ["title#0"]);
  assert.deepStrictEqual(result.inserted, ["body#0"]);
  // title moved, free preserved, body placeholder inserted = 3 elements
  assert.equal(result.elements.length, 3);
  // z-indices restacked sequentially
  assert.deepStrictEqual(
    result.elements.map((e) => e.zIndex),
    [0, 1, 2],
  );
});

test("does not mutate the input elements", () => {
  const title = boundText("title");
  const before = JSON.parse(JSON.stringify(title));
  applyLayoutPreservingContent(
    [title],
    layout([placeholder("title", TITLE_BOX)]),
  );
  assert.deepStrictEqual(title, before);
});
