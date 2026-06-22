import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide } from "./deck";
import {
  addElement,
  addSlide,
  alignElements,
  bringElementToFront,
  duplicateElement,
  duplicateSlide,
  groupElements,
  insertSlide,
  materializeDeck,
  materializeSlide,
  removeElement,
  removeElements,
  nudgeElements,
  duplicateElements,
  removeSlide,
  reorderSlides,
  moveSlide,
  sendElementToBack,
  setDeckSlideFormat,
  setDeckTheme,
  setSlideAccent,
  setSlideBackground,
  slideNeedsMaterialization,
  ungroupElements,
  updateElement,
  updateSlide,
} from "./deck-mutations";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function slide(index: number, title: string): Slide {
  return {
    id: "test-id",
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
// moveSlide
// ---------------------------------------------------------------------------

test("moveSlide moves a slide down by one and re-indexes", () => {
  const deck = makeDeck(["A", "B", "C"]);
  const next = moveSlide(deck, 0, 1);
  assert.deepEqual(
    next.slides.map((s) => s.title),
    ["B", "A", "C"],
  );
  assert.deepEqual(
    next.slides.map((s) => s.index),
    [0, 1, 2],
  );
});

test("moveSlide moves a slide up by one", () => {
  const deck = makeDeck(["A", "B", "C"]);
  const next = moveSlide(deck, 2, -1);
  assert.deepEqual(
    next.slides.map((s) => s.title),
    ["A", "C", "B"],
  );
});

test("moveSlide clamps at both ends (no-op returns same deck)", () => {
  const deck = makeDeck(["A", "B", "C"]);
  assert.equal(moveSlide(deck, 0, -1), deck);
  assert.equal(moveSlide(deck, 2, 1), deck);
  assert.equal(moveSlide(deck, 1, 0), deck);
  assert.equal(moveSlide(deck, -1, 1), deck);
  assert.equal(moveSlide(deck, 3, -1), deck);
});

test("moveSlide uses only the sign of direction", () => {
  const deck = makeDeck(["A", "B", "C"]);
  assert.deepEqual(
    moveSlide(deck, 0, 5).slides.map((s) => s.title),
    ["B", "A", "C"],
  );
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
    id: "authored-id",
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
    id: "first-id",
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

test("updateSlide ignores legacy-field patches once elements are authoritative", () => {
  const deck = materializeSlide(makeDeck(["A", "B"]), 0);
  const before = deck.slides[0];
  const next = updateSlide(deck, 0, {
    title: "HACKED",
    bullets: ["zzz"],
    visualIds: ["v9"],
    layout: "media",
  });

  // Legacy content fields are frozen on a free-form slide — no desync.
  assert.equal(next.slides[0].title, before.title);
  assert.deepEqual(next.slides[0].bullets, before.bullets);
  assert.deepEqual(next.slides[0].visualIds, before.visualIds);
  assert.equal(next.slides[0].layout, before.layout);
  // elements stay authoritative and intact
  assert.equal(next.slides[0].elements, before.elements);
});

test("updateSlide still applies non-legacy fields on a free-form slide", () => {
  const deck = materializeSlide(makeDeck(["A", "B"]), 0);
  const next = updateSlide(deck, 0, {
    title: "ignored",
    notes: "new notes",
    background: "#123456",
  });

  assert.equal(next.slides[0].notes, "new notes");
  assert.equal(next.slides[0].background, "#123456");
  // legacy title patch still ignored
  assert.equal(next.slides[0].title, deck.slides[0].title);
});

test("updateSlide applies the full patch on a legacy slide (no elements)", () => {
  const deck = makeDeck(["A", "B"]);
  const next = updateSlide(deck, 0, {
    title: "A2",
    bullets: ["p"],
    visualIds: ["v1"],
    layout: "media",
  });

  assert.equal(next.slides[0].title, "A2");
  assert.deepEqual(next.slides[0].bullets, ["p"]);
  assert.deepEqual(next.slides[0].visualIds, ["v1"]);
  assert.equal(next.slides[0].layout, "media");
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
// setDeckSlideFormat
// ---------------------------------------------------------------------------

test("setDeckSlideFormat changes the deck-wide slide format", () => {
  const deck = makeDeck(["A"]);
  const next = setDeckSlideFormat(deck, "4:3");

  assert.equal(next.slideFormat, "4:3");
  assert.equal(deck.slideFormat, undefined);
});

test("setDeckSlideFormat returns the same deck for a no-op", () => {
  const deck: Deck = { ...makeDeck(["A"]), slideFormat: "16:9" };
  assert.equal(setDeckSlideFormat(deck, "16:9"), deck);
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
      id: "test-id",
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
      id: "test-id",
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
      id: "test-id",
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
    id: "blank-id",
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

test("updateElement clears stale runs when an inline plain-text edit commits (#243)", () => {
  const base = addElement(deckWithBullets(), 0, {
    id: "t1",
    kind: "text",
    role: "body",
    text: "Old",
    runs: [{ text: "Old", bold: true }],
    box: { x: 0, y: 0, w: 10, h: 10 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  });
  const next = updateElement(base, 0, "t1", { text: "New", runs: undefined });
  const el = next.slides[0].elements?.find((e) => e.id === "t1");
  assert.equal(el?.kind === "text" && el.text, "New");
  // Stale formatted runs must be dropped so the renderer/exporter show "New".
  assert.equal(el?.kind === "text" && el.runs, undefined);
});

test("updateElement clears stale bulletRuns when an inline bullets edit commits (#243)", () => {
  const base = addElement(deckWithBullets(), 0, {
    id: "b1",
    kind: "bullets",
    bullets: ["Old"],
    bulletRuns: [[{ text: "Old", italic: true }]],
    box: { x: 0, y: 0, w: 10, h: 10 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  });
  const next = updateElement(base, 0, "b1", {
    bullets: ["New", "Extra"],
    bulletRuns: undefined,
  });
  const el = next.slides[0].elements?.find((e) => e.id === "b1");
  assert.deepEqual(el?.kind === "bullets" && el.bullets, ["New", "Extra"]);
  assert.equal(el?.kind === "bullets" && el.bulletRuns, undefined);
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

// ---------------------------------------------------------------------------
// Multi-select mutations (issue #245)
// ---------------------------------------------------------------------------

/** A deck whose slide 0 carries exactly three shapes with ids e1/e2/e3. */
function deckWithThreeElements(): Deck {
  const base = makeDeck(["A", "B"]);
  const elements = [
    { id: "e1", x: 0 },
    { id: "e2", x: 30 },
    { id: "e3", x: 60 },
  ].map(({ id, x }, i) => ({
    id,
    kind: "shape" as const,
    shape: "rect" as const,
    color: "#112233",
    zIndex: i,
    box: { x, y: 10, w: 10, h: 10 },
  }));
  return {
    ...base,
    slides: base.slides.map((s, i) => (i === 0 ? { ...s, elements } : s)),
  };
}

test("removeElements deletes only the named ids", () => {
  const base = deckWithThreeElements();
  const next = removeElements(base, 0, ["e1", "e3"]);
  assert.deepEqual(
    next.slides[0].elements?.map((e) => e.id),
    ["e2"],
  );
});

test("removeElements clears elementsDerived and is immutable", () => {
  const base = materializeDeck(deckWithThreeElements());
  // materializeDeck marks the slide as derived; addElement already cleared it,
  // so re-stamp it true to prove removeElements clears it.
  const stamped: Deck = {
    ...base,
    slides: base.slides.map((s, i) =>
      i === 0 ? { ...s, elementsDerived: true } : s,
    ),
  };
  const beforeIds = stamped.slides[0].elements?.map((e) => e.id);
  const next = removeElements(stamped, 0, ["e2"]);
  assert.equal(next.slides[0].elementsDerived, false);
  // Original deck untouched.
  assert.notEqual(next, stamped);
  assert.notEqual(next.slides[0], stamped.slides[0]);
  assert.deepEqual(
    stamped.slides[0].elements?.map((e) => e.id),
    beforeIds,
  );
});

test("removeElements is a no-op (same ref) when no id matches or list is empty", () => {
  const base = deckWithThreeElements();
  assert.equal(removeElements(base, 0, []), base);
  assert.equal(removeElements(base, 0, ["nope"]).slides[0], base.slides[0]);
});

test("nudgeElements moves only the named ids by the same delta", () => {
  const base = deckWithThreeElements();
  const next = nudgeElements(base, 0, ["e1", "e3"], 5, -3);
  const byId = (id: string) =>
    next.slides[0].elements?.find((e) => e.id === id)?.box;
  assert.deepEqual(byId("e1"), { x: 5, y: 7, w: 10, h: 10 });
  assert.deepEqual(byId("e3"), { x: 65, y: 7, w: 10, h: 10 });
  // e2 untouched.
  assert.deepEqual(byId("e2"), { x: 30, y: 10, w: 10, h: 10 });
});

test("nudgeElements clamps each box within the slide", () => {
  const base = deckWithThreeElements();
  // Push e1 (x=0,y=10) up/left past the edge — should clamp to 0,0.
  const next = nudgeElements(base, 0, ["e1"], -50, -50);
  const e1 = next.slides[0].elements?.find((e) => e.id === "e1")?.box;
  assert.deepEqual(e1, { x: 0, y: 0, w: 10, h: 10 });
});

test("nudgeElements clears elementsDerived and is immutable", () => {
  const base = materializeDeck(deckWithThreeElements());
  const stamped: Deck = {
    ...base,
    slides: base.slides.map((s, i) =>
      i === 0 ? { ...s, elementsDerived: true } : s,
    ),
  };
  const next = nudgeElements(stamped, 0, ["e1"], 2, 2);
  assert.equal(next.slides[0].elementsDerived, false);
  assert.notEqual(next, stamped);
  // Original box untouched.
  assert.deepEqual(
    stamped.slides[0].elements?.find((e) => e.id === "e1")?.box,
    { x: 0, y: 10, w: 10, h: 10 },
  );
});

test("nudgeElements is a no-op (same ref) on zero delta / empty / no match", () => {
  const base = deckWithThreeElements();
  assert.equal(nudgeElements(base, 0, ["e1"], 0, 0), base);
  assert.equal(nudgeElements(base, 0, [], 5, 5), base);
  assert.equal(
    nudgeElements(base, 0, ["nope"], 5, 5).slides[0],
    base.slides[0],
  );
});

test("duplicateElements clones every named id, offset and on top", () => {
  const base = deckWithThreeElements();
  const { deck: next, newElementIds } = duplicateElements(base, 0, [
    "e1",
    "e3",
  ]);
  assert.equal(newElementIds.length, 2);
  const elements = next.slides[0].elements ?? [];
  // Originals still present; two copies appended.
  assert.equal(elements.length, 5);
  const maxOriginalZ = Math.max(
    ...["e1", "e2", "e3"].map(
      (id) => elements.find((e) => e.id === id)!.zIndex,
    ),
  );
  for (const id of newElementIds) {
    const copy = elements.find((e) => e.id === id)!;
    assert.ok(copy.zIndex > maxOriginalZ);
  }
  // First copy is e1 offset by the standard amount.
  const e1 = elements.find((e) => e.id === "e1")!;
  const copy1 = elements.find((e) => e.id === newElementIds[0])!;
  assert.equal(copy1.box.x, e1.box.x + 2);
  assert.equal(copy1.box.y, e1.box.y + 2);
});

test("duplicateElements is a no-op when nothing matches", () => {
  const base = deckWithThreeElements();
  const { deck: next, newElementIds } = duplicateElements(base, 0, ["nope"]);
  assert.equal(next, base);
  assert.deepEqual(newElementIds, []);
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

// ---------------------------------------------------------------------------
// duplicateElement (issue #225)
// ---------------------------------------------------------------------------

test("duplicateElement clones with a new id, offset, and returns the copy id", () => {
  const deck = materializeSlide(deckWithBullets(), 0);
  const original = deck.slides[0].elements![0];
  const { deck: next, newElementId } = duplicateElement(deck, 0, original.id);

  // A new element was appended with a fresh id reported back as the selection.
  assert.equal(
    next.slides[0].elements!.length,
    deck.slides[0].elements!.length + 1,
  );
  assert.ok(newElementId);
  assert.notEqual(newElementId, original.id);
  const copy = next.slides[0].elements!.find((e) => e.id === newElementId)!;
  assert.ok(copy);

  // Offset by +2% on both axes (clamped within the slide).
  assert.equal(copy.box.x, original.box.x + 2);
  assert.equal(copy.box.y, original.box.y + 2);
  assert.equal(copy.box.w, original.box.w);
  assert.equal(copy.box.h, original.box.h);

  // Same kind; sits on top (highest z-index).
  assert.equal(copy.kind, original.kind);
  const maxZ = Math.max(...deck.slides[0].elements!.map((e) => e.zIndex));
  assert.ok(copy.zIndex > maxZ);

  // Original element and original deck untouched.
  assert.equal(
    deck.slides[0].elements!.length,
    deck.slides[0].elements!.length,
  );
  assert.equal(next.slides[0].elements![0].box.x, original.box.x);
});

test("duplicateElement clears elementsDerived on the slide", () => {
  const derived = materializeDeck(deckWithBullets());
  assert.equal(derived.slides[0].elementsDerived, true);
  const id = derived.slides[0].elements![0].id;
  const { deck: next } = duplicateElement(derived, 0, id);
  assert.equal(next.slides[0].elementsDerived, false);
});

test("duplicateElement is a no-op for a bad index or missing element", () => {
  const deck = materializeSlide(deckWithBullets(), 0);
  const id = deck.slides[0].elements![0].id;

  const badIndex = duplicateElement(deck, 9, id);
  assert.equal(badIndex.deck, deck);
  assert.equal(badIndex.newElementId, null);

  const missing = duplicateElement(deck, 0, "el-does-not-exist");
  assert.equal(missing.deck, deck);
  assert.equal(missing.newElementId, null);

  // Legacy slide (no elements) is also a no-op.
  const legacy = duplicateElement(deck, 1, id);
  assert.equal(legacy.deck, deck);
  assert.equal(legacy.newElementId, null);
});

test("duplicateElement clamps the offset so the copy stays on the slide", () => {
  const deck = materializeSlide(deckWithBullets(), 0);
  const id = deck.slides[0].elements![0].id;
  // Push the original hard against the bottom-right corner.
  const pinned = updateElement(deck, 0, id, {
    box: { x: 100 - 20, y: 100 - 15, w: 20, h: 15 },
  });
  const { deck: next, newElementId } = duplicateElement(pinned, 0, id);
  const copy = next.slides[0].elements!.find((e) => e.id === newElementId)!;
  assert.equal(copy.box.x, 80);
  assert.equal(copy.box.y, 85);
});

// ---------------------------------------------------------------------------
// alignElements (issue #237)
// ---------------------------------------------------------------------------

// A free-form slide with three positioned shapes plus one untouched control.
function deckWithBoxes(): Deck {
  let deck: Deck = makeDeck(["A"]);
  deck = addElement(deck, 0, {
    id: "a",
    kind: "shape",
    shape: "rect",
    color: "#111111",
    box: { x: 10, y: 5, w: 20, h: 10 },
  });
  deck = addElement(deck, 0, {
    id: "b",
    kind: "shape",
    shape: "rect",
    color: "#222222",
    box: { x: 30, y: 20, w: 40, h: 20 },
  });
  deck = addElement(deck, 0, {
    id: "c",
    kind: "shape",
    shape: "rect",
    color: "#333333",
    box: { x: 50, y: 50, w: 15, h: 10 },
  });
  return deck;
}

test("alignElements aligns only the named ids and leaves others untouched", () => {
  const deck = deckWithBoxes();
  const before = deck.slides[0].elements!;
  const next = alignElements(deck, 0, ["a", "b"], "left");

  const byId = (d: Deck, id: string) =>
    d.slides[0].elements!.find((e) => e.id === id)!;
  // a and b snap to the selection's left edge (minX = 10).
  assert.equal(byId(next, "a").box.x, 10);
  assert.equal(byId(next, "b").box.x, 10);
  // c is not in the selection → unchanged reference.
  assert.equal(byId(next, "c"), byId(deck, "c"));
  // Original deck untouched.
  assert.equal(deck.slides[0].elements, before);
  assert.equal(byId(deck, "b").box.x, 30);
});

test("alignElements clears elementsDerived and returns a new deck", () => {
  const deck = materializeSlide(makeDeck(["A"]), 0);
  assert.equal(deck.slides[0].elementsDerived, true);
  const ids = deck.slides[0].elements!.slice(0, 2).map((e) => e.id);
  const next = alignElements(deck, 0, ids, "top");

  assert.notEqual(next, deck);
  assert.equal(next.slides[0].elementsDerived, false);
});

test("alignElements is a no-op when no named ids are present", () => {
  const deck = deckWithBoxes();
  const next = alignElements(deck, 0, ["nope"], "left");
  assert.equal(next.slides[0].elements, deck.slides[0].elements);
});

// ---------------------------------------------------------------------------
// groupElements / ungroupElements (issue #330)
// ---------------------------------------------------------------------------

test("groupElements assigns a shared groupId to all named elements", () => {
  const deck = deckWithThreeElements();
  const { deck: next, groupId } = groupElements(deck, 0, ["e1", "e2"]);

  const elements = next.slides[0].elements!;
  const e1 = elements.find((e) => e.id === "e1")!;
  const e2 = elements.find((e) => e.id === "e2")!;
  const e3 = elements.find((e) => e.id === "e3")!;

  assert.ok(groupId, "groupId is non-empty");
  assert.equal(e1.groupId, groupId);
  assert.equal(e2.groupId, groupId);
  // e3 is not in the selection — must not receive a groupId.
  assert.equal(e3.groupId, undefined);
});

test("groupElements returns the new groupId for re-selection", () => {
  const deck = deckWithThreeElements();
  const { groupId } = groupElements(deck, 0, ["e1", "e2"]);
  assert.ok(typeof groupId === "string" && groupId.length > 0);
});

test("groupElements clears elementsDerived and is immutable", () => {
  const base = materializeDeck(deckWithThreeElements());
  const stamped: Deck = {
    ...base,
    slides: base.slides.map((s, i) =>
      i === 0 ? { ...s, elementsDerived: true } : s,
    ),
  };
  const { deck: next } = groupElements(stamped, 0, ["e1", "e2"]);
  assert.equal(next.slides[0].elementsDerived, false);
  // Original untouched.
  assert.equal(
    stamped.slides[0].elements?.find((e) => e.id === "e1")?.groupId,
    undefined,
  );
});

test("groupElements is a no-op (same deck ref) when ids is empty", () => {
  const deck = deckWithThreeElements();
  const { deck: next } = groupElements(deck, 0, []);
  assert.equal(next, deck);
});

test("groupElements is a no-op (same slide ref) when no id matches", () => {
  const deck = deckWithThreeElements();
  const { deck: next } = groupElements(deck, 0, ["does-not-exist"]);
  assert.equal(next.slides[0], deck.slides[0]);
});

test("ungroupElements clears groupId from all group members", () => {
  const base = deckWithThreeElements();
  const { deck: grouped, groupId } = groupElements(base, 0, ["e1", "e2"]);
  const next = ungroupElements(grouped, 0, groupId);

  const elements = next.slides[0].elements!;
  assert.equal(elements.find((e) => e.id === "e1")?.groupId, undefined);
  assert.equal(elements.find((e) => e.id === "e2")?.groupId, undefined);
  // e3 never had a groupId — still none.
  assert.equal(elements.find((e) => e.id === "e3")?.groupId, undefined);
});

test("ungroupElements round-trips: group then ungroup leaves no groupId", () => {
  const base = deckWithThreeElements();
  const { deck: grouped, groupId } = groupElements(base, 0, ["e1", "e3"]);
  const next = ungroupElements(grouped, 0, groupId);
  for (const el of next.slides[0].elements!) {
    assert.equal(el.groupId, undefined);
  }
});

test("ungroupElements clears elementsDerived", () => {
  const base = deckWithThreeElements();
  const { deck: grouped, groupId } = groupElements(base, 0, ["e1", "e2"]);
  const next = ungroupElements(grouped, 0, groupId);
  assert.equal(next.slides[0].elementsDerived, false);
});

test("ungroupElements is a no-op (same slide ref) for unknown groupId", () => {
  const deck = deckWithThreeElements();
  const result = ungroupElements(deck, 0, "not-a-real-group");
  assert.equal(result.slides[0], deck.slides[0]);
});

// ---------------------------------------------------------------------------
// duplicateElement + groupId (issue #330)
// ---------------------------------------------------------------------------

test("duplicateElement clears groupId from the copy (partial group copy)", () => {
  const base = deckWithThreeElements();
  const { deck: grouped } = groupElements(base, 0, ["e1", "e2"]);
  const { deck: next, newElementId } = duplicateElement(grouped, 0, "e1");

  const copy = next.slides[0].elements!.find((e) => e.id === newElementId)!;
  assert.ok(copy, "copy exists");
  // Original retains its groupId; copy must NOT.
  const original = next.slides[0].elements!.find((e) => e.id === "e1")!;
  assert.ok(original.groupId, "original still has groupId");
  assert.equal(copy.groupId, undefined, "copy groupId cleared");
});

// ---------------------------------------------------------------------------
// duplicateElements + groupId (issue #330)
// ---------------------------------------------------------------------------

test("duplicateElements: full group copy creates a new shared groupId", () => {
  const base = deckWithThreeElements();
  const { deck: grouped, groupId } = groupElements(base, 0, ["e1", "e2"]);
  const { deck: next, newElementIds } = duplicateElements(grouped, 0, [
    "e1",
    "e2",
  ]);

  assert.equal(newElementIds.length, 2);
  const elements = next.slides[0].elements!;
  const [copyId1, copyId2] = newElementIds;
  const copy1 = elements.find((e) => e.id === copyId1)!;
  const copy2 = elements.find((e) => e.id === copyId2)!;

  // Both copies share a groupId…
  assert.ok(copy1.groupId, "copy1 has groupId");
  assert.equal(
    copy1.groupId,
    copy2.groupId,
    "both copies share the same groupId",
  );
  // …and it is FRESH (different from the original group's id).
  assert.notEqual(copy1.groupId, groupId, "new groupId differs from original");
});

test("duplicateElements: partial group copy clears groupId on copies", () => {
  const base = deckWithThreeElements();
  const { deck: grouped } = groupElements(base, 0, ["e1", "e2"]);
  // Only duplicate e1 (not the full group).
  const { deck: next, newElementIds } = duplicateElements(grouped, 0, ["e1"]);

  assert.equal(newElementIds.length, 1);
  const copy = next.slides[0].elements!.find((e) => e.id === newElementIds[0])!;
  assert.equal(copy.groupId, undefined, "partial copy has no groupId");
});

test("duplicateElements: ungrouped elements have no groupId on copies", () => {
  const base = deckWithThreeElements();
  const { deck: next, newElementIds } = duplicateElements(base, 0, [
    "e1",
    "e2",
  ]);
  const elements = next.slides[0].elements!;
  for (const id of newElementIds) {
    assert.equal(elements.find((e) => e.id === id)!.groupId, undefined);
  }
});
