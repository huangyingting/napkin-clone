/**
 * Unit tests for connector lifecycle helpers (issue #324):
 *  1. detachConnectorEndpoint
 *  2. updateConnectorBindingsOnDelete
 *  3. remapConnectorBindings
 *  4. Integration via deck-mutations: removeElement / removeElements /
 *     duplicateElement / duplicateElements
 *
 * Acceptance criteria verified:
 *  AC-1  Deleting a shape detaches bound connector endpoints (connector kept).
 *  AC-2  Duplicating shape+connector preserves connection between duplicates.
 *  AC-3  Duplicating only one endpoint shape detaches the connector endpoint.
 *  AC-4  Copy/paste with both shapes remaps IDs; with only one — detaches.
 *  AC-5  All lifecycle cases are covered by tests (this file).
 *  AC-6  Typecheck / lint / format clean (verified by validation pipeline).
 *
 * These tests run under `node --test` (no DOM, no React, no browser APIs).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ConnectorEndpoint,
  ConnectorElement,
  ConnectorPointFree,
  Deck,
  ShapeElement,
  Slide,
  SlideElement,
} from "./deck";
import {
  detachConnectorEndpoint,
  remapConnectorBindings,
  updateConnectorBindingsOnDelete,
} from "./connector-lifecycle";
import {
  duplicateElement,
  duplicateElements,
  groupElements,
  removeElement,
  removeElements,
  ungroupElements,
} from "./deck-mutations";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BOX_A = { x: 10, y: 10, w: 20, h: 20 }; // center (20, 20)
const BOX_B = { x: 60, y: 10, w: 20, h: 20 }; // center (70, 20)
const BOX_CONNECTOR = { x: 10, y: 10, w: 60, h: 0.5 };

function makeShape(id: string, box = BOX_A): ShapeElement {
  return {
    id,
    kind: "shape",
    shape: "rect",
    color: "#aabbcc",
    zIndex: 0,
    box,
  };
}

function makeConnector(
  id: string,
  start: ConnectorElement["start"],
  end: ConnectorElement["end"],
): ConnectorElement {
  return {
    id,
    kind: "connector",
    zIndex: 1,
    box: BOX_CONNECTOR,
    start,
    end,
    routing: "straight",
    stroke: { color: "#000000", width: 0.4 },
  };
}

function makeLegacyLine(
  id: string,
  startId?: string,
  endId?: string,
): ShapeElement {
  return {
    id,
    kind: "shape",
    shape: "line",
    color: "#ff0000",
    zIndex: 1,
    box: BOX_CONNECTOR,
    connector: {
      ...(startId
        ? { start: { elementId: startId, anchor: "right" as const } }
        : {}),
      ...(endId ? { end: { elementId: endId, anchor: "left" as const } } : {}),
    },
  };
}

const BOUND_START: ConnectorEndpoint = {
  elementId: "shape-a",
  anchor: "right",
};
const BOUND_END: ConnectorEndpoint = {
  elementId: "shape-b",
  anchor: "left",
};
const FREE_START: ConnectorPointFree = { x: 30, y: 20 };
const FREE_END: ConnectorPointFree = { x: 70, y: 20 };

/** Creates a minimal one-slide deck with the given elements. */
function makeDeck(elements: SlideElement[]): Deck {
  const slide: Slide = {
    id: "sl-1",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    theme: "default",
    elements,
  };
  return { theme: "default", slides: [slide] };
}

// ---------------------------------------------------------------------------
// detachConnectorEndpoint
// ---------------------------------------------------------------------------

test("detachConnectorEndpoint resolves right-anchor to correct free point", () => {
  const elements: SlideElement[] = [makeShape("shape-a", BOX_A)];
  // right anchor of BOX_A: x = 10+20 = 30, y = 10+20/2 = 20
  const result = detachConnectorEndpoint(BOUND_START, elements);
  assert.equal(result.x, 30);
  assert.equal(result.y, 20);
});

