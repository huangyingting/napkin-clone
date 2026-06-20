import assert from "node:assert/strict";
import { test } from "node:test";

import type { DocumentBlock } from "@/lib/visual/document-export";
import { buildDeckFromBlocks, MAX_BULLETS } from "./deck";

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

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

test("empty input yields a single blank slide", () => {
  const deck = buildDeckFromBlocks([]);
  assert.equal(deck.slides.length, 1);
  assert.equal(deck.slides[0].layout, "blank");
  assert.equal(deck.slides[0].title, "");
  assert.equal(deck.slides[0].bullets.length, 0);
  assert.equal(deck.slides[0].visualIds.length, 0);
});

test("theme is stamped on every slide", () => {
  const deck = buildDeckFromBlocks([h1("Title"), para("Body")], "ocean");
  assert.equal(deck.theme, "ocean");
  for (const slide of deck.slides) {
    assert.equal(slide.theme, "ocean");
  }
});

test("default theme is 'default'", () => {
  const deck = buildDeckFromBlocks([h1("Hi")]);
  assert.equal(deck.theme, "default");
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
  assert.equal(s.layout, "title");
});

test("h1 mid-document produces a section slide", () => {
  const deck = buildDeckFromBlocks([
    h1("Intro"),
    para("intro body"),
    h1("Chapter 2"),
  ]);
  const section = deck.slides.find((s) => s.title === "Chapter 2");
  assert.ok(section, "section slide should exist");
  assert.equal(section!.layout, "section");
});

test("h2 opens a content slide", () => {
  const deck = buildDeckFromBlocks([h1("Doc"), h2("Section A")]);
  const s = deck.slides.find((s) => s.title === "Section A");
  assert.ok(s);
  assert.equal(s!.layout, "content");
});

test("h3 opens a content slide", () => {
  const deck = buildDeckFromBlocks([h3("Sub-section")]);
  const s = deck.slides[0];
  assert.equal(s.title, "Sub-section");
  assert.equal(s.layout, "content");
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
  assert.deepEqual(slideA.bullets, ["a1"]);
  assert.deepEqual(slideB.bullets, ["b1"]);
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
  assert.deepEqual(s.bullets, ["point 1", "point 2"]);
});

test("list items become bullets", () => {
  const deck = buildDeckFromBlocks([
    h2("List slide"),
    item("Alpha"),
    item("Beta"),
  ]);
  const s = deck.slides.find((s) => s.title === "List slide")!;
  assert.deepEqual(s.bullets, ["Alpha", "Beta"]);
});

test(`surplus bullets (> ${MAX_BULLETS}) overflow to notes`, () => {
  const blocks: DocumentBlock[] = [h2("Long slide")];
  for (let i = 1; i <= MAX_BULLETS + 3; i++) blocks.push(para(`item ${i}`));
  const deck = buildDeckFromBlocks(blocks);
  const s = deck.slides.find((s) => s.title === "Long slide")!;
  assert.equal(s.bullets.length, MAX_BULLETS);
  assert.ok(s.notes.includes(`item ${MAX_BULLETS + 1}`));
  assert.ok(s.notes.includes(`item ${MAX_BULLETS + 3}`));
});

test("blank/empty paragraph text is ignored", () => {
  const deck = buildDeckFromBlocks([h2("Empty"), para("  "), para("  ")]);
  const s = deck.slides.find((s) => s.title === "Empty")!;
  assert.equal(s.bullets.length, 0);
});

// ---------------------------------------------------------------------------
// Quote → notes
// ---------------------------------------------------------------------------

test("quote blocks always go to notes, not bullets", () => {
  const deck = buildDeckFromBlocks([h2("With quote"), quote("A wise saying")]);
  const s = deck.slides.find((s) => s.title === "With quote")!;
  assert.equal(s.bullets.length, 0);
  assert.ok(s.notes.includes("A wise saying"));
});

// ---------------------------------------------------------------------------
// Visual attachment rules
// ---------------------------------------------------------------------------

test("visual attaches to current slide when it has no visual yet", () => {
  const deck = buildDeckFromBlocks([h2("Slide with visual"), visual("v1")]);
  const s = deck.slides.find((s) => s.title === "Slide with visual")!;
  assert.deepEqual(s.visualIds, ["v1"]);
});

test("second visual on same slide triggers its own media slide", () => {
  const deck = buildDeckFromBlocks([h2("Slide"), visual("v1"), visual("v2")]);
  const mediaSlide = deck.slides.find((s) => s.visualIds.includes("v2"));
  assert.ok(mediaSlide, "v2 should get its own slide");
  assert.equal(mediaSlide!.layout, "media");
  assert.notEqual(
    deck.slides.find((s) => s.visualIds.includes("v1")),
    mediaSlide,
  );
});

test("visual before any heading creates a preamble slide", () => {
  const deck = buildDeckFromBlocks([visual("v0"), h1("Title")]);
  const preamble = deck.slides.find((s) => s.visualIds.includes("v0"));
  assert.ok(preamble);
});

test("slide with only a visual gets media layout", () => {
  const deck = buildDeckFromBlocks([h2("Media only"), visual("v1")]);
  const s = deck.slides.find((s) => s.title === "Media only")!;
  assert.equal(s.layout, "media");
});

test("slide with visual and bullets gets content layout", () => {
  const deck = buildDeckFromBlocks([h2("Mixed"), para("point"), visual("v1")]);
  const s = deck.slides.find((s) => s.title === "Mixed")!;
  assert.equal(s.layout, "content");
  assert.deepEqual(s.bullets, ["point"]);
  assert.deepEqual(s.visualIds, ["v1"]);
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
  assert.deepEqual(first.bullets, ["content"]);
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
  assert.equal(deck.theme, "forest");
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
  assert.deepEqual(approach.bullets, ["Step 1", "Step 2"]);
  assert.deepEqual(approach.visualIds, ["fig-1"]);

  const results = deck.slides.find((s) => s.title === "Results")!;
  assert.deepEqual(results.bullets, ["We found X"]);
  assert.deepEqual(results.visualIds, ["fig-2"]);
});
