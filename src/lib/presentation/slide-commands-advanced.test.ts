import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";
import { applyPatch, executeCommand } from "./slide-commands";
import { resolveThemeTokens } from "./deck-theme-tokens";
import { buildDeck, buildShapeElement, buildSlide } from "@/test/builders/deck";

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

// ============================================================================
// New command tests — issues #398, #399, #400, #401, #402
// ============================================================================

// ---------------------------------------------------------------------------
// Additional fixture helpers
// ---------------------------------------------------------------------------

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

test("APPLY_SLIDE_LAYOUT keeps authored elements and does not insert placeholders", () => {
  const titleEl: SlideElement = {
    id: "t1",
    kind: "text",
    textRole: "h1",
    text: "Heading",
    paragraphs: [{ text: "Heading" }],
    zIndex: 0,
    box: { x: 1, y: 1, w: 10, h: 10 },
    style: { fontSize: 6, bold: true, italic: false, align: "left" },
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
        placeholderType: "title" as const,
        zIndex: 0,
        box: { x: 8, y: 6, w: 84, h: 14 },
      },
      {
        id: "ph-body",
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
  assert.deepEqual(movedTitle?.box, { x: 1, y: 1, w: 10, h: 10 });
  assert.equal(movedTitle?.kind === "text" ? movedTitle.text : "", "Heading");
  const keptFree = els.find((e) => e.id === "f1");
  assert.deepEqual(keptFree?.box, { x: 70, y: 70, w: 20, h: 20 });
  assert.equal(els.length, 2);
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

test("RESET_SLIDE_LAYOUT keeps authored elements without inserting placeholders", () => {
  const titleEl: SlideElement = {
    id: "t1",
    kind: "text",
    textRole: "h1",
    text: "Heading",
    paragraphs: [{ text: "Heading" }],
    zIndex: 0,
    box: { x: 1, y: 1, w: 10, h: 10 },
    style: { fontSize: 6, bold: true, italic: false, align: "left" },
  };
  const deck = buildCommandDeckWithElements("s1", [titleEl]);
  const layout = {
    id: "title-content",
    name: "title-content",
    format: "16:9" as const,
    placeholders: [
      {
        id: "ph-title",
        placeholderType: "title" as const,
        zIndex: 0,
        box: { x: 8, y: 6, w: 84, h: 14 },
      },
      {
        id: "ph-body",
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
  // content preserved, NO placeholder inserted for empty body
  assert.equal(els.length, 1);
  assert.deepEqual(els[0]!.box, { x: 1, y: 1, w: 10, h: 10 });
  assert.equal(els[0]!.kind === "text" ? els[0]!.text : "", "Heading");
  assert.equal(result.patches[0]!.op, "slide.reset_layout");
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

// ---------------------------------------------------------------------------
// Issue #400 — SET_DECK_THEME
// ---------------------------------------------------------------------------

test("SET_DECK_THEME changes deck theme and emits patch with deckFields", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "SET_DECK_THEME",
    themeId: "ocean",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.themeId, "ocean");
  assert.equal(result.patches[0]!.op, "deck.set_theme");
  assert.equal(result.patches[0]!.deckFields?.themeId, "ocean");
  // All slide ids are affected
  assert.equal(result.affectedSlideIds.length, 2);
});

test("SET_DECK_THEME clears custom token set so built-in theme is visible", () => {
  const deck = {
    ...buildCommandDeck(["s1"]),
    customTokenSet: {
      ...resolveThemeTokens("forest"),
      id: "custom:forest",
      name: "Custom Forest",
      colors: { ...resolveThemeTokens("forest").colors, accent: "#ff0000" },
    },
  };
  const result = executeCommand(deck, {
    type: "SET_DECK_THEME",
    themeId: "ocean",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.themeId, "ocean");
  assert.equal(result.deck.customTokenSet, undefined);
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_DECK_FORMAT
// ---------------------------------------------------------------------------

test("SET_DECK_FORMAT changes slide format and emits patch", () => {
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
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
    themeId: "default",
    slides: [{ ...buildCommandDeck(["s1"]).slides[0]!, background: "#aabbcc" }],
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
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
  const deck = buildCommandDeck(["s1"]);
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
    themeId: "default",
    slides: [
      {
        ...buildCommandDeck(["s1"]).slides[0]!,
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
  const deck = buildCommandDeck(["s1"]);
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
    themeId: "default",
    slides: [{ ...buildCommandDeck(["s1"]).slides[0]!, accent: "#ff0000" }],
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
