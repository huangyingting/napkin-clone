import assert from "node:assert/strict";
import { test } from "node:test";

import type { Visual } from "@/lib/visual/schema";
import { blockRichText, collectDocumentBlocks } from "./document-export";

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

// ---------------------------------------------------------------------------
// blockRichText — rich-text run derivation
// ---------------------------------------------------------------------------

function richText(
  text: string,
  opts: { format?: number; style?: string } = {},
) {
  return {
    type: "text",
    text,
    format: opts.format ?? 0,
    style: opts.style ?? "",
  };
}

function richParagraph(children: unknown[]) {
  return { type: "paragraph", children };
}

test("blockRichText derives bold/italic/code flags from format bitmask", () => {
  const block = richParagraph([
    richText("plain "),
    richText("bold", { format: 1 }),
    richText(" "),
    richText("italic", { format: 2 }),
    richText(" "),
    richText("code", { format: 16 }),
  ]);
  const runs = blockRichText(block);
  assert.deepEqual(runs, [
    { text: "plain " },
    { text: "bold", bold: true },
    { text: " " },
    { text: "italic", italic: true },
    { text: " " },
    { text: "code", code: true },
  ]);
});

test("blockRichText combines bold+italic and reads color from style", () => {
  const block = richParagraph([
    richText("strong", { format: 3 }),
    richText(" red", { style: "color: #ff0000;" }),
  ]);
  const runs = blockRichText(block);
  assert.deepEqual(runs, [
    { text: "strong", bold: true, italic: true },
    { text: " red", color: "#ff0000" },
  ]);
});

test("blockRichText preserves links and their inner formatting", () => {
  const block = richParagraph([
    richText("see "),
    {
      type: "link",
      url: "https://example.com",
      children: [richText("here", { format: 1 })],
    },
  ]);
  const runs = blockRichText(block);
  assert.deepEqual(runs, [
    { text: "see " },
    { text: "here", bold: true, link: "https://example.com" },
  ]);
});

test("blockRichText emits a newline run for linebreaks", () => {
  const block = richParagraph([
    richText("line one"),
    { type: "linebreak" },
    richText("line two", { format: 1 }),
  ]);
  const runs = blockRichText(block);
  assert.deepEqual(runs, [
    { text: "line one" },
    { text: "\n" },
    { text: "line two", bold: true },
  ]);
});

test("collectDocumentBlocks attaches runs only when formatting is present", () => {
  const blocks = collectDocumentBlocks(
    state([
      richParagraph([richText("all plain text")]),
      richParagraph([richText("has "), richText("bold", { format: 1 })]),
    ]),
  );
  assert.equal(blocks.length, 2);
  // Plain paragraph carries no runs (identical to legacy shape).
  if (blocks[0].kind === "text") {
    assert.equal(blocks[0].runs, undefined);
    assert.equal(blocks[0].text, "all plain text");
  }
  // Formatted paragraph carries runs and a matching plain-text fallback.
  if (blocks[1].kind === "text") {
    assert.equal(blocks[1].text, "has bold");
    assert.deepEqual(blocks[1].runs, [
      { text: "has " },
      { text: "bold", bold: true },
    ]);
  }
});

// ---------------------------------------------------------------------------
// blockId from serialised Lexical node key (issue #377)
// ---------------------------------------------------------------------------

test("collectDocumentBlocks populates blockId from node key on paragraph", () => {
  const raw = {
    root: {
      type: "root",
      children: [
        {
          type: "paragraph",
          key: "para-1",
          children: [{ type: "text", text: "Hello" }],
        },
      ],
    },
  };
  const blocks = collectDocumentBlocks(raw);
  assert.equal(blocks.length, 1);
  if (blocks[0].kind === "text") {
    assert.equal(blocks[0].blockId, "para-1");
    assert.equal(blocks[0].text, "Hello");
  }
});

test("collectDocumentBlocks populates blockId from node key on heading", () => {
  const raw = {
    root: {
      type: "root",
      children: [
        {
          type: "heading",
          tag: "h2",
          key: "heading-42",
          children: [{ type: "text", text: "Section" }],
        },
      ],
    },
  };
  const blocks = collectDocumentBlocks(raw);
  assert.equal(blocks.length, 1);
  if (blocks[0].kind === "text") {
    assert.equal(blocks[0].blockId, "heading-42");
    assert.equal(blocks[0].blockType, "heading");
  }
});

test("collectDocumentBlocks populates blockId from node key on quote", () => {
  const raw = {
    root: {
      type: "root",
      children: [
        {
          type: "quote",
          key: "q-7",
          children: [{ type: "text", text: "Quote text" }],
        },
      ],
    },
  };
  const blocks = collectDocumentBlocks(raw);
  assert.equal(blocks.length, 1);
  if (blocks[0].kind === "text") {
    assert.equal(blocks[0].blockId, "q-7");
  }
});

test("collectDocumentBlocks populates blockId from listitem key", () => {
  const raw = {
    root: {
      type: "root",
      children: [
        {
          type: "list",
          children: [
            {
              type: "listitem",
              key: "li-3",
              children: [{ type: "text", text: "Item" }],
            },
          ],
        },
      ],
    },
  };
  const blocks = collectDocumentBlocks(raw);
  assert.equal(blocks.length, 1);
  if (blocks[0].kind === "text") {
    assert.equal(blocks[0].blockId, "li-3");
    assert.equal(blocks[0].blockType, "listitem");
  }
});

test("collectDocumentBlocks leaves blockId undefined when key is absent", () => {
  const blocks = collectDocumentBlocks(
    state([paragraph("No key here")]),
  );
  assert.equal(blocks.length, 1);
  if (blocks[0].kind === "text") {
    assert.equal(blocks[0].blockId, undefined);
  }
});

test("collectDocumentBlocks leaves blockId undefined when key is empty string", () => {
  const raw = {
    root: {
      type: "root",
      children: [
        { type: "paragraph", key: "", children: [{ type: "text", text: "Empty key" }] },
      ],
    },
  };
  const blocks = collectDocumentBlocks(raw);
  if (blocks[0].kind === "text") {
    assert.equal(blocks[0].blockId, undefined);
  }
});

test("collectDocumentBlocks extracts blockIds from multiple blocks independently", () => {
  const raw = {
    root: {
      type: "root",
      children: [
        { type: "heading", tag: "h1", key: "k1", children: [{ type: "text", text: "Title" }] },
        { type: "paragraph", key: "k2", children: [{ type: "text", text: "Body" }] },
        { type: "paragraph", children: [{ type: "text", text: "No key" }] },
      ],
    },
  };
  const blocks = collectDocumentBlocks(raw);
  assert.equal(blocks.length, 3);
  const ids = blocks.map((b) => (b.kind === "text" ? b.blockId : null));
  assert.deepEqual(ids, ["k1", "k2", undefined]);
});
