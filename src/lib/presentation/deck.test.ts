import assert from "node:assert/strict";
import { test } from "node:test";

import type { DocumentBlock } from "@/lib/content";
import {
  buildDeckFromBlocks,
  buildVisualElement,
  DEFAULT_VISUAL_BOX,
  MAX_BULLETS,
} from "./deck";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";
import { safeParseDeck } from "./deck-schema";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function h1(text: string): DocumentBlock {
  return { kind: "text", blockType: "heading", level: 1, text };
}

function h2(text: string): DocumentBlock {
  return { kind: "text", blockType: "heading", level: 2, text };
}

function h3(text: string): DocumentBlock {
  return { kind: "text", blockType: "heading", level: 3, text };
}

function para(text: string): DocumentBlock {
  return { kind: "text", blockType: "paragraph", text };
}

function item(text: string): DocumentBlock {
  return { kind: "text", blockType: "listitem", text };
}

function quote(text: string): DocumentBlock {
  return { kind: "text", blockType: "quote", text };
}

function hr(): DocumentBlock {
  return { kind: "text", blockType: "hr", text: "" };
}

function visual(id: string): DocumentBlock {
  return {
    kind: "visual",
    visualId: id,
    visual: {
      version: 1,
      type: "flowchart",
      nodes: [],
      edges: [],
      style: {},
    } as unknown as import("@/lib/visual/schema").Visual,
  };
}

function deckThemeId(deck: unknown): string | undefined {
  return (deck as any).design?.themeId;
}

function slideLayout(slide: unknown): string {
  return (slide as any).templateId ?? "blank";
}

function elementContent(element: unknown): any {
  if (element == null) return {};
  return (element as any).content ?? {};
}

function slideTextElements(slide: unknown): any[] {
  return (((slide as any).elements ?? []) as unknown[]).filter(
    (element: any) => element.kind === "text",
  );
}

function slideBullets(slide: unknown): string[] {
  const bulletElement = slideTextElements(slide).find(
    (element) => element.role === "bullet",
  );
  return (elementContent(bulletElement).paragraphs ?? []).map(
    (paragraph: any) => paragraph.text,
  );
}

function slideBulletRuns(slide: unknown): Array<unknown[] | undefined> {
  const bulletElement = slideTextElements(slide).find(
    (element) => element.role === "bullet",
  );
  return (elementContent(bulletElement).paragraphs ?? []).map(
    (paragraph: any) => paragraph.runs,
  );
}

function slideVisualIds(slide: unknown): string[] {
  return (((slide as any).elements ?? []) as unknown[])
    .filter((element: any) => element.kind === "visual")
    .map((element) => elementContent(element).visualId)
    .filter((visualId): visualId is string => typeof visualId === "string");
}

function firstTextElement(slide: unknown): any | undefined {
  return slideTextElements(slide)[0];
}

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

test("empty input yields a single blank slide", () => {
  const deck = buildDeckFromBlocks([]);
  assert.equal(deck.slides.length, 1);
  assert.equal(slideLayout(deck.slides[0]), "blank");
  assert.equal(deck.slides[0].title, "");
  assert.equal(slideBullets(deck.slides[0]).length, 0);
  assert.equal(slideVisualIds(deck.slides[0]).length, 0);
});

test("themeId is stored at deck level", () => {
  const deck = buildDeckFromBlocks([h1("Title"), para("Body")], "ocean");
  assert.equal(deckThemeId(deck), "ocean");
});

test("default themeId is 'indigo'", () => {
  const deck = buildDeckFromBlocks([h1("Hi")]);
  assert.equal(deckThemeId(deck), "indigo");
});

test("slide indexes are zero-based and sequential", () => {
  const deck = buildDeckFromBlocks([h1("A"), h2("B"), h2("C")]);
  deck.slides.forEach((s, i) => assert.equal(s.index, i));
});

// ---------------------------------------------------------------------------
// Heading rules
// ---------------------------------------------------------------------------

test("h1 produces a title slide (first heading) with title layout", () => {
  const deck = buildDeckFromBlocks([h1("My Presentation")]);
  assert.equal(deck.slides.length, 1);
  const s = deck.slides[0];
  assert.equal(s.title, "My Presentation");
  assert.equal(slideLayout(s), "title");
});

