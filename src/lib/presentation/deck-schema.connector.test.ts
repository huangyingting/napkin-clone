import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParseDeck } from "./deck-schema";
import { elementDeck } from "./deck-schema.test-helpers";

// ---------------------------------------------------------------------------
// ConnectorElement — new first-class connector kind (issue #323)
// ---------------------------------------------------------------------------

test("safeParseDeck accepts a connector element with two free points", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c1",
        kind: "connector",
        zIndex: 5,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { x: 10, y: 20 },
        end: { x: 80, y: 70 },
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "connector");
    if (el?.kind === "connector") {
      assert.deepEqual(el.start, { x: 10, y: 20 });
      assert.deepEqual(el.end, { x: 80, y: 70 });
      assert.equal(el.stroke, undefined);
      assert.equal(el.arrowStart, undefined);
      assert.equal(el.arrowEnd, undefined);
      assert.equal(el.dash, undefined);
      assert.equal(el.routing, undefined);
    }
  }
});

test("safeParseDeck accepts a connector element with bound endpoints", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c2",
        kind: "connector",
        zIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { elementId: "el-a", anchor: "right" },
        end: { elementId: "el-b", anchor: "left" },
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "connector");
    if (el?.kind === "connector") {
      assert.deepEqual(el.start, { elementId: "el-a", anchor: "right" });
      assert.deepEqual(el.end, { elementId: "el-b", anchor: "left" });
    }
  }
});

test("safeParseDeck round-trips connector optional fields", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c3",
        kind: "connector",
        zIndex: 1,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { x: 5, y: 5 },
        end: { x: 95, y: 95 },
        stroke: { color: "#ff0000", width: 1.5 },
        arrowStart: "none",
        arrowEnd: "filled",
        dash: true,
        routing: "elbow",
        opacity: 0.7,
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "connector");
    if (el?.kind === "connector") {
      assert.deepEqual(el.stroke, { color: "#ff0000", width: 1.5 });
      assert.equal(el.arrowStart, "none");
      assert.equal(el.arrowEnd, "filled");
      assert.equal(el.dash, true);
      assert.equal(el.routing, "elbow");
      assert.equal(el.opacity, 0.7);
    }
  }
});

test("safeParseDeck rejects a connector with a missing start", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c4",
        kind: "connector",
        zIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        end: { x: 50, y: 50 },
      },
    ]),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects a connector with an invalid anchor", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c5",
        kind: "connector",
        zIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { elementId: "el-a", anchor: "north" },
        end: { x: 50, y: 50 },
      },
    ]),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects a connector with a non-hex stroke color", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c6",
        kind: "connector",
        zIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { x: 0, y: 0 },
        end: { x: 50, y: 50 },
        stroke: { color: "red", width: 1 },
      },
    ]),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck ignores unrecognised connector routing values", () => {
  // Unknown routing values are silently dropped (not an error)
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c7",
        kind: "connector",
        zIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { x: 0, y: 0 },
        end: { x: 50, y: 50 },
        routing: "bezier",
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    if (el?.kind === "connector") {
      assert.equal(el.routing, undefined);
    }
  }
});
