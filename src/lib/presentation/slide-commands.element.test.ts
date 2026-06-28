import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
import {
  applyPatch,
  executeCommand,
  type SlideCommand,
} from "./slide-commands";
import { safeParseDeck } from "./deck-schema";
import { buildDeck, buildShapeElement, buildSlide } from "@/test/builders/deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildCommandSlideWithElements(
  id: string,
  index: number,
  elements: SlideElement[],
): Slide {
  return buildSlide({
    id,
    index,
    title: "",
    notes: "",
    elements,
  });
}

function buildCommandShapeElement(id: string, zIndex = 0): SlideElement {
  return buildShapeElement({
    id,
    color: "#aabbcc",
    box: { x: 10, y: 10, w: 20, h: 20 },
    zIndex,
  });
}

function buildCommandV6ShapeElement(id: string, zIndex = 0): SlideElement {
  return {
    id,
    kind: "shape",
    role: "label",
    box: { x: 10, y: 10, w: 20, h: 20 },
    zIndex,
    content: { kind: "shape", shape: "rect" },
    designOverrides: { fill: { value: "#aabbcc" } },
  } as unknown as SlideElement;
}

function deckWithElements(slideId: string, elements: SlideElement[]): Deck {
  return buildDeck({
    design: { themeId: "default" },
    slides: [buildCommandSlideWithElements(slideId, 0, elements)],
  });
}

