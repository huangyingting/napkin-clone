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
import { makeMinimalDeck } from "@/test/builders/deck";

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
    content: { kind: "connector", start, end, routing: "straight" },
    designOverrides: { stroke: { color: "#000000", width: 0.4 } },
  } as unknown as ConnectorElement;
}

function connectorStart(element: ConnectorElement): any {
  return ((element as any).content as { start: ConnectorElement["start"] })[
    "start"
  ];
}

function connectorEnd(element: ConnectorElement): any {
  return ((element as any).content as { end: ConnectorElement["end"] })["end"];
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
const makeDeck = (elements: SlideElement[]): Deck =>
  makeMinimalDeck([
    {
      id: "sl-1",
      index: 0,
      title: "",
      bullets: [],
      visualIds: [],
      layout: "blank",
      notes: "",
      elements,
    } satisfies Slide,
  ]);

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
  assert.ok("x" in connectorStart(conn), "start converted to free point");
  if ("x" in connectorStart(conn)) {
    // right anchor of BOX_A: x=30, y=20
    assert.equal(connectorStart(conn).x, 30);
    assert.equal(connectorStart(conn).y, 20);
  }
  // end was already free → unchanged
  assert.deepEqual(connectorEnd(conn), FREE_END);
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
  assert.ok("x" in connectorEnd(conn), "end converted to free point");
  if ("x" in connectorEnd(conn)) {
    // left anchor of BOX_B: x=60, y=20
    assert.equal(connectorEnd(conn).x, 60);
    assert.equal(connectorEnd(conn).y, 20);
  }
  // start was free → unchanged
  assert.deepEqual(connectorStart(conn), FREE_START);
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
  assert.ok("x" in connectorStart(conn), "start converted to free point");
  assert.ok("x" in connectorEnd(conn), "end converted to free point");
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
  assert.deepEqual(connectorStart(conn), FREE_START);
  assert.deepEqual(connectorEnd(conn), FREE_END);
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
    assert.ok("elementId" in connectorStart(result), "start still bound");
    assert.ok("elementId" in connectorEnd(result), "end still bound");
    if (
      "elementId" in connectorStart(result) &&
      "elementId" in connectorEnd(result)
    ) {
      assert.equal(connectorStart(result).elementId, "shape-a-copy");
      assert.equal(connectorEnd(result).elementId, "shape-b-copy");
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
    assert.ok("x" in connectorStart(result), "start detached to free point");
    // end.elementId = shape-b → in idMap → should be remapped
    assert.ok("elementId" in connectorEnd(result), "end still bound");
    if ("elementId" in connectorEnd(result)) {
      assert.equal(connectorEnd(result).elementId, "shape-b-copy");
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
    assert.ok("x" in connectorStart(result), "start detached");
    assert.ok("x" in connectorEnd(result), "end detached");
  }
});

test("remapConnectorBindings — leaves free endpoints unchanged", () => {
  const allElements: SlideElement[] = [makeShape("shape-a")];
  const connectorCopy = makeConnector("conn-new", FREE_START, FREE_END);
  const idMap = new Map([["shape-a", "shape-a-copy"]]);

  const [result] = remapConnectorBindings([connectorCopy], idMap, allElements);

  assert.ok(result?.kind === "connector");
  if (result?.kind === "connector") {
    assert.deepEqual(connectorStart(result), FREE_START);
    assert.deepEqual(connectorEnd(result), FREE_END);
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
  assert.ok(conn && "x" in connectorStart(conn), "start is now a free point");
  // end was free → unchanged
  if (conn) assert.deepEqual(connectorEnd(conn), FREE_END);
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
    assert.deepEqual(connectorStart(conn), FREE_START);
    assert.deepEqual(connectorEnd(conn), FREE_END);
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
    assert.ok("x" in connectorStart(conn), "start detached");
    assert.ok("x" in connectorEnd(conn), "end detached");
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
    assert.ok("x" in connectorStart(copy), "copy start is free point");
    assert.ok("x" in connectorEnd(copy), "copy end is free point");
  }
  // Original connector is unchanged
  const orig = slide.elements?.find((el) => el.id === "conn-1") as
    | ConnectorElement
    | undefined;
  if (orig) {
    assert.ok(
      "elementId" in connectorStart(orig),
      "original start still bound",
    );
    assert.ok("elementId" in connectorEnd(orig), "original end still bound");
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
    assert.ok("elementId" in connectorStart(conn));
    if ("elementId" in connectorStart(conn)) {
      assert.equal(connectorStart(conn).elementId, "shape-a");
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
    assert.ok("elementId" in connectorStart(connCopy), "start still bound");
    assert.ok("elementId" in connectorEnd(connCopy), "end still bound");

    if (
      "elementId" in connectorStart(connCopy) &&
      "elementId" in connectorEnd(connCopy)
    ) {
      // Must point to the new copy IDs, not the originals
      assert.notEqual(connectorStart(connCopy).elementId, "shape-a");
      assert.notEqual(connectorEnd(connCopy).elementId, "shape-b");
      assert.equal(connectorStart(connCopy).elementId, newElementIds[0]);
      assert.equal(connectorEnd(connCopy).elementId, newElementIds[1]);
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
    assert.ok(
      "elementId" in connectorStart(connCopy),
      "start still bound to copy",
    );
    if ("elementId" in connectorStart(connCopy)) {
      assert.equal(connectorStart(connCopy).elementId, shapeANewId);
    }
    // end was bound to shape-b (NOT in idMap) → detached
    assert.ok("x" in connectorEnd(connCopy), "end detached to free point");
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
    assert.ok("x" in connectorStart(connCopy), "start detached");
    assert.ok("x" in connectorEnd(connCopy), "end detached");
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
    assert.ok("elementId" in connectorStart(origConnector));
    assert.ok("elementId" in connectorEnd(origConnector));
    if (
      "elementId" in connectorStart(origConnector) &&
      "elementId" in connectorEnd(origConnector)
    ) {
      assert.equal(connectorStart(origConnector).elementId, "shape-a");
      assert.equal(connectorEnd(origConnector).elementId, "shape-b");
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
  assert.ok(groupedConn && "elementId" in connectorStart(groupedConn));
  assert.ok(groupedConn && "elementId" in connectorEnd(groupedConn));

  // Now ungroup.
  const next = ungroupElements(grouped, 0, groupId);
  const conn = next.slides[0]!.elements?.find((el) => el.id === "conn-1") as
    | ConnectorElement
    | undefined;

  assert.ok(conn, "connector still present after ungroup");
  // start and end must remain bound — ungroupElements must not touch connectors.
  assert.ok(conn && "elementId" in connectorStart(conn), "start still bound");
  assert.ok(conn && "elementId" in connectorEnd(conn), "end still bound");
  if (
    conn &&
    "elementId" in connectorStart(conn) &&
    "elementId" in connectorEnd(conn)
  ) {
    assert.equal(connectorStart(conn).elementId, "shape-a");
    assert.equal(connectorEnd(conn).elementId, "shape-b");
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
  if (
    conn &&
    "elementId" in connectorStart(conn) &&
    "elementId" in connectorEnd(conn)
  ) {
    assert.equal(
      connectorStart(conn).elementId,
      "shape-a",
      "start still bound to shape-a",
    );
    assert.equal(
      connectorEnd(conn).elementId,
      "shape-x",
      "end still bound to shape-x",
    );
  }

  // shape-a must have no groupId anymore.
  const a = next.slides[0]!.elements?.find((el) => el.id === "shape-a");
  assert.equal(a?.groupId, undefined, "shape-a has no groupId after ungroup");
});
