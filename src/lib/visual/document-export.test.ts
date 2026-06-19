import assert from "node:assert/strict";
import { test } from "node:test";

import type { Visual } from "@/lib/visual/schema";
import { collectDocumentBlocks } from "./document-export";

// ---------------------------------------------------------------------------
// Helpers matching the Lexical serialised JSON shapes the editor emits
// ---------------------------------------------------------------------------

function visual(id: string): Visual {
  return {
    version: 1,
    type: "flowchart",
    nodes: [{ id: `${id}-n1`, label: "Node" }],
    edges: [],
    style: {},
  } as unknown as Visual;
}

function visualNode(visualId: string) {
  return { type: "visual", visualId, visual: visual(visualId) };
}

function paragraph(text: string) {
  return {
    type: "paragraph",
    children: [{ type: "text", text }],
  };
}

function heading(level: 1 | 2 | 3, text: string) {
  return {
    type: "heading",
    tag: `h${level}`,
    children: [{ type: "text", text }],
  };
}

function quote(text: string) {
  return {
    type: "quote",
    children: [{ type: "text", text }],
  };
}

function listItem(text: string) {
  return {
    type: "listitem",
    children: [{ type: "text", text }],
  };
}

function list(items: string[]) {
  return {
    type: "list",
    tag: "ul",
    children: items.map(listItem),
  };
}

function hr() {
  return { type: "horizontalrule" };
}

function state(children: unknown[]): string {
  return JSON.stringify({ root: { type: "root", children } });
}

// ---------------------------------------------------------------------------
// collectDocumentBlocks
// ---------------------------------------------------------------------------

test("returns empty array for empty document", () => {
  assert.deepEqual(collectDocumentBlocks(state([])), []);
});

test("returns empty array for malformed input", () => {
  assert.deepEqual(collectDocumentBlocks("not json"), []);
  assert.deepEqual(collectDocumentBlocks(null), []);
  assert.deepEqual(collectDocumentBlocks(undefined), []);
  assert.deepEqual(collectDocumentBlocks({}), []);
});

test("collects a single paragraph", () => {
  const blocks = collectDocumentBlocks(state([paragraph("Hello world")]));
  assert.equal(blocks.length, 1);
  const block = blocks[0];
  assert.equal(block.kind, "text");
  if (block.kind === "text") {
    assert.equal(block.blockType, "paragraph");
    assert.equal(block.text, "Hello world");
  }
});

test("collects headings with correct levels", () => {
  const blocks = collectDocumentBlocks(
    state([heading(1, "Title"), heading(2, "Sub"), heading(3, "Sub-sub")]),
  );
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].kind, "text");
  assert.equal(blocks[1].kind, "text");
  assert.equal(blocks[2].kind, "text");
  if (blocks[0].kind === "text") assert.equal(blocks[0].level, 1);
  if (blocks[1].kind === "text") assert.equal(blocks[1].level, 2);
  if (blocks[2].kind === "text") assert.equal(blocks[2].level, 3);
});

test("collects a single visual (one visual case)", () => {
  const blocks = collectDocumentBlocks(state([visualNode("v1")]));
  assert.equal(blocks.length, 1);
  const block = blocks[0];
  assert.equal(block.kind, "visual");
  if (block.kind === "visual") {
    assert.equal(block.visualId, "v1");
    assert.equal(block.visual.type, "flowchart");
  }
});

test("handles zero visuals — only text blocks returned", () => {
  const blocks = collectDocumentBlocks(
    state([
      heading(1, "Title"),
      paragraph("First paragraph"),
      paragraph("Second paragraph"),
    ]),
  );
  assert.equal(blocks.length, 3);
  assert.ok(blocks.every((b) => b.kind === "text"));
});

test("handles many visuals preserving reading order", () => {
  const blocks = collectDocumentBlocks(
    state([
      heading(1, "Intro"),
      visualNode("a"),
      paragraph("Middle text"),
      visualNode("b"),
      heading(2, "Conclusion"),
      visualNode("c"),
    ]),
  );
  assert.equal(blocks.length, 6);
  const ids = blocks
    .filter((b) => b.kind === "visual")
    .map((b) => (b.kind === "visual" ? b.visualId : ""));
  assert.deepEqual(ids, ["a", "b", "c"]);
});

test("collects list items as listitem blocks", () => {
  const blocks = collectDocumentBlocks(
    state([list(["Apple", "Banana", "Cherry"])]),
  );
  assert.equal(blocks.length, 3);
  for (const block of blocks) {
    assert.equal(block.kind, "text");
    if (block.kind === "text") assert.equal(block.blockType, "listitem");
  }
  if (blocks[1].kind === "text") assert.equal(blocks[1].text, "Banana");
});

test("collects quote blocks", () => {
  const blocks = collectDocumentBlocks(state([quote("Be yourself")]));
  assert.equal(blocks.length, 1);
  const block = blocks[0];
  assert.equal(block.kind, "text");
  if (block.kind === "text") {
    assert.equal(block.blockType, "quote");
    assert.equal(block.text, "Be yourself");
  }
});

test("collects horizontal rule blocks", () => {
  const blocks = collectDocumentBlocks(
    state([paragraph("Before"), hr(), paragraph("After")]),
  );
  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].kind, "text");
  if (blocks[1].kind === "text") assert.equal(blocks[1].blockType, "hr");
});

test("accepts already-parsed state object (not a string)", () => {
  const parsed = JSON.parse(state([paragraph("Parsed"), visualNode("x")]));
  const blocks = collectDocumentBlocks(parsed);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, "text");
  assert.equal(blocks[1].kind, "visual");
});

test("skips visual nodes missing visualId or payload", () => {
  const blocks = collectDocumentBlocks(
    state([
      { type: "visual", visualId: "", visual: visual("x") },
      { type: "visual", visualId: "no-payload" },
    ]),
  );
  assert.equal(blocks.length, 0);
});

test("text+visual mixed document: blocks maintain exact reading order", () => {
  const blocks = collectDocumentBlocks(
    state([
      heading(1, "Chapter 1"),
      paragraph("First paragraph"),
      list(["Item one", "Item two"]),
      visualNode("vis-1"),
      quote("A fine quote"),
      heading(2, "Chapter 2"),
      visualNode("vis-2"),
      paragraph("Last paragraph"),
    ]),
  );
  // headings(1) + paragraph(1) + listitems(2) + visual(1) + quote(1) + heading(1) + visual(1) + paragraph(1) = 9
  assert.equal(blocks.length, 9);
  // list expands to 2 listitems (indices 2,3), so vis-1 is at index 4, vis-2 at index 7
  assert.equal(blocks[4].kind, "visual");
  assert.equal(blocks[7].kind, "visual");
  if (blocks[4].kind === "visual") assert.equal(blocks[4].visualId, "vis-1");
  if (blocks[7].kind === "visual") assert.equal(blocks[7].visualId, "vis-2");
});
