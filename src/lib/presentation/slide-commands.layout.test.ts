import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
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
// Issue #398 — UPDATE_SLIDE_LAYOUT_HINT, APPLY_SLIDE_LAYOUT, RESET_SLIDE_LAYOUT
// ---------------------------------------------------------------------------

test("UPDATE_SLIDE_LAYOUT_HINT updates layout field", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "UPDATE_SLIDE_LAYOUT_HINT",
    slideId: "s1",
    layout: "content",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides[0]!.layout, "content");
  assert.equal(result.patches[0]!.op, "slide.update_layout_hint");
});

test("APPLY_SLIDE_LAYOUT applies content-preserving layout and emits patch", () => {
  const deck = buildCommandDeck(["s1"]);
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

test("APPLY_SLIDE_LAYOUT moves bound content and preserves free-form (#630)", () => {
  const titleEl: SlideElement = {
    id: "t1",
    kind: "text",
    role: "title",
    text: "Heading",
    zIndex: 0,
    box: { x: 1, y: 1, w: 10, h: 10 },
    style: { fontSize: 6, bold: true, italic: false, align: "left" },
    layoutSlot: { kind: "title" },
  };
  const freeEl: SlideElement = {
    id: "f1",
    kind: "shape",
    shape: "rect",
    color: "#3366ff",
    zIndex: 1,
    box: { x: 70, y: 70, w: 20, h: 20 },
  };
  const deck = buildCommandDeckWithElements("s1", [titleEl, freeEl]);
  const layout = {
    id: "title-content",
    name: "title-content",
    format: "16:9" as const,
    placeholders: [
      {
        id: "ph-title",
        kind: "placeholder" as const,
        placeholderType: "title" as const,
        zIndex: 0,
        box: { x: 8, y: 6, w: 84, h: 14 },
      },
      {
        id: "ph-body",
        kind: "placeholder" as const,
        placeholderType: "body" as const,
        zIndex: 1,
        box: { x: 8, y: 24, w: 84, h: 60 },
      },
    ],
  };
  const result = executeCommand(deck, {
    type: "APPLY_SLIDE_LAYOUT",
    slideIndex: 0,
    layout,
  });
  assert.equal(result.ok, true);
  const els = result.deck.slides[0]!.elements ?? [];
  const movedTitle = els.find((e) => e.id === "t1");
  assert.deepEqual(movedTitle?.box, { x: 8, y: 6, w: 84, h: 14 });
  assert.equal(movedTitle?.kind === "text" ? movedTitle.text : "", "Heading");
  const keptFree = els.find((e) => e.id === "f1");
  assert.deepEqual(keptFree?.box, { x: 70, y: 70, w: 20, h: 20 });
  assert.ok(els.some((e) => e.kind === "placeholder"));
  assert.equal(result.patches[0]!.op, "slide.apply_layout");
});

test("APPLY_SLIDE_LAYOUT fails on invalid index", () => {
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
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

test("RESET_SLIDE_LAYOUT repositions bound content without inserting placeholders (#629)", () => {
  const titleEl: SlideElement = {
    id: "t1",
    kind: "text",
    role: "title",
    text: "Heading",
    zIndex: 0,
    box: { x: 1, y: 1, w: 10, h: 10 },
    style: { fontSize: 6, bold: true, italic: false, align: "left" },
    layoutSlot: { kind: "title" },
  };
  const deck = buildCommandDeckWithElements("s1", [titleEl]);
  const layout = {
    id: "title-content",
    name: "title-content",
    format: "16:9" as const,
    placeholders: [
      {
        id: "ph-title",
        kind: "placeholder" as const,
        placeholderType: "title" as const,
        zIndex: 0,
        box: { x: 8, y: 6, w: 84, h: 14 },
      },
      {
        id: "ph-body",
        kind: "placeholder" as const,
        placeholderType: "body" as const,
        zIndex: 1,
        box: { x: 8, y: 24, w: 84, h: 60 },
      },
    ],
  };
  const result = executeCommand(deck, {
    type: "RESET_SLIDE_LAYOUT",
    slideIndex: 0,
    layout,
  });
  assert.equal(result.ok, true);
  const els = result.deck.slides[0]!.elements ?? [];
  // title repositioned, content preserved, NO placeholder inserted for empty body
  assert.equal(els.length, 1);
  assert.deepEqual(els[0]!.box, { x: 8, y: 6, w: 84, h: 14 });
  assert.equal(els[0]!.kind === "text" ? els[0]!.text : "", "Heading");
  assert.equal(result.patches[0]!.op, "slide.reset_layout");
});
