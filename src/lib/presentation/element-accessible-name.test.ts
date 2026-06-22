import assert from "node:assert/strict";
import { test } from "node:test";

import { elementAccessibleName } from "./element-accessible-name";
import type { SlideElement } from "./deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE = {
  id: "e1",
  box: { x: 10, y: 10, w: 40, h: 20 },
  zIndex: 1,
} as const;

function textEl(text: string, role: "title" | "body" = "body"): SlideElement {
  return {
    ...BASE,
    kind: "text",
    text,
    role,
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  };
}

function bulletsEl(bullets: string[]): SlideElement {
  return {
    ...BASE,
    kind: "bullets",
    bullets,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
  };
}

function imageEl(alt?: string): SlideElement {
  return { ...BASE, kind: "image", src: "https://example.com/img.png", alt };
}

function visualEl(alt?: string): SlideElement {
  return { ...BASE, kind: "visual", visualId: "v1", alt };
}

function shapeEl(
  shape: "rect" | "ellipse" | "line" | "triangle",
): SlideElement {
  return { ...BASE, kind: "shape", shape, color: "#ff0000" };
}

// ---------------------------------------------------------------------------
// Text element
// ---------------------------------------------------------------------------

test("text element with content returns its text", () => {
  assert.equal(elementAccessibleName(textEl("Hello world")), "Hello world");
});

test("text element truncates at 60 chars", () => {
  const long = "A".repeat(65);
  const name = elementAccessibleName(textEl(long));
  assert.equal(name.length, 61); // 60 + "…"
  assert.ok(name.endsWith("…"));
});

test("text element with empty string returns fallback", () => {
  assert.equal(elementAccessibleName(textEl("")), "Text element");
});

test("text element with whitespace-only returns fallback", () => {
  assert.equal(elementAccessibleName(textEl("   ")), "Text element");
});

// ---------------------------------------------------------------------------
// Bullets element
// ---------------------------------------------------------------------------

test("bullets element returns first non-empty bullet", () => {
  assert.equal(
    elementAccessibleName(bulletsEl(["", "First point", "Second"])),
    "First point",
  );
});

test("bullets element truncates at 60 chars", () => {
  const long = "B".repeat(70);
  const name = elementAccessibleName(bulletsEl([long]));
  assert.ok(name.endsWith("…"));
  assert.equal(name.length, 61);
});

test("bullets element with no non-empty bullets returns fallback", () => {
  assert.equal(elementAccessibleName(bulletsEl([])), "Bullets element");
});

// ---------------------------------------------------------------------------
// Image element
// ---------------------------------------------------------------------------

test("image element with alt returns alt text", () => {
  assert.equal(
    elementAccessibleName(imageEl("A cat sitting")),
    "A cat sitting",
  );
});

test("image element without alt returns 'Image'", () => {
  assert.equal(elementAccessibleName(imageEl()), "Image");
});

test("image element with empty alt returns 'Image'", () => {
  assert.equal(elementAccessibleName(imageEl("")), "Image");
});

// ---------------------------------------------------------------------------
// Visual element
// ---------------------------------------------------------------------------

test("visual element with alt returns alt text", () => {
  assert.equal(
    elementAccessibleName(visualEl("Revenue chart")),
    "Revenue chart",
  );
});

test("visual element without alt returns 'Visual'", () => {
  assert.equal(elementAccessibleName(visualEl()), "Visual");
});

// ---------------------------------------------------------------------------
// Shape element
// ---------------------------------------------------------------------------

test("shape element returns 'Shape: rect'", () => {
  assert.equal(elementAccessibleName(shapeEl("rect")), "Shape: rect");
});

test("shape element returns 'Shape: ellipse'", () => {
  assert.equal(elementAccessibleName(shapeEl("ellipse")), "Shape: ellipse");
});

test("shape element returns 'Shape: line'", () => {
  assert.equal(elementAccessibleName(shapeEl("line")), "Shape: line");
});