test("h1 mid-document produces a section slide", () => {
  const deck = buildDeckFromBlocks([
    h1("Intro"),
    para("intro body"),
    h1("Chapter 2"),
  ]);
  const section = deck.slides.find((s) => s.title === "Chapter 2");
  assert.ok(section, "section slide should exist");
  assert.equal(slideLayout(section), "section");
});

test("h2 opens a content slide", () => {
  const deck = buildDeckFromBlocks([h1("Doc"), h2("Section A")]);
  const s = deck.slides.find((s) => s.title === "Section A");
  assert.ok(s);
  assert.equal(slideLayout(s), "content");
});

test("h3 opens a content slide", () => {
  const deck = buildDeckFromBlocks([h3("Sub-section")]);
  const s = deck.slides[0];
  assert.equal(s.title, "Sub-section");
  assert.equal(slideLayout(s), "content");
});

test("multiple h2 blocks each produce their own slide", () => {
  const deck = buildDeckFromBlocks([
    h1("Doc"),
    h2("A"),
    para("a1"),
    h2("B"),
    para("b1"),
  ]);
  const titles = deck.slides.map((s) => s.title);
  assert.ok(titles.includes("A"));
  assert.ok(titles.includes("B"));
  const slideA = deck.slides.find((s) => s.title === "A")!;
  const slideB = deck.slides.find((s) => s.title === "B")!;
  assert.deepEqual(slideBullets(slideA), ["a1"]);
  assert.deepEqual(slideBullets(slideB), ["b1"]);
});

// ---------------------------------------------------------------------------
// Bullet / paragraph rules
// ---------------------------------------------------------------------------

test("paragraphs become bullets on the current slide", () => {
  const deck = buildDeckFromBlocks([
    h2("Slide"),
    para("point 1"),
    para("point 2"),
  ]);
  const s = deck.slides.find((s) => s.title === "Slide")!;
  assert.deepEqual(slideBullets(s), ["point 1", "point 2"]);
});

test("list items become bullets", () => {
  const deck = buildDeckFromBlocks([
    h2("List slide"),
    item("Alpha"),
    item("Beta"),
  ]);
  const s = deck.slides.find((s) => s.title === "List slide")!;
  assert.deepEqual(slideBullets(s), ["Alpha", "Beta"]);
});

test(`surplus bullets (> ${MAX_BULLETS}) overflow to notes`, () => {
  const blocks: DocumentBlock[] = [h2("Long slide")];
  for (let i = 1; i <= MAX_BULLETS + 3; i++) blocks.push(para(`item ${i}`));
  const deck = buildDeckFromBlocks(blocks);
  const s = deck.slides.find((s) => s.title === "Long slide")!;
  assert.equal(slideBullets(s).length, MAX_BULLETS);
  assert.ok(s.notes.includes(`item ${MAX_BULLETS + 1}`));
  assert.ok(s.notes.includes(`item ${MAX_BULLETS + 3}`));
});

test("blank/empty paragraph text is ignored", () => {
  const deck = buildDeckFromBlocks([h2("Empty"), para("  "), para("  ")]);
  const s = deck.slides.find((s) => s.title === "Empty")!;
  assert.equal(slideBullets(s).length, 0);
});

// ---------------------------------------------------------------------------
// Quote → notes
// ---------------------------------------------------------------------------

test("quote blocks always go to notes, not bullets", () => {
  const deck = buildDeckFromBlocks([h2("With quote"), quote("A wise saying")]);
  const s = deck.slides.find((s) => s.title === "With quote")!;
  assert.equal(slideBullets(s).length, 0);
  assert.ok(s.notes.includes("A wise saying"));
});

// ---------------------------------------------------------------------------
// Visual attachment rules
// ---------------------------------------------------------------------------

test("visual attaches to current slide when it has no visual yet", () => {
  const deck = buildDeckFromBlocks([h2("Slide with visual"), visual("v1")]);
  const s = deck.slides.find((s) => s.title === "Slide with visual")!;
  assert.deepEqual(slideVisualIds(s), ["v1"]);
});