function buildCommandDeckWithElements(
  slideId: string,
  elements: SlideElement[],
): Deck {
  return buildDeck({
    design: { themeId: "default" },
    slides: [
      buildSlide({
        id: slideId,
        index: 0,
        title: "Test",
        notes: "",
        elements,
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// ADD_ELEMENT
// ---------------------------------------------------------------------------

test("ADD_ELEMENT adds an element to a slide and returns its id", () => {
  const deck = deckWithElements("s1", []);
  const result = executeCommand(deck, {
    type: "ADD_ELEMENT",
    slideId: "s1",
    element: {
      kind: "shape",
      content: { kind: "shape", shape: "rect" },
      designOverrides: { fill: { value: "#112233" } },
      box: { x: 10, y: 10, w: 20, h: 20 },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.affectedSlideIds[0], "s1");
  assert.equal(result.affectedElementIds.length, 1);
  const newId = result.affectedElementIds[0]!;
  const el = result.deck.slides[0]!.elements?.find((e) => e.id === newId);
  assert.equal(el?.kind, "shape");
});

test("ADD_ELEMENT returns error when slide not found", () => {
  const deck = deckWithElements("s1", []);
  const result = executeCommand(deck, {
    type: "ADD_ELEMENT",
    slideId: "ghost",
    element: {
      kind: "shape",
      content: { kind: "shape", shape: "rect" },
      designOverrides: { fill: { value: "#000" } },
      box: { x: 0, y: 0, w: 10, h: 10 },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("ADD_ELEMENT does not mutate the original deck", () => {
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1")]);
  const originalCount = deck.slides[0]!.elements!.length;
  executeCommand(deck, {
    type: "ADD_ELEMENT",
    slideId: "s1",
    element: {
      kind: "shape",
      content: { kind: "shape", shape: "ellipse" },
      designOverrides: { fill: { value: "#fff" } },
      box: { x: 0, y: 0, w: 5, h: 5 },
    },
  });

  assert.equal(deck.slides[0]!.elements!.length, originalCount);
});

// ---------------------------------------------------------------------------
// UPDATE_ELEMENT
// ---------------------------------------------------------------------------

test("UPDATE_ELEMENT patches element fields", () => {
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1", 0)]);
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: { box: { x: 50, y: 50, w: 30, h: 30 } },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
  assert.deepEqual(result.affectedElementIds, ["e1"]);
  const el = result.deck.slides[0]!.elements?.find((e) => e.id === "e1");
  assert.deepEqual(el?.box, { x: 50, y: 50, w: 30, h: 30 });
});

test("UPDATE_ELEMENT preserves element id and kind", () => {
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1", 0)]);
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: { box: { x: 1, y: 1, w: 1, h: 1 } },
  });

  assert.equal(result.ok, true);
  const el = result.deck.slides[0]!.elements?.find((e) => e.id === "e1");
  assert.equal(el?.id, "e1");
  assert.equal(el?.kind, "shape");
});

test("UPDATE_ELEMENT propagates coalesceKey as historyKey", () => {
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1", 0)]);
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: { box: { x: 1, y: 1, w: 1, h: 1 } },
    coalesceKey: "drag-e1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.historyKey, "drag-e1");
});

test("UPDATE_ELEMENT returns error when slide not found", () => {
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1")]);
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "ghost",
    elementId: "e1",
    patch: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("UPDATE_ELEMENT returns error when element not found", () => {
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1")]);
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "phantom",
    patch: {},
  });

  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("phantom"));
  assert.equal(result.deck, deck);
});

test("UPDATE_ELEMENT does not mutate the original deck", () => {
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1", 0)]);
  const originalBox = deck.slides[0]!.elements![0]!.box;
  executeCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: { box: { x: 99, y: 99, w: 1, h: 1 } },
  });

  assert.deepEqual(deck.slides[0]!.elements![0]!.box, originalBox);
});

test("UPDATE_ELEMENT_CONTENT patches v6 content and replays from patch", () => {
  const deck = deckWithElements("s1", [buildCommandV6ShapeElement("e1", 0)]);
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT_CONTENT",
    slideId: "s1",
    elementId: "e1",
    role: "label",
    content: { kind: "shape", shape: "ellipse", text: "Updated" },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
  assert.deepEqual(result.affectedElementIds, ["e1"]);
  assert.equal(result.patches[0]!.op, "element.update_content");
  const el = result.deck.slides[0]!.elements?.find((e) => e.id === "e1");
  assert.equal((el as any).role, "label");
  assert.deepEqual((el as any).content, {
    kind: "shape",
    shape: "ellipse",
    text: "Updated",
  });
  const parsed = safeParseDeck(result.deck);
  assert.equal(parsed.success, true, parsed.success ? undefined : parsed.error);
  assert.deepEqual(applyPatch(deck, result.patches[0]!), result.deck);
});

test("UPDATE_ELEMENT_DESIGN_OVERRIDES patches v6 design overrides and replays from patch", () => {
  const deck = deckWithElements("s1", [buildCommandV6ShapeElement("e1", 0)]);
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT_DESIGN_OVERRIDES",
    slideId: "s1",
    elementId: "e1",
    designOverrides: { fill: { value: "#ffeeaa" }, radius: 8 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "element.update_design_overrides");
  const el = result.deck.slides[0]!.elements?.find((e) => e.id === "e1");
  assert.deepEqual((el as any).designOverrides, {
    fill: { value: "#ffeeaa" },
    radius: 8,
  });
  const parsed = safeParseDeck(result.deck);
  assert.equal(parsed.success, true, parsed.success ? undefined : parsed.error);
  assert.deepEqual(applyPatch(deck, result.patches[0]!), result.deck);
});

// ---------------------------------------------------------------------------
// REMOVE_ELEMENT
// ---------------------------------------------------------------------------

test("REMOVE_ELEMENT removes the named element", () => {
  const deck = deckWithElements("s1", [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
  ]);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
  assert.deepEqual(result.affectedElementIds, ["e1"]);
  assert.equal(result.deck.slides[0]!.elements?.length, 1);
  assert.equal(result.deck.slides[0]!.elements?.[0]?.id, "e2");
});

test("REMOVE_ELEMENT returns error when slide not found", () => {
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1")]);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENT",
    slideId: "ghost",
    elementId: "e1",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REMOVE_ELEMENT returns error when element not found", () => {
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1")]);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENT",
    slideId: "s1",
    elementId: "nope",
  });

  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("nope"));
  assert.equal(result.deck, deck);
});

test("REMOVE_ELEMENT does not mutate the original deck", () => {
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1")]);
  const originalLen = deck.slides[0]!.elements!.length;
  executeCommand(deck, {
    type: "REMOVE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
  });

  assert.equal(deck.slides[0]!.elements!.length, originalLen);
});

// ---------------------------------------------------------------------------
// Issue #399 — REMOVE_ELEMENTS (multi-element)
// ---------------------------------------------------------------------------

test("REMOVE_ELEMENTS removes multiple elements atomically", () => {
  const elements = [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
    buildCommandShapeElement("e3", 2),
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1", "e3"],
  });
  assert.equal(result.ok, true);
  const remaining = result.deck.slides[0]!.elements!;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]!.id, "e2");
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
  assert.ok(result.affectedElementIds.includes("e1"));
  assert.ok(result.affectedElementIds.includes("e3"));
  assert.equal(result.patches[0]!.op, "element.remove_multi");
  assert.deepEqual(result.patches[0]!.removedIds?.sort(), ["e1", "e3"]);
});

test("REMOVE_ELEMENTS fails when no ids match", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENTS",
    slideId: "s1",
    elementIds: ["ghost"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REMOVE_ELEMENTS fails with empty elementIds", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENTS",
    slideId: "s1",
    elementIds: [],
  });
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// Issue #399 — DUPLICATE_ELEMENT
// ---------------------------------------------------------------------------

test("DUPLICATE_ELEMENT duplicates a single element", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1", 0),
  ]);
  const result = executeCommand(deck, {
    type: "DUPLICATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.elements!.length, 2);
  assert.ok(result.affectedElementIds.includes("e1"));
  assert.equal(result.patches[0]!.op, "element.duplicate");
  assert.ok(
    result.patches[0]!.addedIds && result.patches[0]!.addedIds.length === 1,
  );
});

test("DUPLICATE_ELEMENT fails for missing element", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "DUPLICATE_ELEMENT",
    slideId: "s1",
    elementId: "ghost",
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

// ---------------------------------------------------------------------------
// Issue #399 — DUPLICATE_ELEMENTS (multi-element)
// ---------------------------------------------------------------------------

test("DUPLICATE_ELEMENTS duplicates multiple elements", () => {
  const elements = [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "DUPLICATE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1", "e2"],
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.elements!.length, 4);
  assert.equal(result.patches[0]!.op, "element.duplicate_multi");
  assert.equal(result.patches[0]!.addedIds?.length, 2);
  assert.ok(result.affectedElementIds.includes("e1"));
  assert.ok(result.affectedElementIds.includes("e2"));
});

test("DUPLICATE_ELEMENTS fails with empty list", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "DUPLICATE_ELEMENTS",
    slideId: "s1",
    elementIds: [],
  });
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// Issue #399 — NUDGE_ELEMENTS
// ---------------------------------------------------------------------------

