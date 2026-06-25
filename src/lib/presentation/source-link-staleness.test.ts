import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  Deck,
  Slide,
  SlideElement,
  TextElement,
  VisualElement,
  SourceRef,
} from "@/lib/presentation/deck";
import { unlinkSource } from "@/lib/presentation/deck";
import type { DocumentBlock, DocumentTextBlock } from "@/lib/content";
import type { Visual } from "@/lib/visual/schema";
import { hashDocumentBlock } from "@/lib/presentation/document-block-hash";
import {
  findStaleSourceLinks,
  updateTextElementFromBlock,
  updateVisualElementFromBlock,
  buildRefreshSourceRef,
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
      blockKind: "text",
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

function slide(id: string, elements: SlideElement[]): Slide {
  return {
    id,
    index: 0,
    title: "Slide",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    elements,
  };
}

function deck(...slides: Slide[]): Deck {
  return {
    slides: slides.map((s, i) => ({ ...s, index: i })),
    themeId: "indigo",
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
      blockKind: "text",
      // contentHash intentionally absent
    },
  };
  const d = deck(slide("s1", [el]));
  const result = findStaleSourceLinks(d, [textBlock("blk-1", "changed text")]);
  assert.deepEqual(result, []);
});

test("ignores fresh blocks without a blockId (cannot be matched)", () => {
  const noIdBlock = textBlockNoId("Some text");
  const d = deck(slide("s1", [linkedElement("el-1", "blk-1", "oldhash")]));
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
      linkedElement("e1", "k1", "hash-of-gone"), // k1 will be missing
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
    // elements is absent
  };
  const d: Deck = { slides: [slideNoElements], themeId: "indigo" };
  const result = findStaleSourceLinks(d, []);
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// Visual source staleness (#424)
// ---------------------------------------------------------------------------

const FAKE_VISUAL = { type: "chart" } as unknown as Visual;

function visualBlock(visualId: string): DocumentBlock {
  return { kind: "visual", visualId, visual: FAKE_VISUAL };
}

function linkedVisualElement(
  id: string,
  visualId: string,
  contentHash: string,
  overrides: Partial<VisualElement["sourceRef"]> = {},
): VisualElement {
  return {
    id,
    kind: "visual",
    visualId,
    box: { x: 25, y: 18, w: 50, h: 64 },
    zIndex: 0,
    sourceRef: {
      documentId: "doc-1",
      blockId: visualId,
      contentHash,
      linkedAt: "2026-01-01T00:00:00.000Z",
      blockKind: "visual",
      ...overrides,
    },
  };
}

test("visual: returns empty when visual hash matches", () => {
  const block = visualBlock("vis-1");
  const hash = hashDocumentBlock(block);
  const el = linkedVisualElement("el-v1", "vis-1", hash);
  const d = deck(slide("s1", [el]));
  const result = findStaleSourceLinks(d, [block]);
  assert.deepEqual(result, []);
});

test("visual: detects block_missing when visual not in freshBlocks", () => {
  const el = linkedVisualElement("el-v1", "vis-gone", "oldhash");
  const d = deck(slide("s1", [el]));
  const result = findStaleSourceLinks(d, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].reason, "block_missing");
  assert.equal(result[0].blockKind, "visual");
  assert.equal(result[0].blockId, "vis-gone");
  assert.equal(result[0].elementId, "el-v1");
});

test("visual: detects content_changed when hash differs", () => {
  const block1 = visualBlock("vis-1");
  const hash1 = hashDocumentBlock(block1);
  // Simulate a different visual with the same id by re-creating the block
  // (in practice the hash changes when the visual's identity changes, which
  // is encoded in the signature as visual\x02{visualId}).
  // For a forced hash mismatch we just pass a stale hash.
  const el = linkedVisualElement("el-v1", "vis-1", "stale-hash");
  const d = deck(slide("s1", [el]));
  const result = findStaleSourceLinks(d, [block1]);
  assert.equal(result.length, 1);
  assert.equal(result[0].reason, "content_changed");
  assert.equal(result[0].blockKind, "visual");
  assert.equal(hash1, hashDocumentBlock(block1)); // sanity
});