test("second visual on same slide triggers its own media slide", () => {
  const deck = buildDeckFromBlocks([h2("Slide"), visual("v1"), visual("v2")]);
  const mediaSlide = deck.slides.find((s) => slideVisualIds(s).includes("v2"));
  assert.ok(mediaSlide, "v2 should get its own slide");
  assert.equal(slideLayout(mediaSlide), "media");
  assert.notEqual(
    deck.slides.find((s) => slideVisualIds(s).includes("v1")),
    mediaSlide,
  );
});

test("visual before any heading creates a preamble slide", () => {
  const deck = buildDeckFromBlocks([visual("v0"), h1("Title")]);
  const preamble = deck.slides.find((s) => slideVisualIds(s).includes("v0"));
  assert.ok(preamble);
});

test("slide with only a visual gets media layout", () => {
  const deck = buildDeckFromBlocks([h2("Media only"), visual("v1")]);
  const s = deck.slides.find((s) => s.title === "Media only")!;
  assert.equal(slideLayout(s), "media");
});

test("slide with visual and bullets gets content layout", () => {
  const deck = buildDeckFromBlocks([h2("Mixed"), para("point"), visual("v1")]);
  const s = deck.slides.find((s) => s.title === "Mixed")!;
  assert.equal(slideLayout(s), "content");
  assert.deepEqual(slideBullets(s), ["point"]);
  assert.deepEqual(slideVisualIds(s), ["v1"]);
});

// ---------------------------------------------------------------------------
// HR slide break
// ---------------------------------------------------------------------------

test("hr flushes current slide and starts a new one", () => {
  const deck = buildDeckFromBlocks([
    h2("First"),
    para("content"),
    hr(),
    para("second content"),
  ]);
  assert.ok(deck.slides.length >= 2);
  const first = deck.slides.find((s) => s.title === "First")!;
  assert.deepEqual(slideBullets(first), ["content"]);
});

// ---------------------------------------------------------------------------
// Deck return shape
// ---------------------------------------------------------------------------

test("deck.slides is always an array", () => {
  const deck = buildDeckFromBlocks([]);
  assert.ok(Array.isArray(deck.slides));
});

test("returned deck has theme matching the argument", () => {
  const deck = buildDeckFromBlocks([h1("T")], "forest");
  assert.equal(deckThemeId(deck), "forest");
});

test("returned deck carries themeId matching the chosen theme", () => {
  const deck = buildDeckFromBlocks([h1("T")], "forest");
  assert.equal(deckThemeId(deck), "forest");
});

test("complex document: h1 + two h2 sections + visuals", () => {
  const deck = buildDeckFromBlocks([
    h1("My Deck"),
    para("Intro text"),
    h2("Approach"),
    item("Step 1"),
    item("Step 2"),
    visual("fig-1"),
    h2("Results"),
    para("We found X"),
    visual("fig-2"),
  ]);

  const titles = deck.slides.map((s) => s.title);
  assert.ok(titles.includes("My Deck"), "title slide");
  assert.ok(titles.includes("Approach"), "Approach slide");
  assert.ok(titles.includes("Results"), "Results slide");

  const approach = deck.slides.find((s) => s.title === "Approach")!;
  assert.deepEqual(slideBullets(approach), ["Step 1", "Step 2"]);
  assert.deepEqual(slideVisualIds(approach), ["fig-1"]);

  const results = deck.slides.find((s) => s.title === "Results")!;
  assert.deepEqual(slideBullets(results), ["We found X"]);
  assert.deepEqual(slideVisualIds(results), ["fig-2"]);
});

// ---------------------------------------------------------------------------
// Notes pipeline: quote→notes, overflow→notes, safeParseDeck round-trip
// ---------------------------------------------------------------------------

test("multiple quote blocks are joined into notes with newline separator", () => {
  const deck = buildDeckFromBlocks([
    h2("Slide"),
    quote("First note"),
    quote("Second note"),
  ]);
  const s = deck.slides.find((s) => s.title === "Slide")!;
  assert.ok(s.notes.includes("First note"), "notes contains first quote");
  assert.ok(s.notes.includes("Second note"), "notes contains second quote");
});

