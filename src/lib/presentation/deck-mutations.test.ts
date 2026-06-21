import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide } from "./deck";
import {
  addElement,
  addSlide,
  bringElementToFront,
  duplicateSlide,
  insertSlide,
  materializeDeck,
  materializeSlide,
  removeElement,
  removeSlide,
  reorderSlides,
  sendElementToBack,
  setDeckTheme,
  setSlideAccent,
  setSlideBackground,
  slideNeedsMaterialization,
  updateElement,
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
// insertSlide
// ---------------------------------------------------------------------------

test("insertSlide places a caller-built slide and re-indexes", () => {
  const deck = makeDeck(["A", "B"]);
  const authored: Slide = {
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: deck.theme,
    elements: [],
    elementsDerived: false,
  };
  const next = insertSlide(deck, 0, authored);

  assert.equal(next.slides.length, 3);
  assert.equal(next.slides[1].index, 1);
  assert.equal(next.slides[1].elementsDerived, false);
  assert.deepEqual(
    next.slides.map((s) => s.index),
    [0, 1, 2],
  );
});

test("insertSlide with -1 prepends the slide", () => {
  const deck = makeDeck(["A"]);
  const authored: Slide = {
    index: 0,
    title: "First",
    bullets: [],
    visualIds: [],
    layout: "title",
    notes: "",
    theme: deck.theme,
  };
  const next = insertSlide(deck, -1, authored);
  assert.equal(next.slides[0].title, "First");
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

// ---------------------------------------------------------------------------
// Free-form element mutations
// ---------------------------------------------------------------------------

function deckWithBullets(): Deck {
  return makeDeck(["A", "B"]);
}

test("materializeSlide derives elements from legacy content", () => {
  const deck = deckWithBullets();
  const next = materializeSlide(deck, 0);

  assert.ok((next.slides[0].elements?.length ?? 0) > 0);
  // Other slide untouched (still legacy)
  assert.equal(next.slides[1].elements, undefined);
  // Original untouched
  assert.equal(deck.slides[0].elements, undefined);
});

test("materializeSlide is a no-op when elements already exist", () => {
  const deck = materializeSlide(deckWithBullets(), 0);
  const again = materializeSlide(deck, 0);
  assert.equal(again.slides[0].elements, deck.slides[0].elements);
});

test("slideNeedsMaterialization flags legacy content but not blanks", () => {
  // Legacy slide with a title + bullets.
  assert.equal(slideNeedsMaterialization(slide(0, "A")), true);

  // Slide with only a title.
  assert.equal(
    slideNeedsMaterialization({
      index: 0,
      title: "Just a title",
      bullets: [],
      visualIds: [],
      layout: "title",
      notes: "",
      theme: "default",
    }),
    true,
  );

  // Slide with only a visual.
  assert.equal(
    slideNeedsMaterialization({
      index: 0,
      title: "",
      bullets: [],
      visualIds: ["v1"],
      layout: "media",
      notes: "",
      theme: "default",
    }),
    true,
  );

  // Empty / blank slide — nothing to derive.
  assert.equal(
    slideNeedsMaterialization({
      index: 0,
      title: "",
      bullets: [],
      visualIds: [],
      layout: "blank",
      notes: "",
      theme: "default",
    }),
    false,
  );

  // Already materialized slide.
  const materialized = materializeSlide(deckWithBullets(), 0).slides[0];
  assert.equal(slideNeedsMaterialization(materialized), false);
});

test("materializeDeck materializes every legacy slide", () => {
  const deck = makeDeck(["A", "B"]);
  const next = materializeDeck(deck);

  assert.ok((next.slides[0].elements?.length ?? 0) > 0);
  assert.ok((next.slides[1].elements?.length ?? 0) > 0);
  // Original deck untouched (immutability).
  assert.equal(deck.slides[0].elements, undefined);
  assert.equal(deck.slides[1].elements, undefined);
});

test("materializeDeck leaves blank slides legacy and returns same ref when no-op", () => {
  const blank: Slide = {
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    theme: "default",
  };
  const deck: Deck = { theme: "default", slides: [blank] };
  const next = materializeDeck(deck);

  // Nothing to materialize → exact same reference (so a history commit is a no-op).
  assert.equal(next, deck);
  assert.equal(next.slides[0].elements, undefined);
});

test("materializeDeck preserves already-materialized slides untouched", () => {
  const base = materializeDeck(makeDeck(["A", "B"]));
  const again = materializeDeck(base);
  // No legacy slides remain → same reference back.
  assert.equal(again, base);
});

test("addElement materializes then appends with a generated id and top z", () => {
  const deck = deckWithBullets();
  const next = addElement(deck, 0, {
    kind: "shape",
    shape: "rect",
    color: "#112233",
    box: { x: 10, y: 10, w: 20, h: 20 },
  });

  const elements = next.slides[0].elements ?? [];
  const added = elements[elements.length - 1];
  assert.equal(added.kind, "shape");
  assert.ok(typeof added.id === "string" && added.id.length > 0);
  // New element sits on top of every other element.
  assert.ok(elements.every((el) => el.zIndex <= added.zIndex));
});

test("addElement honors an explicit id", () => {
  const deck = deckWithBullets();
  const next = addElement(deck, 0, {
    id: "custom-id",
    kind: "text",
    role: "body",
    text: "Hi",
    box: { x: 0, y: 0, w: 10, h: 10 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  });
  const elements = next.slides[0].elements ?? [];
  assert.ok(elements.some((el) => el.id === "custom-id"));
});

test("updateElement patches a single element by id", () => {
  const base = addElement(deckWithBullets(), 0, {
    id: "t1",
    kind: "text",
    role: "body",
    text: "Old",
    box: { x: 0, y: 0, w: 10, h: 10 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  });
  const next = updateElement(base, 0, "t1", {
    box: { x: 5, y: 5, w: 30, h: 30 },
  });
  const el = next.slides[0].elements?.find((e) => e.id === "t1");
  assert.deepEqual(el?.box, { x: 5, y: 5, w: 30, h: 30 });
  // id/kind preserved
  assert.equal(el?.kind, "text");
});

test("removeElement deletes an element by id", () => {
  const base = addElement(deckWithBullets(), 0, {
    id: "gone",
    kind: "shape",
    shape: "ellipse",
    color: "#ffffff",
    box: { x: 0, y: 0, w: 10, h: 10 },
  });
  const next = removeElement(base, 0, "gone");
  assert.ok(!next.slides[0].elements?.some((e) => e.id === "gone"));
});

test("bringElementToFront / sendElementToBack reorder z-index", () => {
  let deck = materializeSlide(deckWithBullets(), 0);
  const ids = (deck.slides[0].elements ?? []).map((e) => e.id);
  assert.ok(ids.length >= 2);

  const first = ids[0];
  deck = bringElementToFront(deck, 0, first);
  let elements = deck.slides[0].elements ?? [];
  let target = elements.find((e) => e.id === first)!;
  assert.ok(elements.every((e) => e.zIndex <= target.zIndex));

  deck = sendElementToBack(deck, 0, first);
  elements = deck.slides[0].elements ?? [];
  target = elements.find((e) => e.id === first)!;
  assert.ok(elements.every((e) => e.zIndex >= target.zIndex));
});

test("setSlideBackground / setSlideAccent set and clear overrides", () => {
  let deck = deckWithBullets();
  deck = setSlideBackground(deck, 0, "#010203");
  deck = setSlideAccent(deck, 0, "#040506");
  assert.equal(deck.slides[0].background, "#010203");
  assert.equal(deck.slides[0].accent, "#040506");

  deck = setSlideBackground(deck, 0, undefined);
  deck = setSlideAccent(deck, 0, undefined);
  assert.equal(deck.slides[0].background, undefined);
  assert.equal(deck.slides[0].accent, undefined);
});

test("duplicateSlide deep-copies elements", () => {
  const deck = materializeSlide(deckWithBullets(), 0);
  const next = duplicateSlide(deck, 0);
  assert.notEqual(next.slides[0].elements, next.slides[1].elements);
  assert.deepEqual(
    next.slides[0].elements?.map((e) => e.kind),
    next.slides[1].elements?.map((e) => e.kind),
  );
});

// ---------------------------------------------------------------------------
// Provenance flag (issue #221): elementsDerived stamping / clearing
// ---------------------------------------------------------------------------

test("materializeSlide stamps elementsDerived=true on the derived slide", () => {
  const next = materializeSlide(deckWithBullets(), 0);
  assert.equal(next.slides[0].elementsDerived, true);
  // Untouched slide carries no flag.
  assert.equal(next.slides[1].elementsDerived, undefined);
});

test("materializeDeck stamps elementsDerived=true on every derived slide", () => {
  const next = materializeDeck(deckWithBullets());
  assert.ok(next.slides.length >= 1);
  for (const slide of next.slides) {
    assert.equal(slide.elementsDerived, true);
  }
});

test("addElement clears elementsDerived (hand-edit) on the slide", () => {
  const derived = materializeDeck(deckWithBullets());
  assert.equal(derived.slides[0].elementsDerived, true);
  const next = addElement(derived, 0, {
    kind: "shape",
    shape: "rect",
    color: "#112233",
    box: { x: 10, y: 10, w: 20, h: 20 },
  });
  assert.equal(next.slides[0].elementsDerived, false);
  // Other slide unaffected.
  assert.equal(next.slides[1].elementsDerived, true);
});

test("updateElement clears elementsDerived on the slide", () => {
  const derived = materializeDeck(deckWithBullets());
  const elementId = derived.slides[0].elements![0].id;
  const next = updateElement(derived, 0, elementId, {
    box: { x: 5, y: 5, w: 30, h: 30 },
  });
  assert.equal(next.slides[0].elementsDerived, false);
});

test("removeElement / bringElementToFront / sendElementToBack clear elementsDerived", () => {
  const derived = materializeDeck(deckWithBullets());
  const elementId = derived.slides[0].elements![0].id;

  assert.equal(
    removeElement(derived, 0, elementId).slides[0].elementsDerived,
    false,
  );
  assert.equal(
    bringElementToFront(derived, 0, elementId).slides[0].elementsDerived,
    false,
  );
  assert.equal(
    sendElementToBack(derived, 0, elementId).slides[0].elementsDerived,
    false,
  );
});

test("duplicateSlide carries the elementsDerived flag onto the copy", () => {
  const derived = materializeDeck(deckWithBullets());
  const next = duplicateSlide(derived, 0);
  assert.equal(next.slides[0].elementsDerived, true);
  assert.equal(next.slides[1].elementsDerived, true);
});
