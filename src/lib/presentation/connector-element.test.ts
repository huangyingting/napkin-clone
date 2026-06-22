/**
 * Unit tests for the ConnectorElement deck model:
 *  1. Schema validation via {@link safeParseDeck}
 *  2. The {@link normalizeConnector} migration helper
 *
 * These tests run under `node --test` (no React, no DOM).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ConnectorElement, ShapeElement } from "./deck";
import { normalizeConnector } from "./connector-normalize";
import { safeParseDeck } from "./deck-schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wraps a single element in a minimal valid deck shape. */
function deckWithElement(el: object): unknown {
  return {
    theme: "default",
    slides: [
      {
        id: "sl-1",
        index: 0,
        title: "",
        bullets: [],
        visualIds: [],
        layout: "blank",
        notes: "",
        theme: "default",
        elements: [el],
      },
    ],
  };
}

const BASE_BOX = { x: 10, y: 20, w: 30, h: 0.5 };

const MINIMAL_CONNECTOR = {
  id: "c1",
  kind: "connector",
  zIndex: 0,
  box: BASE_BOX,
  start: { x: 10, y: 20 },
  end: { x: 40, y: 25 },
  routing: "straight",
  stroke: { color: "#ffffff", width: 0.4 },
};

// ---------------------------------------------------------------------------
// Schema — valid connector elements
// ---------------------------------------------------------------------------

test("safeParseDeck accepts a minimal connector element (free points)", () => {
  const result = safeParseDeck(deckWithElement(MINIMAL_CONNECTOR));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "connector");
    if (el?.kind === "connector") {
      assert.deepEqual(el.start, { x: 10, y: 20 });
      assert.deepEqual(el.end, { x: 40, y: 25 });
      assert.equal(el.routing, "straight");
      assert.deepEqual(el.stroke, { color: "#ffffff", width: 0.4 });
    }
  }
});

