import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DocumentBlock,
  DocumentTextBlock,
} from "@/lib/visual/document-export";
import type { Visual } from "@/lib/visual/schema";

import {
  buildInsertables,
  buildSourceRefFromBlock,
  insertableTextElement,
  type Insertable,
} from "./document-insertable";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function heading(text: string, level: 1 | 2 | 3): DocumentTextBlock {
  return { kind: "text", blockType: "heading", level, text };
}

function para(text: string, runs?: DocumentTextBlock["runs"]): DocumentBlock {
  return {
    kind: "text",
    blockType: "paragraph",
    text,
    ...(runs ? { runs } : {}),
  };
}

function hr(): DocumentBlock {
  return { kind: "text", blockType: "hr", text: "" };
}

const FAKE_VISUAL = { type: "chart" } as unknown as Visual;

function visual(visualId: string): DocumentBlock {
  return { kind: "visual", visualId, visual: FAKE_VISUAL };
}

function textItems(
  items: Insertable[],
): Extract<Insertable, { kind: "text" }>[] {
  return items.filter(
    (item): item is Extract<Insertable, { kind: "text" }> =>
      item.kind === "text",
  );
}

// ---------------------------------------------------------------------------
// buildInsertables
// ---------------------------------------------------------------------------

test("skips hr and empty / whitespace-only text blocks", () => {
  const blocks: DocumentBlock[] = [
    para("Real text"),
    hr(),
    para(""),
    para("   \n\t "),
    para("Another"),
  ];
  const items = buildInsertables(blocks);
  assert.deepEqual(
    items.map((i) => (i.kind === "text" ? i.text : i.visualId)),
    ["Real text", "Another"],
  );
});

test("dedupes visuals by visualId keeping the first occurrence", () => {
  const blocks: DocumentBlock[] = [
    visual("v1"),
    visual("v2"),
    visual("v1"),
    visual("v2"),
  ];
  const items = buildInsertables(blocks);
  assert.deepEqual(
    items.map((i) => (i.kind === "visual" ? i.visualId : null)),
    ["v1", "v2"],
  );
});

test("preserves document order across text and visuals", () => {
  const blocks: DocumentBlock[] = [
    heading("Title", 1),
    visual("v1"),
    para("Body"),
    visual("v2"),
  ];
  const items = buildInsertables(blocks);
  assert.deepEqual(
    items.map((i) => i.kind),
    ["text", "visual", "text", "visual"],
  );
});

test("truncates long text labels with an ellipsis but keeps full text", () => {
  const long =
    "This is a very long paragraph that easily exceeds the forty character label limit";
  const items = textItems(buildInsertables([para(long)]));
  assert.equal(items.length, 1);
  assert.ok(items[0].label.length <= 40);
  assert.ok(items[0].label.endsWith("…"));
  assert.equal(items[0].text, long);
});

test("does not truncate short labels", () => {
  const items = textItems(buildInsertables([para("Short line")]));
  assert.equal(items[0].label, "Short line");
});

test("marks heading blocks and carries level; paragraphs are not headings", () => {
  const items = textItems(buildInsertables([heading("H2", 2), para("Body")]));
  assert.equal(items[0].heading, true);
  assert.equal(items[0].level, 2);
  assert.equal(items[1].heading, false);
  assert.equal(items[1].level, undefined);
});

test("carries runs through only when present and non-empty", () => {
  const runs = [{ text: "Bold", bold: true }];
  const items = textItems(
    buildInsertables([para("Bold", runs), para("Plain")]),
  );
  assert.deepEqual(items[0].runs, runs);
  assert.equal(items[1].runs, undefined);
});

// ---------------------------------------------------------------------------
// insertableTextElement
// ---------------------------------------------------------------------------

test("maps a level-1 heading to a large bold title element", () => {
  const [item] = textItems(buildInsertables([heading("Hello", 1)]));
  const el = insertableTextElement(item, { id: "fixed" });
  assert.equal(el.id, "fixed");
  assert.equal(el.kind, "text");
  assert.equal(el.role, "title");
  assert.equal(el.text, "Hello");
  assert.equal(el.style.bold, true);
  assert.equal(el.style.fontSize, 6.5);
  assert.equal(el.style.italic, false);
  assert.equal(el.style.align, "left");
});

test("maps lower-level headings to bold body elements with smaller sizes", () => {
  const [h2] = textItems(buildInsertables([heading("H2", 2)]));
  const [h3] = textItems(buildInsertables([heading("H3", 3)]));
  assert.equal(insertableTextElement(h2).role, "body");
  assert.equal(insertableTextElement(h2).style.fontSize, 5.5);
  assert.equal(insertableTextElement(h2).style.bold, true);
  assert.equal(insertableTextElement(h3).style.fontSize, 5);
});

test("maps a paragraph to a non-bold body element at body size", () => {
  const [item] = textItems(buildInsertables([para("Body text")]));
  const el = insertableTextElement(item);
  assert.equal(el.role, "body");
  assert.equal(el.style.bold, false);
  assert.equal(el.style.fontSize, 4);
  assert.ok(el.id.length > 0);
});

test("passes runs through to the built element only when present", () => {
  const runs = [{ text: "Hi", italic: true }];
  const [withRuns] = textItems(buildInsertables([para("Hi", runs)]));
  const [plain] = textItems(buildInsertables([para("Plain")]));
  assert.deepEqual(insertableTextElement(withRuns).runs, runs);
  assert.equal(insertableTextElement(plain).runs, undefined);
});

