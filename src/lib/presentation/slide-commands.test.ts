import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
import {
  coalesceCommands,
  executeCommand,
  type SlideCommand,
} from "./slide-commands";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSlide(id: string, index: number, title = ""): Slide {
  return {
    id,
    index,
    title,
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    theme: "default",
  };
}

function makeSlideWithElements(
  id: string,
  index: number,
  elements: SlideElement[],
): Slide {
  return {
    id,
    index,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    theme: "default",
    elements,
    elementsDerived: false,
  };
}

function shapeElement(id: string, zIndex = 0): SlideElement {
  return {
    id,
    kind: "shape",
    shape: "rect",
    color: "#aabbcc",
    box: { x: 10, y: 10, w: 20, h: 20 },
    zIndex,
  };
}

function makeDeck(slideIds: string[]): Deck {
  return {
    theme: "default",
    slides: slideIds.map((id, i) => makeSlide(id, i, `Slide ${i}`)),
  };
}

function deckWithElements(slideId: string, elements: SlideElement[]): Deck {
  return {
    theme: "default",
    slides: [makeSlideWithElements(slideId, 0, elements)],
  };
}

// ---------------------------------------------------------------------------
// ADD_SLIDE
// ---------------------------------------------------------------------------

test("ADD_SLIDE appends a new slide when afterSlideId is undefined", () => {
  const deck = makeDeck(["s1", "s2"]);
  const result = executeCommand(deck, { type: "ADD_SLIDE" });

  assert.equal(result.ok, true);
  assert.equal(result.deck.slides.length, 3);
  assert.equal(result.affectedSlideIds.length, 1);
  const newId = result.affectedSlideIds[0]!;
  assert.equal(result.deck.slides[2]!.id, newId);
});

test("ADD_SLIDE inserts after a named slide", () => {
  const deck = makeDeck(["s1", "s2", "s3"]);
  const result = executeCommand(deck, {
    type: "ADD_SLIDE",
    afterSlideId: "s1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.deck.slides.length, 4);
  // New slide sits at index 1 (right after s1 which was at index 0).
  const newId = result.affectedSlideIds[0]!;
  assert.equal(result.deck.slides[1]!.id, newId);
  // s2/s3 shifted down; s1 stays at 0.
  assert.equal(result.deck.slides[0]!.id, "s1");
  assert.equal(result.deck.slides[2]!.id, "s2");
});

test("ADD_SLIDE returns error when afterSlideId is not found", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "ADD_SLIDE",
    afterSlideId: "missing",
  });

  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("missing"));
  // Deck reference must be unchanged on failure.
  assert.equal(result.deck, deck);
});

test("ADD_SLIDE does not mutate the original deck", () => {
  const deck = makeDeck(["s1"]);
  const originalSlides = deck.slides;
  executeCommand(deck, { type: "ADD_SLIDE" });

  assert.equal(deck.slides, originalSlides);
  assert.equal(deck.slides.length, 1);
});

// ---------------------------------------------------------------------------
// REMOVE_SLIDE
// ---------------------------------------------------------------------------

test("REMOVE_SLIDE removes the named slide", () => {
  const deck = makeDeck(["s1", "s2", "s3"]);
  const result = executeCommand(deck, { type: "REMOVE_SLIDE", slideId: "s2" });

  assert.equal(result.ok, true);
  assert.equal(result.deck.slides.length, 2);
  assert.deepEqual(
    result.deck.slides.map((s) => s.id),
    ["s1", "s3"],
  );
  assert.deepEqual(result.affectedSlideIds, ["s2"]);
});

test("REMOVE_SLIDE re-indexes remaining slides", () => {
  const deck = makeDeck(["s1", "s2", "s3"]);
  const result = executeCommand(deck, { type: "REMOVE_SLIDE", slideId: "s1" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.deck.slides.map((s) => s.index),
    [0, 1],
  );
});

test("REMOVE_SLIDE rejects removing the last slide", () => {
  const deck = makeDeck(["only"]);
  const result = executeCommand(deck, {
    type: "REMOVE_SLIDE",
    slideId: "only",
  });

  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("last slide"));
  assert.equal(result.deck, deck);
});

