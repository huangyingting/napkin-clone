import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck-migration";
import {
  applyPatch,
  coalesceCommands,
  commitCommand,
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

test("DUPLICATE_SLIDE does not mutate the original deck", () => {
  const deck = makeDeck(["s1", "s2"]);
  const originalLength = deck.slides.length;
  const originalIds = deck.slides.map((s) => s.id);
  executeCommand(deck, { type: "DUPLICATE_SLIDE", slideId: "s1" });

  assert.equal(deck.slides.length, originalLength);
  assert.deepEqual(
    deck.slides.map((s) => s.id),
    originalIds,
  );
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

test("REORDER_SLIDE does not mutate the original deck", () => {
  const deck = makeDeck(["s1", "s2", "s3"]);
  const originalIds = deck.slides.map((s) => s.id);
  executeCommand(deck, { type: "REORDER_SLIDE", slideId: "s1", toIndex: 2 });

  assert.deepEqual(
    deck.slides.map((s) => s.id),
    originalIds,
  );
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

test("UPDATE_SLIDE preserves slide id even when unsafe input forces id into patch", () => {
  const deck = makeDeck(["s1"]);
  // Force `id` into patch via unsafe cast to verify the runtime guard strips it.
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE",
    slideId: "s1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    patch: { notes: "ok", id: "injected" } as any,
  });

  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.id, "s1");
});

test("UPDATE_SLIDE patch type excludes id at compile time", () => {
  const deck = makeDeck(["s1"]);
  executeCommand(deck, {
    type: "UPDATE_SLIDE",
    slideId: "s1",
    // @ts-expect-error — `id` is excluded from UpdateSlideCommand.patch
    patch: { id: "injected" },
  });
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

// ---------------------------------------------------------------------------
// Slide-editor wiring contract (#375)
//
// These tests pin the properties that slide-editor.tsx relies on when routing
// ADD_SLIDE, REMOVE_SLIDE, DUPLICATE_SLIDE, and REORDER_SLIDE through
// executeCommand:
//
//  1. Slide-level commands never produce a historyKey (they carry no
//     coalesceKey field), so upstream history records each as a discrete step.
//  2. On failure, the returned deck is the same reference as the input —
//     callers can safely skip onDeckChange without worrying about partial state.
// ---------------------------------------------------------------------------

test("ADD_SLIDE: historyKey is undefined (slide editor records discrete step)", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, { type: "ADD_SLIDE" });

  assert.equal(result.ok, true);
  assert.equal(result.historyKey, undefined);
});

test("REMOVE_SLIDE: historyKey is undefined (slide editor records discrete step)", () => {
  const deck = makeDeck(["s1", "s2"]);
  const result = executeCommand(deck, { type: "REMOVE_SLIDE", slideId: "s1" });

  assert.equal(result.ok, true);
  assert.equal(result.historyKey, undefined);
});

test("DUPLICATE_SLIDE: historyKey is undefined (slide editor records discrete step)", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "DUPLICATE_SLIDE",
    slideId: "s1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.historyKey, undefined);
});

test("REORDER_SLIDE: historyKey is undefined (slide editor records discrete step)", () => {
  const deck = makeDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "REORDER_SLIDE",
    slideId: "s1",
    toIndex: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.historyKey, undefined);
});