test("detachConnectorEndpoint resolves center-anchor of BOX_B", () => {
  const elements: SlideElement[] = [makeShape("shape-b", BOX_B)];
  const ep: ConnectorEndpoint = { elementId: "shape-b", anchor: "center" };
  const result = detachConnectorEndpoint(ep, elements);
  // center of BOX_B: x = 60+20/2 = 70, y = 10+20/2 = 20
  assert.equal(result.x, 70);
  assert.equal(result.y, 20);
});

test("detachConnectorEndpoint falls back to {50,50} when target not found", () => {
  const result = detachConnectorEndpoint(BOUND_START, []);
  assert.deepEqual(result, { x: 50, y: 50 });
});

// ---------------------------------------------------------------------------
// updateConnectorBindingsOnDelete — ConnectorElement
// ---------------------------------------------------------------------------

test("updateConnectorBindingsOnDelete — detaches bound start when its shape is deleted", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const connector = makeConnector("conn-1", BOUND_START, FREE_END);
  const elements: SlideElement[] = [shapeA, connector];

  const result = updateConnectorBindingsOnDelete(
    elements,
    new Set(["shape-a"]),
  );

  const conn = result.find((el) => el.id === "conn-1") as ConnectorElement;
  assert.ok(conn, "connector still present");
  // start was bound → should now be a free point
  assert.ok("x" in conn.start, "start converted to free point");
  if ("x" in conn.start) {
    // right anchor of BOX_A: x=30, y=20
    assert.equal(conn.start.x, 30);
    assert.equal(conn.start.y, 20);
  }
  // end was already free → unchanged
  assert.deepEqual(conn.end, FREE_END);
});

test("updateConnectorBindingsOnDelete — detaches bound end when its shape is deleted", () => {
  const shapeB = makeShape("shape-b", BOX_B);
  const connector = makeConnector("conn-1", FREE_START, BOUND_END);
  const elements: SlideElement[] = [shapeB, connector];

  const result = updateConnectorBindingsOnDelete(
    elements,
    new Set(["shape-b"]),
  );

  const conn = result.find((el) => el.id === "conn-1") as ConnectorElement;
  assert.ok("x" in conn.end, "end converted to free point");
  if ("x" in conn.end) {
    // left anchor of BOX_B: x=60, y=20
    assert.equal(conn.end.x, 60);
    assert.equal(conn.end.y, 20);
  }
  // start was free → unchanged
  assert.deepEqual(conn.start, FREE_START);
});

test("updateConnectorBindingsOnDelete — detaches both endpoints when both shapes are deleted", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const connector = makeConnector("conn-1", BOUND_START, BOUND_END);
  const elements: SlideElement[] = [shapeA, shapeB, connector];

  const result = updateConnectorBindingsOnDelete(
    elements,
    new Set(["shape-a", "shape-b"]),
  );

  const conn = result.find((el) => el.id === "conn-1") as ConnectorElement;
  assert.ok("x" in conn.start, "start converted to free point");
  assert.ok("x" in conn.end, "end converted to free point");
});

test("updateConnectorBindingsOnDelete — leaves free endpoints untouched", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const connector = makeConnector("conn-1", FREE_START, FREE_END);
  const elements: SlideElement[] = [shapeA, connector];

  const result = updateConnectorBindingsOnDelete(
    elements,
    new Set(["shape-a"]),
  );

  const conn = result.find((el) => el.id === "conn-1") as ConnectorElement;
  assert.deepEqual(conn.start, FREE_START);
  assert.deepEqual(conn.end, FREE_END);
  // connector is reference-equal (nothing changed)
  assert.equal(conn, connector);
});

test("updateConnectorBindingsOnDelete — leaves unrelated connectors with the same identity", () => {
  const shapeX = makeShape("shape-x");
  const connector = makeConnector("conn-1", FREE_START, FREE_END);
  const elements: SlideElement[] = [shapeX, connector];

  const result = updateConnectorBindingsOnDelete(
    elements,
    new Set(["shape-x"]),
  );
  assert.equal(
    result.find((el) => el.id === "conn-1"),
    connector,
  );
});