test("REMOVE_SLIDE returns error when slide not found", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "REMOVE_SLIDE",
    slideId: "ghost",
  });

  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("ghost"));
  assert.equal(result.deck, deck);
});

test("REMOVE_SLIDE does not mutate the original deck", () => {
  const deck = makeDeck(["s1", "s2"]);
  const snapshot = deck.slides.map((s) => s.id);
  executeCommand(deck, { type: "REMOVE_SLIDE", slideId: "s1" });

  assert.deepEqual(
    deck.slides.map((s) => s.id),
    snapshot,
  );
});

// ---------------------------------------------------------------------------
// DUPLICATE_SLIDE
// ---------------------------------------------------------------------------

test("DUPLICATE_SLIDE inserts a copy right after the original", () => {
  const deck = makeDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "DUPLICATE_SLIDE",
    slideId: "s1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.deck.slides.length, 3);
  // Both original and new ids are in affectedSlideIds.
  assert.ok(result.affectedSlideIds.includes("s1"));
  assert.equal(result.affectedSlideIds.length, 2);
  const newId = result.affectedSlideIds.find((id) => id !== "s1");
  assert.equal(result.deck.slides[1]!.id, newId);
});

test("DUPLICATE_SLIDE returns error when slide not found", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "DUPLICATE_SLIDE",
    slideId: "nope",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

// ---------------------------------------------------------------------------
// REORDER_SLIDE
// ---------------------------------------------------------------------------

test("REORDER_SLIDE moves a slide to a new position", () => {
  const deck = makeDeck(["s1", "s2", "s3"]);
  const result = executeCommand(deck, {
    type: "REORDER_SLIDE",
    slideId: "s1",
    toIndex: 2,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.deck.slides.map((s) => s.id),
    ["s2", "s3", "s1"],
  );
  // All slides in the moved range are affected.
  assert.ok(result.affectedSlideIds.includes("s1"));
  assert.ok(result.affectedSlideIds.includes("s2"));
  assert.ok(result.affectedSlideIds.includes("s3"));
});

test("REORDER_SLIDE returns error for out-of-bounds toIndex", () => {
  const deck = makeDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "REORDER_SLIDE",
    slideId: "s1",
    toIndex: 5,
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REORDER_SLIDE returns error when slide not found", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "REORDER_SLIDE",
    slideId: "ghost",
    toIndex: 0,
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

// ---------------------------------------------------------------------------
// UPDATE_SLIDE
// ---------------------------------------------------------------------------

test("UPDATE_SLIDE patches slide fields", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE",
    slideId: "s1",
    patch: { notes: "speaker notes" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.notes, "speaker notes");
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
});

test("UPDATE_SLIDE propagates coalesceKey as historyKey", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE",
    slideId: "s1",
    patch: { notes: "x" },
    coalesceKey: "notes-edit",
  });

  assert.equal(result.ok, true);
  assert.equal(result.historyKey, "notes-edit");
});