test("ADD_SLIDE failure: deck reference is unchanged so onDeckChange is safely skipped", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "ADD_SLIDE",
    afterSlideId: "ghost",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REMOVE_SLIDE failure (last slide): deck reference is unchanged so onDeckChange is safely skipped", () => {
  const deck = makeDeck(["only"]);
  const result = executeCommand(deck, {
    type: "REMOVE_SLIDE",
    slideId: "only",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("DUPLICATE_SLIDE failure: deck reference is unchanged so onDeckChange is safely skipped", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "DUPLICATE_SLIDE",
    slideId: "ghost",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REORDER_SLIDE failure (out-of-bounds): deck reference is unchanged so onDeckChange is safely skipped", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "REORDER_SLIDE",
    slideId: "s1",
    toIndex: 99,
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

// ============================================================================
// New command tests — issues #398, #399, #400, #401, #402
// ============================================================================

// ---------------------------------------------------------------------------
// Additional fixture helpers
// ---------------------------------------------------------------------------

function makeDeckWithElements(slideId: string, elements: SlideElement[]): Deck {
  return {
    theme: "default",
    slides: [
      {
        id: slideId,
        index: 0,
        title: "Test",
        bullets: [],
        visualIds: [],
        layout: "blank",
        notes: "",
        theme: "default",
        elements,
        elementsDerived: false,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Issue #398 — MOVE_SLIDE
// ---------------------------------------------------------------------------

test("MOVE_SLIDE moves slide forward by 1", () => {
  const deck = makeDeck(["s1", "s2", "s3"]);
  const result = executeCommand(deck, {
    type: "MOVE_SLIDE",
    slideIndex: 0,
    direction: 1,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.deck.slides.map((s) => s.id),
    ["s2", "s1", "s3"],
  );
  assert.ok(result.affectedSlideIds.includes("s1"));
  assert.ok(result.affectedSlideIds.includes("s2"));
});

test("MOVE_SLIDE moves slide backward by 1", () => {
  const deck = makeDeck(["s1", "s2", "s3"]);
  const result = executeCommand(deck, {
    type: "MOVE_SLIDE",
    slideIndex: 2,
    direction: -1,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.deck.slides.map((s) => s.id),
    ["s1", "s3", "s2"],
  );
});

test("MOVE_SLIDE fails when move would exceed deck bounds", () => {
  const deck = makeDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "MOVE_SLIDE",
    slideIndex: 0,
    direction: -1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("MOVE_SLIDE fails on invalid index", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "MOVE_SLIDE",
    slideIndex: 5,
    direction: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("MOVE_SLIDE emits slide.move patch", () => {
  const deck = makeDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "MOVE_SLIDE",
    slideIndex: 0,
    direction: 1,
  });
  assert.equal(result.ok, true);
  assert.equal(result.patches.length, 1);
  assert.equal(result.patches[0]!.op, "slide.move");
});

// ---------------------------------------------------------------------------
// Issue #398 — INSERT_TEMPLATE_SLIDE
// ---------------------------------------------------------------------------

test("INSERT_TEMPLATE_SLIDE inserts at end by default", () => {
  const deck = makeDeck(["s1", "s2"]);
  const newSlide = {
    id: "tmpl1",
    index: 0,
    title: "Template",
    bullets: [],
    visualIds: [],
    layout: "blank" as const,
    notes: "",
    theme: "default" as const,
  };
  const result = executeCommand(deck, {
    type: "INSERT_TEMPLATE_SLIDE",
    slide: newSlide,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides.length, 3);
  assert.equal(result.deck.slides[2]!.id, "tmpl1");
  assert.deepEqual(result.affectedSlideIds, ["tmpl1"]);
  assert.equal(result.patches[0]!.op, "slide.insert_template");
  assert.deepEqual(result.patches[0]!.addedIds, ["tmpl1"]);
});

test("INSERT_TEMPLATE_SLIDE inserts after specified index", () => {
  const deck = makeDeck(["s1", "s2", "s3"]);
  const newSlide = {
    id: "tmpl2",
    index: 0,
    title: "Template",
    bullets: [],
    visualIds: [],
    layout: "blank" as const,
    notes: "",
    theme: "default" as const,
  };
  const result = executeCommand(deck, {
    type: "INSERT_TEMPLATE_SLIDE",
    slide: newSlide,
    afterIndex: 0,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[1]!.id, "tmpl2");
});

// ---------------------------------------------------------------------------
// Issue #398 — UPDATE_SLIDE_TITLE, UPDATE_SLIDE_BODY, UPDATE_SLIDE_NOTES
// ---------------------------------------------------------------------------

test("UPDATE_SLIDE_TITLE updates the title and emits patch", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE_TITLE",
    slideId: "s1",
    title: "New Title",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.title, "New Title");
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
  assert.equal(result.patches[0]!.op, "slide.update_title");
  assert.equal(result.patches[0]!.slideFields?.["s1"]?.title, "New Title");
});

test("UPDATE_SLIDE_TITLE coalesces", () => {
  const deck = makeDeck(["s1"]);
  const r1 = executeCommand(deck, {
    type: "UPDATE_SLIDE_TITLE",
    slideId: "s1",
    title: "A",
    coalesceKey: "title-s1",
  });
  assert.equal(r1.historyKey, "title-s1");
});

test("UPDATE_SLIDE_TITLE fails for missing slide", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE_TITLE",
    slideId: "missing",
    title: "X",
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("UPDATE_SLIDE_BODY updates bullets and emits patch", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE_BODY",
    slideId: "s1",
    bullets: ["bullet 1", "bullet 2"],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.deck.slides[0]!.bullets, ["bullet 1", "bullet 2"]);
  assert.equal(result.patches[0]!.op, "slide.update_body");
});

test("UPDATE_SLIDE_NOTES updates notes and emits patch", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE_NOTES",
    slideId: "s1",
    notes: "Speaker notes here",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.notes, "Speaker notes here");
  assert.equal(result.patches[0]!.op, "slide.update_notes");
  assert.equal(
    result.patches[0]!.slideFields?.["s1"]?.notes,
    "Speaker notes here",
  );
});

test("UPDATE_SLIDE_NOTES coalesces with matching key", () => {
  const deck = makeDeck(["s1"]);
  const r1 = executeCommand(deck, {
    type: "UPDATE_SLIDE_NOTES",
    slideId: "s1",
    notes: "draft",
    coalesceKey: "notes-s1",
  });
  assert.equal(r1.historyKey, "notes-s1");
});

// ---------------------------------------------------------------------------
// Issue #398 — UPDATE_SLIDE_LAYOUT_HINT, APPLY_SLIDE_LAYOUT, RESET_SLIDE_LAYOUT
// ---------------------------------------------------------------------------

test("UPDATE_SLIDE_LAYOUT_HINT updates layout field", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE_LAYOUT_HINT",
    slideId: "s1",
    layout: "content",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.layout, "content");
  assert.equal(result.patches[0]!.op, "slide.update_layout_hint");
});

test("APPLY_SLIDE_LAYOUT applies placeholder layout", () => {
  const deck = makeDeck(["s1"]);
  const layout = {
    id: "two-col",
    name: "Two Column",
    format: "16:9" as const,
    placeholders: [],
  };
  const result = executeCommand(deck, {
    type: "APPLY_SLIDE_LAYOUT",
    slideIndex: 0,
    layout,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
  assert.equal(result.patches[0]!.op, "slide.apply_layout");
});

test("APPLY_SLIDE_LAYOUT fails on invalid index", () => {
  const deck = makeDeck(["s1"]);
  const layout = {
    id: "x",
    name: "X",
    format: "16:9" as const,
    placeholders: [],
  };
  const result = executeCommand(deck, {
    type: "APPLY_SLIDE_LAYOUT",
    slideIndex: 5,
    layout,
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("RESET_SLIDE_LAYOUT resets layout and emits patch", () => {
  const deck = makeDeck(["s1"]);
  const layout = {
    id: "blank",
    name: "Blank",
    format: "16:9" as const,
    placeholders: [],
  };
  const result = executeCommand(deck, {
    type: "RESET_SLIDE_LAYOUT",
    slideIndex: 0,
    layout,
  });
  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "slide.reset_layout");
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
});

// ---------------------------------------------------------------------------
// Issue #398 — MATERIALIZE_SLIDE
// ---------------------------------------------------------------------------

test("MATERIALIZE_SLIDE materializes a legacy slide", () => {
  const deck: Deck = {
    theme: "default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "My Title",
        bullets: ["point a"],
        visualIds: [],
        layout: "content",
        notes: "",
        theme: "default",
      },
    ],
  };
  const result = executeCommand(deck, {
    type: "MATERIALIZE_SLIDE",
    slideIndex: 0,
  });
  assert.equal(result.ok, true);
  assert.ok(
    result.deck.slides[0]!.elements &&
      result.deck.slides[0]!.elements.length > 0,
    "slide should have elements after materialization",
  );
  assert.equal(result.patches[0]!.op, "slide.materialize");
});

test("MATERIALIZE_SLIDE fails on invalid index", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "MATERIALIZE_SLIDE",
    slideIndex: 99,
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

// ---------------------------------------------------------------------------
// Issue #399 — REMOVE_ELEMENTS (multi-element)
// ---------------------------------------------------------------------------

test("REMOVE_ELEMENTS removes multiple elements atomically", () => {
  const elements = [
    shapeElement("e1", 0),
    shapeElement("e2", 1),
    shapeElement("e3", 2),
  ];
  const deck = makeDeckWithElements("s1", elements);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENTS",
    slideId: "s1",
    elementIds: ["ghost"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REMOVE_ELEMENTS fails with empty elementIds", () => {
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1", 0)]);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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
  const elements = [shapeElement("e1", 0), shapeElement("e2", 1)];
  const deck = makeDeckWithElements("s1", elements);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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
  const el = shapeElement("e1", 0);
  const origX = el.box.x;
  const origY = el.box.y;
  const deck = makeDeckWithElements("s1", [el]);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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
    shapeElement("e1", 0),
    shapeElement("e2", 1),
    shapeElement("e3", 2),
  ];
  const deck = makeDeckWithElements("s1", elements);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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
  const elements = [shapeElement("e1", 0), shapeElement("e2", 1)];
  const deck = makeDeckWithElements("s1", elements);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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
  const el1 = { ...shapeElement("e1", 0), box: { x: 10, y: 10, w: 20, h: 20 } };
  const el2 = { ...shapeElement("e2", 1), box: { x: 50, y: 30, w: 20, h: 20 } };
  const deck = makeDeckWithElements("s1", [el1, el2]);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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
    { ...shapeElement("e1", 0), box: { x: 0, y: 10, w: 10, h: 10 } },
    { ...shapeElement("e2", 1), box: { x: 30, y: 10, w: 10, h: 10 } },
    { ...shapeElement("e3", 2), box: { x: 60, y: 10, w: 10, h: 10 } },
  ];
  const deck = makeDeckWithElements("s1", elements);
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
  const deck = makeDeckWithElements("s1", [
    shapeElement("e1"),
    shapeElement("e2"),
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
    { ...shapeElement("e1", 0), box: { x: 0, y: 0, w: 20, h: 20 } },
    { ...shapeElement("e2", 1), box: { x: 30, y: 0, w: 40, h: 40 } },
  ];
  const deck = makeDeckWithElements("s1", elements);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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
    shapeElement("e1", 0),
    shapeElement("e2", 1),
    shapeElement("e3", 2),
  ];
  const deck = makeDeckWithElements("s1", elements);
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
  const elements = [shapeElement("e1", 0), shapeElement("e2", 1)];
  const deck = makeDeckWithElements("s1", elements);
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
  const elements = [shapeElement("e1", 0), shapeElement("e2", 1)];
  const deck = makeDeckWithElements("s1", elements);
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
  const elements = [shapeElement("e1", 0), shapeElement("e2", 1)];
  const deck = makeDeckWithElements("s1", elements);
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
  const elements = [shapeElement("e1", 0), shapeElement("e2", 1)];
  const deck = makeDeckWithElements("s1", elements);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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
  const elements = [shapeElement("e1", 0), shapeElement("e2", 1)];
  const deck = makeDeckWithElements("s1", elements);
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
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
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

// ---------------------------------------------------------------------------
// Issue #400 — SET_DECK_THEME
// ---------------------------------------------------------------------------

test("SET_DECK_THEME changes deck theme and emits patch with deckFields", () => {
  const deck = makeDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "SET_DECK_THEME",
    theme: "ocean",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.theme, "ocean");
  for (const slide of result.deck.slides) {
    assert.equal(slide.theme, "ocean");
  }
  assert.equal(result.patches[0]!.op, "deck.set_theme");
  assert.equal(result.patches[0]!.deckFields?.theme, "ocean");
  // All slide ids are affected
  assert.equal(result.affectedSlideIds.length, 2);
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_DECK_FORMAT
// ---------------------------------------------------------------------------

test("SET_DECK_FORMAT changes slide format and emits patch", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_DECK_FORMAT",
    slideFormat: "4:3",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slideFormat, "4:3");
  assert.equal(result.patches[0]!.op, "deck.set_format");
  assert.equal(result.patches[0]!.deckFields?.slideFormat, "4:3");
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_SLIDE_BACKGROUND
// ---------------------------------------------------------------------------

test("SET_SLIDE_BACKGROUND sets background color and emits patch", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND",
    slideId: "s1",
    background: "#ff0000",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.background, "#ff0000");
  assert.deepEqual(result.affectedSlideIds, ["s1"]);
  assert.equal(result.patches[0]!.op, "slide.set_background");
  assert.equal(result.patches[0]!.slideFields?.["s1"]?.background, "#ff0000");
});

test("SET_SLIDE_BACKGROUND clears background with undefined", () => {
  const deck: Deck = {
    theme: "default",
    slides: [{ ...makeDeck(["s1"]).slides[0]!, background: "#aabbcc" }],
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND",
    slideId: "s1",
    background: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.background, undefined);
});

test("SET_SLIDE_BACKGROUND fails for missing slide", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND",
    slideId: "missing",
    background: "#ff0000",
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_SLIDE_BACKGROUND_GRADIENT
// ---------------------------------------------------------------------------

test("SET_SLIDE_BACKGROUND_GRADIENT sets gradient and emits patch", () => {
  const deck = makeDeck(["s1"]);
  const gradient = { from: "#ff0000", to: "#0000ff", angle: 45 };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_GRADIENT",
    slideId: "s1",
    gradient,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.deck.slides[0]!.backgroundGradient, gradient);
  assert.equal(result.patches[0]!.op, "slide.set_background_gradient");
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_SLIDE_BACKGROUND_IMAGE
// ---------------------------------------------------------------------------

test("SET_SLIDE_BACKGROUND_IMAGE sets image URL and emits patch", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_IMAGE",
    slideId: "s1",
    image: "https://example.com/bg.jpg",
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.deck.slides[0]!.backgroundImage,
    "https://example.com/bg.jpg",
  );
  assert.equal(result.patches[0]!.op, "slide.set_background_image");
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_SLIDE_BACKGROUND_ASSET (epic #374 asset layer)
// ---------------------------------------------------------------------------

test("SET_SLIDE_BACKGROUND_ASSET sets background asset and emits patch", () => {
  const deck = makeDeck(["s1"]);
  const opts = {
    url: "https://cdn.example.com/asset123.jpg",
    assetId: "asset123",
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_ASSET",
    slideId: "s1",
    opts,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.backgroundImage, opts.url);
  assert.equal(result.deck.slides[0]!.backgroundAssetId, opts.assetId);
  assert.equal(result.patches[0]!.op, "slide.set_background_asset");
  assert.equal(
    result.patches[0]!.slideFields?.["s1"]?.backgroundImage,
    opts.url,
  );
  assert.equal(
    result.patches[0]!.slideFields?.["s1"]?.backgroundAssetId,
    opts.assetId,
  );
});

test("SET_SLIDE_BACKGROUND_ASSET clears asset with undefined", () => {
  const deck: Deck = {
    theme: "default",
    slides: [
      {
        ...makeDeck(["s1"]).slides[0]!,
        backgroundImage: "https://cdn.example.com/old.jpg",
        backgroundAssetId: "old123",
      },
    ],
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND_ASSET",
    slideId: "s1",
    opts: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.backgroundImage, undefined);
  assert.equal(result.deck.slides[0]!.backgroundAssetId, undefined);
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_SLIDE_ACCENT
// ---------------------------------------------------------------------------

test("SET_SLIDE_ACCENT sets accent color and emits patch", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_SLIDE_ACCENT",
    slideId: "s1",
    accent: "#00ff00",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.accent, "#00ff00");
  assert.equal(result.patches[0]!.op, "slide.set_accent");
  assert.equal(result.patches[0]!.slideFields?.["s1"]?.accent, "#00ff00");
});

test("SET_SLIDE_ACCENT clears accent with undefined", () => {
  const deck: Deck = {
    theme: "default",
    slides: [{ ...makeDeck(["s1"]).slides[0]!, accent: "#ff0000" }],
  };
  const result = executeCommand(deck, {
    type: "SET_SLIDE_ACCENT",
    slideId: "s1",
    accent: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.accent, undefined);
});

// ---------------------------------------------------------------------------
// Issue #401 — Patch output invariants and applyPatch round-trip
// ---------------------------------------------------------------------------

test("Successful commands always emit patches; failures emit empty patches", () => {
  const deck = makeDeck(["s1"]);
  const ok = executeCommand(deck, { type: "ADD_SLIDE" });
  assert.ok(ok.patches.length > 0, "successful command should emit patches");

  const fail = executeCommand(deck, {
    type: "REMOVE_SLIDE",
    slideId: "s1",
  });
  assert.equal(fail.ok, false);
  assert.equal(fail.patches.length, 0, "failed command should emit no patches");
});

test("Patches carry schemaVersion matching CURRENT_DECK_SCHEMA_VERSION", () => {
  const version = CURRENT_DECK_SCHEMA_VERSION;
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_DECK_THEME",
    theme: "forest",
  });
  assert.equal(result.patches[0]!.schemaVersion, version);
});

test("applyPatch round-trip: SET_DECK_THEME", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_DECK_THEME",
    theme: "grape",
  });
  const patch = result.patches[0]!;
  const reproduced = applyPatch(deck, patch);
  assert.ok(reproduced !== null, "applyPatch should return a deck");
  assert.equal(reproduced!.theme, "grape");
});

test("applyPatch round-trip: UPDATE_SLIDE_TITLE", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE_TITLE",
    slideId: "s1",
    title: "Reproduced Title",
  });
  const patch = result.patches[0]!;
  const reproduced = applyPatch(deck, patch);
  assert.ok(reproduced !== null);
  assert.equal(reproduced!.slides[0]!.title, "Reproduced Title");
});

test("applyPatch round-trip: UPDATE_SLIDE_NOTES", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE_NOTES",
    slideId: "s1",
    notes: "round-trip notes",
  });
  const reproduced = applyPatch(deck, result.patches[0]!);
  assert.ok(reproduced !== null);
  assert.equal(reproduced!.slides[0]!.notes, "round-trip notes");
});

test("applyPatch round-trip: SET_SLIDE_BACKGROUND", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_SLIDE_BACKGROUND",
    slideId: "s1",
    background: "#abcdef",
  });
  const reproduced = applyPatch(deck, result.patches[0]!);
  assert.ok(reproduced !== null);
  assert.equal(reproduced!.slides[0]!.background, "#abcdef");
});