test("updateConnectorBindingsOnDelete — returns same reference when deletedIds is empty", () => {
  const elements: SlideElement[] = [
    makeShape("s"),
    makeConnector("c", FREE_START, FREE_END),
  ];
  const result = updateConnectorBindingsOnDelete(elements, new Set());
  assert.equal(result, elements);
});

// ---------------------------------------------------------------------------
// updateConnectorBindingsOnDelete — legacy shape:line
// ---------------------------------------------------------------------------

test("updateConnectorBindingsOnDelete — clears legacy line start binding when shape is deleted", () => {
  const shapeA = makeShape("shape-a");
  const line = makeLegacyLine("line-1", "shape-a");
  const elements: SlideElement[] = [shapeA, line];

  const result = updateConnectorBindingsOnDelete(
    elements,
    new Set(["shape-a"]),
  );

  const patchedLine = result.find((el) => el.id === "line-1") as ShapeElement;
  assert.equal(patchedLine.kind, "shape");
  if (patchedLine.kind === "shape") {
    assert.equal(patchedLine.connector?.start, undefined);
  }
});

test("updateConnectorBindingsOnDelete — clears legacy line end binding when shape is deleted", () => {
  const shapeB = makeShape("shape-b");
  const line = makeLegacyLine("line-1", undefined, "shape-b");
  const elements: SlideElement[] = [shapeB, line];

  const result = updateConnectorBindingsOnDelete(
    elements,
    new Set(["shape-b"]),
  );

  const patchedLine = result.find((el) => el.id === "line-1") as ShapeElement;
  if (patchedLine.kind === "shape") {
    assert.equal(patchedLine.connector?.end, undefined);
  }
});

test("updateConnectorBindingsOnDelete — preserves legacy line binding when unaffected shape is deleted", () => {
  const shapeX = makeShape("shape-x");
  const line = makeLegacyLine("line-1", "shape-a", "shape-b");
  const elements: SlideElement[] = [shapeX, line];

  const result = updateConnectorBindingsOnDelete(
    elements,
    new Set(["shape-x"]),
  );

  // Line should be reference-equal — nothing changed
  assert.equal(
    result.find((el) => el.id === "line-1"),
    line,
  );
});

// ---------------------------------------------------------------------------
// remapConnectorBindings — ConnectorElement
// ---------------------------------------------------------------------------

test("remapConnectorBindings — remaps both endpoints when both shapes are included (AC-2)", () => {
  // Scenario: duplicating shapeA + shapeB + connector together.
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const allElements: SlideElement[] = [shapeA, shapeB];

  // The copies have new IDs for the shapes but the connector still references old IDs
  const connectorCopy = makeConnector("conn-new", BOUND_START, BOUND_END);

  const idMap = new Map([
    ["shape-a", "shape-a-copy"],
    ["shape-b", "shape-b-copy"],
    ["conn-1", "conn-new"],
  ]);

  const [result] = remapConnectorBindings([connectorCopy], idMap, allElements);

  assert.ok(result?.kind === "connector");
  if (result?.kind === "connector") {
    assert.ok("elementId" in result.start, "start still bound");
    assert.ok("elementId" in result.end, "end still bound");
    if ("elementId" in result.start && "elementId" in result.end) {
      assert.equal(result.start.elementId, "shape-a-copy");
      assert.equal(result.end.elementId, "shape-b-copy");
    }
  }
});