// ---------------------------------------------------------------------------
// contentHash and blockId on Insertable (issue #377)
// ---------------------------------------------------------------------------

test("text insertables always carry a contentHash string", () => {
  const items = textItems(buildInsertables([para("Body"), heading("H1", 1)]));
  for (const item of items) {
    assert.equal(typeof item.contentHash, "string");
    assert.ok(item.contentHash.length > 0);
  }
});

test("contentHash is deterministic: same block same hash", () => {
  const [a] = textItems(buildInsertables([para("Stable")]));
  const [b] = textItems(buildInsertables([para("Stable")]));
  assert.equal(a.contentHash, b.contentHash);
});

test("contentHash differs for different block text", () => {
  const [a] = textItems(buildInsertables([para("Alpha")]));
  const [b] = textItems(buildInsertables([para("Beta")]));
  assert.notEqual(a.contentHash, b.contentHash);
});

test("contentHash differs for heading vs paragraph with same text", () => {
  const [h] = textItems(buildInsertables([heading("Intro", 1)]));
  const [p] = textItems(buildInsertables([para("Intro")]));
  assert.notEqual(h.contentHash, p.contentHash);
});

test("blockId is absent when block has no blockId", () => {
  const [item] = textItems(buildInsertables([para("No id")]));
  assert.equal(item.blockId, undefined);
});

test("blockId is carried through when block has a blockId", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "With id",
    blockId: "block-abc-123",
  };
  const [item] = textItems(buildInsertables([block]));
  assert.equal(item.blockId, "block-abc-123");
});

// ---------------------------------------------------------------------------
// buildSourceRefFromBlock
// ---------------------------------------------------------------------------

test("buildSourceRefFromBlock returns a valid SourceRef", () => {
  const ref = buildSourceRefFromBlock(
    "doc-1",
    "block-42",
    "a1b2c3d4",
    "2026-01-01T00:00:00.000Z",
  );
  assert.equal(ref.documentId, "doc-1");
  assert.equal(ref.blockId, "block-42");
  assert.equal(ref.contentHash, "a1b2c3d4");
  assert.equal(ref.linkedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(ref.unlinked, undefined);
});

// ---------------------------------------------------------------------------
// insertableTextElement sourceRef stamping (issue #377)
// ---------------------------------------------------------------------------

test("insertableTextElement omits sourceRef when documentId is absent", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "No doc id",
    blockId: "blk-1",
  };
  const [item] = textItems(buildInsertables([block]));
  const el = insertableTextElement(item);
  assert.equal(el.sourceRef, undefined);
});

test("insertableTextElement omits sourceRef when blockId is absent even with documentId", () => {
  const [item] = textItems(buildInsertables([para("No block id")]));
  const el = insertableTextElement(item, {
    documentId: "doc-1",
    linkedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(el.sourceRef, undefined);
});

test("insertableTextElement stamps sourceRef when documentId and blockId are both provided", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "Linked text",
    blockId: "blk-linked",
  };
  const [item] = textItems(buildInsertables([block]));
  const el = insertableTextElement(item, {
    documentId: "doc-xyz",
    linkedAt: "2026-06-01T12:00:00.000Z",
  });
  assert.ok(el.sourceRef !== undefined, "sourceRef should be set");
  assert.equal(el.sourceRef!.documentId, "doc-xyz");
  assert.equal(el.sourceRef!.blockId, "blk-linked");
  assert.equal(el.sourceRef!.linkedAt, "2026-06-01T12:00:00.000Z");
  assert.equal(typeof el.sourceRef!.contentHash, "string");
  assert.ok(el.sourceRef!.contentHash!.length > 0);
  assert.equal(el.sourceRef!.unlinked, undefined);
});

test("insertableTextElement sourceRef contentHash matches block contentHash", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "Consistent hash",
    blockId: "blk-hash",
  };
  const [item] = textItems(buildInsertables([block]));
  const el = insertableTextElement(item, {
    documentId: "doc-1",
    linkedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(el.sourceRef!.contentHash, item.contentHash);
});

test("insertableTextElement defaults linkedAt to now when documentId set but linkedAt omitted", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "Auto time",
    blockId: "blk-auto",
  };
  const before = Date.now();
  const [item] = textItems(buildInsertables([block]));
  const el = insertableTextElement(item, { documentId: "doc-1" });
  const after = Date.now();
  assert.ok(el.sourceRef !== undefined);
  const ts = Date.parse(el.sourceRef!.linkedAt);
  assert.ok(ts >= before && ts <= after, "linkedAt should be near now");
});

test("insertableTextElement heading stamps sourceRef when both ids present", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "heading",
    level: 2,
    text: "Section Title",
    blockId: "blk-h2",
  };
  const [item] = textItems(buildInsertables([block]));
  const el = insertableTextElement(item, {
    documentId: "doc-2",
    linkedAt: "2026-06-01T00:00:00.000Z",
  });
  assert.equal(el.sourceRef!.documentId, "doc-2");
  assert.equal(el.sourceRef!.blockId, "blk-h2");
  assert.equal(el.role, "body");
  assert.equal(el.style.bold, true);
});

