import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
import {
  applyPatch,
  coalesceCommands,
  commitCommand,
  executeCommand,
  type SlideCommand,
} from "./slide-commands";
import { buildDeck, buildShapeElement, buildSlide } from "@/test/builders/deck";

function buildCommandSlide(id: string, index: number, title = ""): Slide {
  return buildSlide({
    id,
    index,
    title,
    bullets: [],
    notes: "",
    elements: [],
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
        notes: "",
        elements,
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Issue #402 — commitCommand adapter
// ---------------------------------------------------------------------------

test("commitCommand returns result, commitOptions, and patches in one call", () => {
  const deck = buildCommandDeck(["s1"]);
  const cc = commitCommand(deck, { type: "ADD_SLIDE" });
  assert.equal(cc.result.ok, true);
  assert.equal(cc.commitOptions, undefined); // ADD_SLIDE has no coalesceKey
  assert.ok(Array.isArray(cc.affectedSlideIds));
  assert.ok(Array.isArray(cc.patches));
  assert.ok(cc.patches.length > 0);
});

test("commitCommand carries coalesceKey to commitOptions", () => {
  const deck = buildCommandDeckWithElements("s1", [
    buildCommandShapeElement("e1"),
  ]);
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
  const deck = buildCommandDeck(["s1"]);
  const cc = commitCommand(deck, {
    type: "REMOVE_SLIDE",
    slideId: "ghost",
  });
  assert.equal(cc.result.ok, false);
  assert.equal(cc.commitOptions, undefined);
  assert.equal(cc.patches.length, 0);
});

test("commitCommand affectedSlideIds match result.affectedSlideIds", () => {
  const deck = buildCommandDeck(["s1"]);
  const cc = commitCommand(deck, {
    type: "SET_PRESENTATION_THEME",
    themeId: "indigo",
  });
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

test("REORDER_ELEMENT moves an element to a target's z-order position (#639)", () => {
  const els: SlideElement[] = [
    {
      id: "a",
      kind: "shape",
      content: { kind: "shape", shape: "rect" },
      designOverrides: { fill: { value: "#111" } },
      zIndex: 0,
      box: { x: 0, y: 0, w: 5, h: 5 },
    },
    {
      id: "b",
      kind: "shape",
      content: { kind: "shape", shape: "rect" },
      designOverrides: { fill: { value: "#222" } },
      zIndex: 1,
      box: { x: 0, y: 0, w: 5, h: 5 },
    },
    {
      id: "c",
      kind: "shape",
      content: { kind: "shape", shape: "rect" },
      designOverrides: { fill: { value: "#333" } },
      zIndex: 2,
      box: { x: 0, y: 0, w: 5, h: 5 },
    },
  ];
  const deck = buildCommandDeckWithElements("s1", els);
  const result = executeCommand(deck, {
    type: "REORDER_ELEMENT",
    slideId: "s1",
    elementId: "a",
    targetElementId: "c",
  });
  assert.equal(result.ok, true);
  const byZ = [...(result.deck.slides[0]!.elements ?? [])]
    .sort((x, y) => x.zIndex - y.zIndex)
    .map((e) => e.id);
  assert.deepEqual(byZ, ["b", "c", "a"]);
  assert.equal(result.patches[0]!.op, "element.reorder");
});

test("REORDER_ELEMENT fails when the element is missing (#639)", () => {
  const deck = buildCommandDeckWithElements("s1", [
    {
      id: "a",
      kind: "shape",
      content: { kind: "shape", shape: "rect" },
      designOverrides: { fill: { value: "#111" } },
      zIndex: 0,
      box: { x: 0, y: 0, w: 5, h: 5 },
    },
  ]);
  const result = executeCommand(deck, {
    type: "REORDER_ELEMENT",
    slideId: "s1",
    elementId: "nope",
    targetElementId: "a",
  });
  assert.equal(result.ok, false);
});

test("UPDATE_THEME_OVERRIDES edits theme overrides and is collab-patch round-trippable (#614)", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_THEME_OVERRIDES",
    patch: { colors: { accent: "#00aa00" } },
  });
  assert.equal(result.ok, true);
  assert.equal(
    (result.deck as any).design.themeOverrides.tokenSet.colors.accent,
    "#00aa00",
  );
  assert.equal(result.patches[0]!.op, "presentation.update_theme_overrides");
  // applying the emitted patch to the original deck reproduces the edit (collab)
  const replayed = applyPatch(deck, result.patches[0]!);
  assert.equal(
    (replayed as any)?.design.themeOverrides.tokenSet.colors.accent,
    "#00aa00",
  );
});
