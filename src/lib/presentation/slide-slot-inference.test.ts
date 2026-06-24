/**
 * Unit tests for slide-slot-inference.ts — conservative legacy slot inference (#626).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BulletsElement,
  ImageElement,
  ShapeElement,
  Slide,
  SlideElement,
  TextElement,
  VisualElement,
} from "./deck";
import {
  inferElementSlotKind,
  inferElementSlots,
  inferSlideSlots,
} from "./slide-slot-inference";

let nextId = 0;
function id(): string {
  nextId += 1;
  return `el-${nextId}`;
}

function text(
  role: "title" | "body",
  box = { x: 6, y: 6, w: 80, h: 16 },
): TextElement {
  return {
    id: id(),
    kind: "text",
    role,
    text: role,
    zIndex: 0,
    box,
    style: { fontSize: 5, align: "left", bold: false, italic: false },
  };
}

function bullets(): BulletsElement {
  return {
    id: id(),
    kind: "bullets",
    bullets: ["a", "b"],
    items: [{ text: "a" }, { text: "b" }],
    zIndex: 0,
    box: { x: 6, y: 26, w: 80, h: 60 },
    style: { fontSize: 4.5, align: "left", bold: false, italic: false },
  };
}

function visual(): VisualElement {
  return {
    id: id(),
    kind: "visual",
    visualId: "vis-1",
    zIndex: 0,
    box: { x: 10, y: 24, w: 80, h: 60 },
  };
}

function image(): ImageElement {
  return {
    id: id(),
    kind: "image",
    src: "data:image/png;base64,xx",
    zIndex: 0,
    box: { x: 10, y: 24, w: 40, h: 40 },
  };
}

function shape(): ShapeElement {
  return {
    id: id(),
    kind: "shape",
    shape: "rect",
    color: "#3366ff",
    zIndex: 0,
    box: { x: 10, y: 10, w: 20, h: 20 },
  };
}

function makeSlide(elements: SlideElement[]): Slide {
  return {
    id: "s1",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "default",
    elements,
  };
}

function slotKeys(elements: SlideElement[]): string[] {
  return elements.map((el) =>
    el.layoutSlot
      ? `${el.layoutSlot.kind}#${el.layoutSlot.index ?? 0}`
      : "unbound",
  );
}

// ---------------------------------------------------------------------------
// inferElementSlotKind — rule documentation
// ---------------------------------------------------------------------------

test("title-role text infers the title slot", () => {
  assert.strictEqual(inferElementSlotKind(text("title")), "title");
});

test("body-role text infers the body slot", () => {
  assert.strictEqual(inferElementSlotKind(text("body")), "body");
});

test("bottom-band short text infers the footer slot", () => {
  const footer = text("body", { x: 6, y: 92, w: 88, h: 6 });
  assert.strictEqual(inferElementSlotKind(footer), "footer");
});

test("bullets infer the body slot", () => {
  assert.strictEqual(inferElementSlotKind(bullets()), "body");
});

test("visual infers the visual slot", () => {
  assert.strictEqual(inferElementSlotKind(visual()), "visual");
});

test("images and shapes are ambiguous and stay unbound", () => {
  assert.strictEqual(inferElementSlotKind(image()), undefined);
  assert.strictEqual(inferElementSlotKind(shape()), undefined);
});

// ---------------------------------------------------------------------------
// inferElementSlots — fixtures for legacy slide shapes
// ---------------------------------------------------------------------------

test("legacy title slide binds title + subtitle-ish body", () => {
  const title = text("title", { x: 8, y: 36, w: 84, h: 20 });
  const subtitle = text("body", { x: 8, y: 58, w: 84, h: 10 });
  const out = inferElementSlots([title, subtitle]);
  assert.deepStrictEqual(slotKeys(out), ["title#0", "body#0"]);
});

test("legacy content slide binds title/body/visual", () => {
  const out = inferElementSlots([text("title"), bullets(), visual()]);
  assert.deepStrictEqual(slotKeys(out), ["title#0", "body#0", "visual#0"]);
});

test("legacy two-column slide binds body#0 and body#1 deterministically", () => {
  const col1 = text("body", { x: 6, y: 26, w: 40, h: 60 });
  const col2 = text("body", { x: 54, y: 26, w: 40, h: 60 });
  const out = inferElementSlots([text("title"), col1, col2]);
  assert.deepStrictEqual(slotKeys(out), ["title#0", "body#0", "body#1"]);
});

test("legacy visual slide leaves an image spotlight unbound, caption infers body", () => {
  const spotlight = image();
  const caption = text("body", { x: 6, y: 82, w: 88, h: 8 }); // not bottom-band → body
  const out = inferElementSlots([spotlight, caption]);
  assert.deepStrictEqual(slotKeys(out), ["unbound", "body#0"]);
});

test("free-form slide (shapes/images only) stays entirely unbound", () => {
  const out = inferElementSlots([shape(), image(), shape()]);
  assert.deepStrictEqual(slotKeys(out), ["unbound", "unbound", "unbound"]);
});

test("already-bound elements are preserved, not re-inferred", () => {
  const bound = { ...text("body"), layoutSlot: { kind: "title" as const } };
  const out = inferElementSlots([bound, text("title")]);
  // The pre-bound element keeps title; the new title-role text also infers title
  // but as a fresh occurrence counter (#0, since the bound one is not counted).
  assert.strictEqual(out[0].layoutSlot?.kind, "title");
  assert.strictEqual(out[1].layoutSlot?.kind, "title");
});

test("inference preserves geometry, content, and styles", () => {
  const original = bullets();
  const [out] = inferElementSlots([original]);
  assert.notStrictEqual(out, original); // new object
  if (out.kind !== "bullets") throw new Error("kind changed");
  assert.deepStrictEqual(out.box, original.box);
  assert.deepStrictEqual(out.items, original.items);
  assert.deepStrictEqual(out.style, original.style);
  assert.strictEqual(out.layoutSlot?.kind, "body");
});

// ---------------------------------------------------------------------------
// inferSlideSlots
// ---------------------------------------------------------------------------

test("inferSlideSlots applies bindings to a slide's elements", () => {
  const slide = makeSlide([text("title"), bullets()]);
  const out = inferSlideSlots(slide);
  assert.deepStrictEqual(slotKeys(out.elements ?? []), ["title#0", "body#0"]);
});

test("inferSlideSlots returns the slide unchanged when it has no elements", () => {
  const slide: Slide = {
    id: "s1",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "default",
  };
  assert.strictEqual(inferSlideSlots(slide), slide);
});