test("remapConnectorBindings — detaches start when only end shape is duplicated (AC-3)", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const allElements: SlideElement[] = [shapeA, shapeB];

  // Only shapeB is in the idMap — shapeA was not duplicated
  const connectorCopy = makeConnector("conn-new", BOUND_START, BOUND_END);
  const idMap = new Map([["shape-b", "shape-b-copy"]]);

  const [result] = remapConnectorBindings([connectorCopy], idMap, allElements);

  assert.ok(result?.kind === "connector");
  if (result?.kind === "connector") {
    // start.elementId = shape-a → not in idMap → should be detached
    assert.ok("x" in result.start, "start detached to free point");
    // end.elementId = shape-b → in idMap → should be remapped
    assert.ok("elementId" in result.end, "end still bound");
    if ("elementId" in result.end) {
      assert.equal(result.end.elementId, "shape-b-copy");
    }
  }
});

test("remapConnectorBindings — detaches both endpoints when neither shape is duplicated (AC-3)", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const allElements: SlideElement[] = [shapeA, shapeB];

  // Neither shape is in idMap — only the connector itself was duplicated
  const connectorCopy = makeConnector("conn-new", BOUND_START, BOUND_END);
  const idMap = new Map([["conn-1", "conn-new"]]);

  const [result] = remapConnectorBindings([connectorCopy], idMap, allElements);

  assert.ok(result?.kind === "connector");
  if (result?.kind === "connector") {
    assert.ok("x" in result.start, "start detached");
    assert.ok("x" in result.end, "end detached");
  }
});

test("remapConnectorBindings — leaves free endpoints unchanged", () => {
  const allElements: SlideElement[] = [makeShape("shape-a")];
  const connectorCopy = makeConnector("conn-new", FREE_START, FREE_END);
  const idMap = new Map([["shape-a", "shape-a-copy"]]);

  const [result] = remapConnectorBindings([connectorCopy], idMap, allElements);

  assert.ok(result?.kind === "connector");
  if (result?.kind === "connector") {
    assert.deepEqual(result.start, FREE_START);
    assert.deepEqual(result.end, FREE_END);
    // Reference equality — no change
    assert.equal(result, connectorCopy);
  }
});

test("remapConnectorBindings — returns same copies reference when nothing changed", () => {
  const copies: SlideElement[] = [makeShape("s-new")];
  const idMap = new Map([["s-old", "s-new"]]);
  const result = remapConnectorBindings(copies, idMap, []);
  // No connectors in copies — should return same reference
  assert.equal(result, copies);
});

// ---------------------------------------------------------------------------
// remapConnectorBindings — legacy shape:line (copy/paste AC-4)
// ---------------------------------------------------------------------------

test("remapConnectorBindings — remaps legacy line start binding when shape included (AC-4)", () => {
  const allElements: SlideElement[] = [
    makeShape("shape-a"),
    makeShape("shape-b"),
  ];
  const lineCopy = makeLegacyLine("line-new", "shape-a", "shape-b");
  const idMap = new Map([
    ["shape-a", "shape-a-copy"],
    ["shape-b", "shape-b-copy"],
    ["line-1", "line-new"],
  ]);

  const [result] = remapConnectorBindings([lineCopy], idMap, allElements);

  assert.ok(result?.kind === "shape");
  if (result?.kind === "shape" && result.shape === "line") {
    assert.equal(result.connector?.start?.elementId, "shape-a-copy");
    assert.equal(result.connector?.end?.elementId, "shape-b-copy");
  }
});

test("remapConnectorBindings — clears legacy line binding when shape not included (AC-4)", () => {
  const allElements: SlideElement[] = [
    makeShape("shape-a"),
    makeShape("shape-b"),
  ];
  // Only line is in idMap — neither shape is duplicated
  const lineCopy = makeLegacyLine("line-new", "shape-a", "shape-b");
  const idMap = new Map([["line-1", "line-new"]]);

  const [result] = remapConnectorBindings([lineCopy], idMap, allElements);

  assert.ok(result?.kind === "shape");
  if (result?.kind === "shape") {
    assert.equal(result.connector?.start, undefined);
    assert.equal(result.connector?.end, undefined);
  }
});

// ---------------------------------------------------------------------------
// Integration: deck-mutations.removeElement (AC-1)
// ---------------------------------------------------------------------------

