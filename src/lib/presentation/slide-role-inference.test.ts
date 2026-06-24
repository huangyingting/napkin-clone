/**
 * Unit tests for slide-role-inference.ts — legacy semantic-role migration (#616).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BulletsElement,
  Deck,
  ShapeElement,
  Slide,
  SlideElement,
  TextElement,
} from "./deck";
import {
  inferBulletsRole,
  inferShapeLabelRole,
  inferTextElementRole,
  migrateElementRoles,
  migrateSlideRoles,
} from "./slide-role-inference";
import { resolveTextElementStyle } from "./style-cascade";

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
    bullets: ["a"],
    items: [{ text: "a" }],
    zIndex: 0,
    box: { x: 6, y: 26, w: 80, h: 60 },
    style: { fontSize: 4.5, align: "left", bold: false, italic: false },
  };
}

function labeledShape(): ShapeElement {
  return {
    id: id(),
    kind: "shape",
    shape: "rect",
    color: "#3366ff",
    text: "Label",
    zIndex: 0,
    box: { x: 10, y: 10, w: 30, h: 20 },
  };
}

function unlabeledShape(): ShapeElement {
  return {
    id: id(),
    kind: "shape",
    shape: "ellipse",
    color: "#3366ff",
    zIndex: 0,
    box: { x: 10, y: 10, w: 30, h: 20 },
  };
}

// ---------------------------------------------------------------------------
// Role rules
// ---------------------------------------------------------------------------

test("title-role text infers h1", () => {
  assert.strictEqual(inferTextElementRole(text("title")), "h1");
});

test("body-role text infers body", () => {
  assert.strictEqual(inferTextElementRole(text("body")), "body");
});

test("bottom-band short body text infers footer", () => {
  assert.strictEqual(
    inferTextElementRole(text("body", { x: 6, y: 92, w: 88, h: 6 })),
    "footer",
  );
});

test("bullets infer the bullet role", () => {
  assert.strictEqual(inferBulletsRole(bullets()), "bullet");
});

test("shape label infers shapeLabel", () => {
  assert.strictEqual(inferShapeLabelRole(labeledShape()), "shapeLabel");
});

// ---------------------------------------------------------------------------
// migrateElementRoles
// ---------------------------------------------------------------------------

test("legacy content slide gains deterministic roles", () => {
  const out = migrateElementRoles([
    text("title"),
    bullets(),
    text("body", { x: 6, y: 92, w: 88, h: 6 }),
  ]);
  const roles = out.map((el) =>
    el.kind === "text" || el.kind === "bullets" || el.kind === "shape"
      ? el.textRole
      : undefined,
  );
  assert.deepStrictEqual(roles, ["h1", "bullet", "footer"]);
});

test("migration never mutates concrete style (no visual drift)", () => {
  const original = text("title");
  const beforeStyle = { ...original.style };
  const [migrated] = migrateElementRoles([original]);
  if (migrated.kind !== "text") throw new Error("kind changed");
  assert.deepStrictEqual(migrated.style, beforeStyle);
  assert.strictEqual(migrated.textRole, "h1");
  // original object untouched (pure)
  assert.strictEqual(original.textRole, undefined);
});

test("already-stamped textRole is preserved", () => {
  const pre: TextElement = { ...text("body"), textRole: "caption" };
  const [out] = migrateElementRoles([pre]);
  assert.strictEqual(out.kind === "text" ? out.textRole : undefined, "caption");
});

test("unlabeled shapes are not given a text role", () => {
  const [out] = migrateElementRoles([unlabeledShape()]);
  assert.strictEqual(out.kind === "shape" ? out.textRole : "x", undefined);
});

test("labeled shapes get shapeLabel", () => {
  const [out] = migrateElementRoles([labeledShape()]);
  assert.strictEqual(
    out.kind === "shape" ? out.textRole : undefined,
    "shapeLabel",
  );
});

// ---------------------------------------------------------------------------
// Resolved-style invariance for default-mapped roles
// ---------------------------------------------------------------------------

test("resolved style is unchanged for title/body after migration", () => {
  const deck: Deck = { theme: "default", slides: [] };
  for (const role of ["title", "body"] as const) {
    const el = text(role);
    const before = resolveTextElementStyle(deck, el);
    const [migrated] = migrateElementRoles([el]);
    if (migrated.kind !== "text") throw new Error("kind changed");
    const after = resolveTextElementStyle(deck, migrated);
    // title→h1 and body→body match the default legacy mapping, so the resolved
    // style is identical before and after stamping the role.
    assert.deepStrictEqual(after, before);
  }
});

// ---------------------------------------------------------------------------
// migrateSlideRoles
// ---------------------------------------------------------------------------

function makeSlide(
  elements: SlideElement[],
  layout: Slide["layout"] = "content",
): Slide {
  return {
    id: "s1",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout,
    notes: "",
    theme: "default",
    elements,
  };
}

test("migrateSlideRoles stamps roles across a slide's elements", () => {
  const slide = makeSlide([text("title"), bullets()]);
  const out = migrateSlideRoles(slide);
  const roles = (out.elements ?? []).map((el) =>
    el.kind === "text" || el.kind === "bullets" ? el.textRole : undefined,
  );
  assert.deepStrictEqual(roles, ["h1", "bullet"]);
});

test("migrateSlideRoles returns the slide unchanged when it has no elements", () => {
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
  assert.strictEqual(migrateSlideRoles(slide), slide);
});
