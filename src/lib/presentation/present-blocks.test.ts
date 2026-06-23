import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPresentationBlocks } from "./present-blocks";

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
  const blocks = buildPresentationBlocks(MINIMAL_LEXICAL_JSON);
  const titles = blocks
    .filter(
      (b): b is Extract<(typeof blocks)[0], { kind: "text" }> =>
        b.kind === "text" &&
        (b as Extract<(typeof blocks)[0], { kind: "text" }>).blockType ===
          "heading",
    )
    .map((b) => b.text);
  assert.ok(titles.includes("Lexical Title"), "heading from Lexical state");
});

test("buildPresentationBlocks: returns empty array when source is absent", () => {
  const blocks = buildPresentationBlocks(null);
  assert.deepEqual(blocks, []);
});

test("buildPresentationBlocks: returns empty array when source is undefined", () => {
  const blocks = buildPresentationBlocks(undefined);
  assert.deepEqual(blocks, []);
});