test("quote notes are preserved through safeParseDeck round-trip", () => {
  const deck = buildDeckFromBlocks([
    h2("Slide with notes"),
    para("bullet"),
    quote("Speaker note for this slide"),
  ]);
  const original = deck.slides.find((s) => s.title === "Slide with notes")!;
  assert.ok(original.notes.includes("Speaker note for this slide"));

  // Simulate serialise → parse (as done by saveDeckJson / safeParseDeck)
  const roundTrip = safeParseDeck(JSON.parse(JSON.stringify(deck)));
  assert.ok(roundTrip.success, "safeParseDeck must succeed");
  const restored = roundTrip.data.slides.find(
    (sl) => sl.title === "Slide with notes",
  )!;
  assert.equal(
    restored.notes,
    original.notes,
    "notes must survive JSON round-trip through safeParseDeck",
  );
});

test("overflow bullets appear in notes and survive safeParseDeck round-trip", () => {
  const blocks: DocumentBlock[] = [h2("Overflow slide")];
  for (let i = 1; i <= MAX_BULLETS + 2; i++) blocks.push(para(`item ${i}`));
  const deck = buildDeckFromBlocks(blocks);
  const original = deck.slides.find((s) => s.title === "Overflow slide")!;
  assert.ok(
    original.notes.includes(`item ${MAX_BULLETS + 1}`),
    "overflow bullet goes to notes",
  );

  const roundTrip = safeParseDeck(JSON.parse(JSON.stringify(deck)));
  assert.ok(roundTrip.success, "safeParseDeck must succeed");
  const restored = roundTrip.data.slides.find(
    (sl) => sl.title === "Overflow slide",
  )!;
  assert.equal(
    restored.notes,
    original.notes,
    "overflow notes must survive JSON round-trip",
  );
});

test("safeParseDeck accepts a slide with missing optional notes field", () => {
  const deck = buildDeckFromBlocks([h2("Slide")]);
  const raw = JSON.parse(JSON.stringify(deck)) as {
    slides: Array<Record<string, unknown>>;
  };
  delete raw.slides[0].notes;
  const result = safeParseDeck(raw);
  assert.equal(result.success, true, "notes is optional in v6");
});

// ---------------------------------------------------------------------------
// buildSlideElementsFromContent
// ---------------------------------------------------------------------------

test("buildSlideElementsFromContent builds a title element from slide content", async () => {
  const { buildSlideElementsFromContent } = await import("./deck");
  const elements = buildSlideElementsFromContent({
    id: "test-id",
    index: 0,
    title: "Hello",
    bullets: [],
    visualIds: [],
    layout: "title",
    notes: "",
  });
  const title = elements.find((e) => e.kind === "text");
  assert.ok(title);
  if (title?.kind === "text") {
    assert.equal(elementContent(title).text, "Hello");
    assert.equal((title as any).role, "title");
  }
});

test("buildSlideElementsFromContent pairs bullets and a visual side by side", async () => {
  const { buildSlideElementsFromContent } = await import("./deck");
  const elements = buildSlideElementsFromContent({
    id: "test-id",
    index: 0,
    title: "T",
    bullets: ["a", "b"],
    visualIds: ["vis-1"],
    layout: "content",
    notes: "",
  });
  assert.ok(elements.some((e) => e.kind === "text" && (e as any).role === "bullet"));
  assert.ok(elements.some((e) => e.kind === "visual"));
});

test("buildSlideElementsFromContent emits free-form elements without layout slots", async () => {
  const { buildSlideElementsFromContent } = await import("./deck");
  const elements = buildSlideElementsFromContent({
    id: "test-id",
    index: 0,
    title: "T",
    bullets: ["a", "b"],
    visualIds: ["vis-1", "vis-2"],
    layout: "content",
    notes: "",
  });
  assert.ok(elements.every((element) => !("layoutSlot" in element)));
  assert.ok(elements.some((element) => element.kind === "text"));
  assert.equal(
    elements.filter((element) => element.kind === "visual").length,
    2,
  );
});

