/**
 * Unit tests for text-visual sync helpers:
 *   - {@link mergeVisualContent} — pure merge of new content with old styles
 *   - {@link isSourceStale} — out-of-date detection
 *   - {@link hashSourceText} — deterministic FNV-1a hash
 *
 * No LLM calls are made: tests use hand-built Visuals.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hashSourceText,
  safeParseVisual,
  validateVisual,
  VISUAL_SCHEMA_VERSION,
  type Visual,
  type VisualNode,
} from "@/lib/visual/schema";
import { mergeVisualContent, isSourceStale } from "@/lib/visual/transforms";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVisual(
  nodes: Partial<VisualNode>[],
  overrides: Partial<Visual> = {},
): Visual {
  const fullNodes: VisualNode[] = nodes.map((n, i) => ({
    id: n.id ?? `n${i}`,
    label: n.label ?? `Node ${i}`,
    ...n,
  }));
  return validateVisual({
    version: VISUAL_SCHEMA_VERSION,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: fullNodes,
    edges: [],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// mergeVisualContent
// ---------------------------------------------------------------------------

test("mergeVisualContent: new content (nodes/edges/title/type) comes from newVisual", () => {
  const old = makeVisual([{ id: "a", label: "Alpha" }]);
  const next = makeVisual(
    [
      { id: "x", label: "X" },
      { id: "y", label: "Y" },
    ],
    { title: "New title", type: "mindmap" },
  );
  const merged = mergeVisualContent(old, next);
  assert.equal(merged.nodes.length, 2);
  assert.equal(merged.nodes[0].label, "X");
  assert.equal(merged.nodes[1].label, "Y");
  assert.equal(merged.title, "New title");
  assert.equal(merged.type, "mindmap");
});

test("mergeVisualContent: global style comes from oldVisual", () => {
  const customStyle = {
    palette: ["#ff0000", "#00ff00"],
    background: "#111111",
    nodeFill: "#222222",
    nodeStroke: "#333333",
    nodeText: "#444444",
    edgeColor: "#555555",
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: 700,
  };
  const old = makeVisual([{ id: "a", label: "A" }], { style: customStyle });
  const next = makeVisual([{ id: "b", label: "B" }]);
  const merged = mergeVisualContent(old, next);
  assert.deepEqual(merged.style.palette, customStyle.palette);
  assert.equal(merged.style.background, customStyle.background);
  assert.equal(merged.style.nodeFill, customStyle.nodeFill);
  assert.equal(merged.style.nodeStroke, customStyle.nodeStroke);
  assert.equal(merged.style.nodeText, customStyle.nodeText);
  assert.equal(merged.style.edgeColor, customStyle.edgeColor);
  assert.equal(merged.style.fontFamily, customStyle.fontFamily);
  assert.equal(merged.style.fontSize, customStyle.fontSize);
  assert.equal(merged.style.fontWeight, customStyle.fontWeight);
});

test("mergeVisualContent: per-node color overrides preserved when label matches (case-insensitive)", () => {
  const old = makeVisual([
    {
      id: "a",
      label: "Alpha",
      color: "#ff0000",
      stroke: "#00ff00",
      textColor: "#0000ff",
    },
    { id: "b", label: "Beta" },
  ]);
  const next = makeVisual([
    { id: "x", label: "ALPHA" }, // same label, different case
    { id: "y", label: "Gamma" }, // no match
  ]);
  const merged = mergeVisualContent(old, next);
  // "ALPHA" matches "Alpha" — overrides re-applied
  assert.equal(merged.nodes[0].color, "#ff0000");
  assert.equal(merged.nodes[0].stroke, "#00ff00");
  assert.equal(merged.nodes[0].textColor, "#0000ff");
  // "Gamma" has no match by label; falls back to index 1 (Beta), which has no overrides
  assert.equal(merged.nodes[1].color, undefined);
});

test("mergeVisualContent: per-node overrides preserved by index when label doesn't match", () => {
  const old = makeVisual([
    { id: "a", label: "Alpha", color: "#aabbcc" },
    { id: "b", label: "Beta", stroke: "#ddeeff" },
  ]);
  const next = makeVisual([
    { id: "x", label: "Completely Different" },
    { id: "y", label: "Also Different" },
  ]);
  const merged = mergeVisualContent(old, next);
  // Index 0 → old node "Alpha" → color applied
  assert.equal(merged.nodes[0].color, "#aabbcc");
  // Index 1 → old node "Beta" → stroke applied
  assert.equal(merged.nodes[1].stroke, "#ddeeff");
});

test("mergeVisualContent: new nodes beyond old count get no overrides", () => {
  const old = makeVisual([{ id: "a", label: "A", color: "#ff0000" }]);
  const next = makeVisual([
    { id: "x", label: "X" },
    { id: "y", label: "Y" }, // no old node at index 1
    { id: "z", label: "Z" }, // no old node at index 2
  ]);
  const merged = mergeVisualContent(old, next);
  assert.equal(merged.nodes.length, 3);
  // Index 0 matches old node (by label or index) — but "X" !== "A" by label, so index fallback
  assert.equal(merged.nodes[0].color, "#ff0000"); // index 0 fallback
  assert.equal(merged.nodes[1].color, undefined); // no old node at index 1
  assert.equal(merged.nodes[2].color, undefined); // no old node at index 2
});

test("mergeVisualContent: extended per-node styles preserved (icon, fillStyle, borderStyle, borderWidth, textAlign)", () => {
  const old = makeVisual([
    {
      id: "a",
      label: "Styled",
      icon: "Lightbulb",
      fillStyle: "gradient",
      borderStyle: "dashed",
      borderWidth: 3,
      textAlign: "left",
    },
  ]);
  const next = makeVisual([{ id: "b", label: "Styled" }]);
  const merged = mergeVisualContent(old, next);
  assert.equal(merged.nodes[0].icon, "Lightbulb");
  assert.equal(merged.nodes[0].fillStyle, "gradient");
  assert.equal(merged.nodes[0].borderStyle, "dashed");
  assert.equal(merged.nodes[0].borderWidth, 3);
  assert.equal(merged.nodes[0].textAlign, "left");
});

test("mergeVisualContent: sourceText/sourceTextHash are cleared (caller stamps them)", () => {
  const old = makeVisual([{ id: "a", label: "A" }], {
    sourceText: "old text",
    sourceTextHash: "deadbeef",
  } as Partial<Visual>);
  const next = makeVisual([{ id: "b", label: "B" }]);
  const merged = mergeVisualContent(old, next);
  assert.equal(merged.sourceText, undefined);
  assert.equal(merged.sourceTextHash, undefined);
});

test("mergeVisualContent: non-mutating — neither input is modified", () => {
  const old = makeVisual([{ id: "a", label: "A", color: "#abc" }]);
  const next = makeVisual([{ id: "b", label: "A" }]);
  const beforeOld = JSON.stringify(old);
  const beforeNext = JSON.stringify(next);
  mergeVisualContent(old, next);
  assert.equal(JSON.stringify(old), beforeOld, "old must not be mutated");
  assert.equal(JSON.stringify(next), beforeNext, "next must not be mutated");
});

test("mergeVisualContent: output is schema-valid", () => {
  const old = makeVisual([{ id: "a", label: "A", color: "#ff0000" }]);
  const next = makeVisual([{ id: "b", label: "B" }]);
  const merged = mergeVisualContent(old, next);
  const result = safeParseVisual(merged);
  assert.equal(result.success, true, "merged visual must be schema-valid");
});

// ---------------------------------------------------------------------------
// isSourceStale
// ---------------------------------------------------------------------------

test("isSourceStale: true when texts differ", () => {
  const visual = makeVisual([{ id: "a", label: "A" }], {
    sourceText: "original text",
  } as Partial<Visual>);
  assert.equal(isSourceStale(visual, "edited text"), true);
});

test("isSourceStale: false when texts match (after trimming)", () => {
  const visual = makeVisual([{ id: "a", label: "A" }], {
    sourceText: "same text",
  } as Partial<Visual>);
  assert.equal(isSourceStale(visual, "  same text  "), false);
});

test("isSourceStale: false when visual has no sourceText", () => {
  const visual = makeVisual([{ id: "a", label: "A" }]);
  assert.equal(isSourceStale(visual, "some text"), false);
});

test("isSourceStale: false when currentText is empty", () => {
  const visual = makeVisual([{ id: "a", label: "A" }], {
    sourceText: "some text",
  } as Partial<Visual>);
  assert.equal(isSourceStale(visual, ""), false);
  assert.equal(isSourceStale(visual, "   "), false);
});

test("isSourceStale: false when both values are absent", () => {
  const visual = makeVisual([{ id: "a", label: "A" }]);
  assert.equal(isSourceStale(visual, ""), false);
});

// ---------------------------------------------------------------------------
// hashSourceText
// ---------------------------------------------------------------------------

test("hashSourceText: deterministic — same input → same output", () => {
  const text = "Hello, world!";
  assert.equal(hashSourceText(text), hashSourceText(text));
});

test("hashSourceText: returns different values for different inputs", () => {
  assert.notEqual(hashSourceText("foo"), hashSourceText("bar"));
  assert.notEqual(hashSourceText("abc"), hashSourceText("ABC"));
  assert.notEqual(hashSourceText(""), hashSourceText(" "));
});

test("hashSourceText: returns an 8-character hex string", () => {
  const h = hashSourceText("test");
  assert.match(h, /^[0-9a-f]{8}$/);
});

test("hashSourceText: empty string returns a valid 8-char hex", () => {
  const h = hashSourceText("");
  assert.match(h, /^[0-9a-f]{8}$/);
});

// ---------------------------------------------------------------------------
// Schema round-trip for new fields
// ---------------------------------------------------------------------------

test("validateVisual: preserves sourceText and sourceTextHash through round-trip", () => {
  const raw = {
    version: VISUAL_SCHEMA_VERSION,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: [{ id: "a", label: "A" }],
    edges: [],
    sourceText: "my anchor text",
    sourceTextHash: "deadbeef",
  };
  const result = safeParseVisual(raw);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.sourceText, "my anchor text");
    assert.equal(result.data.sourceTextHash, "deadbeef");
  }
});

test("validateVisual: accepts visual without sourceText", () => {
  const raw = {
    version: VISUAL_SCHEMA_VERSION,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: [{ id: "a", label: "A" }],
    edges: [],
  };
  const result = safeParseVisual(raw);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.sourceText, undefined);
    assert.equal(result.data.sourceTextHash, undefined);
  }
});

test("validateVisual: silently drops non-string sourceText/sourceTextHash", () => {
  const raw = {
    version: VISUAL_SCHEMA_VERSION,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: [{ id: "a", label: "A" }],
    edges: [],
    sourceText: 42,
    sourceTextHash: true,
  };
  const result = safeParseVisual(raw);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.sourceText, undefined);
    assert.equal(result.data.sourceTextHash, undefined);
  }
});
