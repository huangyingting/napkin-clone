/**
 * Tests for resolveExportCapabilities.
 *
 * Pure-Node tests (node --import tsx --test) — no DOM, no jsdom, no React.
 * Covers the free / Plus / Pro states required by issue #93 acceptance criteria.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PLAN_ENTITLEMENTS } from "@/lib/billing/catalog";
import {
  resolveExportCapabilities,
  type ExportCapabilities,
} from "@/lib/visual/export-capabilities";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function caps(plan: keyof typeof PLAN_ENTITLEMENTS): ExportCapabilities {
  return resolveExportCapabilities(PLAN_ENTITLEMENTS[plan]);
}

// ---------------------------------------------------------------------------
// Free tier
// ---------------------------------------------------------------------------

describe("resolveExportCapabilities — free plan", () => {
  it("disables SVG export", () => {
    assert.strictEqual(caps("free").canSvg, false);
  });

  it("disables PPTX export", () => {
    assert.strictEqual(caps("free").canPptx, false);
  });

  it("disables watermark removal", () => {
    assert.strictEqual(caps("free").canRemoveWatermark, false);
  });

  it("signals upgrade is needed", () => {
    assert.strictEqual(caps("free").showUpgrade, true);
  });
});

// ---------------------------------------------------------------------------
// Plus tier
// ---------------------------------------------------------------------------

describe("resolveExportCapabilities — plus plan", () => {
  it("enables SVG export", () => {
    assert.strictEqual(caps("plus").canSvg, true);
  });

  it("enables PPTX export", () => {
    assert.strictEqual(caps("plus").canPptx, true);
  });

  it("enables watermark removal", () => {
    assert.strictEqual(caps("plus").canRemoveWatermark, true);
  });

  it("does NOT signal upgrade when all features are unlocked", () => {
    assert.strictEqual(caps("plus").showUpgrade, false);
  });
});

// ---------------------------------------------------------------------------
// Pro tier
// ---------------------------------------------------------------------------

describe("resolveExportCapabilities — pro plan", () => {
  it("enables SVG export", () => {
    assert.strictEqual(caps("pro").canSvg, true);
  });

  it("enables PPTX export", () => {
    assert.strictEqual(caps("pro").canPptx, true);
  });

  it("enables watermark removal", () => {
    assert.strictEqual(caps("pro").canRemoveWatermark, true);
  });

  it("does NOT signal upgrade when all features are unlocked", () => {
    assert.strictEqual(caps("pro").showUpgrade, false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases (undefined / partial)
// ---------------------------------------------------------------------------

describe("resolveExportCapabilities — undefined entitlements (safe default)", () => {
  it("falls back to free-tier limits when entitlements are absent", () => {
    const result = resolveExportCapabilities(undefined);
    assert.deepStrictEqual(result, {
      canSvg: false,
      canPptx: false,
      canRemoveWatermark: false,
      showUpgrade: true,
    });
  });
});

describe("resolveExportCapabilities — partial entitlements", () => {
  it("showUpgrade is true when only one feature is locked", () => {
    const result = resolveExportCapabilities({
      svgExport: true,
      pptxExport: true,
      removeWatermark: false,
    });
    assert.strictEqual(result.canSvg, true);
    assert.strictEqual(result.canPptx, true);
    assert.strictEqual(result.canRemoveWatermark, false);
    assert.strictEqual(result.showUpgrade, true);
  });

  it("showUpgrade is false when all three features are enabled", () => {
    const result = resolveExportCapabilities({
      svgExport: true,
      pptxExport: true,
      removeWatermark: true,
    });
    assert.strictEqual(result.showUpgrade, false);
  });
});
