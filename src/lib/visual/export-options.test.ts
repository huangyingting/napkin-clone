import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyExportOptionsToSvg,
  computeExportDimensions,
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
} from "@/lib/visual/export-options";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><rect x="0" y="0" width="800" height="600" fill="#ffffff"/><circle cx="400" cy="300" r="50" fill="#6366f1"/></svg>`;
const BASE_SVG_NO_BG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><circle cx="400" cy="300" r="50" fill="#6366f1"/></svg>`;
const BASE_SVG_WITH_DEFS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><marker id="m1"/></defs><circle cx="400" cy="300" r="50" fill="#6366f1"/></svg>`;

function makeOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return { ...DEFAULT_EXPORT_OPTIONS, ...overrides };
}

// ---------------------------------------------------------------------------
// computeExportDimensions
// ---------------------------------------------------------------------------

test("computeExportDimensions: 1x returns natural dimensions", () => {
  const dims = computeExportDimensions({ width: 800, height: 600 }, 1);
  assert.deepEqual(dims, { width: 800, height: 600 });
});

test("computeExportDimensions: 2x doubles both dimensions", () => {
  const dims = computeExportDimensions({ width: 400, height: 300 }, 2);
  assert.deepEqual(dims, { width: 800, height: 600 });
});

test("computeExportDimensions: 3x triples both dimensions", () => {
  const dims = computeExportDimensions({ width: 100, height: 50 }, 3);
  assert.deepEqual(dims, { width: 300, height: 150 });
});

test("computeExportDimensions: fractional scale rounds to integer", () => {
  const dims = computeExportDimensions({ width: 300, height: 200 }, 1.5);
  assert.equal(dims.width, 450);
  assert.equal(dims.height, 300);
});

// ---------------------------------------------------------------------------
// applyExportOptionsToSvg — background: include (no-op)
// ---------------------------------------------------------------------------

test("background include: SVG is unchanged (no background transform applied)", () => {
  const opts = makeOptions({ background: "include" });
  const result = applyExportOptionsToSvg(BASE_SVG, opts);
  // Existing background rect should still be present
  assert.ok(
    result.includes('fill="#ffffff"'),
    "background rect fill should be preserved",
  );
  // Core content should still be present
  assert.ok(result.includes("#6366f1"), "content fill should be preserved");
});

// ---------------------------------------------------------------------------
// applyExportOptionsToSvg — background: transparent
// ---------------------------------------------------------------------------

test("background transparent: strips a leading background rect", () => {
  const opts = makeOptions({ background: "transparent", colorMode: "color" });
  const result = applyExportOptionsToSvg(BASE_SVG, opts);
  // The white background rect should be gone; the content circle should remain
  assert.ok(
    result.includes("#6366f1"),
    "content circle should still be present",
  );
  // The SVG root should still be present
  assert.ok(result.includes("<svg"), "svg element should still be present");
  assert.ok(
    result.includes("</svg>"),
    "svg closing tag should still be present",
  );
});

test("background transparent: SVG without background rect is unchanged", () => {
  const opts = makeOptions({ background: "transparent", colorMode: "color" });
  const result = applyExportOptionsToSvg(BASE_SVG_NO_BG, opts);
  assert.ok(result.includes("#6366f1"), "content fill should still be present");
  assert.ok(result.includes("<svg"), "svg element should still be present");
});

// ---------------------------------------------------------------------------
// applyExportOptionsToSvg — background: custom
// ---------------------------------------------------------------------------

test("background custom: injects a background rect with the custom fill", () => {
  const opts = makeOptions({
    background: "custom",
    customBackground: "#ff0000",
    colorMode: "color",
  });
  const result = applyExportOptionsToSvg(BASE_SVG_NO_BG, opts);
  assert.ok(
    result.includes('fill="#ff0000"'),
    "custom background fill should be injected",
  );
  assert.ok(
    result.includes('data-export-bg="true"'),
    "injected rect should carry the marker attribute",
  );
});

test("background custom: default fallback is white when customBackground is omitted", () => {
  const opts = makeOptions({ background: "custom", colorMode: "color" });
  const result = applyExportOptionsToSvg(BASE_SVG_NO_BG, opts);
  assert.ok(
    result.includes('fill="#ffffff"'),
    "fallback white background should be injected",
  );
});

test("background custom: injected rect dimensions match viewBox", () => {
  const opts = makeOptions({
    background: "custom",
    customBackground: "#0000ff",
    colorMode: "color",
  });
  const result = applyExportOptionsToSvg(BASE_SVG_NO_BG, opts);
  // The rect should use the viewBox dimensions (800 x 600)
  assert.ok(result.includes('width="800"'), "rect width should match viewBox");
  assert.ok(
    result.includes('height="600"'),
    "rect height should match viewBox",
  );
});

// ---------------------------------------------------------------------------
// applyExportOptionsToSvg — colorMode: mono
// ---------------------------------------------------------------------------

test("colorMode mono: injects a greyscale feColorMatrix filter", () => {
  const opts = makeOptions({ colorMode: "mono", background: "include" });
  const result = applyExportOptionsToSvg(BASE_SVG_NO_BG, opts);
  assert.ok(
    result.includes("feColorMatrix"),
    "feColorMatrix filter element should be injected",
  );
  assert.ok(
    result.includes('type="saturate"'),
    "feColorMatrix should use saturate type",
  );
  assert.ok(
    result.includes('values="0"'),
    "feColorMatrix should have values=0 for greyscale",
  );
});

test("colorMode mono: wraps content in a filter group", () => {
  const opts = makeOptions({ colorMode: "mono", background: "include" });
  const result = applyExportOptionsToSvg(BASE_SVG_NO_BG, opts);
  assert.ok(
    result.includes('filter="url(#__export_mono__)"'),
    "content should be wrapped in a mono filter group",
  );
});

test("colorMode mono: inserts filter into existing <defs>", () => {
  const opts = makeOptions({ colorMode: "mono", background: "include" });
  const result = applyExportOptionsToSvg(BASE_SVG_WITH_DEFS, opts);
  // Should NOT create a second <defs> block
  const defsCount = (result.match(/<defs/g) ?? []).length;
  assert.equal(defsCount, 1, "should reuse existing <defs> block");
  assert.ok(
    result.includes("feColorMatrix"),
    "filter should be injected inside existing <defs>",
  );
});

test("colorMode mono: creates <defs> when none exists", () => {
  const opts = makeOptions({ colorMode: "mono", background: "include" });
  const result = applyExportOptionsToSvg(BASE_SVG_NO_BG, opts);
  assert.ok(result.includes("<defs>"), "defs block should be created");
});

test("colorMode color (default): no filter is injected", () => {
  const opts = makeOptions({ colorMode: "color", background: "include" });
  const result = applyExportOptionsToSvg(BASE_SVG_NO_BG, opts);
  assert.ok(
    !result.includes("feColorMatrix"),
    "no filter should be injected for color mode",
  );
  assert.ok(
    !result.includes("__export_mono__"),
    "mono filter id should not be present",
  );
});

// ---------------------------------------------------------------------------
// applyExportOptionsToSvg — combined options
// ---------------------------------------------------------------------------

test("transparent + mono: applies both transforms correctly", () => {
  const opts = makeOptions({ background: "transparent", colorMode: "mono" });
  const result = applyExportOptionsToSvg(BASE_SVG, opts);
  // Background rect should be stripped
  assert.ok(
    result.includes("#6366f1"),
    "content circle should still be present after background strip",
  );
  // Mono filter should be applied
  assert.ok(result.includes("feColorMatrix"), "mono filter should be applied");
});

test("custom bg + mono: injects both background rect and mono filter", () => {
  const opts = makeOptions({
    background: "custom",
    customBackground: "#cccccc",
    colorMode: "mono",
  });
  const result = applyExportOptionsToSvg(BASE_SVG_NO_BG, opts);
  assert.ok(
    result.includes('fill="#cccccc"'),
    "custom background should be injected",
  );
  assert.ok(result.includes("feColorMatrix"), "mono filter should be injected");
});
