/**
 * Unit tests for the four new visual kinds added in issue #8:
 * venn, pyramid, matrix, orgchart.
 *
 * Mirrors the conventions in fixtures.test.ts and schema.test.ts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VISUAL_SCHEMA_VERSION,
  safeParseVisual,
  validateVisual,
  VISUAL_KIND_TO_PRISMA,
  PRISMA_TO_VISUAL_KIND,
} from "@/lib/visual/schema";
import { createBlankVisual } from "@/lib/visual/fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVenn() {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "venn",
    title: "Overlap",
    width: 600,
    height: 480,
    nodes: [
      { id: "a", label: "Set A", x: 220, y: 220, width: 240, height: 240 },
      { id: "b", label: "Set B", x: 380, y: 220, width: 240, height: 240 },
    ],
    edges: [],
  };
}

function makePyramid() {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "pyramid",
    title: "Hierarchy",
    width: 560,
    height: 420,
    nodes: [
      { id: "apex", label: "Top" },
      { id: "mid", label: "Middle" },
      { id: "base", label: "Base" },
    ],
    edges: [],
  };
}

function makeMatrix() {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "matrix",
    title: "2x2 grid",
    width: 600,
    height: 480,
    nodes: [
      { id: "q0", label: "TL", value: 0 },
      { id: "q1", label: "TR", value: 1 },
      { id: "q2", label: "BL", value: 2 },
      { id: "q3", label: "BR", value: 3 },
    ],
    edges: [],
  };
}

function makeOrgchart() {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type: "orgchart",
    title: "Org",
    width: 600,
    height: 420,
    nodes: [
      {
        id: "ceo",
        label: "CEO",
        x: 300,
        y: 70,
        width: 150,
        height: 56,
        shape: "rounded",
      },
      {
        id: "cto",
        label: "CTO",
        x: 150,
        y: 210,
        width: 150,
        height: 56,
        shape: "rounded",
      },
      {
        id: "cfo",
        label: "CFO",
        x: 450,
        y: 210,
        width: 150,
        height: 56,
        shape: "rounded",
      },
    ],
    edges: [
      { id: "e1", from: "ceo", to: "cto" },
      { id: "e2", from: "ceo", to: "cfo" },
    ],
  };
}

// ---------------------------------------------------------------------------
// validateVisual accepts each new kind
// ---------------------------------------------------------------------------

test("validateVisual accepts a venn visual", () => {
  const v = validateVisual(makeVenn());
  assert.equal(v.type, "venn");
  assert.equal(v.nodes.length, 2);
});

test("validateVisual accepts a pyramid visual", () => {
  const v = validateVisual(makePyramid());
  assert.equal(v.type, "pyramid");
  assert.equal(v.nodes.length, 3);
});

test("validateVisual accepts a matrix visual", () => {
  const v = validateVisual(makeMatrix());
  assert.equal(v.type, "matrix");
  assert.equal(v.nodes.length, 4);
});

test("validateVisual accepts an orgchart visual", () => {
  const v = validateVisual(makeOrgchart());
  assert.equal(v.type, "orgchart");
  assert.equal(v.nodes.length, 3);
  assert.equal(v.edges.length, 2);
});

// ---------------------------------------------------------------------------
// createBlankVisual produces valid output for each new kind
// ---------------------------------------------------------------------------

test("createBlankVisual('venn') is schema-valid", () => {
  const v = createBlankVisual("venn");
  const result = safeParseVisual(v);
  assert.ok(
    result.success,
    `expected success, got: ${!result.success && result.error}`,
  );
  assert.equal(result.success && result.data.type, "venn");
  assert.ok(v.nodes.length > 0);
  assert.ok(v.width > 0 && v.height > 0);
});

test("createBlankVisual('pyramid') is schema-valid", () => {
  const v = createBlankVisual("pyramid");
  const result = safeParseVisual(v);
  assert.ok(
    result.success,
    `expected success, got: ${!result.success && result.error}`,
  );
  assert.equal(result.success && result.data.type, "pyramid");
  assert.ok(v.nodes.length > 0);
});

test("createBlankVisual('matrix') is schema-valid", () => {
  const v = createBlankVisual("matrix");
  const result = safeParseVisual(v);
  assert.ok(
    result.success,
    `expected success, got: ${!result.success && result.error}`,
  );
  assert.equal(result.success && result.data.type, "matrix");
  assert.ok(v.nodes.length > 0);
});

test("createBlankVisual('orgchart') is schema-valid", () => {
  const v = createBlankVisual("orgchart");
  const result = safeParseVisual(v);
  assert.ok(
    result.success,
    `expected success, got: ${!result.success && result.error}`,
  );
  assert.equal(result.success && result.data.type, "orgchart");
  assert.ok(v.nodes.length > 0);
  assert.ok(v.edges.length > 0, "orgchart blank should have at least one edge");
});

// ---------------------------------------------------------------------------
// createBlankVisual returns fresh isolated objects
// ---------------------------------------------------------------------------

test("createBlankVisual new kinds return fresh objects on each call", () => {
  for (const kind of ["venn", "pyramid", "matrix", "orgchart"] as const) {
    const a = createBlankVisual(kind);
    const b = createBlankVisual(kind);
    assert.notEqual(a, b, `${kind}: must be a new object`);
    assert.notEqual(a.nodes, b.nodes, `${kind}: nodes must be a new array`);
    assert.notEqual(a.style, b.style, `${kind}: style must be a new object`);
  }
});

// ---------------------------------------------------------------------------
// node ids are unique within each blank
// ---------------------------------------------------------------------------

test("createBlankVisual new kinds have unique node ids", () => {
  for (const kind of ["venn", "pyramid", "matrix", "orgchart"] as const) {
    const v = createBlankVisual(kind);
    const ids = v.nodes.map((n) => n.id);
    assert.equal(
      new Set(ids).size,
      ids.length,
      `${kind}: node ids must be unique`,
    );
  }
});

// ---------------------------------------------------------------------------
// VISUAL_KIND_TO_PRISMA / PRISMA_TO_VISUAL_KIND round-trip
// ---------------------------------------------------------------------------

test("new kinds round-trip through kind↔prisma maps", () => {
  for (const kind of ["venn", "pyramid", "matrix", "orgchart"] as const) {
    const prismaType = VISUAL_KIND_TO_PRISMA[kind];
    assert.ok(prismaType, `${kind} must have a PRISMA type`);
    const roundTripped = PRISMA_TO_VISUAL_KIND[prismaType];
    assert.equal(roundTripped, kind, `${kind} round-trip failed`);
  }
});

// ---------------------------------------------------------------------------
// safeParseVisual rejects unknown kinds (unchanged regression)
// ---------------------------------------------------------------------------

test("safeParseVisual still rejects an unknown kind", () => {
  const result = safeParseVisual({
    version: VISUAL_SCHEMA_VERSION,
    type: "banana",
    width: 400,
    height: 300,
    nodes: [{ id: "n1", label: "A" }],
    edges: [],
  });
  assert.equal(result.success, false);
});
