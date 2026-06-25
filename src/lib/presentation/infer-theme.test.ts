import assert from "node:assert/strict";
import { test } from "node:test";

import type { DocumentBlock } from "@/lib/visual/document-export";
import { createBlankVisual } from "@/lib/visual/blank";
import { applyTheme } from "@/lib/visual/transforms";

import { inferDeckTheme } from "./infer-theme";

/** A visual block themed with the given style-theme id. */
function visualBlock(themeId: string, idx: number): DocumentBlock {
  return {
    kind: "visual",
    visualId: `v-${themeId}-${idx}`,
    visual: applyTheme(createBlankVisual("flowchart"), themeId),
  };
}

function textBlock(text: string): DocumentBlock {
  return { kind: "text", blockType: "paragraph", text };
}

test("majority theme wins", () => {
  const blocks: DocumentBlock[] = [
    visualBlock("ocean", 0),
    visualBlock("ocean", 1),
    visualBlock("ocean", 2),
    visualBlock("forest", 0),
    textBlock("ignored"),
  ];
  assert.equal(inferDeckTheme(blocks), "ocean");
});

test("a single themed visual decides the deck theme", () => {
  assert.equal(inferDeckTheme([visualBlock("grape", 0)]), "grape");
});

test("tie-breaking is deterministic by canonical order", () => {
  // forest vs sunset tie → forest (earlier in canonical order) regardless of
  // appearance order in the document.
  const blocks: DocumentBlock[] = [
    visualBlock("sunset", 0),
    visualBlock("forest", 0),
    visualBlock("sunset", 1),
    visualBlock("forest", 1),
  ];
  assert.equal(inferDeckTheme(blocks), "forest");

  // Reversing the document order yields the same deterministic winner.
  assert.equal(inferDeckTheme([...blocks].reverse()), "forest");
});

test("no visuals falls back to indigo", () => {
  assert.equal(inferDeckTheme([]), "indigo");
  assert.equal(
    inferDeckTheme([textBlock("just"), textBlock("text")]),
    "indigo",
  );
});

test("visuals with no inferable theme fall back to indigo", () => {
  // `rose` is a valid STYLE_THEME but has no mirrored deck theme, so it cannot
  // be inferred and the deck falls back to indigo.
  assert.equal(inferDeckTheme([visualBlock("rose", 0)]), "indigo");
});

test("default is never inferred", () => {
  const blocks: DocumentBlock[] = [
    visualBlock("rose", 0),
    visualBlock("amber", 0),
  ];
  assert.notEqual(inferDeckTheme(blocks), "default");
});