test("NUDGE_ELEMENTS moves elements by dx/dy", () => {
  const el = buildCommandShapeElement("e1", 0);
  const origX = el.box.x;
  const origY = el.box.y;
  const deck = buildCommandDeckWithElements("s1", [el]);
  const result = executeCommand(deck, {
    type: "NUDGE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1"],
    dx: 5,
    dy: 3,
  });
  assert.equal(result.ok, true);
  const moved = result.deck.slides[0]!.elements![0]!;
  assert.equal(moved.box.x, origX + 5);
  assert.equal(moved.box.y, origY + 3);
  assert.equal(result.patches[0]!.op, "element.nudge");
});

test("NUDGE_ELEMENTS coalesces with matching key", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const r = executeCommand(deck, {
    type: "NUDGE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1"],
    dx: 1,
    dy: 0,
    coalesceKey: "nudge-s1",
  });
  assert.equal(r.historyKey, "nudge-s1");
});

// ---------------------------------------------------------------------------
// Issue #399 — GROUP_ELEMENTS / UNGROUP_ELEMENTS
// ---------------------------------------------------------------------------

test("GROUP_ELEMENTS groups elements and reports all affected ids", () => {
  const elements = [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
    buildCommandShapeElement("e3", 2),
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "GROUP_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1", "e2"],
  });
  assert.equal(result.ok, true);
  const e1 = result.deck.slides[0]!.elements!.find((e) => e.id === "e1");
  const e2 = result.deck.slides[0]!.elements!.find((e) => e.id === "e2");
  assert.ok((e1 as { groupId?: string }).groupId, "e1 should have groupId");
  assert.equal(
    (e1 as { groupId?: string }).groupId,
    (e2 as { groupId?: string }).groupId,
    "e1 and e2 should share groupId",
  );
  // e3 should not be grouped
  const e3 = result.deck.slides[0]!.elements!.find((e) => e.id === "e3");
  assert.equal((e3 as { groupId?: string }).groupId, undefined);
  assert.ok(result.affectedElementIds.includes("e1"));
  assert.ok(result.affectedElementIds.includes("e2"));
  assert.equal(result.patches[0]!.op, "element.group");
});