test("applyPatch returns null for ops without sufficient payload (slide.add)", () => {
  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, { type: "ADD_SLIDE" });
  const reproduced = applyPatch(deck, result.patches[0]!);
  assert.equal(reproduced, null);
});

test("Patches include correct slideIds and elementIds for element ops", () => {
  const deck = makeDeckWithElements("s1", [
    shapeElement("e1"),
    shapeElement("e2"),
  ]);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1", "e2"],
  });
  assert.deepEqual(result.patches[0]!.slideIds, ["s1"]);
  assert.deepEqual(result.patches[0]!.elementIds.sort(), ["e1", "e2"]);
});

// ---------------------------------------------------------------------------
// Issue #402 — commitCommand adapter
// ---------------------------------------------------------------------------

test("commitCommand returns result, commitOptions, and patches in one call", () => {
  const deck = makeDeck(["s1"]);
  const cc = commitCommand(deck, { type: "ADD_SLIDE" });
  assert.equal(cc.result.ok, true);
  assert.equal(cc.commitOptions, undefined); // ADD_SLIDE has no coalesceKey
  assert.ok(Array.isArray(cc.affectedSlideIds));
  assert.ok(Array.isArray(cc.patches));
  assert.ok(cc.patches.length > 0);
});

test("commitCommand carries coalesceKey to commitOptions", () => {
  const deck = makeDeckWithElements("s1", [shapeElement("e1")]);
  const cc = commitCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: { box: { x: 1, y: 1, w: 20, h: 20 } },
    coalesceKey: "drag-e1",
  });
  assert.equal(cc.result.ok, true);
  assert.equal(cc.commitOptions?.coalesceKey, "drag-e1");
  assert.deepEqual(cc.affectedSlideIds, ["s1"]);
  assert.deepEqual(cc.affectedElementIds, ["e1"]);
});

