import assert from "node:assert/strict";
import { test } from "node:test";

import type { ImageElement, PlaceholderElement } from "./deck";
import {
  buildTemplateSlide,
  SLIDE_TEMPLATES,
  type SlideTemplateKind,
} from "./slide-templates";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function elementKinds(kind: SlideTemplateKind, visualId?: string): string[] {
  const slide = buildTemplateSlide(kind, { theme: "indigo", visualId });
  return (slide.elements ?? []).map((element) => element.kind);
}

// ---------------------------------------------------------------------------
// Template catalogue
// ---------------------------------------------------------------------------

test("SLIDE_TEMPLATES exposes the five expected kinds in order", () => {
  assert.deepEqual(
    SLIDE_TEMPLATES.map((option) => option.kind),
    ["title", "content", "visual", "two-column", "blank"],
  );
  for (const option of SLIDE_TEMPLATES) {
    assert.ok(option.label.length > 0);
    assert.ok(option.description.length > 0);
  }
});

// ---------------------------------------------------------------------------
// Authored (non-blank) templates
// ---------------------------------------------------------------------------

test("non-blank templates carry the chosen theme", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, { theme: "forest" });
    assert.equal(slide.theme, "forest");
  }
});

test("non-blank templates are authored (elementsDerived === false)", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, { theme: "indigo" });
    assert.equal(
      slide.elementsDerived,
      false,
      `${kind} must be flagged authored so sync preserves its elements`,
    );
    assert.ok(
      (slide.elements?.length ?? 0) > 0,
      `${kind} must ship non-empty elements[]`,
    );
  }
});

test("non-blank templates assign unique sequential z-indices", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, { theme: "indigo" });
    const zs = (slide.elements ?? []).map((element) => element.zIndex);
    assert.deepEqual(
      zs,
      [...zs].sort((a, b) => a - b),
    );
    assert.equal(new Set(zs).size, zs.length, `${kind} z-indices must differ`);
  }
});

test("non-blank templates assign unique element ids", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, { theme: "indigo" });
    const ids = (slide.elements ?? []).map((element) => element.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("title template = title, subtitle, and footer placeholders", () => {
  assert.deepEqual(elementKinds("title"), [
    "placeholder",
    "placeholder",
    "placeholder",
  ]);
  const slide = buildTemplateSlide("title", { theme: "indigo" });
  assert.equal(slide.layout, "title");
  const placeholders = slide.elements as PlaceholderElement[];
  assert.deepEqual(
    placeholders.map((element) => element.placeholderType),
    ["title", "subtitle", "footer"],
  );
});

test("content template = title/body/visual/footer placeholders", () => {
  assert.deepEqual(elementKinds("content"), [
    "placeholder",
    "placeholder",
    "placeholder",
    "placeholder",
  ]);
  const slide = buildTemplateSlide("content", { theme: "indigo" });
  assert.equal(slide.layout, "content");
  const placeholders = slide.elements as PlaceholderElement[];
  assert.deepEqual(
    placeholders.map((element) => element.placeholderType),
    ["title", "body", "visual", "footer"],
  );
});

test("two-column template = title + two body placeholders + footer", () => {
  assert.deepEqual(elementKinds("two-column"), [
    "placeholder",
    "placeholder",
    "placeholder",
    "placeholder",
  ]);
  const slide = buildTemplateSlide("two-column", { theme: "indigo" });
  const [, left, right] = slide.elements as [
    PlaceholderElement,
    PlaceholderElement,
    PlaceholderElement,
  ];
  assert.equal(left.placeholderType, "body");
  assert.equal(right.placeholderType, "body");
  // Columns sit side by side: the right column starts past the left's edge.
  assert.ok(right.box.x >= left.box.x + left.box.w);
});

// ---------------------------------------------------------------------------
// Visual spotlight template
// ---------------------------------------------------------------------------

test("visual spotlight without a visualId uses an image placeholder", () => {
  assert.deepEqual(elementKinds("visual"), ["image", "text"]);
  const slide = buildTemplateSlide("visual", { theme: "indigo" });
  assert.equal(slide.layout, "media");
  const image = slide.elements?.[0] as ImageElement;
  assert.equal(image.src, "");
  assert.deepEqual(slide.visualIds, []);
});

test("visual spotlight with a visualId references that document visual", () => {
  assert.deepEqual(elementKinds("visual", "vis-42"), ["visual", "text"]);
  const slide = buildTemplateSlide("visual", {
    theme: "indigo",
    visualId: "vis-42",
  });
  const visual = slide.elements?.[0];
  assert.equal(visual?.kind, "visual");
  assert.equal((visual as { visualId: string }).visualId, "vis-42");
  assert.deepEqual(slide.visualIds, ["vis-42"]);
});

// ---------------------------------------------------------------------------
// Blank template — legacy parity
// ---------------------------------------------------------------------------

test("blank template reproduces the legacy blank slide", () => {
  const slide = buildTemplateSlide("blank", { theme: "ocean" });
  assert.equal(slide.title, "");
  assert.deepEqual(slide.bullets, []);
  assert.deepEqual(slide.visualIds, []);
  assert.equal(slide.layout, "blank");
  assert.equal(slide.notes, "");
  assert.equal(slide.theme, "ocean");
  // No elements and no derived flag — identical to today's blank add.
  assert.equal(slide.elements, undefined);
  assert.equal(slide.elementsDerived, undefined);
});

test("every box stays within the 0–100 percent slide bounds", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, { theme: "indigo" });
    for (const element of slide.elements ?? []) {
      const { x, y, w, h } = element.box;
      assert.ok(x >= 0 && y >= 0, `${kind} box origin in bounds`);
      assert.ok(x + w <= 100, `${kind} box right edge in bounds`);
      assert.ok(y + h <= 100, `${kind} box bottom edge in bounds`);
    }
  }
});
