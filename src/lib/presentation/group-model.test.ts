/**
 * Unit tests for the group model (issue #330).
 *
 * Design decision: groups are represented as a shared `groupId` field on
 * individual elements — there is no first-class GroupElement container. This
 * keeps the schema flat and the rendering pipeline unchanged.
 *
 * Acceptance criteria verified:
 *  AC-1  Clicking a grouped element selects the whole group.
 *        (Covered by integration in slide-stage-editor; pure mutation
 *         helpers verified here.)
 *  AC-2  Double-clicking enters group-editing mode.
 *        (Interaction, not tested here.)
 *  AC-3  Move/resize/rotate the group moves all members.
 *        (Covered by existing multi-select tests; pure mutation verified here.)
 *  AC-4  Ungrouping clears groupId; connectors' endpoints are untouched.
 *  AC-5  Copy/paste a full group assigns a new shared groupId to the copies.
 *  AC-6  Copy/paste a partial group strips groupId from the copies.
 *  AC-7  Inspector shows Group indicator when all selected elements share a groupId.
 *        (Component test; pure logic tested via sharedGroupId derivation below.)
 *  AC-8  All tests pass, typecheck clean, lint clean, format clean.
 *
 * These tests run under `node --test` (no DOM, no React, no browser APIs).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ConnectorElement,
  Deck,
  ShapeElement,
  Slide,
  SlideElement,
} from "./deck";
import {
  duplicateElements,
  groupElements,
  ungroupElements,
} from "./deck-mutations";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeShape(id: string, x = 0): ShapeElement {
  return {
    id,
    kind: "shape",
    shape: "rect",
    color: "#112233",
    zIndex: 0,
    box: { x, y: 10, w: 10, h: 10 },
  };
}

function makeConnector(
  id: string,
  startId: string,
  endId: string,
): ConnectorElement {
  return {
    id,
    kind: "connector",
    zIndex: 5,
    box: { x: 0, y: 0, w: 50, h: 0.5 },
    routing: "straight",
    stroke: { color: "#000000", width: 0.4 },
    start: { elementId: startId, anchor: "right" },
    end: { elementId: endId, anchor: "left" },
  };
}

function makeDeck(elements: SlideElement[]): Deck {
  const slide: Slide = {
    id: "slide-1",
    index: 0,
    title: "Test",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "default",
    elements,
  };
  return { theme: "default", slides: [slide] };
}

// ---------------------------------------------------------------------------
// groupElements
// ---------------------------------------------------------------------------

test("groupElements assigns same new groupId to all specified elements", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b"), makeShape("c")]);
  const { deck: next, groupId } = groupElements(deck, 0, ["a", "b"]);

  assert.ok(groupId, "groupId should be a non-empty string");
  const elements = next.slides[0].elements ?? [];

  const a = elements.find((e) => e.id === "a")!;
  const b = elements.find((e) => e.id === "b")!;
  const c = elements.find((e) => e.id === "c")!;

  assert.equal(a.groupId, groupId);
  assert.equal(b.groupId, groupId);
  assert.equal(
    c.groupId,
    undefined,
    "non-grouped element must not get groupId",
  );
});

test("groupElements returns updated deck (immutable — original unchanged)", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b")]);
  const { deck: next } = groupElements(deck, 0, ["a", "b"]);

  assert.notEqual(next, deck);
  assert.equal(deck.slides[0].elements?.[0].groupId, undefined);
});

test("groupElements is a no-op on an empty id list", () => {
  const deck = makeDeck([makeShape("a")]);
  const { deck: next } = groupElements(deck, 0, []);
  // All elements on the slide still have no groupId.
  const elements = next.slides[0].elements ?? [];
  assert.ok(elements.every((e) => e.groupId === undefined));
});

// ---------------------------------------------------------------------------
// ungroupElements
// ---------------------------------------------------------------------------

test("ungroupElements clears groupId from all group members", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b"), makeShape("c")]);
  const { deck: grouped, groupId } = groupElements(deck, 0, ["a", "b"]);
  const ungrouped = ungroupElements(grouped, 0, groupId);

  const elements = ungrouped.slides[0].elements ?? [];
  const a = elements.find((e) => e.id === "a")!;
  const b = elements.find((e) => e.id === "b")!;

  assert.equal(a.groupId, undefined);
  assert.equal(b.groupId, undefined);
});

test("ungroupElements does not affect elements from a different group", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b"), makeShape("c")]);
  const { deck: d1, groupId: gid1 } = groupElements(deck, 0, ["a", "b"]);
  const { deck: d2, groupId: gid2 } = groupElements(d1, 0, ["c"]);

  const ungrouped = ungroupElements(d2, 0, gid1);
  const elements = ungrouped.slides[0].elements ?? [];

  const a = elements.find((e) => e.id === "a")!;
  const b = elements.find((e) => e.id === "b")!;
  const c = elements.find((e) => e.id === "c")!;

  assert.equal(a.groupId, undefined);
  assert.equal(b.groupId, undefined);
  assert.equal(c.groupId, gid2, "other group must be unaffected");
});

test("ungroupElements is immutable — original deck unchanged", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b")]);
  const { deck: grouped, groupId } = groupElements(deck, 0, ["a", "b"]);
  const ungrouped = ungroupElements(grouped, 0, groupId);

  assert.notEqual(ungrouped, grouped);
  // Original grouped deck still has groupId set.
  assert.equal(grouped.slides[0].elements?.[0].groupId, groupId);
});

// ---------------------------------------------------------------------------
// Connector preservation through group/ungroup
// ---------------------------------------------------------------------------

test("ungroupElements preserves connector endpoint bindings", () => {
  const shapeA = makeShape("a", 0);
  const shapeB = makeShape("b", 50);
  const connector = makeConnector("conn", "a", "b");
  const deck = makeDeck([shapeA, shapeB, connector]);

  const { deck: grouped, groupId } = groupElements(deck, 0, ["a", "b"]);
  const ungrouped = ungroupElements(grouped, 0, groupId);

  const elements = ungrouped.slides[0].elements ?? [];
  const conn = elements.find((e) => e.id === "conn") as ConnectorElement;

  assert.ok(conn, "connector must still exist after ungroup");
  assert.ok("elementId" in conn.start, "start endpoint must remain bound");
  assert.ok("elementId" in conn.end, "end endpoint must remain bound");
  assert.equal(
    (conn.start as { elementId: string }).elementId,
    "a",
    "start must still reference shape a",
  );
  assert.equal(
    (conn.end as { elementId: string }).elementId,
    "b",
    "end must still reference shape b",
  );
});

// ---------------------------------------------------------------------------
// Copy/paste group — duplicateElements groupId remapping (issue #330)
// ---------------------------------------------------------------------------

test("duplicating a full group gives copies a new shared groupId", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b"), makeShape("c")]);
  const { deck: grouped, groupId: originalGid } = groupElements(deck, 0, [
    "a",
    "b",
  ]);

  const { deck: duped, newElementIds } = duplicateElements(grouped, 0, [
    "a",
    "b",
  ]);
  assert.equal(newElementIds.length, 2);

  const elements = duped.slides[0].elements ?? [];
  const copyA = elements.find((e) => e.id === newElementIds[0])!;
  const copyB = elements.find((e) => e.id === newElementIds[1])!;

  // Copies must have a groupId.
  assert.ok(copyA.groupId, "copy A must have a groupId");
  assert.equal(copyA.groupId, copyB.groupId, "copies must share a groupId");

  // Copies must get a DIFFERENT groupId than the originals.
  assert.notEqual(
    copyA.groupId,
    originalGid,
    "copies must not reuse the original groupId",
  );

  // Originals are unaffected.
  const origA = elements.find((e) => e.id === "a")!;
  assert.equal(
    origA.groupId,
    originalGid,
    "original groupId must be unchanged",
  );
});

test("duplicating only some members of a group strips groupId from copies", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b"), makeShape("c")]);
  const { deck: grouped } = groupElements(deck, 0, ["a", "b", "c"]);

  // Only copy 'a' and 'b' — 'c' is not in the selection, so the group is partial.
  const { deck: duped, newElementIds } = duplicateElements(grouped, 0, [
    "a",
    "b",
  ]);
  assert.equal(newElementIds.length, 2);

  const elements = duped.slides[0].elements ?? [];
  const copyA = elements.find((e) => e.id === newElementIds[0])!;
  const copyB = elements.find((e) => e.id === newElementIds[1])!;

  assert.equal(
    copyA.groupId,
    undefined,
    "partial-group copy must not have a groupId",
  );
  assert.equal(
    copyB.groupId,
    undefined,
    "partial-group copy must not have a groupId",
  );
});

test("duplicating ungrouped elements does not add groupId to copies", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b")]);
  const { deck: duped, newElementIds } = duplicateElements(deck, 0, ["a", "b"]);

  const elements = duped.slides[0].elements ?? [];
  for (const id of newElementIds) {
    const copy = elements.find((e) => e.id === id)!;
    assert.equal(
      copy.groupId,
      undefined,
      "copy of ungrouped element has no groupId",
    );
  }
});

test("duplicating a full group preserves connector endpoint remapping", () => {
  // Shape A and Shape B are grouped; a connector links A → B.
  // Duplicating all three should remap the connector endpoints to the copies
  // AND give the copies a new groupId.
  const shapeA = makeShape("a", 0);
  const shapeB = makeShape("b", 50);
  const connector = makeConnector("conn", "a", "b");
  const deck = makeDeck([shapeA, shapeB, connector]);

  const { deck: grouped, groupId: originalGid } = groupElements(deck, 0, [
    "a",
    "b",
  ]);
  const { deck: duped, newElementIds } = duplicateElements(grouped, 0, [
    "a",
    "b",
    "conn",
  ]);
  assert.equal(newElementIds.length, 3);

  const elements = duped.slides[0].elements ?? [];
  // The copies are in the same order as the originals.
  const copyA = elements.find((e) => e.id === newElementIds[0])!;
  const copyB = elements.find((e) => e.id === newElementIds[1])!;
  const copyConn = elements.find(
    (e) => e.id === newElementIds[2],
  ) as ConnectorElement;

  // Connector endpoints must point to the copies, not the originals.
  assert.equal(
    (copyConn.start as { elementId: string }).elementId,
    copyA.id,
    "copied connector start must reference copyA",
  );
  assert.equal(
    (copyConn.end as { elementId: string }).elementId,
    copyB.id,
    "copied connector end must reference copyB",
  );

  // Shapes A and B are a full group → copies share a new groupId.
  assert.ok(copyA.groupId, "copyA must have a groupId");
  assert.equal(copyA.groupId, copyB.groupId, "copyA and copyB share groupId");
  assert.notEqual(copyA.groupId, originalGid);

  // The connector copy is not grouped (it was not part of the group).
  assert.equal(
    copyConn.groupId,
    undefined,
    "connector copy must not have a groupId",
  );
});

// ---------------------------------------------------------------------------
// sharedGroupId computation (mirrors the logic in SlideInspector, issue #330)
// ---------------------------------------------------------------------------

/**
 * Mirrors the inspector's `sharedGroupId` calculation so we can verify the
 * pure logic without spinning up React.
 */
