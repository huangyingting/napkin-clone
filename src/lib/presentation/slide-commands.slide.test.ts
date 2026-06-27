import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide } from "./deck";
import { executeCommand } from "./slide-commands";
import { buildDeck, buildSlide } from "@/test/builders/deck";

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

function buildCommandDeck(slideIds: string[]): Deck {
  return buildDeck({
    themeId: "default",
    slides: slideIds.map((id, i) => buildCommandSlide(id, i, `Slide ${i}`)),
  });
}

// ---------------------------------------------------------------------------
// ADD_SLIDE
// ---------------------------------------------------------------------------

test("ADD_SLIDE appends a new slide when afterSlideId is undefined", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
  const result = executeCommand(deck, { type: "ADD_SLIDE" });

  assert.equal(result.ok, true);
  assert.equal(result.deck.slides.length, 3);
  assert.equal(result.affectedSlideIds.length, 1);
  const newId = result.affectedSlideIds[0]!;
  assert.equal(result.deck.slides[2]!.id, newId);
});

test("ADD_SLIDE inserts after a named slide", () => {
  const deck = buildCommandDeck(["s1", "s2", "s3"]);
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
  const originalSlides = deck.slides;
  executeCommand(deck, { type: "ADD_SLIDE" });

  assert.equal(deck.slides, originalSlides);
  assert.equal(deck.slides.length, 1);
});

// ---------------------------------------------------------------------------
// REMOVE_SLIDE
// ---------------------------------------------------------------------------

test("REMOVE_SLIDE removes the named slide", () => {
  const deck = buildCommandDeck(["s1", "s2", "s3"]);
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
  const deck = buildCommandDeck(["s1", "s2", "s3"]);
  const result = executeCommand(deck, { type: "REMOVE_SLIDE", slideId: "s1" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.deck.slides.map((s) => s.index),
    [0, 1],
  );
});

test("REMOVE_SLIDE rejects removing the last slide", () => {
  const deck = buildCommandDeck(["only"]);
  const result = executeCommand(deck, {
    type: "REMOVE_SLIDE",
    slideId: "only",
  });

  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("last slide"));
  assert.equal(result.deck, deck);
});

test("REMOVE_SLIDE returns error when slide not found", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "REMOVE_SLIDE",
    slideId: "ghost",
  });

  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("ghost"));
  assert.equal(result.deck, deck);
});

test("REMOVE_SLIDE does not mutate the original deck", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
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
  const deck = buildCommandDeck(["s1", "s2"]);
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
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "DUPLICATE_SLIDE",
    slideId: "nope",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("DUPLICATE_SLIDE does not mutate the original deck", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
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
  const deck = buildCommandDeck(["s1", "s2", "s3"]);
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
  const deck = buildCommandDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "REORDER_SLIDE",
    slideId: "s1",
    toIndex: 5,
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REORDER_SLIDE returns error when slide not found", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "REORDER_SLIDE",
    slideId: "ghost",
    toIndex: 0,
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("REORDER_SLIDE does not mutate the original deck", () => {
  const deck = buildCommandDeck(["s1", "s2", "s3"]);
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE",
    slideId: "missing",
    patch: { notes: "x" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("UPDATE_SLIDE does not mutate the original deck", () => {
  const deck = buildCommandDeck(["s1"]);
  const originalNotes = deck.slides[0]!.notes;
  executeCommand(deck, {
    type: "UPDATE_SLIDE",
    slideId: "s1",
    patch: { notes: "changed" },
  });

  assert.equal(deck.slides[0]!.notes, originalNotes);
});

test("UPDATE_SLIDE preserves slide id even when unsafe input forces id into patch", () => {
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
  executeCommand(deck, {
    type: "UPDATE_SLIDE",
    slideId: "s1",
    patch: { id: "injected" },
  });
});

// ---------------------------------------------------------------------------
// Issue #398 — MOVE_SLIDE
// ---------------------------------------------------------------------------

test("MOVE_SLIDE moves slide forward by 1", () => {
  const deck = buildCommandDeck(["s1", "s2", "s3"]);
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
  const deck = buildCommandDeck(["s1", "s2", "s3"]);
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
  const deck = buildCommandDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "MOVE_SLIDE",
    slideIndex: 0,
    direction: -1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("MOVE_SLIDE fails on invalid index", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "MOVE_SLIDE",
    slideIndex: 5,
    direction: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("MOVE_SLIDE emits slide.move patch", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
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
  const deck = buildCommandDeck(["s1", "s2"]);
  const newSlide = {
    id: "tmpl1",
    index: 0,
    title: "Template",
    bullets: [],
    visualIds: [],
    layout: "blank" as const,
    notes: "",
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
  const deck = buildCommandDeck(["s1", "s2", "s3"]);
  const newSlide = {
    id: "tmpl2",
    index: 0,
    title: "Template",
    bullets: [],
    visualIds: [],
    layout: "blank" as const,
    notes: "",
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
  const r1 = executeCommand(deck, {
    type: "UPDATE_SLIDE_TITLE",
    slideId: "s1",
    title: "A",
    coalesceKey: "title-s1",
  });
  assert.equal(r1.historyKey, "title-s1");
});

test("UPDATE_SLIDE_TITLE fails for missing slide", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE_TITLE",
    slideId: "missing",
    title: "X",
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

test("UPDATE_SLIDE_BODY updates bullets and emits patch", () => {
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
  const r1 = executeCommand(deck, {
    type: "UPDATE_SLIDE_NOTES",
    slideId: "s1",
    notes: "draft",
    coalesceKey: "notes-s1",
  });
  assert.equal(r1.historyKey, "notes-s1");
});