test("UPDATE_SLIDE returns error when slide not found", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE",
    slideId: "missing",
    patch: { notes: "x" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("UPDATE_SLIDE does not mutate the original deck", () => {
  const deck = makeDeck(["s1"]);
  const originalNotes = deck.slides[0]!.notes;
  executeCommand(deck, {
    type: "UPDATE_SLIDE",
    slideId: "s1",
    patch: { notes: "changed" },
  });

  assert.equal(deck.slides[0]!.notes, originalNotes);
});

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
      shape: "rect",
      color: "#112233",
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
      shape: "rect",
      color: "#000",
      box: { x: 0, y: 0, w: 10, h: 10 },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("ADD_ELEMENT does not mutate the original deck", () => {
  const deck = deckWithElements("s1", [shapeElement("e1")]);
  const originalCount = deck.slides[0]!.elements!.length;
  executeCommand(deck, {
    type: "ADD_ELEMENT",
    slideId: "s1",
    element: {
      kind: "shape",
      shape: "ellipse",
      color: "#fff",
      box: { x: 0, y: 0, w: 5, h: 5 },
    },
  });

  assert.equal(deck.slides[0]!.elements!.length, originalCount);
});

// ---------------------------------------------------------------------------
// UPDATE_ELEMENT
// ---------------------------------------------------------------------------

test("UPDATE_ELEMENT patches element fields", () => {
  const deck = deckWithElements("s1", [shapeElement("e1", 0)]);
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
  const deck = deckWithElements("s1", [shapeElement("e1", 0)]);
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
  const deck = deckWithElements("s1", [shapeElement("e1", 0)]);
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
  const deck = deckWithElements("s1", [shapeElement("e1")]);
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
  const deck = deckWithElements("s1", [shapeElement("e1")]);
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
  const deck = deckWithElements("s1", [shapeElement("e1", 0)]);
  const originalBox = deck.slides[0]!.elements![0]!.box;
  executeCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: { box: { x: 99, y: 99, w: 1, h: 1 } },
  });

  assert.deepEqual(deck.slides[0]!.elements![0]!.box, originalBox);
});

// ---------------------------------------------------------------------------
// REMOVE_ELEMENT
// ---------------------------------------------------------------------------