test("removeElement — detaches connector start endpoint when shape is deleted (AC-1)", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const connector = makeConnector("conn-1", BOUND_START, FREE_END);
  const deck = makeDeck([shapeA, connector]);

  const next = removeElement(deck, 0, "shape-a");
  const slide = next.slides[0]!;

  // shape-a must be gone
  assert.equal(
    slide.elements?.find((el) => el.id === "shape-a"),
    undefined,
  );
  // connector must still exist
  const conn = slide.elements?.find((el) => el.id === "conn-1") as
    | ConnectorElement
    | undefined;
  assert.ok(conn, "connector still present after shape deletion");
  // start was bound to shape-a → must now be a free point
  assert.ok(conn && "x" in conn.start, "start is now a free point");
  // end was free → unchanged
  if (conn) assert.deepEqual(conn.end, FREE_END);
});

test("removeElement — connector with free endpoints unaffected when shape deleted", () => {
  const shapeA = makeShape("shape-a");
  const connector = makeConnector("conn-1", FREE_START, FREE_END);
  const deck = makeDeck([shapeA, connector]);

  const next = removeElement(deck, 0, "shape-a");
  const slide = next.slides[0]!;

  const conn = slide.elements?.find((el) => el.id === "conn-1") as
    | ConnectorElement
    | undefined;
  assert.ok(conn);
  if (conn) {
    assert.deepEqual(conn.start, FREE_START);
    assert.deepEqual(conn.end, FREE_END);
  }
});

// ---------------------------------------------------------------------------
// Integration: deck-mutations.removeElements (AC-1)
// ---------------------------------------------------------------------------

test("removeElements — detaches connector endpoints for all deleted shapes (AC-1)", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const connector = makeConnector("conn-1", BOUND_START, BOUND_END);
  const deck = makeDeck([shapeA, shapeB, connector]);

  const next = removeElements(deck, 0, ["shape-a", "shape-b"]);
  const slide = next.slides[0]!;

  assert.equal(
    slide.elements?.find((el) => el.id === "shape-a"),
    undefined,
  );
  assert.equal(
    slide.elements?.find((el) => el.id === "shape-b"),
    undefined,
  );

  const conn = slide.elements?.find((el) => el.id === "conn-1") as
    | ConnectorElement
    | undefined;
  assert.ok(conn, "connector still present");
  if (conn) {
    assert.ok("x" in conn.start, "start detached");
    assert.ok("x" in conn.end, "end detached");
  }
});

// ---------------------------------------------------------------------------
// Integration: deck-mutations.duplicateElement (AC-3)
// ---------------------------------------------------------------------------

test("duplicateElement of a connector detaches both bound endpoints (AC-3)", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const connector = makeConnector("conn-1", BOUND_START, BOUND_END);
  const deck = makeDeck([shapeA, shapeB, connector]);

  const { deck: next, newElementId } = duplicateElement(deck, 0, "conn-1");
  assert.ok(newElementId);

  const slide = next.slides[0]!;
  const copy = slide.elements?.find((el) => el.id === newElementId) as
    | ConnectorElement
    | undefined;
  assert.ok(copy, "copy exists");
  // Neither shape was duplicated → both endpoints must be detached
  if (copy) {
    assert.ok("x" in copy.start, "copy start is free point");
    assert.ok("x" in copy.end, "copy end is free point");
  }
  // Original connector is unchanged
  const orig = slide.elements?.find((el) => el.id === "conn-1") as
    | ConnectorElement
    | undefined;
  if (orig) {
    assert.ok("elementId" in orig.start, "original start still bound");
    assert.ok("elementId" in orig.end, "original end still bound");
  }
});

