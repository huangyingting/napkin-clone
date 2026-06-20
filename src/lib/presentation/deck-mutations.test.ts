import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide } from "./deck";
import {
  addSlide,
  duplicateSlide,
  removeSlide,
  reorderSlides,
  setDeckTheme,
  updateSlide,
} from "./deck-mutations";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function slide(index: number, title: string): Slide {
  return {
    index,
    title,
    bullets: [`${title} bullet`],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "default",
  };
}

function makeDeck(titles: string[]): Deck {
  return {
    theme: "default",
    slides: titles.map((title, index) => slide(index, title)),
  };
}

// ---------------------------------------------------------------------------
// reorderSlides
// ---------------------------------------------------------------------------

test("reorderSlides moves a slide and re-indexes", () => {
  const deck = makeDeck(["A", "B", "C"]);
  const next = reorderSlides(deck, 0, 2);

  assert.deepEqual(
    next.slides.map((s) => s.title),
    ["B", "C", "A"],
  );
  assert.deepEqual(
    next.slides.map((s) => s.index),
    [0, 1, 2],
  );
  // immutable: original untouched
  assert.equal(deck.slides[0].title, "A");
});

test("reorderSlides ignores out-of-range / no-op moves", () => {
  const deck = makeDeck(["A", "B"]);
  assert.equal(reorderSlides(deck, 1, 1), deck);
  assert.equal(reorderSlides(deck, -1, 0), deck);
  assert.equal(reorderSlides(deck, 0, 5), deck);
});

// ---------------------------------------------------------------------------
// addSlide
// ---------------------------------------------------------------------------

test("addSlide inserts a blank slide after the given index", () => {
  const deck = makeDeck(["A", "B"]);
  const next = addSlide(deck, 0);

  assert.equal(next.slides.length, 3);
  assert.equal(next.slides[1].layout, "blank");
  assert.equal(next.slides[1].title, "");
  assert.deepEqual(
    next.slides.map((s) => s.index),
    [0, 1, 2],
  );
});

test("addSlide with -1 prepends", () => {
  const deck = makeDeck(["A"]);
  const next = addSlide(deck, -1);
  assert.equal(next.slides[0].layout, "blank");
  assert.equal(next.slides[1].title, "A");
});

// ---------------------------------------------------------------------------
// duplicateSlide
// ---------------------------------------------------------------------------

test("duplicateSlide copies content right after the original", () => {
  const deck = makeDeck(["A", "B"]);
  const next = duplicateSlide(deck, 0);

  assert.equal(next.slides.length, 3);
  assert.equal(next.slides[1].title, "A");
  assert.deepEqual(next.slides[1].bullets, deck.slides[0].bullets);
  // deep copy — not the same array reference
  assert.notEqual(next.slides[1].bullets, deck.slides[0].bullets);
  assert.deepEqual(
    next.slides.map((s) => s.index),
    [0, 1, 2],
  );
});

// ---------------------------------------------------------------------------
// removeSlide
// ---------------------------------------------------------------------------

test("removeSlide removes a slide and re-indexes", () => {
  const deck = makeDeck(["A", "B", "C"]);
  const next = removeSlide(deck, 1);

  assert.deepEqual(
    next.slides.map((s) => s.title),
    ["A", "C"],
  );
  assert.deepEqual(
    next.slides.map((s) => s.index),
    [0, 1],
  );
});

test("removeSlide keeps at least one slide", () => {
  const deck = makeDeck(["A"]);
  const next = removeSlide(deck, 0);
  assert.equal(next.slides.length, 1);
});

// ---------------------------------------------------------------------------
// updateSlide
// ---------------------------------------------------------------------------

test("updateSlide applies a patch to title and bullets", () => {
  const deck = makeDeck(["A", "B"]);
  const next = updateSlide(deck, 1, {
    title: "B2",
    bullets: ["x", "y"],
  });

  assert.equal(next.slides[1].title, "B2");
  assert.deepEqual(next.slides[1].bullets, ["x", "y"]);
  // other slides untouched
  assert.equal(next.slides[0].title, "A");
  // original untouched
  assert.equal(deck.slides[1].title, "B");
});

// ---------------------------------------------------------------------------
// setDeckTheme
// ---------------------------------------------------------------------------

test("setDeckTheme changes the deck and all slide themes", () => {
  const deck = makeDeck(["A", "B"]);
  const next = setDeckTheme(deck, "ocean");

  assert.equal(next.theme, "ocean");
  assert.ok(next.slides.every((s) => s.theme === "ocean"));
  // original untouched
  assert.equal(deck.theme, "default");
});