test("REMOVE_ELEMENT removes the named element", () => {
  const deck = deckWithElements("s1", [
    shapeElement("e1", 0),
    shapeElement("e2", 1),
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
  const deck = deckWithElements("s1", [shapeElement("e1")]);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENT",
    slideId: "ghost",
    elementId: "e1",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REMOVE_ELEMENT returns error when element not found", () => {
  const deck = deckWithElements("s1", [shapeElement("e1")]);
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
  const deck = deckWithElements("s1", [shapeElement("e1")]);
  const originalLen = deck.slides[0]!.elements!.length;
  executeCommand(deck, {
    type: "REMOVE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
  });

  assert.equal(deck.slides[0]!.elements!.length, originalLen);
});

// ---------------------------------------------------------------------------
// Determinism / replay
// ---------------------------------------------------------------------------

test("executeCommand is deterministic: same inputs always produce same output", () => {
  const deck = makeDeck(["s1", "s2"]);
  const cmd: SlideCommand = { type: "ADD_SLIDE", afterSlideId: "s1" };

  const r1 = executeCommand(deck, cmd);
  const r2 = executeCommand(deck, cmd);

  assert.equal(r1.ok, r2.ok);
  assert.equal(r1.deck.slides.length, r2.deck.slides.length);
  assert.deepEqual(
    r1.deck.slides.map((s) => s.title),
    r2.deck.slides.map((s) => s.title),
  );
  // New slide ids will differ because makeSlideId() generates fresh ids, but
  // the structural shape (length, index, theme) must be identical.
  assert.deepEqual(
    r1.deck.slides.map((s) => s.index),
    r2.deck.slides.map((s) => s.index),
  );
});

test("replay: executing the same mutation command twice produces the same structural result", () => {
  const deck = deckWithElements("s1", [shapeElement("e1", 0)]);
  const cmd: SlideCommand = {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: { box: { x: 5, y: 5, w: 10, h: 10 } },
  };

  const r1 = executeCommand(deck, cmd);
  const r2 = executeCommand(deck, cmd);

  assert.deepEqual(
    r1.deck.slides[0]!.elements![0]!.box,
    r2.deck.slides[0]!.elements![0]!.box,
  );
});

test("validation no-op: failed command returns original deck reference unchanged", () => {
  const deck = makeDeck(["s1"]);
  const badCmds: SlideCommand[] = [
    { type: "REMOVE_SLIDE", slideId: "only" },
    { type: "REMOVE_SLIDE", slideId: "ghost" },
    { type: "UPDATE_SLIDE", slideId: "ghost", patch: {} },
    { type: "REORDER_SLIDE", slideId: "s1", toIndex: 99 },
  ];

  for (const cmd of badCmds) {
    const result = executeCommand(deck, cmd);
    assert.equal(result.ok, false);
    assert.equal(
      result.deck,
      deck,
      `Expected same deck reference for failed command: ${cmd.type}`,
    );
  }
});

// ---------------------------------------------------------------------------
// coalesceCommands
// ---------------------------------------------------------------------------

test("coalesceCommands merges adjacent UPDATE_SLIDE commands with same key", () => {
  const cmds: SlideCommand[] = [
    {
      type: "UPDATE_SLIDE",
      slideId: "s1",
      patch: { notes: "first" },
      coalesceKey: "notes-edit",
    },
    {
      type: "UPDATE_SLIDE",
      slideId: "s1",
      patch: { notes: "second" },
      coalesceKey: "notes-edit",
    },
  ];

  const result = coalesceCommands(cmds);
  assert.equal(result.length, 1);
  const merged = result[0]!;
  assert.equal(merged.type, "UPDATE_SLIDE");
  if (merged.type === "UPDATE_SLIDE") {
    assert.equal(merged.patch.notes, "second");
  }
});

test("coalesceCommands merges adjacent UPDATE_ELEMENT commands with same key", () => {
  const cmds: SlideCommand[] = [
    {
      type: "UPDATE_ELEMENT",
      slideId: "s1",
      elementId: "e1",
      patch: { box: { x: 1, y: 1, w: 10, h: 10 } },
      coalesceKey: "drag-e1",
    },
    {
      type: "UPDATE_ELEMENT",
      slideId: "s1",
      elementId: "e1",
      patch: { box: { x: 5, y: 5, w: 10, h: 10 } },
      coalesceKey: "drag-e1",
    },
    {
      type: "UPDATE_ELEMENT",
      slideId: "s1",
      elementId: "e1",
      patch: { box: { x: 9, y: 9, w: 10, h: 10 } },
      coalesceKey: "drag-e1",
    },
  ];

  const result = coalesceCommands(cmds);
  assert.equal(result.length, 1);
  const merged = result[0]!;
  assert.equal(merged.type, "UPDATE_ELEMENT");
  if (merged.type === "UPDATE_ELEMENT") {
    assert.deepEqual(merged.patch.box, { x: 9, y: 9, w: 10, h: 10 });
  }
});

test("coalesceCommands does not merge commands with different coalesceKeys", () => {
  const cmds: SlideCommand[] = [
    {
      type: "UPDATE_ELEMENT",
      slideId: "s1",
      elementId: "e1",
      patch: { box: { x: 1, y: 1, w: 10, h: 10 } },
      coalesceKey: "key-a",
    },
    {
      type: "UPDATE_ELEMENT",
      slideId: "s1",
      elementId: "e1",
      patch: { box: { x: 2, y: 2, w: 10, h: 10 } },
      coalesceKey: "key-b",
    },
  ];

  assert.equal(coalesceCommands(cmds).length, 2);
});

test("coalesceCommands does not merge commands targeting different elements", () => {
  const cmds: SlideCommand[] = [
    {
      type: "UPDATE_ELEMENT",
      slideId: "s1",
      elementId: "e1",
      patch: {},
      coalesceKey: "drag",
    },
    {
      type: "UPDATE_ELEMENT",
      slideId: "s1",
      elementId: "e2",
      patch: {},
      coalesceKey: "drag",
    },
  ];

  assert.equal(coalesceCommands(cmds).length, 2);
});

test("coalesceCommands does not merge commands without a coalesceKey", () => {
  const cmds: SlideCommand[] = [
    { type: "UPDATE_SLIDE", slideId: "s1", patch: { notes: "a" } },
    { type: "UPDATE_SLIDE", slideId: "s1", patch: { notes: "b" } },
  ];

  assert.equal(coalesceCommands(cmds).length, 2);
});

test("coalesceCommands passes non-coalescing commands through unchanged", () => {
  const cmds: SlideCommand[] = [
    { type: "ADD_SLIDE" },
    { type: "REMOVE_SLIDE", slideId: "s1" },
    { type: "DUPLICATE_SLIDE", slideId: "s2" },
  ];

  const result = coalesceCommands(cmds);
  assert.equal(result.length, 3);
  assert.deepEqual(result, cmds);
});

test("coalesceCommands returns empty array for empty input", () => {
  assert.deepEqual(coalesceCommands([]), []);
});

test("coalesceCommands does not break non-adjacent same-key commands", () => {
  // A different command separating two coalescing commands must block merging.
  const cmds: SlideCommand[] = [
    {
      type: "UPDATE_SLIDE",
      slideId: "s1",
      patch: { notes: "a" },
      coalesceKey: "edit",
    },
    { type: "ADD_SLIDE" },
    {
      type: "UPDATE_SLIDE",
      slideId: "s1",
      patch: { notes: "b" },
      coalesceKey: "edit",
    },
  ];

  assert.equal(coalesceCommands(cmds).length, 3);
});

// ---------------------------------------------------------------------------
// Affected-id tracking
// ---------------------------------------------------------------------------

test("ADD_SLIDE: affectedSlideIds contains exactly the new slide id", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, { type: "ADD_SLIDE" });

  assert.equal(result.affectedSlideIds.length, 1);
  const [newId] = result.affectedSlideIds;
  assert.ok(
    result.deck.slides.some((s) => s.id === newId),
    "new slide must exist in result deck",
  );
});

