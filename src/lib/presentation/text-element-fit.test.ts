/**
 * Tests for text fit mode helpers introduced in issue #333.
 *
 * Coverage:
 *  - `isAutoHeight`           — default and explicit modes
 *  - `textFitPaddingPct`      — text vs bullets padding slack
 *  - `shrinkFontSizeToFit`    — binary-search convergence via mock measurer
 *  - `fitNewTextElementBox`   — sizing a new element via mock measurer
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { TextLikeElement, TextResizeMeasurer } from "./text-element-fit";
import {
  fitNewTextElementBox,
  fitTextElementToContent,
  isAutoHeight,
  shrinkFontSizeToFit,
  textFitPaddingPct,
} from "./text-element-fit";

// ---------------------------------------------------------------------------
// Minimal element factories
// ---------------------------------------------------------------------------

function textEl(overrides: {
  fitMode?: "auto-height" | "fixed-box" | "shrink-to-fit";
  fontSize?: number;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
}): TextLikeElement {
  return {
    kind: "text",
    id: "t",
    box: { x: 10, y: 10, w: 40, h: 20 },
    text: "Hello world",
    paragraphs: [{ text: "Hello world" }],
    style: {
      fontSize: overrides.fontSize ?? 5,
      bold: false,
      italic: false,
      align: overrides.align ?? "left",
      ...(overrides.verticalAlign !== undefined
        ? { verticalAlign: overrides.verticalAlign }
        : {}),
    },
    ...(overrides.fitMode !== undefined ? { fitMode: overrides.fitMode } : {}),
  };
}

function bulletsEl(fontSize = 5): TextLikeElement {
  return {
    kind: "text",
    id: "b",
    box: { x: 10, y: 10, w: 40, h: 20 },
    text: "one\ntwo",
    paragraphs: [
      { text: "one", listType: "bullet" },
      { text: "two", listType: "bullet" },
    ],
    textRole: "bullet",
    style: { fontSize, bold: false, italic: false, align: "left" },
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

// ---------------------------------------------------------------------------
// textFitPaddingPct
// ---------------------------------------------------------------------------

test("textFitPaddingPct returns 2×AUTO_FIT_PADDING for text elements", () => {
  const el = textEl({ fontSize: 5 });
  // AUTO_FIT_PADDING_PCT = 1.2, so 1.2 * 2 = 2.4 for text elements
  const result = textFitPaddingPct(el);
  assert.ok(
    result >= 2.4 && result <= 2.41,
    `Expected padding ≈ 2.4, got ${result}`,
  );
});

test("textFitPaddingPct adds font-relative slack for bullets elements", () => {
  const textResult = textFitPaddingPct(textEl({ fontSize: 5 }));
  const bulletsResult = textFitPaddingPct(bulletsEl(5));
  assert.ok(
    bulletsResult > textResult,
    `Bullets padding ${bulletsResult} should exceed text padding ${textResult}`,
  );
});

test("textFitPaddingPct scales bullets slack with fontSize", () => {
  const small = textFitPaddingPct(bulletsEl(4));
  const large = textFitPaddingPct(bulletsEl(10));
  assert.ok(
    large > small,
    `Larger font size should produce larger bullets padding (${large} > ${small})`,
  );
});

// ---------------------------------------------------------------------------
// fitNewTextElementBox
// ---------------------------------------------------------------------------

test("fitNewTextElementBox fits box to measured content dimensions", () => {
  // mockMeasurer(1): height = fontSize = 5; minWidth = 5; maxWidth = 40
  const el = textEl({ fontSize: 5 });
  const box = { x: 10, y: 10, w: 50, h: 30 };
  const measurer = mockMeasurer(1);
  const result = fitNewTextElementBox(el, box, measurer);
  // Width clamped between minWidth(5) and maxContentWidth(40)
  assert.equal(result.w, 40, `Expected width 40, got ${result.w}`);
  // Height = measureHeightPct(40, 5) + padding = 5 + 2.4 = 7.4 (≈)
  assert.ok(result.h > 5 && result.h < 15, `Height ${result.h} out of range`);
  // top-left anchor: x and y should be unchanged (element fits within slide)
  assert.equal(result.x, box.x);
  assert.equal(result.y, box.y);
});

test("fitNewTextElementBox respects top-left anchor (default)", () => {
  const el = textEl({ fontSize: 5 });
  const box = { x: 10, y: 10, w: 50, h: 30 };
  const measurer = mockMeasurer(1);
  const result = fitNewTextElementBox(el, box, measurer, "top-left");
  assert.equal(result.x, box.x);
  assert.equal(result.y, box.y);
});

test("fitNewTextElementBox centers element for center anchor", () => {
  const el = textEl({ fontSize: 5 });
  const box = { x: 0, y: 0, w: 50, h: 30 };
  const measurer = mockMeasurer(1);
  const result = fitNewTextElementBox(el, box, measurer, "center");
  // Center X of result should equal center X of box
  const resultCenterX = result.x + result.w / 2;
  const boxCenterX = box.x + box.w / 2;
  assert.ok(
    Math.abs(resultCenterX - boxCenterX) < 0.5,
    `Center X ${resultCenterX} should be close to box center ${boxCenterX}`,
  );
});

test("fitNewTextElementBox preserves left-aligned rendered text position", () => {
  const el = textEl({ fontSize: 5, align: "left" });
  const box = { x: 6, y: 26, w: 88, h: 66 };
  const measurer = mockMeasurer(1);
  const result = fitNewTextElementBox(
    el,
    box,
    measurer,
    "preserve-text-position",
  );

  assert.equal(result.x, box.x);
  assert.ok(result.h < box.h, "expected fitted height to shrink");
  assert.ok(
    Math.abs(result.y + result.h / 2 - (box.y + box.h / 2)) < 0.5,
    "middle-aligned text should keep its vertical center",
  );
});

test("fitNewTextElementBox preserves right and bottom aligned rendered text position", () => {
  const el = textEl({ fontSize: 5, align: "right", verticalAlign: "bottom" });
  const box = { x: 10, y: 20, w: 60, h: 40 };
  const measurer = mockMeasurer(1);
  const result = fitNewTextElementBox(
    el,
    box,
    measurer,
    "preserve-text-position",
  );

  assert.ok(Math.abs(result.x + result.w - (box.x + box.w)) < 0.5);
  assert.ok(Math.abs(result.y + result.h - (box.y + box.h)) < 0.5);
});

test("fitTextElementToContent returns an element with a fitted box", () => {
  const el = textEl({ fontSize: 5 });
  const measurer = mockMeasurer(1);
  const result = fitTextElementToContent(el, measurer);
  assert.equal(result.id, el.id);
  assert.equal(result.kind, el.kind);
  assert.notDeepEqual(result.box, el.box);
});

test("fitNewTextElementBox clamps to slide boundaries", () => {
  const el = textEl({ fontSize: 5 });
  // Box near the right/bottom edge; content may overflow without clamping
  const box = { x: 70, y: 70, w: 50, h: 30 };
  const measurer = mockMeasurer(1);
  const result = fitNewTextElementBox(el, box, measurer);
  assert.ok(result.x >= 0 && result.x + result.w <= 100, "X out of bounds");
  assert.ok(result.y >= 0 && result.y + result.h <= 100, "Y out of bounds");
});