test("safeParseDeck accepts a connector with bound start endpoint", () => {
  const result = safeParseDeck(
    deckWithElement({
      ...MINIMAL_CONNECTOR,
      start: { elementId: "el-abc", anchor: "right" },
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    if (el?.kind === "connector") {
      assert.deepEqual(el.start, { elementId: "el-abc", anchor: "right" });
    }
  }
});

test("safeParseDeck accepts a connector with both endpoints bound", () => {
  const result = safeParseDeck(
    deckWithElement({
      ...MINIMAL_CONNECTOR,
      start: { elementId: "el-a", anchor: "right" },
      end: { elementId: "el-b", anchor: "left" },
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "connector");
  }
});

test("safeParseDeck accepts optional arrowStart, arrowEnd, and dash", () => {
  const result = safeParseDeck(
    deckWithElement({
      ...MINIMAL_CONNECTOR,
      arrowStart: "open",
      arrowEnd: "filled",
      dash: "dashed",
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    if (el?.kind === "connector") {
      assert.equal(el.arrowStart, "open");
      assert.equal(el.arrowEnd, "filled");
      assert.equal(el.dash, "dashed");
    }
  }
});

test("safeParseDeck round-trips all arrowhead variants", () => {
  const variants: ConnectorElement["arrowStart"][] = [
    "none",
    "open",
    "filled",
    "dot",
  ];
  for (const v of variants) {
    const result = safeParseDeck(
      deckWithElement({ ...MINIMAL_CONNECTOR, arrowEnd: v }),
    );
    assert.equal(result.success, true, `arrowEnd "${v}" should be accepted`);
  }
});

test("safeParseDeck round-trips all dash variants", () => {
  const variants: ConnectorElement["dash"][] = ["solid", "dashed", "dotted"];
  for (const v of variants) {
    const result = safeParseDeck(
      deckWithElement({ ...MINIMAL_CONNECTOR, dash: v }),
    );
    assert.equal(result.success, true, `dash "${v}" should be accepted`);
  }
});

// ---------------------------------------------------------------------------
// Schema — invalid connector elements
// ---------------------------------------------------------------------------

test("safeParseDeck rejects connector missing stroke", () => {
  const { stroke: _omit, ...noStroke } = MINIMAL_CONNECTOR;
  const result = safeParseDeck(deckWithElement(noStroke));
  assert.equal(result.success, false);
});

test("safeParseDeck rejects connector with non-hex stroke color", () => {
  const result = safeParseDeck(
    deckWithElement({
      ...MINIMAL_CONNECTOR,
      stroke: { color: "white", width: 1 },
    }),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects connector missing start endpoint", () => {
  const { start: _omit, ...noStart } = MINIMAL_CONNECTOR;
  const result = safeParseDeck(deckWithElement(noStart));
  assert.equal(result.success, false);
});

test("safeParseDeck rejects connector missing end endpoint", () => {
  const { end: _omit, ...noEnd } = MINIMAL_CONNECTOR;
  const result = safeParseDeck(deckWithElement(noEnd));
  assert.equal(result.success, false);
});

test("safeParseDeck rejects connector with invalid routing", () => {
  const result = safeParseDeck(
    deckWithElement({ ...MINIMAL_CONNECTOR, routing: "curved" }),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects connector with invalid arrowStart", () => {
  const result = safeParseDeck(
    deckWithElement({ ...MINIMAL_CONNECTOR, arrowStart: "triangle" }),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects connector with invalid dash", () => {
  const result = safeParseDeck(
    deckWithElement({ ...MINIMAL_CONNECTOR, dash: "wavy" }),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects bound endpoint with invalid anchor", () => {
  const result = safeParseDeck(
    deckWithElement({
      ...MINIMAL_CONNECTOR,
      start: { elementId: "el-x", anchor: "diagonal" },
    }),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects bound endpoint with empty elementId", () => {
  const result = safeParseDeck(
    deckWithElement({
      ...MINIMAL_CONNECTOR,
      start: { elementId: "", anchor: "right" },
    }),
  );
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Backward compatibility — old shape:line elements still validate
// ---------------------------------------------------------------------------

test("safeParseDeck round-trips a shape:line element unchanged", () => {
  const result = safeParseDeck(
    deckWithElement({
      id: "s1",
      kind: "shape",
      shape: "line",
      color: "#ff0000",
      zIndex: 0,
      box: BASE_BOX,
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "shape");
    if (el?.kind === "shape") {
      assert.equal(el.shape, "line");
      assert.equal(el.color, "#ff0000");
    }
  }
});

// ---------------------------------------------------------------------------
// normalizeConnector migration helper
// ---------------------------------------------------------------------------

function makeLineShape(
  overrides: Partial<ShapeElement & { shape: "line" }> = {},
): ShapeElement & { shape: "line" } {
  return {
    id: "el-line",
    kind: "shape",
    shape: "line",
    color: "#aabbcc",
    zIndex: 3,
    box: { x: 10, y: 50, w: 50, h: 0.5 },
    ...overrides,
  } as ShapeElement & { shape: "line" };
}

test("normalizeConnector returns a ConnectorElement with kind=connector", () => {
  const connector = normalizeConnector(makeLineShape());
  assert.equal(connector.kind, "connector");
  assert.equal(connector.id, "el-line");
  assert.equal(connector.zIndex, 3);
  assert.equal(connector.routing, "straight");
});

test("normalizeConnector derives free endpoints from box + rotation", () => {
  // A horizontal line at y=50%, from x=10% to x=60%
  const connector = normalizeConnector(
    makeLineShape({ box: { x: 10, y: 50, w: 50, h: 0.5 }, rotation: 0 }),
  );
  // With no rotation, endpoints lie at left/right center of the box
  // (from lineEndpoints: start.x ≈ 10 + 50/2 - 50/2 = 10, end.x ≈ 60)
  assert.ok("x" in connector.start, "start should be a free point");
  assert.ok("x" in connector.end, "end should be a free point");
  if ("x" in connector.start && "x" in connector.end) {
    assert.ok(
      Math.abs(connector.start.x - 10) < 0.5,
      `start.x ≈ 10, got ${connector.start.x}`,
    );
    assert.ok(
      Math.abs(connector.end.x - 60) < 0.5,
      `end.x ≈ 60, got ${connector.end.x}`,
    );
  }
});

test("normalizeConnector promotes connector.start binding to ConnectorBoundEndpoint", () => {
  const connector = normalizeConnector(
    makeLineShape({
      connector: {
        start: { elementId: "el-target", anchor: "right" },
      },
    }),
  );
  assert.ok("elementId" in connector.start, "start should be a bound endpoint");
  if ("elementId" in connector.start) {
    assert.equal(connector.start.elementId, "el-target");
    assert.equal(connector.start.anchor, "right");
  }
  // end has no binding → must be a free point
  assert.ok("x" in connector.end, "end should remain a free point");
});

test("normalizeConnector promotes both connector bindings", () => {
  const connector = normalizeConnector(
    makeLineShape({
      connector: {
        start: { elementId: "el-a", anchor: "bottom" },
        end: { elementId: "el-b", anchor: "top" },
      },
    }),
  );
  assert.ok("elementId" in connector.start);
  assert.ok("elementId" in connector.end);
  if ("elementId" in connector.start && "elementId" in connector.end) {
    assert.equal(connector.start.elementId, "el-a");
    assert.equal(connector.end.elementId, "el-b");
  }
});

test("normalizeConnector uses shape.stroke if present", () => {
  const connector = normalizeConnector(
    makeLineShape({ stroke: { color: "#112233", width: 1.5 } }),
  );
  assert.deepEqual(connector.stroke, { color: "#112233", width: 1.5 });
});

test("normalizeConnector falls back to shape.color for stroke when no stroke", () => {
  const connector = normalizeConnector(makeLineShape({ color: "#ff0000" }));
  assert.equal(connector.stroke.color, "#ff0000");
  assert.equal(connector.stroke.width, 0.4);
});

test("normalizeConnector forwards optional BaseElement fields", () => {
  const connector = normalizeConnector(
    makeLineShape({
      opacity: 0.7,
      rotation: 45,
      shadow: true,
      locked: true,
      groupId: "grp-1",
    }),
  );
  assert.equal(connector.opacity, 0.7);
  assert.equal(connector.rotation, 45);
  assert.equal(connector.shadow, true);
  assert.equal(connector.locked, true);
  assert.equal(connector.groupId, "grp-1");
});

test("normalizeConnector omits optional fields that are not set on input", () => {
  const connector = normalizeConnector(makeLineShape());
  assert.equal(connector.opacity, undefined);
  assert.equal(connector.rotation, undefined);
  assert.equal(connector.shadow, undefined);
  assert.equal(connector.locked, undefined);
  assert.equal(connector.groupId, undefined);
});