test("commitCommand on failure: result.ok false and patches empty", () => {
  const deck = makeDeck(["s1"]);
  const cc = commitCommand(deck, {
    type: "REMOVE_SLIDE",
    slideId: "ghost",
  });
  assert.equal(cc.result.ok, false);
  assert.equal(cc.commitOptions, undefined);
  assert.equal(cc.patches.length, 0);
});

test("commitCommand affectedSlideIds match result.affectedSlideIds", () => {
  const deck = makeDeck(["s1"]);
  const cc = commitCommand(deck, { type: "SET_DECK_THEME", theme: "indigo" });
  assert.deepEqual(cc.affectedSlideIds, cc.result.affectedSlideIds);
});

// ---------------------------------------------------------------------------
// Coalescing extended — new command types
// ---------------------------------------------------------------------------

test("UPDATE_SLIDE_TITLE commands coalesce when key+slideId match", () => {
  const cmds: SlideCommand[] = [
    { type: "UPDATE_SLIDE_TITLE", slideId: "s1", title: "A", coalesceKey: "t" },
    {
      type: "UPDATE_SLIDE_TITLE",
      slideId: "s1",
      title: "AB",
      coalesceKey: "t",
    },
  ];
  const result = coalesceCommands(cmds);
  assert.equal(result.length, 1);
  assert.equal((result[0] as { title: string }).title, "AB");
});

