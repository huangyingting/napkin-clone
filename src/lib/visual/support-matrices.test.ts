/**
 * Unit tests for registry-derived support matrices and prompt constraints
 * (Epic #442, issue #447).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { VISUAL_KINDS } from "@/lib/visual/schema";
import {
  assertSupportMatricesComplete,
  buildKindExportMatrix,
  buildKindGuidanceRecord,
  buildKindPromptConstraints,
  getKindExportSupport,
  getKindPromptEntry,
  getKindsForFormat,
  kindSupportsFormat,
} from "@/lib/visual/support-matrices";

// ---------------------------------------------------------------------------
// Export matrix completeness
// ---------------------------------------------------------------------------

test("buildKindExportMatrix returns one row per VisualKind", () => {
  const matrix = buildKindExportMatrix();
  assert.equal(matrix.length, VISUAL_KINDS.length);
  for (const kind of VISUAL_KINDS) {
    assert.ok(
      matrix.some((r) => r.kind === kind),
      `Matrix missing row for "${kind}"`,
    );
  }
});

test("every kind in matrix supports PNG export", () => {
  const matrix = buildKindExportMatrix();
  for (const row of matrix) {
    assert.equal(row.png, true, `"${row.kind}" should support PNG export`);
  }
});

test("every kind in matrix supports SVG and PDF export", () => {
  const matrix = buildKindExportMatrix();
  for (const row of matrix) {
    assert.equal(row.svg, true, `"${row.kind}" should support SVG`);
    assert.equal(row.pdf, true, `"${row.kind}" should support PDF`);
  }
});

test("positioned kinds support PPTX native in matrix", () => {
  const matrix = buildKindExportMatrix();
  const nativeKinds = ["flowchart", "mindmap", "concept", "orgchart"];
  for (const kind of nativeKinds) {
    const row = matrix.find((r) => r.kind === kind);
    assert.ok(row, `No matrix row for "${kind}"`);
    assert.equal(
      row!.pptxNative,
      true,
      `"${kind}" should have pptxNative=true`,
    );
  }
});

test("derived kinds use raster fallback in matrix", () => {
  const matrix = buildKindExportMatrix();
  const derivedKinds = [
    "list",
    "chart",
    "timeline",
    "cycle",
    "comparison",
    "funnel",
    "pyramid",
    "matrix",
  ];
  for (const kind of derivedKinds) {
    const row = matrix.find((r) => r.kind === kind);
    assert.ok(row, `No matrix row for "${kind}"`);
    assert.equal(
      row!.pptxNative,
      false,
      `"${kind}" should have pptxNative=false`,
    );
    assert.equal(
      row!.pptxRasterFallback,
      true,
      `"${kind}" should have pptxRasterFallback=true`,
    );
  }
});

// ---------------------------------------------------------------------------
// getKindExportSupport
// ---------------------------------------------------------------------------

test("getKindExportSupport returns correct row for flowchart", () => {
  const row = getKindExportSupport("flowchart");
  assert.equal(row.kind, "flowchart");
  assert.equal(row.svg, true);
  assert.equal(row.pptxNative, true);
});

test("getKindExportSupport returns correct row for chart", () => {
  const row = getKindExportSupport("chart");
  assert.equal(row.kind, "chart");
  assert.equal(row.pptxNative, false);
  assert.equal(row.pptxRasterFallback, true);
});

// ---------------------------------------------------------------------------
// getKindsForFormat
// ---------------------------------------------------------------------------

test("getKindsForFormat pptx-native returns only positioned graph kinds", () => {
  const nativeKinds = getKindsForFormat("pptx-native");
  for (const kind of ["flowchart", "mindmap", "concept", "orgchart"]) {
    assert.ok(
      nativeKinds.includes(kind as never),
      `Expected "${kind}" to support pptx-native`,
    );
  }
  // Derived kinds should NOT appear
  for (const kind of ["chart", "list", "timeline"]) {
    assert.equal(
      nativeKinds.includes(kind as never),
      false,
      `"${kind}" should not support pptx-native`,
    );
  }
});

test("getKindsForFormat svg returns all kinds", () => {
  const svgKinds = getKindsForFormat("svg");
  assert.equal(svgKinds.length, VISUAL_KINDS.length);
});

// ---------------------------------------------------------------------------
// kindSupportsFormat
// ---------------------------------------------------------------------------

test("kindSupportsFormat for flowchart/pptx-native is true", () => {
  assert.equal(kindSupportsFormat("flowchart", "pptx-native"), true);
});

test("kindSupportsFormat for chart/pptx-native is false", () => {
  assert.equal(kindSupportsFormat("chart", "pptx-native"), false);
});

test("kindSupportsFormat for chart/png is true", () => {
  assert.equal(kindSupportsFormat("chart", "png"), true);
});

// ---------------------------------------------------------------------------
// Prompt constraints
// ---------------------------------------------------------------------------

test("buildKindPromptConstraints returns one entry per VisualKind", () => {
  const constraints = buildKindPromptConstraints();
  assert.equal(constraints.length, VISUAL_KINDS.length);
  for (const kind of VISUAL_KINDS) {
    assert.ok(
      constraints.some((c) => c.kind === kind),
      `Missing prompt constraint for "${kind}"`,
    );
  }
});

test("every prompt constraint has non-empty guidance", () => {
  const constraints = buildKindPromptConstraints();
  for (const c of constraints) {
    assert.ok(c.guidance.length > 0, `"${c.kind}" has empty prompt guidance`);
  }
});

test("chart prompt constraint requires node value", () => {
  const entry = getKindPromptEntry("chart");
  assert.equal(entry.requiresNodeValue, true);
  assert.equal(entry.requiresNodePosition, false);
});

test("flowchart prompt constraint requires node position and has edges", () => {
  const entry = getKindPromptEntry("flowchart");
  assert.equal(entry.requiresNodePosition, true);
  assert.equal(entry.edgesRelevant, true);
});

test("cycle prompt constraint does not require position", () => {
  const entry = getKindPromptEntry("cycle");
  assert.equal(entry.requiresNodePosition, false);
  assert.equal(entry.edgesRelevant, false);
});

// ---------------------------------------------------------------------------
// buildKindGuidanceRecord
// ---------------------------------------------------------------------------

test("buildKindGuidanceRecord has one entry per VisualKind", () => {
  const record = buildKindGuidanceRecord();
  for (const kind of VISUAL_KINDS) {
    assert.ok(
      kind in record,
      `buildKindGuidanceRecord missing entry for "${kind}"`,
    );
    assert.ok(record[kind].length > 0, `"${kind}" guidance is empty`);
  }
});

// ---------------------------------------------------------------------------
// Completeness guard
// ---------------------------------------------------------------------------

test("assertSupportMatricesComplete does not throw", () => {
  assert.doesNotThrow(() => assertSupportMatricesComplete());
});
