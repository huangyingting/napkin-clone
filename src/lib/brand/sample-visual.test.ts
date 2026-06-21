/**
 * Unit tests for sample-visual helpers (issue #163).
 * DOM-free — runs with node:test.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SAMPLE_VISUAL_BASE,
  SAMPLE_BRAND,
  buildSampleBrandedVisual,
} from "@/lib/brand/sample-visual";
import { DEFAULT_STYLE } from "@/lib/visual/schema";

describe("SAMPLE_VISUAL_BASE", () => {
  it("is a valid flowchart with 4 nodes and 3 edges", () => {
    assert.equal(SAMPLE_VISUAL_BASE.type, "flowchart");
    assert.equal(SAMPLE_VISUAL_BASE.nodes.length, 4);
    assert.equal(SAMPLE_VISUAL_BASE.edges.length, 3);
  });
});

describe("buildSampleBrandedVisual", () => {
  it("applies brand colors to the visual", () => {
    const visual = buildSampleBrandedVisual(SAMPLE_BRAND);
    assert.equal(visual.style.background, SAMPLE_BRAND.background);
    assert.deepEqual(visual.style.palette, SAMPLE_BRAND.palette);
    assert.equal(visual.style.nodeStroke, SAMPLE_BRAND.nodeStroke);
    assert.equal(visual.style.nodeFill, SAMPLE_BRAND.nodeFill);
    assert.equal(visual.style.nodeText, SAMPLE_BRAND.nodeText);
    assert.equal(visual.style.edgeColor, SAMPLE_BRAND.edgeColor);
    assert.equal(visual.style.fontFamily, SAMPLE_BRAND.fontFamily);
  });

  it("does not mutate SAMPLE_VISUAL_BASE", () => {
    buildSampleBrandedVisual(SAMPLE_BRAND);
    assert.equal(SAMPLE_VISUAL_BASE.style.background, DEFAULT_STYLE.background);
    assert.deepEqual(SAMPLE_VISUAL_BASE.style.palette, DEFAULT_STYLE.palette);
  });

  it("preserves nodes and edges from the base", () => {
    const visual = buildSampleBrandedVisual(SAMPLE_BRAND);
    assert.equal(visual.nodes.length, SAMPLE_VISUAL_BASE.nodes.length);
    assert.equal(visual.edges.length, SAMPLE_VISUAL_BASE.edges.length);
    assert.equal(visual.nodes[0].label, SAMPLE_VISUAL_BASE.nodes[0].label);
  });

  it("preserves typography (fontSize, fontWeight)", () => {
    const visual = buildSampleBrandedVisual(SAMPLE_BRAND);
    assert.equal(visual.style.fontSize, DEFAULT_STYLE.fontSize);
    assert.equal(visual.style.fontWeight, DEFAULT_STYLE.fontWeight);
  });

  it("handles a brand with null fields gracefully", () => {
    const partialBrand = {
      ...SAMPLE_BRAND,
      nodeFill: null,
      fontFamily: null,
    };
    const visual = buildSampleBrandedVisual(partialBrand);
    // null fields fall back to DEFAULT_STYLE
    assert.equal(visual.style.nodeFill, DEFAULT_STYLE.nodeFill);
    assert.equal(visual.style.fontFamily, DEFAULT_STYLE.fontFamily);
    // set fields still applied
    assert.equal(visual.style.background, SAMPLE_BRAND.background);
  });

  it("returns a new object reference each call", () => {
    const v1 = buildSampleBrandedVisual(SAMPLE_BRAND);
    const v2 = buildSampleBrandedVisual(SAMPLE_BRAND);
    assert.notEqual(v1, v2);
    assert.notEqual(v1.style, v2.style);
  });
});