test("buildSlideElementsFromContent cascades 3+ visuals into offset tiles", async () => {
  const { buildSlideElementsFromContent } = await import("./deck");
  const elements = buildSlideElementsFromContent({
    id: "test-id",
    index: 0,
    title: "",
    bullets: [],
    visualIds: ["vis-a", "vis-b", "vis-c"],
    layout: "media",
    notes: "",
  });

  const visuals = elements.filter((e) => e.kind === "visual");
  // One element per source visual, in source order (no dedupe, no drop).
  assert.equal(visuals.length, 3);
  assert.deepEqual(
    visuals.map((e) => (e.kind === "visual" ? elementContent(e).visualId : null)),
    ["vis-a", "vis-b", "vis-c"],
  );

  // The first visual is the hero box; the rest tile with a growing offset so
  // they remain individually grabbable rather than perfectly overlapping.
  const [hero, second, third] = visuals;
  assert.ok(second.box.x > hero.box.x);
  assert.ok(third.box.x > second.box.x);
  assert.ok(third.box.y > second.box.y);

  // zIndices are unique and strictly increasing in paint order.
  const zs = elements.map((e) => e.zIndex);
  assert.deepEqual(
    zs,
    [...zs].sort((a, b) => a - b),
  );
  assert.equal(new Set(zs).size, zs.length);

  // ids are unique across the cascade.
  const ids = elements.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);

  // Every tile stays within the 0–100 percent slide bounds.
  for (const v of visuals) {
    assert.ok(v.box.x >= 0 && v.box.x + v.box.w <= 100);
    assert.ok(v.box.y >= 0 && v.box.y + v.box.h <= 100);
  }
});

test("buildSlideElementsFromContent tiles extra visuals alongside bullets", async () => {
  const { buildSlideElementsFromContent } = await import("./deck");
  const elements = buildSlideElementsFromContent({
    id: "test-id",
    index: 0,
    title: "T",
    bullets: ["a", "b"],
    visualIds: ["vis-1", "vis-2", "vis-3"],
    layout: "content",
    notes: "",
  });

  // The bullets keep their pane; every visual still materializes (1 paired +
  // 2 cascaded), preserving source order.
  assert.equal(
    elements.filter((e) => e.kind === "text" && (e as any).role === "bullet").length,
    1,
  );
  const visuals = elements.filter((e) => e.kind === "visual");
  assert.deepEqual(
    visuals.map((e) => (e.kind === "visual" ? elementContent(e).visualId : null)),
    ["vis-1", "vis-2", "vis-3"],
  );

  const zs = elements.map((e) => e.zIndex);
  assert.equal(new Set(zs).size, zs.length);
});

// ---------------------------------------------------------------------------
// buildVisualElement — centered visual insert for the "Insert visual" picker
// ---------------------------------------------------------------------------

test("buildVisualElement: centered box, kind, and visualId; no zIndex", () => {
  const element = buildVisualElement("vis-1");
  assert.equal(element.kind, "visual");
  assert.equal(elementContent(element).visualId, "vis-1");
  assert.deepEqual(element.box, DEFAULT_VISUAL_BOX);
  assert.ok(typeof element.id === "string" && element.id.length > 0);
  // zIndex is assigned by addElement, so it must not be baked in here.
  assert.ok(!("zIndex" in element));
  // No restyle by default — the visual renders in its document style.
  assert.ok(!("styleThemeId" in element));
});

test("buildVisualElement: default box is fully on-slide (0–100, fits)", () => {
  const { x, y, w, h } = DEFAULT_VISUAL_BOX;
  assert.ok(x >= 0 && y >= 0);
  assert.ok(w > 0 && h > 0);
  assert.ok(x + w <= 100);
  assert.ok(y + h <= 100);
});

test("buildVisualElement: default box is horizontally and vertically centered", () => {
  const { x, w, y, h } = DEFAULT_VISUAL_BOX;
  // Equal left/right and top/bottom margins → centered placement.
  assert.equal(x, 100 - (x + w));
  assert.equal(y, 100 - (y + h));
});

test("buildVisualElement: honors explicit id, box, and styleThemeId", () => {
  const box = { x: 10, y: 10, w: 20, h: 20 };
  const element = buildVisualElement("vis-2", {
    id: "fixed-id",
    box,
    styleThemeId: "ocean",
  });
  assert.equal(element.id, "fixed-id");
  assert.deepEqual(element.box, box);
  assert.equal(elementContent(element).styleThemeId, "ocean");
});

test("buildVisualElement: generates unique ids across calls", () => {
  const a = buildVisualElement("vis");
  const b = buildVisualElement("vis");
  assert.notEqual(a.id, b.id);
});

// ---------------------------------------------------------------------------
// Visual element styleThemeId survives schema validation (render parity)
// ---------------------------------------------------------------------------