test("GROUP_ELEMENTS fails with fewer than 2 ids", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "GROUP_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("UNGROUP_ELEMENTS clears groupId from all members", () => {
  // First group them
  const elements = [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const grouped = executeCommand(deck, {
    type: "GROUP_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1", "e2"],
  });
  assert.equal(grouped.ok, true);
  const groupedSlide = grouped.deck.slides[0]!;
  const groupId = (groupedSlide.elements![0] as { groupId?: string }).groupId!;
  assert.ok(groupId, "must have a groupId after grouping");

  // Now ungroup
  const result = executeCommand(grouped.deck, {
    type: "UNGROUP_ELEMENTS",
    slideId: "s1",
    groupId,
  });
  assert.equal(result.ok, true);
  const afterElements = result.deck.slides[0]!.elements!;
  for (const el of afterElements) {
    assert.equal((el as { groupId?: string }).groupId, undefined);
  }
  assert.ok(result.affectedElementIds.includes("e1"));
  assert.ok(result.affectedElementIds.includes("e2"));
  assert.equal(result.patches[0]!.op, "element.ungroup");
});

test("UNGROUP_ELEMENTS fails for unknown groupId", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "UNGROUP_ELEMENTS",
    slideId: "s1",
    groupId: "ghost-group",
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

// ---------------------------------------------------------------------------
// Issue #399 — ALIGN_ELEMENTS
// ---------------------------------------------------------------------------

test("ALIGN_ELEMENTS aligns elements and emits patch", () => {
  const el1 = {
    ...buildCommandShapeElement("e1", 0),
    box: { x: 10, y: 10, w: 20, h: 20 },
  };
  const el2 = {
    ...buildCommandShapeElement("e2", 1),
    box: { x: 50, y: 30, w: 20, h: 20 },
  };
  const deck = buildCommandDeckWithElements("s1", [el1, el2]);
  const result = executeCommand(deck, {
    type: "ALIGN_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1", "e2"],
    mode: "left",
  });
  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "element.align");
  assert.ok(result.affectedElementIds.includes("e1"));
  assert.ok(result.affectedElementIds.includes("e2"));
});

test("ALIGN_ELEMENTS fails with fewer than 2 ids", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "ALIGN_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1"],
    mode: "left",
  });
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// Issue #399 — DISTRIBUTE_ELEMENTS
// ---------------------------------------------------------------------------

test("DISTRIBUTE_ELEMENTS distributes and emits patch", () => {
  const elements = [
    {
      ...buildCommandShapeElement("e1", 0),
      box: { x: 0, y: 10, w: 10, h: 10 },
    },
    {
      ...buildCommandShapeElement("e2", 1),
      box: { x: 30, y: 10, w: 10, h: 10 },
    },
    {
      ...buildCommandShapeElement("e3", 2),
      box: { x: 60, y: 10, w: 10, h: 10 },
    },
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "DISTRIBUTE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1", "e2", "e3"],
    mode: "horizontal",
  });
  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "element.distribute");
});

