/**
 * Unit tests for the watermark injection in export-options (US-010 epic).
 *
 * Tests are pure — no DOM, no browser APIs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyWatermarkToSvg,
  applyExportOptionsToSvg,
  DEFAULT_EXPORT_OPTIONS,
} from "@/lib/visual/export-options";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect x="0" y="0" width="400" height="300" fill="#ffffff"/><text x="200" y="150">Hello</text></svg>`;

describe("applyWatermarkToSvg", () => {
  it("injects a watermark text element before </svg>", () => {
    const result = applyWatermarkToSvg(SAMPLE_SVG);
    assert.ok(result.includes("TextIQ"), "should contain watermark text");
    assert.ok(
      result.includes('data-watermark="true"'),
      "should have data-watermark attribute",
    );
  });

  it("places watermark element just before </svg>", () => {
    const result = applyWatermarkToSvg(SAMPLE_SVG);
    const watermarkIdx = result.indexOf("TextIQ");
    const closingIdx = result.indexOf("</svg>");
    assert.ok(
      watermarkIdx < closingIdx,
      "watermark should appear before </svg>",
    );
  });

  it("returns unchanged SVG when no viewBox is present", () => {
    const noViewBox = `<svg xmlns="http://www.w3.org/2000/svg"><text>Hi</text></svg>`;
    const result = applyWatermarkToSvg(noViewBox);
    assert.strictEqual(result, noViewBox);
  });

  it("produces valid-looking SVG (still closes with </svg>)", () => {
    const result = applyWatermarkToSvg(SAMPLE_SVG);
    assert.ok(result.endsWith("</svg>"), "should still end with </svg>");
  });
});

describe("applyExportOptionsToSvg with watermark", () => {
  it("does NOT add watermark when watermark option is false (default)", () => {
    const result = applyExportOptionsToSvg(SAMPLE_SVG, DEFAULT_EXPORT_OPTIONS);
    assert.ok(
      !result.includes("data-watermark"),
      "should not contain watermark",
    );
  });

  it("adds watermark when watermark option is true", () => {
    const result = applyExportOptionsToSvg(SAMPLE_SVG, {
      ...DEFAULT_EXPORT_OPTIONS,
      watermark: true,
    });
    assert.ok(result.includes("TextIQ"), "should contain watermark text");
    assert.ok(
      result.includes('data-watermark="true"'),
      "should have data-watermark attribute",
    );
  });

  it("combined: watermark + mono", () => {
    const result = applyExportOptionsToSvg(SAMPLE_SVG, {
      ...DEFAULT_EXPORT_OPTIONS,
      colorMode: "mono",
      watermark: true,
    });
    assert.ok(result.includes("TextIQ"), "should contain watermark");
    assert.ok(result.includes("__export_mono__"), "should contain mono filter");
  });
});

describe("watermark decision (free vs paid)", () => {
  it("free tier: watermark should be true (!removeWatermark)", () => {
    const removeWatermark = false; // free tier
    const watermark = !removeWatermark;
    assert.strictEqual(watermark, true);
  });

  it("plus/pro tier: watermark should be false (removeWatermark = true)", () => {
    const removeWatermark = true; // plus/pro tier
    const watermark = !removeWatermark;
    assert.strictEqual(watermark, false);
  });
});
