import assert from "node:assert/strict";
import { test } from "node:test";

import { elementAccessibleName } from "./element-accessible-name";
import {
  buildBulletsElement,
  buildConnectorElement,
  buildImageElement,
  buildShapeElement,
  buildTextElement,
  buildVisualElement,
} from "@/test/builders";
import type { SlideElement } from "./deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE = { id: "e1", box: { x: 10, y: 10, w: 40, h: 20 }, zIndex: 1 };

function fixtureText(text: string): SlideElement {
  return buildTextElement({ ...BASE, text, paragraphs: [{ text }] });
}

function bulletsEl(bullets: string[]): SlideElement {
  return buildBulletsElement({ ...BASE, bullets });
}

function imageEl(alt?: string): SlideElement {
  return buildImageElement({
    ...BASE,
    src: "https://example.com/img.png",
    ...(alt !== undefined ? { alt } : {}),
  });
}

function visualEl(alt?: string): SlideElement {
  return buildVisualElement({
    ...BASE,
    visualId: "v1",
    ...(alt !== undefined ? { alt } : {}),
  });
}

function fixtureShape(shape: "rect" | "ellipse" | "line" | "triangle") {
  return buildShapeElement({ ...BASE, shape, color: "#ff0000" });
}

// ---------------------------------------------------------------------------
// Text element
// ---------------------------------------------------------------------------

test("text element with content returns its text", () => {
  assert.equal(
    elementAccessibleName(fixtureText("Hello world")),
    "Hello world",
  );
});

test("text element truncates at 60 chars", () => {
  const long = "A".repeat(65);
  const name = elementAccessibleName(fixtureText(long));
  assert.equal(name.length, 61); // 60 + "…"
  assert.ok(name.endsWith("…"));
});

test("text element with empty string returns fallback", () => {
  assert.equal(elementAccessibleName(fixtureText("")), "Text element");
});

test("text element with whitespace-only returns fallback", () => {
  assert.equal(elementAccessibleName(fixtureText("   ")), "Text element");
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

test("list text element with no non-empty paragraphs returns fallback", () => {
  assert.equal(elementAccessibleName(bulletsEl([])), "Text element");
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
  assert.equal(elementAccessibleName(fixtureShape("rect")), "Shape: rect");
});

test("shape element returns 'Shape: ellipse'", () => {
  assert.equal(
    elementAccessibleName(fixtureShape("ellipse")),
    "Shape: ellipse",
  );
});

test("shape element returns 'Shape: line'", () => {
  assert.equal(elementAccessibleName(fixtureShape("line")), "Shape: line");
});

// ---------------------------------------------------------------------------
// Connector element
// ---------------------------------------------------------------------------

const SHAPE_ONE = buildShapeElement({
  id: "shape1",
  box: { x: 0, y: 0, w: 20, h: 20 },
  zIndex: 0,
  shape: "rect",
  color: "#ff0000",
});

const SHAPE_TWO = buildShapeElement({
  id: "shape2",
  box: { x: 80, y: 80, w: 20, h: 20 },
  zIndex: 0,
  shape: "ellipse",
  color: "#0000ff",
});

function connectorEl(startBound?: boolean, endBound?: boolean) {
  return buildConnectorElement({
    ...BASE,
    start: startBound
      ? { elementId: "shape1", anchor: "center" as const }
      : { x: 10, y: 20 },
    end: endBound
      ? { elementId: "shape2", anchor: "center" as const }
      : { x: 50, y: 60 },
  });
}

test("connector without allElements returns 'Connector'", () => {
  assert.equal(elementAccessibleName(connectorEl()), "Connector");
});

test("connector with free endpoints returns point labels", () => {
  assert.equal(
    elementAccessibleName(connectorEl(), []),
    "Connector from point to point",
  );
});

test("connector with both endpoints bound returns shape labels", () => {
  assert.equal(
    elementAccessibleName(connectorEl(true, true), [SHAPE_ONE, SHAPE_TWO]),
    "Connector from rect to ellipse",
  );
});

test("connector with only start bound", () => {
  assert.equal(
    elementAccessibleName(connectorEl(true, false), [SHAPE_ONE, SHAPE_TWO]),
    "Connector from rect to point",
  );
});

test("connector with only end bound", () => {
  assert.equal(
    elementAccessibleName(connectorEl(false, true), [SHAPE_ONE, SHAPE_TWO]),
    "Connector from point to ellipse",
  );
});

test("connector bound to missing element falls back to point", () => {
  assert.equal(
    elementAccessibleName(connectorEl(true, true), []),
    "Connector from point to point",
  );
});
