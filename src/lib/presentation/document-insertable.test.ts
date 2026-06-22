import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DocumentBlock,
  DocumentTextBlock,
} from "@/lib/visual/document-export";
import type { Visual } from "@/lib/visual/schema";

import {
  buildInsertables,
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
