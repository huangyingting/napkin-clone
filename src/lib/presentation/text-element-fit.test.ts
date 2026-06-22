/**
 * Tests for text fit mode helpers introduced in issue #333.
 *
 * Coverage:
 *  - `isAutoHeight`           — default and explicit modes
 *  - `shrinkFontSizeToFit`    — binary-search convergence via mock measurer
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { TextLikeElement, TextResizeMeasurer } from "./text-element-fit";
import { isAutoHeight, shrinkFontSizeToFit } from "./text-element-fit";

// ---------------------------------------------------------------------------
// Minimal element factories
// ---------------------------------------------------------------------------

function textEl(overrides: {
  fitMode?: "auto-height" | "fixed-box" | "shrink-to-fit";
  fontSize?: number;
}): TextLikeElement {
  return {
    kind: "text",
    id: "t",
    box: { x: 10, y: 10, w: 40, h: 20 },
    text: "Hello world",
    role: "body",
    style: {
      fontSize: overrides.fontSize ?? 5,
      bold: false,
      italic: false,
      align: "left",
    },
    ...(overrides.fitMode !== undefined ? { fitMode: overrides.fitMode } : {}),
  };
}

// ---------------------------------------------------------------------------
// isAutoHeight
// ---------------------------------------------------------------------------

test("isAutoHeight returns true when fitMode is absent", () => {
  assert.equal(isAutoHeight(textEl({})), true);
});

test("isAutoHeight returns true for explicit auto-height", () => {
  assert.equal(isAutoHeight(textEl({ fitMode: "auto-height" })), true);
});

test("isAutoHeight returns false for fixed-box", () => {
  assert.equal(isAutoHeight(textEl({ fitMode: "fixed-box" })), false);
});

test("isAutoHeight returns false for shrink-to-fit", () => {
  assert.equal(isAutoHeight(textEl({ fitMode: "shrink-to-fit" })), false);
});

// ---------------------------------------------------------------------------
// shrinkFontSizeToFit — mock measurer
// ---------------------------------------------------------------------------

/**
 * A mock measurer where content height is proportional to font size.
 * `measureHeightPct(el, widthPct, fontSizePct) = fontSizePct * heightFactor`.
 */
function mockMeasurer(heightFactor: number): TextResizeMeasurer {
  return {
    measureHeightPct: (_el, _widthPct, fontSizePct) =>
      fontSizePct * heightFactor,
    measureMinWidthPct: () => 5,
    measureMaxWidthPct: () => 40,
  };
}

test("shrinkFontSizeToFit returns original size when content already fits", () => {
  const el = textEl({ fontSize: 5 });
  // heightFactor = 1 → content height = 5; boxHeightPct = 20, padding ≈ 2.4
  // targetHeight ≈ 17.6 → 5 < 17.6, so no shrink needed
  const measurer = mockMeasurer(1);
  const result = shrinkFontSizeToFit(el, 40, 20, measurer);
  assert.equal(result, 5);
});

test("shrinkFontSizeToFit reduces font size when content overflows", () => {
  const el = textEl({ fontSize: 10 });
  // heightFactor = 4 → at fontSize=10, content height = 40
  // box height = 20, padding ≈ 2.4 → target ≈ 17.6
  // Expected shrink: ~17.6 / 40 * 10 ≈ 4.4
  const measurer = mockMeasurer(4);
  const result = shrinkFontSizeToFit(el, 40, 20, measurer);
  assert.ok(result < 10, `Expected font size < 10, got ${result}`);
  // Content at the shrunken size should now fit: result * 4 <= target
  const contentH = result * 4;
  const target = 20 - 2.4; // approx target without bullets slack
  assert.ok(
    contentH <= target + 0.1, // small tolerance
    `Content height ${contentH} should be ≤ target ${target}`,
  );
});

test("shrinkFontSizeToFit never returns below minFontSizePct", () => {
  const el = textEl({ fontSize: 10 });
  // heightFactor = 100 → always overflows, should clamp to min
  const measurer = mockMeasurer(100);
  const result = shrinkFontSizeToFit(el, 40, 20, measurer, 2);
  assert.equal(result, 2);
});

test("shrinkFontSizeToFit converges within 16 iterations", () => {
  const el = textEl({ fontSize: 8 });
  let callCount = 0;
  // Non-linear measurer: heights taper off at small sizes
  const measurer: TextResizeMeasurer = {
    measureHeightPct: (_el, _widthPct, fs) => {
      callCount++;
      return fs * 2.5;
    },
    measureMinWidthPct: () => 5,
    measureMaxWidthPct: () => 40,
  };
  const result = shrinkFontSizeToFit(el, 40, 20, measurer);
  // binary search does at most 16+1 calls (1 for the fast path check)
  assert.ok(callCount <= 17, `Expected ≤ 17 measurer calls, got ${callCount}`);
  assert.ok(result > 0 && result <= 8, `Result ${result} out of range`);
});
