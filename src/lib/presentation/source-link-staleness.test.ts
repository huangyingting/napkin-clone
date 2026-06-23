import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement, TextElement } from "@/lib/presentation/deck";
import type { DocumentBlock, DocumentTextBlock } from "@/lib/visual/document-export";
import { hashDocumentBlock } from "@/lib/presentation/document-block-hash";
import {
  findStaleSourceLinks,
  type StaleSourceLink,
} from "./source-link-staleness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function textBlock(
  blockId: string,
  text: string,
  overrides: Partial<DocumentTextBlock> = {},
): DocumentTextBlock {
  return { kind: "text", blockType: "paragraph", text, blockId, ...overrides };
}

function textBlockNoId(text: string): DocumentTextBlock {
  return { kind: "text", blockType: "paragraph", text };
}

function linkedElement(
  id: string,
  blockId: string,
  contentHash: string,
  overrides: Partial<TextElement["sourceRef"]> = {},
): TextElement {
  return {
    id,
    kind: "text",
    role: "body",
    text: "slide text",
    box: { x: 0, y: 0, w: 50, h: 20 },
    zIndex: 0,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
    sourceRef: {
      documentId: "doc-1",
      blockId,
      contentHash,
      linkedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
  };
}

function unlinkedElement(id: string): TextElement {
  return {
    id,
    kind: "text",
    role: "body",
    text: "slide text",
    box: { x: 0, y: 0, w: 50, h: 20 },
    zIndex: 0,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
  };
}

function slide(
  id: string,
  elements: SlideElement[],
): Slide {
  return {
    id,
    index: 0,
    title: "Slide",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "indigo",
    elements,
  };
}

function deck(...slides: Slide[]): Deck {
  return {
    slides: slides.map((s, i) => ({ ...s, index: i })),
    theme: "indigo",
  };
}

// ---------------------------------------------------------------------------
// findStaleSourceLinks — matching hash (no staleness)
// ---------------------------------------------------------------------------

test("returns empty array when deck has no slides with elements", () => {
  const d = deck(slide("s1", []));
  const result = findStaleSourceLinks(d, []);
  assert.deepEqual(result, []);
});

test("returns empty array when all linked elements match fresh blocks", () => {
  const block = textBlock("blk-1", "Hello world");
  const hash = hashDocumentBlock(block);
  const d = deck(slide("s1", [linkedElement("el-1", "blk-1", hash)]));
  const result = findStaleSourceLinks(d, [block]);
  assert.deepEqual(result, []);
});

test("returns empty array when source links are present but hash matches", () => {
  const b1 = textBlock("k1", "Intro text");
  const b2 = textBlock("k2", "Body text");
  const d = deck(
    slide("s1", [
      linkedElement("e1", "k1", hashDocumentBlock(b1)),
      linkedElement("e2", "k2", hashDocumentBlock(b2)),
    ]),
  );
  const result = findStaleSourceLinks(d, [b1, b2]);
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// content_changed
// ---------------------------------------------------------------------------

test("detects content_changed when fresh block text differs from contentHash", () => {
  const originalBlock = textBlock("blk-1", "Original text");
  const originalHash = hashDocumentBlock(originalBlock);
  const changedBlock = textBlock("blk-1", "Updated text"); // same blockId, different content

  const d = deck(slide("s1", [linkedElement("el-1", "blk-1", originalHash)]));
  const result = findStaleSourceLinks(d, [changedBlock]);

  assert.equal(result.length, 1);
  const link = result[0];
  assert.equal(link.slideId, "s1");
  assert.equal(link.elementId, "el-1");
  assert.equal(link.blockId, "blk-1");
  assert.equal(link.reason, "content_changed");
});

test("detects content_changed for heading blocks", () => {
  const original: DocumentTextBlock = {
    kind: "text",
    blockType: "heading",
    level: 1,
    text: "Introduction",
    blockId: "h-1",
  };
  const changed: DocumentTextBlock = {
    kind: "text",
    blockType: "heading",
    level: 1,
    text: "Introduction (Revised)",
    blockId: "h-1",
  };
  const d = deck(
    slide("s1", [linkedElement("el-h", "h-1", hashDocumentBlock(original))]),
  );
  const result = findStaleSourceLinks(d, [changed]);
  assert.equal(result.length, 1);
  assert.equal(result[0].reason, "content_changed");
});

// ---------------------------------------------------------------------------
// block_missing
// ---------------------------------------------------------------------------

test("detects block_missing when blockId is not in freshBlocks", () => {
  const d = deck(slide("s1", [linkedElement("el-1", "blk-gone", "oldhash")]));
  const result = findStaleSourceLinks(d, [textBlock("blk-other", "Unrelated")]);
  assert.equal(result.length, 1);
  assert.equal(result[0].reason, "block_missing");
  assert.equal(result[0].blockId, "blk-gone");
});

test("detects block_missing when freshBlocks is empty", () => {
  const d = deck(slide("s1", [linkedElement("el-1", "blk-1", "somehash")]));
  const result = findStaleSourceLinks(d, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].reason, "block_missing");
});

// ---------------------------------------------------------------------------
// ignoring unlinked / no sourceRef
// ---------------------------------------------------------------------------

test("ignores elements without a sourceRef", () => {
  const d = deck(slide("s1", [unlinkedElement("plain")]));
  const result = findStaleSourceLinks(d, []);
  assert.deepEqual(result, []);
});

test("ignores elements with sourceRef.unlinked === true", () => {
  const block = textBlock("blk-1", "text");
  const hash = hashDocumentBlock(block);
  const d = deck(
    slide("s1", [linkedElement("el-1", "blk-1", hash, { unlinked: true })]),
  );
  const result = findStaleSourceLinks(d, [block]);
  assert.deepEqual(result, []);
});

test("ignores sourceRef without contentHash", () => {
  const el: TextElement = {
    id: "el-no-hash",
    kind: "text",
    role: "body",
    text: "text",
    box: { x: 0, y: 0, w: 50, h: 20 },
    zIndex: 0,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
    sourceRef: {
      documentId: "doc-1",
      blockId: "blk-1",
      linkedAt: "2026-01-01T00:00:00.000Z",
      // contentHash intentionally absent
    },
  };
  const d = deck(slide("s1", [el]));
  const result = findStaleSourceLinks(d, [textBlock("blk-1", "changed text")]);
  assert.deepEqual(result, []);
});

test("ignores fresh blocks without a blockId (cannot be matched)", () => {
  const noIdBlock = textBlockNoId("Some text");
  const d = deck(
    slide("s1", [linkedElement("el-1", "blk-1", "oldhash")]),
  );
  // freshBlocks only has a block without blockId — should not match
  const result = findStaleSourceLinks(d, [noIdBlock]);
  assert.equal(result.length, 1);
  assert.equal(result[0].reason, "block_missing"); // can't find blk-1
});

// ---------------------------------------------------------------------------
// multi-slide cases
// ---------------------------------------------------------------------------

test("checks elements across all slides", () => {
  const b1 = textBlock("k1", "Slide one text");
  const b2 = textBlock("k2", "Slide two text");
  const changedB2 = textBlock("k2", "Changed text");

  const d = deck(
    slide("s1", [linkedElement("e1", "k1", hashDocumentBlock(b1))]),
    slide("s2", [linkedElement("e2", "k2", hashDocumentBlock(b2))]),
  );
  const result = findStaleSourceLinks(d, [b1, changedB2]);
  assert.equal(result.length, 1);
  assert.equal(result[0].slideId, "s2");
  assert.equal(result[0].elementId, "e2");
  assert.equal(result[0].reason, "content_changed");
});

test("reports stale links from multiple slides when all are stale", () => {
  const d = deck(
    slide("s1", [linkedElement("e1", "k1", "h1")]),
    slide("s2", [linkedElement("e2", "k2", "h2")]),
  );
  const result = findStaleSourceLinks(d, []);
  assert.equal(result.length, 2);
  const slideIds = result.map((r) => r.slideId).sort();
  assert.deepEqual(slideIds, ["s1", "s2"]);
});

test("reports multiple stale elements on a single slide", () => {
  const d = deck(
    slide("s1", [
      linkedElement("e1", "k1", "old1"),
      linkedElement("e2", "k2", "old2"),
    ]),
  );
  const result = findStaleSourceLinks(d, []);
  assert.equal(result.length, 2);
  const elementIds = result.map((r) => r.elementId).sort();
  assert.deepEqual(elementIds, ["e1", "e2"]);
});

test("mixes missing and changed in the same slide", () => {
  const b2 = textBlock("k2", "Body");
  const changedB2 = textBlock("k2", "Changed body");

  const d = deck(
    slide("s1", [
      linkedElement("e1", "k1", "hash-of-gone"),   // k1 will be missing
      linkedElement("e2", "k2", hashDocumentBlock(b2)), // k2 changed
    ]),
  );
  const result: StaleSourceLink[] = findStaleSourceLinks(d, [changedB2]);
  assert.equal(result.length, 2);
  const byEl = Object.fromEntries(result.map((r) => [r.elementId, r.reason]));
  assert.equal(byEl["e1"], "block_missing");
  assert.equal(byEl["e2"], "content_changed");
});

test("slides without elements array are skipped gracefully", () => {
  const slideNoElements: Slide = {
    id: "s-no-el",
    index: 0,
    title: "No elements",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "indigo",
    // elements is absent
  };
  const d: Deck = { slides: [slideNoElements], theme: "indigo" };
  const result = findStaleSourceLinks(d, []);
  assert.deepEqual(result, []);
});