test("DISTRIBUTE_ELEMENTS fails with fewer than 3 ids", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
    buildCommandShapeElement("e2"),
  ]);
  const result = executeCommand(deck, {
    type: "DISTRIBUTE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1", "e2"],
    mode: "horizontal",
  });
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// Issue #399 — MATCH_SIZE_ELEMENTS
// ---------------------------------------------------------------------------

test("MATCH_SIZE_ELEMENTS matches sizes and emits patch", () => {
  const elements = [
    { ...buildCommandShapeElement("e1", 0), box: { x: 0, y: 0, w: 20, h: 20 } },
    {
      ...buildCommandShapeElement("e2", 1),
      box: { x: 30, y: 0, w: 40, h: 40 },
    },
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "MATCH_SIZE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1", "e2"],
    mode: "width",
  });
  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "element.match_size");
});

test("MATCH_SIZE_ELEMENTS fails with fewer than 2 ids", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "MATCH_SIZE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1"],
    mode: "both",
  });
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// Issue #399 — ARRANGE_ELEMENTS
// ---------------------------------------------------------------------------

test("ARRANGE_ELEMENTS rearranges z-order and emits patch", () => {
  const elements = [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
    buildCommandShapeElement("e3", 2),
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "ARRANGE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1"],
    mode: "front",
  });
  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "element.arrange");
});

// ---------------------------------------------------------------------------
// Issue #399 — BRING_ELEMENT_TO_FRONT / SEND_ELEMENT_TO_BACK
// ---------------------------------------------------------------------------

test("BRING_ELEMENT_TO_FRONT raises element to top", () => {
  const elements = [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "BRING_ELEMENT_TO_FRONT",
    slideId: "s1",
    elementId: "e1",
  });
  assert.equal(result.ok, true);
  const e1 = result.deck.slides[0]!.elements!.find((e) => e.id === "e1")!;
  const e2 = result.deck.slides[0]!.elements!.find((e) => e.id === "e2")!;
  assert.ok(e1.zIndex > e2.zIndex, "e1 should be above e2");
  assert.equal(result.patches[0]!.op, "element.bring_to_front");
});

test("SEND_ELEMENT_TO_BACK lowers element to bottom", () => {
  const elements = [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "SEND_ELEMENT_TO_BACK",
    slideId: "s1",
    elementId: "e2",
  });
  assert.equal(result.ok, true);
  const e1 = result.deck.slides[0]!.elements!.find((e) => e.id === "e1")!;
  const e2 = result.deck.slides[0]!.elements!.find((e) => e.id === "e2")!;
  assert.ok(e2.zIndex < e1.zIndex, "e2 should be below e1");
  assert.equal(result.patches[0]!.op, "element.send_to_back");
});

// ---------------------------------------------------------------------------
// Issue #399 — SET_ELEMENT_BOXES / SET_ELEMENT_PATCHES
// ---------------------------------------------------------------------------

test("SET_ELEMENT_BOXES updates multiple boxes atomically", () => {
  const elements = [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "SET_ELEMENT_BOXES",
    slideId: "s1",
    boxesById: {
      e1: { x: 20, y: 20, w: 30, h: 30 },
      e2: { x: 60, y: 60, w: 10, h: 10 },
    },
    coalesceKey: "drag-s1",
  });
  assert.equal(result.ok, true);
  const e1 = result.deck.slides[0]!.elements!.find((e) => e.id === "e1")!;
  assert.equal(e1.box.x, 20);
  assert.equal(result.historyKey, "drag-s1");
  assert.equal(result.patches[0]!.op, "element.set_boxes");
});

