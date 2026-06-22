import assert from "node:assert/strict";
import { test } from "node:test";

import type { ConnectorElement, SlideElement } from "./deck";
import { filterElementsByName, getConnectorTargetNames } from "./layer-list";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE = {
  box: { x: 0, y: 0, w: 20, h: 20 },
  zIndex: 0,
} as const;

function textEl(id: string, text: string): SlideElement {
  return {
    ...BASE,
    id,
    kind: "text",
    text,
    role: "body",
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  };
}

function shapeEl(
  id: string,
  shape: "rect" | "ellipse" | "line" | "triangle",
): SlideElement {
  return { ...BASE, id, kind: "shape", shape, color: "#ff0000" };
}

function connectorEl(
  id: string,
  startId?: string,
  endId?: string,
): ConnectorElement {
  return {
    ...BASE,
    id,
    kind: "connector",
    start: startId ? { elementId: startId, anchor: "center" } : { x: 0, y: 0 },
    end: endId ? { elementId: endId, anchor: "center" } : { x: 50, y: 50 },
  };
}

// ---------------------------------------------------------------------------
// filterElementsByName
// ---------------------------------------------------------------------------

test("filterElementsByName returns original reference for blank query", () => {
  const elements = [textEl("a", "Hello"), textEl("b", "World")];
  assert.equal(filterElementsByName(elements, ""), elements);
  assert.equal(filterElementsByName(elements, "   "), elements);
});

test("filterElementsByName matches by accessible name (case-insensitive)", () => {
  const elements = [
    textEl("a", "Hello World"),
    textEl("b", "Foo Bar"),
    shapeEl("c", "rect"),
  ];
  const result = filterElementsByName(elements, "hello");
  assert.equal(result.length, 1);
  assert.equal(result[0]!.id, "a");
});

test("filterElementsByName matches shape kind", () => {
  const elements = [textEl("a", "Title"), shapeEl("b", "ellipse")];
  const result = filterElementsByName(elements, "ellipse");
  assert.equal(result.length, 1);
  assert.equal(result[0]!.id, "b");
});

test("filterElementsByName returns empty array when nothing matches", () => {
  const elements = [textEl("a", "Hello")];
  const result = filterElementsByName(elements, "zzz");
  assert.equal(result.length, 0);
});

test("filterElementsByName matches partial substring", () => {
  const elements = [textEl("a", "Quarterly Revenue"), textEl("b", "Budget")];
  const result = filterElementsByName(elements, "rev");
  assert.equal(result.length, 1);
  assert.equal(result[0]!.id, "a");
});

// ---------------------------------------------------------------------------
// getConnectorTargetNames
// ---------------------------------------------------------------------------

test("getConnectorTargetNames with free endpoints returns free-point labels", () => {
  const connector = connectorEl("c");
  const names = getConnectorTargetNames(connector, [connector]);
  assert.equal(names.start, "(free point)");
  assert.equal(names.end, "(free point)");
});

test("getConnectorTargetNames resolves bound endpoints by accessible name", () => {
  const rect = shapeEl("r", "rect");
  const ellipse = shapeEl("e", "ellipse");
  const connector = connectorEl("c", "r", "e");
  const names = getConnectorTargetNames(connector, [rect, ellipse, connector]);
  assert.equal(names.start, "Shape: rect");
  assert.equal(names.end, "Shape: ellipse");
});

test("getConnectorTargetNames falls back to free-point when element not found", () => {
  const connector = connectorEl("c", "missing-id", "also-missing");
  const names = getConnectorTargetNames(connector, [connector]);
  assert.equal(names.start, "(free point)");
  assert.equal(names.end, "(free point)");
});

test("getConnectorTargetNames uses text content for text element targets", () => {
  const title = textEl("t", "Introduction");
  const connector = connectorEl("c", "t");
  const names = getConnectorTargetNames(connector, [title, connector]);
  assert.equal(names.start, "Introduction");
  assert.equal(names.end, "(free point)");
});

// ---------------------------------------------------------------------------
// hidden field round-trip via schema
// ---------------------------------------------------------------------------

test("hidden field is preserved through schema round-trip", async () => {
  const { safeParseDeck } = await import("./deck-schema");

  const input = {
    theme: "default",
    slides: [
      {
        index: 0,
        title: "",
        bullets: [],
        visualIds: [],
        layout: "blank",
        notes: "",
        theme: "default",
        elements: [
          {
            id: "el1",
            kind: "shape",
            shape: "rect",
            color: "#ff0000",
            zIndex: 0,
            box: { x: 0, y: 0, w: 20, h: 20 },
            hidden: true,
          },
          {
            id: "el2",
            kind: "shape",
            shape: "ellipse",
            color: "#00ff00",
            zIndex: 1,
            box: { x: 0, y: 0, w: 20, h: 20 },
            // hidden absent — should remain undefined
          },
        ],
      },
    ],
  };

  const result = safeParseDeck(input);
  assert.equal(result.success, true);
  if (!result.success) return;

  const elements = result.data.slides[0]!.elements!;
  assert.equal(elements[0]!.hidden, true);
  assert.equal(elements[1]!.hidden, undefined);
});

test("hidden field false is preserved through schema round-trip", async () => {
  const { safeParseDeck } = await import("./deck-schema");

  const input = {
    theme: "default",
    slides: [
      {
        index: 0,
        title: "",
        bullets: [],
        visualIds: [],
        layout: "blank",
        notes: "",
        theme: "default",
        elements: [
          {
            id: "el1",
            kind: "shape",
            shape: "rect",
            color: "#ff0000",
            zIndex: 0,
            box: { x: 0, y: 0, w: 20, h: 20 },
            hidden: false,
          },
        ],
      },
    ],
  };

  const result = safeParseDeck(input);
  assert.equal(result.success, true);
  if (!result.success) return;

  const elements = result.data.slides[0]!.elements!;
  // false should be preserved (not stripped since it's a boolean)
  assert.equal(elements[0]!.hidden, false);
});
