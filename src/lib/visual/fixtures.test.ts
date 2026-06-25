import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VISUAL_KINDS,
  VISUAL_SCHEMA_VERSION,
  validateVisual,
  type VisualKind,
} from "@/lib/visual/schema";

import { createBlankVisual } from "./blank";
import { FIXTURE_LIST, FIXTURES } from "./fixtures";

test("sample fixtures cover every kind in canonical order", () => {
  assert.deepEqual(
    FIXTURE_LIST.map((visual) => visual.type),
    [...VISUAL_KINDS],
  );

  for (const kind of VISUAL_KINDS) {
    assert.equal(FIXTURES[kind].type, kind);
    assert.doesNotThrow(() => validateVisual(FIXTURES[kind]));
  }
});

test("createBlankVisual returns a schema-valid Visual for every kind", () => {
  for (const kind of VISUAL_KINDS) {
    const visual = createBlankVisual(kind);
    // validateVisual throws on any structural problem.
    const validated = validateVisual(visual);
    assert.equal(validated.type, kind, `type should be ${kind}`);
    assert.equal(validated.version, VISUAL_SCHEMA_VERSION);
    assert.ok(validated.nodes.length > 0, `${kind} must have nodes`);
    assert.ok(validated.width > 0 && validated.height > 0);
  }
});

test("createBlankVisual edges reference existing node ids", () => {
  for (const kind of VISUAL_KINDS) {
    const visual = createBlankVisual(kind);
    const ids = new Set(visual.nodes.map((node) => node.id));
    for (const edge of visual.edges) {
      assert.ok(ids.has(edge.from), `${kind} edge.from must exist`);
      assert.ok(ids.has(edge.to), `${kind} edge.to must exist`);
    }
  }
});

test("createBlankVisual node ids are unique within a visual", () => {
  for (const kind of VISUAL_KINDS) {
    const visual = createBlankVisual(kind);
    const ids = visual.nodes.map((node) => node.id);
    assert.equal(new Set(ids).size, ids.length, `${kind} ids must be unique`);
  }
});

test("createBlankVisual returns a fresh, isolated object each call", () => {
  const kind: VisualKind = "flowchart";
  const a = createBlankVisual(kind);
  const b = createBlankVisual(kind);
  assert.notEqual(a, b);
  assert.notEqual(a.nodes, b.nodes);
  assert.notEqual(a.style, b.style);

  // Mutating one must not affect a subsequent build.
  a.nodes[0].label = "MUTATED";
  a.style.background = "#000000";
  const c = createBlankVisual(kind);
  assert.notEqual(c.nodes[0].label, "MUTATED");
  assert.notEqual(c.style.background, "#000000");
});

test("createBlankVisual produces graph types with connected edges", () => {
  for (const kind of ["flowchart", "mindmap", "concept"] as const) {
    const visual = createBlankVisual(kind);
    assert.ok(
      visual.edges.length > 0,
      `${kind} blank template should seed at least one edge`,
    );
  }
});