test("visual: ignores visual with unlinked === true", () => {
  const block = visualBlock("vis-1");
  const hash = hashDocumentBlock(block);
  const el = linkedVisualElement("el-v1", "vis-1", hash, { unlinked: true });
  const d = deck(slide("s1", [el]));
  const result = findStaleSourceLinks(d, [block]);
  assert.deepEqual(result, []);
});

test("visual: ignores visual sourceRef with no contentHash", () => {
  const el: VisualElement = {
    id: "el-no-hash",
    kind: "visual",
    visualId: "vis-1",
    box: { x: 25, y: 18, w: 50, h: 64 },
    zIndex: 0,
    sourceRef: {
      documentId: "doc-1",
      blockId: "vis-1",
      linkedAt: "2026-01-01T00:00:00.000Z",
      blockKind: "visual",
      // contentHash intentionally absent
    },
  };
  const d = deck(slide("s1", [el]));
  const result = findStaleSourceLinks(d, [visualBlock("vis-1")]);
  assert.deepEqual(result, []);
});

test("visual: sourceRef with blockKind=text is treated as text", () => {
  const textBlock: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "hello",
    blockId: "vis-1", // same as visual id — but looked up as text
  };
  const el: VisualElement = {
    id: "el-text-kind",
    kind: "visual",
    visualId: "vis-1",
    box: { x: 25, y: 18, w: 50, h: 64 },
    zIndex: 0,
    sourceRef: {
      documentId: "doc-1",
      blockId: "vis-1",
      contentHash: hashDocumentBlock(textBlock),
      linkedAt: "2026-01-01T00:00:00.000Z",
      blockKind: "text",
    },
  };
  const d = deck(slide("s1", [el]));
  // Pass a fresh text block with matching hash → not stale
  const result = findStaleSourceLinks(d, [textBlock]);
  assert.deepEqual(result, []);
});

test("blockKind is carried through on each stale entry", () => {
  const textEl = linkedElement("te1", "blk-1", "stale-hash-text");
  const visEl = linkedVisualElement("ve1", "vis-1", "stale-hash-vis");
  const d = deck(slide("s1", [textEl, visEl]));
  const result = findStaleSourceLinks(d, []);
  assert.equal(result.length, 2);
  const byEl = Object.fromEntries(
    result.map((r) => [r.elementId, r.blockKind]),
  );
  assert.equal(byEl["te1"], "text");
  assert.equal(byEl["ve1"], "visual");
});

// ---------------------------------------------------------------------------
// #408 action helpers: updateTextElementFromBlock
// ---------------------------------------------------------------------------

test("updateTextElementFromBlock: updates text and runs, preserves geometry", () => {
  const original = textBlock("blk-1", "Original text");
  const originalHash = hashDocumentBlock(original);
  const el = linkedElement("el-1", "blk-1", originalHash);

  const fresh: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "Updated text",
    blockId: "blk-1",
    runs: [{ text: "Updated text", bold: true }],
  };
  const freshHash = hashDocumentBlock(fresh);
  const newRef = buildRefreshSourceRef(
    el.sourceRef!,
    "blk-1",
    freshHash,
    "2026-06-01T00:00:00.000Z",
    "text",
  );

  const updated = updateTextElementFromBlock(el, fresh, newRef);

  assert.equal(updated.text, "Updated text");
  assert.deepEqual(updated.runs, [{ text: "Updated text", bold: true }]);
  // Geometry preserved:
  assert.deepEqual(updated.box, el.box);
  assert.equal(updated.zIndex, el.zIndex);
  assert.deepEqual(updated.style, el.style);
  assert.equal(updated.id, el.id);
  assert.equal(updated.role, el.role);
  // sourceRef updated:
  assert.equal(updated.sourceRef!.contentHash, freshHash);
  assert.equal(updated.sourceRef!.linkedAt, "2026-06-01T00:00:00.000Z");
  assert.equal(updated.sourceRef!.unlinked, undefined);
});