test("safeParseDeck: preserves a visual element's styleThemeId", () => {
  const deck = {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "",
        notes: "",
        elements: [
          {
            id: "v1",
            kind: "visual" as const,
            role: "visual",
            zIndex: 0,
            box: { x: 25, y: 18, w: 50, h: 64 },
            content: { kind: "visual", visualId: "vis-1", styleThemeId: "forest" },
          },
        ],
      },
    ],
  };
  const parsed = safeParseDeck(deck);
  assert.ok(parsed.success);
  const element = parsed.data.slides[0].elements?.[0];
  assert.ok(element && element.kind === "visual");
  assert.equal(
    element.kind === "visual" ? elementContent(element).styleThemeId : undefined,
    "forest",
  );
});

test("safeParseDeck: omits styleThemeId when absent", () => {
  const deck = {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "",
        notes: "",
        elements: [
          {
            id: "v1",
            kind: "visual" as const,
            role: "visual",
            zIndex: 0,
            box: { x: 25, y: 18, w: 50, h: 64 },
            content: { kind: "visual", visualId: "vis-1" },
          },
        ],
      },
    ],
  };
  const parsed = safeParseDeck(deck);
  assert.ok(parsed.success);
  const element = parsed.data.slides[0].elements?.[0];
  assert.ok(element && element.kind === "visual");
  assert.ok(!("styleThemeId" in elementContent(element)));
});

// ---------------------------------------------------------------------------
// Rich-text runs (issue #210)
// ---------------------------------------------------------------------------

function h2Rich(text: string, runs: import("./deck").TextRun[]): DocumentBlock {
  return { kind: "text", blockType: "heading", level: 2, text, runs };
}

function paraRich(
  text: string,
  runs: import("./deck").TextRun[],
): DocumentBlock {
  return { kind: "text", blockType: "paragraph", text, runs };
}

test("buildDeckFromBlocks threads title runs onto the slide", () => {
  const deck = buildDeckFromBlocks([
    h2Rich("Bold Title", [{ text: "Bold Title", bold: true }]),
    para("plain body"),
  ]);
  const slide = deck.slides[0];
  assert.equal(slide.title, "Bold Title");
  assert.deepEqual(elementContent(firstTextElement(slide)).runs, [
    { text: "Bold Title", bold: true },
  ]);
});

test("buildDeckFromBlocks keeps bulletRuns parallel to bullets", () => {
  const deck = buildDeckFromBlocks([
    h2("Section"),
    para("plain one"),
    paraRich("rich two", [{ text: "rich " }, { text: "two", italic: true }]),
  ]);
  const slide = deck.slides[0];
  assert.deepEqual(slideBullets(slide), ["plain one", "rich two"]);
  assert.equal(slideBulletRuns(slide).length, 2);
  assert.deepEqual(slideBulletRuns(slide)[0], undefined);
  assert.deepEqual(slideBulletRuns(slide)[1], [
    { text: "rich " },
    { text: "two", italic: true },
  ]);
});

test("buildDeckFromBlocks omits runs entirely for a plain document", () => {
  const deck = buildDeckFromBlocks([h2("Plain"), para("a"), para("b")]);
  const slide = deck.slides[0];
  assert.equal(elementContent(firstTextElement(slide)).runs, undefined);
  assert.deepEqual(slideBulletRuns(slide), [undefined, undefined]);
});

test("buildSlideElementsFromContent copies titleRuns and bulletRuns to elements", async () => {
  const { buildSlideElementsFromContent } = await import("./deck");
  const elements = buildSlideElementsFromContent({
    id: "test-id",
    index: 0,
    title: "Title",
    titleRuns: [{ text: "Title", bold: true }],
    bullets: ["one", "two"],
    bulletRuns: [[], [{ text: "two", italic: true }]],
    visualIds: [],
    layout: "content",
    notes: "",
  });
  const title = elements.find((e) => e.kind === "text");
  assert.ok(title && title.kind === "text");
  if (title.kind === "text") {
    assert.deepEqual(elementContent(title).runs, [
      { text: "Title", bold: true },
    ]);
  }
  const bullets = elements.find(
    (e) => e.kind === "text" && (e as any).role === "bullet",
  );
  assert.ok(bullets && bullets.kind === "text");
  if (bullets.kind === "text") {
    assert.deepEqual(
      elementContent(bullets).paragraphs?.map((paragraph: any) => paragraph.runs),
      [undefined, [{ text: "two", italic: true }]],
    );
  }
});

