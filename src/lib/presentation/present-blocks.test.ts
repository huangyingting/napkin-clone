import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPresentationBlocks,
  markdownToDocumentBlocks,
} from "./present-blocks";

// ---------------------------------------------------------------------------
// markdownToDocumentBlocks
// ---------------------------------------------------------------------------

test("markdownToDocumentBlocks: heading is mapped correctly", () => {
  const blocks = markdownToDocumentBlocks("# My Title");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, "text");
  const b = blocks[0] as Extract<(typeof blocks)[0], { kind: "text" }>;
  assert.equal(b.blockType, "heading");
  assert.equal(b.level, 1);
  assert.equal(b.text, "My Title");
});

test("markdownToDocumentBlocks: h2 and h3 levels are preserved", () => {
  const blocks = markdownToDocumentBlocks("## Section\n### Sub");
  const [h2, h3] = blocks as Array<
    Extract<(typeof blocks)[0], { kind: "text" }>
  >;
  assert.equal(h2.level, 2);
  assert.equal(h3.level, 3);
});

test("markdownToDocumentBlocks: paragraph is mapped correctly", () => {
  const blocks = markdownToDocumentBlocks("Hello world");
  assert.equal(blocks.length, 1);
  const b = blocks[0] as Extract<(typeof blocks)[0], { kind: "text" }>;
  assert.equal(b.blockType, "paragraph");
  assert.equal(b.text, "Hello world");
});

test("markdownToDocumentBlocks: bullet list becomes individual listitem blocks", () => {
  const blocks = markdownToDocumentBlocks("- Alpha\n- Beta\n- Gamma");
  assert.equal(blocks.length, 3);
  for (const b of blocks) {
    const tb = b as Extract<(typeof blocks)[0], { kind: "text" }>;
    assert.equal(tb.kind, "text");
    assert.equal(tb.blockType, "listitem");
  }
  const items = blocks.map(
    (b) => (b as Extract<(typeof blocks)[0], { kind: "text" }>).text,
  );
  assert.deepEqual(items, ["Alpha", "Beta", "Gamma"]);
});

test("markdownToDocumentBlocks: empty string returns empty array", () => {
  const blocks = markdownToDocumentBlocks("");
  assert.equal(blocks.length, 0);
});

test("markdownToDocumentBlocks: mixed content preserves order", () => {
  const md = [
    "# Title",
    "",
    "Intro paragraph",
    "",
    "- Point A",
    "- Point B",
  ].join("\n");
  const blocks = markdownToDocumentBlocks(md);
  assert.equal(blocks.length, 4); // heading + paragraph + 2 listitems
  const types = blocks.map(
    (b) => (b as Extract<(typeof blocks)[0], { kind: "text" }>).blockType,
  );
  assert.deepEqual(types, ["heading", "paragraph", "listitem", "listitem"]);
});

// ---------------------------------------------------------------------------
// buildPresentationBlocks — contentJson path
// ---------------------------------------------------------------------------

const MINIMAL_LEXICAL_JSON = JSON.stringify({
  root: {
    children: [
      {
        type: "heading",
        tag: "h1",
        children: [{ type: "text", text: "Lexical Title" }],
      },
      {
        type: "paragraph",
        children: [{ type: "text", text: "Lexical body" }],
      },
    ],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

test("buildPresentationBlocks: uses contentJson when present and non-empty", () => {
  const blocks = buildPresentationBlocks(
    MINIMAL_LEXICAL_JSON,
    "# Markdown Title\n\nFallback paragraph",
  );
  // Should use the Lexical source, not Markdown
  const titles = blocks
    .filter(
      (b): b is Extract<(typeof blocks)[0], { kind: "text" }> =>
        b.kind === "text" &&
        (b as Extract<(typeof blocks)[0], { kind: "text" }>).blockType ===
          "heading",
    )
    .map((b) => b.text);
  assert.ok(titles.includes("Lexical Title"), "heading from Lexical state");
  assert.ok(!titles.includes("Markdown Title"), "Markdown title not used");
});

test("buildPresentationBlocks: falls back to Markdown when contentJson is null", () => {
  const blocks = buildPresentationBlocks(
    null,
    "# Markdown Title\n\nFallback body",
  );
  assert.ok(blocks.length > 0, "should produce non-empty blocks");
  const first = blocks[0] as Extract<(typeof blocks)[0], { kind: "text" }>;
  assert.equal(first.blockType, "heading");
  assert.equal(first.text, "Markdown Title");
});

test("buildPresentationBlocks: falls back to Markdown when contentJson is empty string", () => {
  const blocks = buildPresentationBlocks("", "# MD\n\nBody text");
  assert.ok(blocks.length > 0, "should produce non-empty blocks from Markdown");
  const first = blocks[0] as Extract<(typeof blocks)[0], { kind: "text" }>;
  assert.equal(first.blockType, "heading");
  assert.equal(first.text, "MD");
});

test("buildPresentationBlocks: falls back to Markdown when contentJson is undefined", () => {
  const blocks = buildPresentationBlocks(undefined, "## Section\n\n- item 1");
  assert.ok(blocks.length > 0);
  const [h2, item] = blocks as Array<
    Extract<(typeof blocks)[0], { kind: "text" }>
  >;
  assert.equal(h2.blockType, "heading");
  assert.equal(h2.level, 2);
  assert.equal(item.blockType, "listitem");
  assert.equal(item.text, "item 1");
});

test("buildPresentationBlocks: Markdown fallback produces slides via buildDeckFromBlocks", async () => {
  const { buildDeckFromBlocks } = await import("./deck");
  const blocks = buildPresentationBlocks(
    null,
    "# Presentation\n\n## Slide One\n\n- Point A\n- Point B\n\n## Slide Two\n\nBody",
  );
  const deck = buildDeckFromBlocks(blocks);
  assert.ok(deck.slides.length >= 3, "should have at least 3 slides");
  const titles = deck.slides.map((s) => s.title);
  assert.ok(titles.includes("Presentation"));
  assert.ok(titles.includes("Slide One"));
  assert.ok(titles.includes("Slide Two"));
  const slideOne = deck.slides.find((s) => s.title === "Slide One")!;
  assert.deepEqual(slideOne.bullets, ["Point A", "Point B"]);
});

test("buildPresentationBlocks: returns empty array when both sources are absent", () => {
  const blocks = buildPresentationBlocks(null, null);
  assert.deepEqual(blocks, []);
});

test("buildPresentationBlocks: returns empty array when both sources are undefined", () => {
  const blocks = buildPresentationBlocks(undefined, undefined);
  assert.deepEqual(blocks, []);
});
