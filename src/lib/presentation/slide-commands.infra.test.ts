import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";
import {
  applyPatch,
  coalesceCommands,
  executeCommand,
  type SlideCommand,
} from "./slide-commands";
import { buildDeck, buildShapeElement, buildSlide } from "@/test/builders/deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildCommandSlide(id: string, index: number, title = ""): Slide {
  return buildSlide({
    id,
    index,
    title,
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    elements: [],
  });
}

function buildCommandSlideWithElements(
  id: string,
  index: number,
  elements: SlideElement[],
): Slide {
  return buildSlide({
    id,
    index,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    elements,
    elementsDerived: false,
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

function buildCommandDeck(slideIds: string[]): Deck {
  return buildDeck({
    themeId: "default",
    slides: slideIds.map((id, i) => buildCommandSlide(id, i, `Slide ${i}`)),
  });
}

function deckWithElements(slideId: string, elements: SlideElement[]): Deck {
  return buildDeck({
    themeId: "default",
    slides: [buildCommandSlideWithElements(slideId, 0, elements)],
  });
}

function buildCommandDeckWithElements(
  slideId: string,
  elements: SlideElement[],
): Deck {
  return buildDeck({
    themeId: "default",
    slides: [
      buildSlide({
        id: slideId,
        index: 0,
        title: "Test",
        bullets: [],
        visualIds: [],
        layout: "blank",
        notes: "",
        elements,
        elementsDerived: false,
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Determinism / replay
// ---------------------------------------------------------------------------

test("executeCommand is deterministic: same inputs always produce same output", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
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
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1", 0)]);
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, { type: "ADD_SLIDE" });

  assert.equal(result.affectedSlideIds.length, 1);
  const [newId] = result.affectedSlideIds;
  assert.ok(
    result.deck.slides.some((s) => s.id === newId),
    "new slide must exist in result deck",
  );
});

test("REMOVE_SLIDE: affectedSlideIds contains the removed slide id", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
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
  const deck = deckWithElements("s1", [buildCommandShapeElement("e1")]);
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: {},
  });

  assert.deepEqual(result.affectedElementIds, ["e1"]);
});

test("REMOVE_ELEMENT: affectedElementIds contains the removed element id", () => {
  const deck = deckWithElements("s1", [
    buildCommandShapeElement("e1"),
    buildCommandShapeElement("e2"),
  ]);
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
  const deck = buildCommandDeck(["s1", "s2", "s3"]);
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
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, { type: "ADD_SLIDE" });

  assert.equal(result.ok, true);
  assert.equal(result.historyKey, undefined);
});

test("REMOVE_SLIDE: historyKey is undefined (slide editor records discrete step)", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
  const result = executeCommand(deck, { type: "REMOVE_SLIDE", slideId: "s1" });

  assert.equal(result.ok, true);
  assert.equal(result.historyKey, undefined);
});

test("DUPLICATE_SLIDE: historyKey is undefined (slide editor records discrete step)", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "DUPLICATE_SLIDE",
    slideId: "s1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.historyKey, undefined);
});

test("REORDER_SLIDE: historyKey is undefined (slide editor records discrete step)", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "REORDER_SLIDE",
    slideId: "s1",
    toIndex: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.historyKey, undefined);
});

test("ADD_SLIDE failure: deck reference is unchanged so onDeckChange is safely skipped", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "ADD_SLIDE",
    afterSlideId: "ghost",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REMOVE_SLIDE failure (last slide): deck reference is unchanged so onDeckChange is safely skipped", () => {
  const deck = buildCommandDeck(["only"]);
  const result = executeCommand(deck, {
    type: "REMOVE_SLIDE",
    slideId: "only",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("DUPLICATE_SLIDE failure: deck reference is unchanged so onDeckChange is safely skipped", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "DUPLICATE_SLIDE",
    slideId: "ghost",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REORDER_SLIDE failure (out-of-bounds): deck reference is unchanged so onDeckChange is safely skipped", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "REORDER_SLIDE",
    slideId: "s1",
    toIndex: 99,
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

// ---------------------------------------------------------------------------
// Issue #401 — Patch output invariants and applyPatch round-trip
// ---------------------------------------------------------------------------

test("Successful commands always emit patches; failures emit empty patches", () => {
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_DECK_THEME",
    themeId: "forest",
  });
  assert.equal(result.patches[0]!.schemaVersion, version);
});

test("applyPatch round-trip: SET_DECK_THEME", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_DECK_THEME",
    themeId: "grape",
  });
  const patch = result.patches[0]!;
  const reproduced = applyPatch(deck, patch);
  assert.ok(reproduced !== null, "applyPatch should return a deck");
  assert.equal(reproduced!.themeId, "grape");
});

test("applyPatch round-trip: UPDATE_SLIDE_TITLE", () => {
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, { type: "ADD_SLIDE" });
  const reproduced = applyPatch(deck, result.patches[0]!);
  assert.equal(reproduced, null);
});

test("Patches include correct slideIds and elementIds for element ops", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
    buildCommandShapeElement("e2"),
  ]);
  const result = executeCommand(deck, {
    type: "REMOVE_ELEMENTS",
    slideId: "s1",
    elementIds: ["e1", "e2"],
  });
  assert.deepEqual(result.patches[0]!.slideIds, ["s1"]);
  assert.deepEqual(result.patches[0]!.elementIds.sort(), ["e1", "e2"]);
});