test("SET_ELEMENT_PATCHES applies per-element patches atomically", () => {
  const elements = [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "SET_ELEMENT_PATCHES",
    slideId: "s1",
    patchesById: {
      e1: { box: { x: 5, y: 5, w: 20, h: 20 } },
    },
    coalesceKey: "resize-s1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.historyKey, "resize-s1");
  assert.equal(result.patches[0]!.op, "element.set_patches");
});

// ---------------------------------------------------------------------------
// Issue #399 — SET_ELEMENT_HIDDEN / SET_ELEMENT_LOCKED
// ---------------------------------------------------------------------------

test("SET_ELEMENT_HIDDEN sets hidden flag and emits patch", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "SET_ELEMENT_HIDDEN",
    slideId: "s1",
    elementId: "e1",
    hidden: true,
  });
  assert.equal(result.ok, true);
  const el = result.deck.slides[0]!.elements![0]!;
  assert.equal((el as { hidden?: boolean }).hidden, true);
  assert.equal(result.patches[0]!.op, "element.set_hidden");
});

test("SET_ELEMENT_LOCKED sets locked flag and emits patch", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "SET_ELEMENT_LOCKED",
    slideId: "s1",
    elementId: "e1",
    locked: true,
  });
  assert.equal(result.ok, true);
  const el = result.deck.slides[0]!.elements![0]!;
  assert.equal((el as { locked?: boolean }).locked, true);
  assert.equal(result.patches[0]!.op, "element.set_locked");
});

// ---------------------------------------------------------------------------
// Issue #399 — MOVE_ELEMENT_ZORDER / RENAME_ELEMENT
// ---------------------------------------------------------------------------

test("MOVE_ELEMENT_ZORDER moves element up and emits patch", () => {
  const elements = [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
  ];
  const deck = buildCommandDeckWithElements("s1", elements);
  const result = executeCommand(deck, {
    type: "MOVE_ELEMENT_ZORDER",
    slideId: "s1",
    elementId: "e1",
    direction: "up",
  });
  assert.equal(result.ok, true);
  const e1 = result.deck.slides[0]!.elements!.find((e) => e.id === "e1")!;
  const e2 = result.deck.slides[0]!.elements!.find((e) => e.id === "e2")!;
  assert.ok(e1.zIndex > e2.zIndex, "e1 should be above e2 after moving up");
  assert.equal(result.patches[0]!.op, "element.move_zorder");
});

test("RENAME_ELEMENT sets element name and emits patch", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
  const result = executeCommand(deck, {
    type: "RENAME_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    name: "My Shape",
  });
  assert.equal(result.ok, true);
  const el = result.deck.slides[0]!.elements![0]!;
  assert.equal((el as { name?: string }).name, "My Shape");
  assert.equal(result.patches[0]!.op, "element.rename");
});

test("content and design update commands fail without mutating when targets are missing", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);

  const missingContentSlide = executeCommand(deck, {
    type: "UPDATE_ELEMENT_CONTENT",
    slideId: "missing",
    elementId: "e1",
    content: { kind: "shape", shape: "rect" },
  });
  assert.equal(missingContentSlide.ok, false);
  assert.equal(missingContentSlide.deck, deck);

  const missingContentElement = executeCommand(deck, {
    type: "UPDATE_ELEMENT_CONTENT",
    slideId: "s1",
    elementId: "missing",
    content: { kind: "shape", shape: "rect" },
  });
  assert.equal(missingContentElement.ok, false);
  assert.equal(missingContentElement.deck, deck);

  const missingDesignSlide = executeCommand(deck, {
    type: "UPDATE_ELEMENT_DESIGN_OVERRIDES",
    slideId: "missing",
    elementId: "e1",
    designOverrides: {},
  });
  assert.equal(missingDesignSlide.ok, false);
  assert.equal(missingDesignSlide.deck, deck);

  const missingDesignElement = executeCommand(deck, {
    type: "UPDATE_ELEMENT_DESIGN_OVERRIDES",
    slideId: "s1",
    elementId: "missing",
    designOverrides: {},
  });
  assert.equal(missingDesignElement.ok, false);
  assert.equal(missingDesignElement.deck, deck);
});