test("duplicateElement of a plain shape leaves connectors untouched", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const connector = makeConnector("conn-1", BOUND_START, FREE_END);
  const deck = makeDeck([shapeA, connector]);

  const { deck: next, newElementId } = duplicateElement(deck, 0, "shape-a");
  assert.ok(newElementId);

  const slide = next.slides[0]!;
  // Original connector still bound to original shape-a
  const conn = slide.elements?.find((el) => el.id === "conn-1") as
    | ConnectorElement
    | undefined;
  assert.ok(conn);
  if (conn) {
    assert.ok("elementId" in conn.start);
    if ("elementId" in conn.start) {
      assert.equal(conn.start.elementId, "shape-a");
    }
  }
});

// ---------------------------------------------------------------------------
// Integration: deck-mutations.duplicateElements (AC-2, AC-3, AC-4)
// ---------------------------------------------------------------------------

test("duplicateElements with shape+connector preserves connection between duplicates (AC-2)", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const connector = makeConnector("conn-1", BOUND_START, BOUND_END);
  const deck = makeDeck([shapeA, shapeB, connector]);

  const { deck: next, newElementIds } = duplicateElements(deck, 0, [
    "shape-a",
    "shape-b",
    "conn-1",
  ]);

  assert.equal(newElementIds.length, 3);
  const slide = next.slides[0]!;

  // Find the copy of shape-a, shape-b, and the connector
  const [, , connNewId] = newElementIds;
  const connCopy = slide.elements?.find((el) => el.id === connNewId) as
    | ConnectorElement
    | undefined;
  assert.ok(connCopy, "connector copy exists");

  if (connCopy) {
    // Both endpoints must be bound (remapped to copies)
    assert.ok("elementId" in connCopy.start, "start still bound");
    assert.ok("elementId" in connCopy.end, "end still bound");

    if ("elementId" in connCopy.start && "elementId" in connCopy.end) {
      // Must point to the new copy IDs, not the originals
      assert.notEqual(connCopy.start.elementId, "shape-a");
      assert.notEqual(connCopy.end.elementId, "shape-b");
      assert.equal(connCopy.start.elementId, newElementIds[0]);
      assert.equal(connCopy.end.elementId, newElementIds[1]);
    }
  }
});

test("duplicateElements with only one endpoint shape detaches the other endpoint (AC-3)", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const connector = makeConnector("conn-1", BOUND_START, BOUND_END);
  const deck = makeDeck([shapeA, shapeB, connector]);

  // Duplicate only shapeA + connector (not shapeB)
  const { deck: next, newElementIds } = duplicateElements(deck, 0, [
    "shape-a",
    "conn-1",
  ]);

  const slide = next.slides[0]!;
  const [shapeANewId, connNewId] = newElementIds;
  const connCopy = slide.elements?.find((el) => el.id === connNewId) as
    | ConnectorElement
    | undefined;
  assert.ok(connCopy, "connector copy exists");

  if (connCopy) {
    // start was bound to shape-a (which IS in idMap) → remapped to copy
    assert.ok("elementId" in connCopy.start, "start still bound to copy");
    if ("elementId" in connCopy.start) {
      assert.equal(connCopy.start.elementId, shapeANewId);
    }
    // end was bound to shape-b (NOT in idMap) → detached
    assert.ok("x" in connCopy.end, "end detached to free point");
  }
});

test("duplicateElements with only connector detaches both endpoints (AC-3)", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const connector = makeConnector("conn-1", BOUND_START, BOUND_END);
  const deck = makeDeck([shapeA, shapeB, connector]);

  // Duplicate only the connector (neither shape)
  const { deck: next, newElementIds } = duplicateElements(deck, 0, ["conn-1"]);

  const slide = next.slides[0]!;
  const [connNewId] = newElementIds;
  const connCopy = slide.elements?.find((el) => el.id === connNewId) as
    | ConnectorElement
    | undefined;
  assert.ok(connCopy, "connector copy exists");

  if (connCopy) {
    assert.ok("x" in connCopy.start, "start detached");
    assert.ok("x" in connCopy.end, "end detached");
  }
});