test("a deck with runs round-trips through the schema", () => {
  const deck = buildDeckFromBlocks([
    h2Rich("Rich", [{ text: "Rich", bold: true }]),
    paraRich("body", [{ text: "body", italic: true }]),
  ]);
  const parsed = safeParseDeck(deck);
  assert.ok(parsed.success);
  if (parsed.success) {
    const slide = parsed.data.slides[0];
    assert.deepEqual(elementContent(firstTextElement(slide)).runs, [
      { text: "Rich", bold: true },
    ]);
    assert.deepEqual(slideBulletRuns(slide)[0], [
      { text: "body", italic: true },
    ]);
  }
});

// ---------------------------------------------------------------------------
// makeElementId — stateless, SSR-safe unique id generator
// ---------------------------------------------------------------------------

test("makeElementId returns an id with the el- shape", async () => {
  const { makeElementId } = await import("./deck");
  const id = makeElementId();
  assert.equal(typeof id, "string");
  assert.ok(id.startsWith("el-"));
  // Some unique payload follows the prefix.
  assert.ok(id.length > "el-".length);
});

test("makeElementId returns unique ids across many calls", async () => {
  const { makeElementId } = await import("./deck");
  const ids = new Set<string>();
  for (let i = 0; i < 10_000; i++) {
    ids.add(makeElementId());
  }
  assert.equal(ids.size, 10_000);
});

test("makeElementId holds no module-level state (order-independent)", async () => {
  // Re-importing must not reset or rely on a shared counter: two ids generated
  // back-to-back are simply distinct, never a predictable sequence like el-0/el-1.
  const { makeElementId } = await import("./deck");
  const a = makeElementId();
  const b = makeElementId();
  assert.notEqual(a, b);
  assert.ok(!/^el-0$/.test(a));
  assert.ok(!/^el-1$/.test(b));
});

// ---------------------------------------------------------------------------
// normalizeTextParagraphs — multi-level list paragraphs (#335)
// ---------------------------------------------------------------------------

test("normalizeTextParagraphs returns paragraphs[] as-is when present", async () => {
  const { normalizeTextParagraphs } = await import("./deck");
  const el = {
    id: "b",
    kind: "text" as const,
    text: "fallback",
    paragraphs: [
      { text: "First", indent: 0, listType: "bullet" as const },
      { text: "Second", indent: 1, listType: "number" as const },
    ],
    zIndex: 0,
    box: { x: 0, y: 0, w: 10, h: 10 },
    style: { fontSize: 4, bold: false, italic: false, align: "left" as const },
  };
  const result = normalizeTextParagraphs(el);
  assert.equal(result.length, 2);
  assert.equal(result[0].text, "First");
  assert.equal(result[0].indent, 0);
  assert.equal(result[1].text, "Second");
  assert.equal(result[1].indent, 1);
  assert.equal(result[1].listType, "number");
});

test("normalizeTextParagraphs returns empty current paragraphs", async () => {
  const { normalizeTextParagraphs } = await import("./deck");
  const el = {
    id: "b",
    kind: "text" as const,
    text: "",
    paragraphs: [],
    zIndex: 0,
    box: { x: 0, y: 0, w: 10, h: 10 },
    style: { fontSize: 4, bold: false, italic: false, align: "left" as const },
  };
  const result = normalizeTextParagraphs(el);
  assert.equal(result.length, 0);
});

test("buildSlideElementsFromContent stamps semantic textRole h1/bullet (#610)", async () => {
  const { buildSlideElementsFromContent } = await import("./deck");
  const elements = buildSlideElementsFromContent({
    id: "test-id",
    index: 0,
    title: "Title",
    bullets: ["a", "b"],
    visualIds: [],
    layout: "content",
    notes: "",
  });
  const title = elements.find((e) => e.kind === "text");
  const bullets = elements.find(
    (e) => e.kind === "text" && (e as any).role === "bullet",
  );
  assert.equal(title?.kind === "text" ? (title as any).role : undefined, "title");
  assert.equal(bullets?.kind === "text" ? (bullets as any).role : undefined, "bullet");
});