test("updateTextElementFromBlock: clears runs when fresh block has no runs", () => {
  const el = linkedElement("el-1", "blk-1", "oldhash");
  const fresh: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "Plain text",
    blockId: "blk-1",
    // no runs
  };
  const newRef = buildRefreshSourceRef(
    el.sourceRef!,
    "blk-1",
    hashDocumentBlock(fresh),
    "2026-06-01T00:00:00.000Z",
    "text",
  );
  const updated = updateTextElementFromBlock(el, fresh, newRef);
  assert.equal(updated.text, "Plain text");
  assert.equal(updated.runs, undefined);
});

test("updateTextElementFromBlock: clears unlinked flag", () => {
  const el = linkedElement("el-1", "blk-1", "oldhash", { unlinked: true });
  const fresh: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "Fresh",
    blockId: "blk-1",
  };
  const newRef = buildRefreshSourceRef(
    el.sourceRef!,
    "blk-1",
    hashDocumentBlock(fresh),
    "2026-06-01T00:00:00.000Z",
    "text",
  );
  const updated = updateTextElementFromBlock(el, fresh, newRef);
  assert.equal(updated.sourceRef!.unlinked, undefined);
});

// ---------------------------------------------------------------------------
// #408 action helpers: updateVisualElementFromBlock + buildRefreshSourceRef
// ---------------------------------------------------------------------------

test("updateVisualElementFromBlock: updates visualId and sourceRef, preserves geometry", () => {
  const el = linkedVisualElement("el-v1", "vis-old", "oldhash");
  const newRef: SourceRef = {
    documentId: "doc-1",
    blockId: "vis-new",
    contentHash: "newhash",
    linkedAt: "2026-06-01T00:00:00.000Z",
    blockKind: "visual",
  };
  const updated = updateVisualElementFromBlock(el, newRef);

  assert.equal(updated.visualId, "vis-new");
  assert.equal(updated.sourceRef!.blockId, "vis-new");
  assert.equal(updated.sourceRef!.contentHash, "newhash");
  assert.equal(updated.sourceRef!.unlinked, undefined);
  // Geometry preserved:
  assert.deepEqual(updated.box, el.box);
  assert.equal(updated.zIndex, el.zIndex);
  assert.equal(updated.id, el.id);
});

test("buildRefreshSourceRef: carries documentId and blockKind", () => {
  const existing: SourceRef = {
    documentId: "doc-abc",
    blockId: "old-block",
    contentHash: "oldhash",
    linkedAt: "2026-01-01T00:00:00.000Z",
    blockKind: "text",
  };
  const ref = buildRefreshSourceRef(
    existing,
    "new-block",
    "newhash",
    "2026-06-01T00:00:00.000Z",
    "text",
  );
  assert.equal(ref.documentId, "doc-abc");
  assert.equal(ref.blockId, "new-block");
  assert.equal(ref.contentHash, "newhash");
  assert.equal(ref.linkedAt, "2026-06-01T00:00:00.000Z");
  assert.equal(ref.blockKind, "text");
  assert.equal(ref.unlinked, undefined);
});

// ---------------------------------------------------------------------------
// #410 orphan handling: block_missing is never auto-deleted
// ---------------------------------------------------------------------------

test("orphan (#410): block_missing elements remain in deck after sync", () => {
  // This test validates the invariant: findStaleSourceLinks reports orphans,
  // but the caller decides whether to delete them — the library never does.
  const el = linkedElement("el-orphan", "blk-deleted", "somehash");
  const d = deck(slide("s1", [el]));
  // Fresh blocks don't include "blk-deleted" anymore.
  const stale = findStaleSourceLinks(d, []);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].reason, "block_missing");
  // The deck itself is unchanged — we only got a report, no mutation.
  assert.equal(d.slides[0].elements?.length, 1);
  assert.equal(d.slides[0].elements?.[0].id, "el-orphan");
});

test("orphan (#410): after unlinking, orphaned element no longer appears stale", () => {
  const el = linkedElement("el-orphan", "blk-deleted", "somehash");
  const unlinkedEl = unlinkSource(el);
  const d = deck(slide("s1", [unlinkedEl]));
  const stale = findStaleSourceLinks(d, []);
  // Unlinked elements are ignored — the orphan badge clears after unlinking.
  assert.deepEqual(stale, []);
});