test("duplicateElements original connectors are not modified", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const connector = makeConnector("conn-1", BOUND_START, BOUND_END);
  const deck = makeDeck([shapeA, shapeB, connector]);

  duplicateElements(deck, 0, ["shape-a", "shape-b", "conn-1"]);

  // Original elements must be immutable — verify the originals deck is unchanged
  const origConnector = deck.slides[0]?.elements?.find(
    (el) => el.id === "conn-1",
  ) as ConnectorElement | undefined;
  assert.ok(origConnector);
  if (origConnector) {
    assert.ok("elementId" in origConnector.start);
    assert.ok("elementId" in origConnector.end);
    if (
      "elementId" in origConnector.start &&
      "elementId" in origConnector.end
    ) {
      assert.equal(origConnector.start.elementId, "shape-a");
      assert.equal(origConnector.end.elementId, "shape-b");
    }
  }
});

// ---------------------------------------------------------------------------
// ungroupElements + connector bindings (issue #330)
// ---------------------------------------------------------------------------

test("ungroupElements — connectors bound to grouped shapes stay bound after ungroup", () => {
  const shapeA = makeShape("shape-a", BOX_A);
  const shapeB = makeShape("shape-b", BOX_B);
  const connector = makeConnector("conn-1", BOUND_START, BOUND_END);
  const deck = makeDeck([shapeA, shapeB, connector]);

  // Group both shapes together.
  const { deck: grouped, groupId } = groupElements(deck, 0, [
    "shape-a",
    "shape-b",
  ]);
  // Connector bindings must be unaffected by grouping.
  const groupedConn = grouped.slides[0]!.elements?.find(
    (el) => el.id === "conn-1",
  ) as ConnectorElement | undefined;
  assert.ok(groupedConn);
  assert.ok("elementId" in (groupedConn?.start ?? {}));
  assert.ok("elementId" in (groupedConn?.end ?? {}));

  // Now ungroup.
  const next = ungroupElements(grouped, 0, groupId);
  const conn = next.slides[0]!.elements?.find((el) => el.id === "conn-1") as
    | ConnectorElement
    | undefined;

  assert.ok(conn, "connector still present after ungroup");
  // start and end must remain bound — ungroupElements must not touch connectors.
  assert.ok("elementId" in (conn?.start ?? {}), "start still bound");
  assert.ok("elementId" in (conn?.end ?? {}), "end still bound");
  if (conn && "elementId" in conn.start && "elementId" in conn.end) {
    assert.equal(conn.start.elementId, "shape-a");
    assert.equal(conn.end.elementId, "shape-b");
  }
});

test("ungroupElements — connectors bound across group members are preserved with IDs intact", () => {
  // Connector goes from a grouped shape to an ungrouped shape.
  const shapeA = makeShape("shape-a", BOX_A); // will be in group
  const shapeX = makeShape("shape-x", BOX_B); // NOT in group
  const connector = makeConnector(
    "conn-1",
    { elementId: "shape-a", anchor: "right" },
    { elementId: "shape-x", anchor: "left" },
  );
  const deck = makeDeck([shapeA, shapeX, connector]);
  const { deck: grouped, groupId } = groupElements(deck, 0, ["shape-a"]);
  const next = ungroupElements(grouped, 0, groupId);

  const conn = next.slides[0]!.elements?.find((el) => el.id === "conn-1") as
    | ConnectorElement
    | undefined;
  assert.ok(conn, "connector present after ungroup");
  if (conn && "elementId" in conn.start && "elementId" in conn.end) {
    assert.equal(
      conn.start.elementId,
      "shape-a",
      "start still bound to shape-a",
    );
    assert.equal(conn.end.elementId, "shape-x", "end still bound to shape-x");
  }

  // shape-a must have no groupId anymore.
  const a = next.slides[0]!.elements?.find((el) => el.id === "shape-a");
  assert.equal(a?.groupId, undefined, "shape-a has no groupId after ungroup");
});