test("REMOVE_SLIDE: affectedSlideIds contains the removed slide id", () => {
  const deck = makeDeck(["s1", "s2"]);
  const result = executeCommand(deck, { type: "REMOVE_SLIDE", slideId: "s1" });

  assert.deepEqual(result.affectedSlideIds, ["s1"]);
  assert.equal(result.affectedElementIds.length, 0);
});

test("ADD_ELEMENT: affectedElementIds contains exactly the new element id", () => {
  const deck = deckWithElements("s1", []);
  const result = executeCommand(deck, {
    type: "ADD_ELEMENT",
    slideId: "s1",
    element: {
      kind: "shape",
      shape: "ellipse",
      color: "#000",
      box: { x: 0, y: 0, w: 10, h: 10 },
    },
  });

  assert.equal(result.affectedElementIds.length, 1);
  const [newId] = result.affectedElementIds;
  assert.ok(
    result.deck.slides[0]!.elements?.some((e) => e.id === newId),
    "new element must exist on slide",
  );
});

test("UPDATE_ELEMENT: affectedElementIds contains the updated element id", () => {
  const deck = deckWithElements("s1", [shapeElement("e1")]);
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: {},
  });

  assert.deepEqual(result.affectedElementIds, ["e1"]);
});

test("REMOVE_ELEMENT: affectedElementIds contains the removed element id", () => {
  const deck = deckWithElements("s1", [shapeElement("e1"), shapeElement("e2")]);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
  });

  assert.deepEqual(result.affectedElementIds, ["e1"]);
});

// ---------------------------------------------------------------------------
// Calls existing mutation patterns (regression guard)
// ---------------------------------------------------------------------------

test("REMOVE_SLIDE delegates to existing removeSlide mutation: deck re-indexes", () => {
  const deck = makeDeck(["s1", "s2", "s3"]);
  const result = executeCommand(deck, { type: "REMOVE_SLIDE", slideId: "s2" });

  // removeSlide always re-indexes — indices must be 0,1 after removing s2.
  assert.deepEqual(
    result.deck.slides.map((s) => s.index),
    [0, 1],
  );
});

test("ADD_ELEMENT delegates to existing addElement mutation: element gets generated id", () => {
  const deck = deckWithElements("s1", []);
  const result = executeCommand(deck, {
    type: "ADD_ELEMENT",
    slideId: "s1",
    element: {
      kind: "shape",
      shape: "rect",
      color: "#fff",
      box: { x: 0, y: 0, w: 10, h: 10 },
    },
  });

  assert.equal(result.ok, true);
  const el = result.deck.slides[0]!.elements?.[0];
  assert.ok(el?.id, "element must have a non-empty id");
  assert.equal(el?.kind, "shape");
});