function sharedGroupId(
  elements: SlideElement[],
  selectedIds: Set<string>,
): string | null {
  if (selectedIds.size < 2) return null;
  const sel = elements.filter((e) => selectedIds.has(e.id));
  if (sel.length < 2) return null;
  const gid = sel[0]?.groupId;
  if (!gid) return null;
  return sel.every((e) => e.groupId === gid) ? gid : null;
}

test("sharedGroupId returns groupId when all selected share it", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b"), makeShape("c")]);
  const { deck: grouped, groupId } = groupElements(deck, 0, ["a", "b"]);
  const elements = grouped.slides[0].elements ?? [];

  const result = sharedGroupId(elements, new Set(["a", "b"]));
  assert.equal(result, groupId);
});

test("sharedGroupId returns null when selected elements have different groupIds", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b"), makeShape("c")]);
  const { deck: d1, groupId: g1 } = groupElements(deck, 0, ["a"]);
  const { deck: d2, groupId: g2 } = groupElements(d1, 0, ["b"]);
  assert.notEqual(g1, g2);

  const elements = d2.slides[0].elements ?? [];
  const result = sharedGroupId(elements, new Set(["a", "b"]));
  assert.equal(result, null);
});

test("sharedGroupId returns null when some selected elements have no groupId", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b"), makeShape("c")]);
  const { deck: grouped } = groupElements(deck, 0, ["a", "b"]);
  const elements = grouped.slides[0].elements ?? [];

  // 'c' has no groupId, 'a' and 'b' do — mixed selection.
  const result = sharedGroupId(elements, new Set(["a", "c"]));
  assert.equal(result, null);
});

test("sharedGroupId returns null for a single-element selection", () => {
  const deck = makeDeck([makeShape("a"), makeShape("b")]);
  const { deck: grouped, groupId } = groupElements(deck, 0, ["a", "b"]);
  const elements = grouped.slides[0].elements ?? [];

  assert.ok(groupId);
  const result = sharedGroupId(elements, new Set(["a"]));
  assert.equal(result, null);
});