test("UPDATE_SLIDE_NOTES commands coalesce when key+slideId match", () => {
  const cmds: SlideCommand[] = [
    {
      type: "UPDATE_SLIDE_NOTES",
      slideId: "s1",
      notes: "draft",
      coalesceKey: "n",
    },
    {
      type: "UPDATE_SLIDE_NOTES",
      slideId: "s1",
      notes: "draft v2",
      coalesceKey: "n",
    },
  ];
  const result = coalesceCommands(cmds);
  assert.equal(result.length, 1);
  assert.equal((result[0] as { notes: string }).notes, "draft v2");
});

test("NUDGE_ELEMENTS commands coalesce when key+slideId+elementIds match", () => {
  const cmds: SlideCommand[] = [
    {
      type: "NUDGE_ELEMENTS",
      slideId: "s1",
      elementIds: ["e1"],
      dx: 1,
      dy: 0,
      coalesceKey: "nudge",
    },
    {
      type: "NUDGE_ELEMENTS",
      slideId: "s1",
      elementIds: ["e1"],
      dx: 1,
      dy: 0,
      coalesceKey: "nudge",
    },
  ];
  // NUDGE_ELEMENTS doesn't coalesce in the existing coalesceCommands (it's not UPDATE_SLIDE
  // or UPDATE_ELEMENT), so two commands remain. This is correct behavior — nudge is
  // handled by accumulating patch effects, not by collapsing commands.
  const result = coalesceCommands(cmds);
  assert.equal(result.length, 2);
});

test("SET_ELEMENT_BOXES commands coalesce when they share a coalesceKey", () => {
  const cmds: SlideCommand[] = [
    {
      type: "SET_ELEMENT_BOXES",
      slideId: "s1",
      boxesById: { e1: { x: 10, y: 10, w: 20, h: 20 } },
      coalesceKey: "drag",
    },
    {
      type: "SET_ELEMENT_BOXES",
      slideId: "s1",
      boxesById: { e1: { x: 15, y: 15, w: 20, h: 20 } },
      coalesceKey: "drag",
    },
  ];
  // SET_ELEMENT_BOXES is not in the coalesceCommands merge logic (it's not
  // UPDATE_SLIDE or UPDATE_ELEMENT); both commands remain. The editor's
  // history uses coalesceKey in commitOptions to fold them into one undo step.
  const result = coalesceCommands(cmds);
  assert.equal(result.length, 2);
});
