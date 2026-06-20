import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_STYLE, VISUAL_SCHEMA_VERSION, type Visual } from "./schema";
import { computeVisualInfo } from "./info";

const BASE_VISUAL: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "flowchart",
  width: 480,
  height: 380,
  style: { ...DEFAULT_STYLE },
  nodes: [
    { id: "n1", label: "Start", x: 100, y: 100, width: 120, height: 56 },
    { id: "n2", label: "End", x: 100, y: 220, width: 120, height: 56 },
  ],
  edges: [{ id: "e1", from: "n1", to: "n2" }],
};

test("computeVisualInfo — kind, nodeCount, edgeCount", () => {
  const info = computeVisualInfo(BASE_VISUAL);
  assert.equal(info.kind, "flowchart");
  assert.equal(info.nodeCount, 2);
  assert.equal(info.edgeCount, 1);
});

test("computeVisualInfo — title undefined when absent", () => {
  const info = computeVisualInfo({ ...BASE_VISUAL, title: undefined });
  assert.equal(info.title, undefined);
});

test("computeVisualInfo — title undefined when blank string", () => {
  const info = computeVisualInfo({ ...BASE_VISUAL, title: "   " });
  assert.equal(info.title, undefined);
});

test("computeVisualInfo — title returned when set", () => {
  const info = computeVisualInfo({ ...BASE_VISUAL, title: "My diagram" });
  assert.equal(info.title, "My diagram");
});

test("computeVisualInfo — sourceText undefined when absent", () => {
  const info = computeVisualInfo({ ...BASE_VISUAL, sourceText: undefined });
  assert.equal(info.sourceText, undefined);
});

test("computeVisualInfo — sourceText returned when set", () => {
  const info = computeVisualInfo({
    ...BASE_VISUAL,
    sourceText: "User logs in",
  });
  assert.equal(info.sourceText, "User logs in");
});

test("computeVisualInfo — effectCount zero when no effects", () => {
  const info = computeVisualInfo({ ...BASE_VISUAL, effects: undefined });
  assert.equal(info.effectCount, 0);
});

test("computeVisualInfo — effectCount matches effects array", () => {
  const info = computeVisualInfo({
    ...BASE_VISUAL,
    effects: [{ kind: "shadow" }, { kind: "sketch" }],
  });
  assert.equal(info.effectCount, 2);
});

test("computeVisualInfo — fontFamily from style", () => {
  const info = computeVisualInfo(BASE_VISUAL);
  assert.equal(info.fontFamily, DEFAULT_STYLE.fontFamily);
});

test("computeVisualInfo — zero edges", () => {
  const info = computeVisualInfo({ ...BASE_VISUAL, edges: [] });
  assert.equal(info.edgeCount, 0);
});

test("computeVisualInfo — mindmap kind", () => {
  const info = computeVisualInfo({
    ...BASE_VISUAL,
    type: "mindmap",
  });
  assert.equal(info.kind, "mindmap");
});
