import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_DECK_SCHEMA_VERSION,
  type ImageElement,
  type TextElement,
} from "./deck";
import { safeParseDeck } from "./deck-schema";
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

test("template slides are valid deck payloads", () => {
  for (const kind of SLIDE_TEMPLATES.map((option) => option.kind)) {
    const slide = buildTemplateSlide(kind, { theme: "indigo" });
    const result = safeParseDeck({
      schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
      theme: "indigo",
      slides: [{ ...slide, index: 0 }],
    });
    assert.equal(result.success, true, kind);
  }
});

test("title template = editable title, subtitle, and footer text", () => {
  assert.deepEqual(elementKinds("title"), ["text", "text", "text"]);
  const slide = buildTemplateSlide("title", { theme: "indigo" });
  assert.equal(slide.layout, "title");
  const textElements = slide.elements as TextElement[];
  assert.deepEqual(
    textElements.map((element) => element.text),
    ["Title", "Subtitle", "Footer"],
  );
  assert.equal(textElements[0]?.role, "title");
});

test("content template = editable title/body text plus image/footer", () => {
  assert.deepEqual(elementKinds("content"), ["text", "text", "image", "text"]);
  const slide = buildTemplateSlide("content", { theme: "indigo" });
  assert.equal(slide.layout, "content");
  const [title, body, image, footer] = slide.elements ?? [];
  assert.equal(title?.kind, "text");
  assert.equal((title as TextElement).text, "Title");
  assert.equal(body?.kind, "text");
  assert.equal((body as TextElement).text, "Body");
  assert.equal(image?.kind, "image");
  assert.match((image as ImageElement).src, /^data:image\/svg\+xml,/);
  assert.equal(footer?.kind, "text");
  assert.equal((footer as TextElement).text, "Footer");
});

test("layout templates no longer emit non-editable placeholders", () => {
  for (const kind of ["title", "content", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, { theme: "indigo" });
    assert.equal(
      (slide.elements ?? []).some((element) => element.kind === "placeholder"),
      false,
      `${kind} should use editable concrete elements`,
    );
  }
});

test("two-column template = title + two editable text columns + footer", () => {
  assert.deepEqual(elementKinds("two-column"), [
    "text",
    "text",
    "text",
    "text",
  ]);
  const slide = buildTemplateSlide("two-column", { theme: "indigo" });
  const [, left, right] = slide.elements as [
    TextElement,
    TextElement,
    TextElement,
  ];
  assert.deepEqual([left.text, right.text], ["Left column", "Right column"]);
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
  assert.match(image.src, /^data:image\/svg\+xml,/);
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
// Blank template
// ---------------------------------------------------------------------------

test("blank template creates an element-first blank slide", () => {
  const slide = buildTemplateSlide("blank", { theme: "ocean" });
  assert.equal(slide.title, "");
  assert.deepEqual(slide.bullets, []);
  assert.deepEqual(slide.visualIds, []);
  assert.equal(slide.layout, "blank");
  assert.equal(slide.notes, "");
  assert.equal(slide.theme, "ocean");
  assert.deepEqual(slide.elements, []);
  assert.equal(slide.elementsDerived, false);
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
