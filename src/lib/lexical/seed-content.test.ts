import assert from "node:assert/strict";
import { test } from "node:test";

import { FIXTURES } from "@/lib/visual/fixtures";
import { safeParseVisual } from "@/lib/visual/schema";

import { buildSeedContentJson } from "./seed-content";

const DEMO_VISUAL_ID = "demo-visual-id-abc123";
const sampleVisual = FIXTURES.flowchart;

test("returns a root node with exactly two children: paragraph + visual", () => {
  const state = buildSeedContentJson(
    "Hello world",
    sampleVisual,
    DEMO_VISUAL_ID,
  );
  assert.equal(state.root.type, "root");
  assert.equal(state.root.version, 1);
  assert.equal(state.root.children.length, 2);
  assert.equal(state.root.children[0].type, "paragraph");
  assert.equal(state.root.children[1].type, "visual");
});

test("visual node has the correct type, version, visualId, and visual payload", () => {
  const state = buildSeedContentJson("intro", sampleVisual, DEMO_VISUAL_ID);
  const visualNode = state.root.children[1];
  assert.equal(visualNode.type, "visual");
  assert.equal((visualNode as { version: number }).version, 1);
  assert.equal((visualNode as { visualId: string }).visualId, DEMO_VISUAL_ID);
  const visual = (visualNode as { visual: typeof sampleVisual }).visual;
  assert.equal(visual.type, "flowchart");
});

test("embedded visual payload passes safeParseVisual", () => {
  const state = buildSeedContentJson("intro", sampleVisual, DEMO_VISUAL_ID);
  const visualNode = state.root.children[1] as { visual: unknown };
  const parsed = safeParseVisual(visualNode.visual);
  assert.equal(
    parsed.success,
    true,
    `safeParseVisual failed: ${!parsed.success && parsed.error}`,
  );
});

test("embedded visual kind matches the fixture kind", () => {
  const state = buildSeedContentJson("intro", sampleVisual, DEMO_VISUAL_ID);
  const visual = (state.root.children[1] as { visual: typeof sampleVisual })
    .visual;
  assert.equal(visual.type, sampleVisual.type);
  assert.equal(visual.nodes.length, sampleVisual.nodes.length);
});

test("intro paragraph renders the supplied text as a text child", () => {
  const text = "Welcome to TextIQ — here is the sample flowchart.";
  const state = buildSeedContentJson(text, sampleVisual, DEMO_VISUAL_ID);
  const para = state.root.children[0] as {
    type: string;
    children: Array<{ type: string; text: string }>;
  };
  assert.equal(para.type, "paragraph");
  assert.equal(para.children.length, 1);
  assert.equal(para.children[0].type, "text");
  assert.equal(para.children[0].text, text);
});

test("different visualId values are stored independently", () => {
  const state1 = buildSeedContentJson("a", sampleVisual, "id-1");
  const state2 = buildSeedContentJson("b", sampleVisual, "id-2");
  const id1 = (state1.root.children[1] as { visualId: string }).visualId;
  const id2 = (state2.root.children[1] as { visualId: string }).visualId;
  assert.equal(id1, "id-1");
  assert.equal(id2, "id-2");
  assert.notEqual(id1, id2);
});

test("JSON-stringify round-trip preserves the visual payload and id", () => {
  const state = buildSeedContentJson(
    "round-trip test",
    sampleVisual,
    DEMO_VISUAL_ID,
  );
  const roundTripped = JSON.parse(JSON.stringify(state)) as typeof state;
  const visualNode = roundTripped.root.children[1] as {
    type: string;
    visualId: string;
    visual: unknown;
  };
  assert.equal(visualNode.type, "visual");
  assert.equal(visualNode.visualId, DEMO_VISUAL_ID);
  const parsed = safeParseVisual(visualNode.visual);
  assert.equal(parsed.success, true);
});