test("multi-element commands fail without mutating when inputs are empty or slide is missing", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
    buildCommandShapeElement("e2"),
  ]);

  const commands = [
    {
      type: "REMOVE_ELEMENTS",
      slideId: "missing",
      elementIds: ["e1"],
    },
    {
      type: "DUPLICATE_ELEMENT",
      slideId: "missing",
      elementId: "e1",
    },
    {
      type: "DUPLICATE_ELEMENTS",
      slideId: "missing",
      elementIds: ["e1"],
    },
    {
      type: "NUDGE_ELEMENTS",
      slideId: "missing",
      elementIds: ["e1"],
      dx: 1,
      dy: 1,
    },
    {
      type: "NUDGE_ELEMENTS",
      slideId: "s1",
      elementIds: [],
      dx: 1,
      dy: 1,
    },
    {
      type: "GROUP_ELEMENTS",
      slideId: "missing",
      elementIds: ["e1", "e2"],
    },
    {
      type: "ALIGN_ELEMENTS",
      slideId: "missing",
      elementIds: ["e1", "e2"],
      mode: "left",
    },
    {
      type: "DISTRIBUTE_ELEMENTS",
      slideId: "missing",
      elementIds: ["e1", "e2", "missing"],
      mode: "horizontal",
    },
    {
      type: "MATCH_SIZE_ELEMENTS",
      slideId: "missing",
      elementIds: ["e1", "e2"],
      mode: "width",
    },
    {
      type: "ARRANGE_ELEMENTS",
      slideId: "missing",
      elementIds: ["e1"],
      mode: "front",
    },
    {
      type: "ARRANGE_ELEMENTS",
      slideId: "s1",
      elementIds: [],
      mode: "front",
    },
  ] satisfies SlideCommand[];

  for (const command of commands) {
    const result = executeCommand(deck, command);
    assert.equal(result.ok, false, command.type);
    assert.equal(result.deck, deck, command.type);
  }
});

test("layer commands fail without mutating when slide or element is missing", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);

  const commands = [
    { type: "BRING_ELEMENT_TO_FRONT", slideId: "missing", elementId: "e1" },
    { type: "SEND_ELEMENT_TO_BACK", slideId: "s1", elementId: "missing" },
    {
      type: "SET_ELEMENT_HIDDEN",
      slideId: "missing",
      elementId: "e1",
      hidden: true,
    },
    {
      type: "SET_ELEMENT_LOCKED",
      slideId: "s1",
      elementId: "missing",
      locked: true,
    },
    {
      type: "MOVE_ELEMENT_ZORDER",
      slideId: "missing",
      elementId: "e1",
      direction: "up",
    },
    { type: "RENAME_ELEMENT", slideId: "s1", elementId: "missing", name: "x" },
    {
      type: "REORDER_ELEMENT",
      slideId: "missing",
      elementId: "e1",
      targetElementId: "e1",
    },
  ] as const;

  for (const command of commands) {
    const result = executeCommand(deck, command);
    assert.equal(result.ok, false, command.type);
    assert.equal(result.deck, deck, command.type);
  }
});

test("REORDER_ELEMENT moves an element to the target z-order", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1", 0),
    buildCommandShapeElement("e2", 1),
    buildCommandShapeElement("e3", 2),
  ]);

  const result = executeCommand(deck, {
    type: "REORDER_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    targetElementId: "e3",
  });

  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "element.reorder");
  assert.deepEqual(result.affectedElementIds, ["e1"]);
});

test("batch patch commands fail without mutating when inputs are empty or slide is missing", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);

  const commands = [
    { type: "SET_ELEMENT_BOXES", slideId: "missing", boxesById: {} },
    { type: "SET_ELEMENT_BOXES", slideId: "s1", boxesById: {} },
    { type: "SET_ELEMENT_PATCHES", slideId: "missing", patchesById: {} },
    { type: "SET_ELEMENT_PATCHES", slideId: "s1", patchesById: {} },
  ] as const;

  for (const command of commands) {
    const result = executeCommand(deck, command);
    assert.equal(result.ok, false, command.type);
    assert.equal(result.deck, deck, command.type);
  }
});
