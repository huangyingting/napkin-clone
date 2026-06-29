import assert from "node:assert/strict";
import { test } from "node:test";

import { elementAccessibleName } from "./element-accessible-name";
import {
  buildBulletsElement,
  buildConnectorElement,
  buildTextElement,
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
  return {
    ...BASE,
    kind: "image",
    role: "image",
    content: {
      kind: "image",
      src: "https://example.com/img.png",
      ...(alt !== undefined ? { alt } : {}),
    },
  } as unknown as SlideElement;
}

function visualEl(alt?: string): SlideElement {
  return {
    ...BASE,
    kind: "visual",
    role: "visual",
    content: {
      kind: "visual",
      visualId: "v1",
      ...(alt !== undefined ? { alt } : {}),
    },
  } as unknown as SlideElement;
}

function fixtureShape(shape: "rect" | "ellipse" | "line" | "triangle") {
  return {
    ...BASE,
    kind: "shape",
    role: "label",
    content: { kind: "shape", shape },
    designOverrides: { fill: { value: "#ff0000" } },
  } as unknown as SlideElement;
}

function tableEl(caption?: string, labels = ["Region", "ARR"]): SlideElement {
  return {
    ...BASE,
    kind: "table",
    role: "table",
    content: {
      kind: "table",
      header: true,
      ...(caption !== undefined ? { caption } : {}),
      columns: labels.map((label, index) => ({
        id: `col-${index + 1}`,
        label,
      })),
      rows: [
        {
          id: "row-1",
          cells: labels.map((label) => ({ text: `${label} value` })),
        },
      ],
    },
  } as unknown as SlideElement;
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

test("shape element prefers label text and truncates long labels", () => {
  const long = "Shape label ".repeat(8);
  const element = {
    ...fixtureShape("rect"),
    content: { kind: "shape", shape: "rect", text: long },
  } as unknown as SlideElement;
  const name = elementAccessibleName(element);
  assert.ok(name.endsWith("…"));
  assert.equal(name.length, 61);
});

// ---------------------------------------------------------------------------
// Table element
// ---------------------------------------------------------------------------

test("table element accessible name prefers caption", () => {
  assert.equal(
    elementAccessibleName(tableEl("Revenue assumptions")),
    "Table: Revenue assumptions",
  );
});

test("table element accessible name falls back to column labels", () => {
  assert.equal(elementAccessibleName(tableEl(undefined)), "Table: Region, ARR");
});

test("table element accessible name falls back to Table", () => {
  assert.equal(elementAccessibleName(tableEl(undefined, ["", ""])), "Table");
});

// ---------------------------------------------------------------------------
// Connector element
// ---------------------------------------------------------------------------

const SHAPE_ONE = {
  id: "shape1",
  box: { x: 0, y: 0, w: 20, h: 20 },
  zIndex: 0,
  kind: "shape",
  role: "label",
  content: { kind: "shape", shape: "rect" },
  designOverrides: { fill: { value: "#ff0000" } },
} as unknown as SlideElement;

const SHAPE_TWO = {
  id: "shape2",
  box: { x: 80, y: 80, w: 20, h: 20 },
  zIndex: 0,
  kind: "shape",
  role: "label",
  content: { kind: "shape", shape: "ellipse" },
  designOverrides: { fill: { value: "#0000ff" } },
} as unknown as SlideElement;

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

test("connector target labels use text, image alt, and visual alt fallbacks", () => {
  const longText = fixtureText("Long connector label ".repeat(3));
  const image = { ...imageEl("Photo alt"), id: "image1" } as SlideElement;
  const visual = { ...visualEl("Chart alt"), id: "visual1" } as SlideElement;
  const toImage = buildConnectorElement({
    ...BASE,
    start: { elementId: longText.id, anchor: "center" },
    end: { elementId: image.id, anchor: "center" },
  });
  const toVisual = buildConnectorElement({
    ...BASE,
    start: { elementId: visual.id, anchor: "center" },
    end: { elementId: "shape1", anchor: "center" },
  });

  assert.equal(
    elementAccessibleName(toImage, [longText, image]),
    "Connector from Long connector label… to Photo alt",
  );
  assert.equal(
    elementAccessibleName(toVisual, [visual, SHAPE_ONE]),
    "Connector from Chart alt to rect",
  );
});
