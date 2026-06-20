import { test } from "node:test";
import assert from "node:assert/strict";

import { computeAnchoredPosition, type AnchorRect } from "./anchored-position";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an AnchorRect from top/left/width/height. */
function rect(
  top: number,
  left: number,
  width: number,
  height: number,
): AnchorRect {
  return {
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

/** True when the float box overlaps the anchor box (touching edges is fine). */
function overlaps(
  pos: { top: number; left: number },
  size: { width: number; height: number },
  anchor: AnchorRect,
): boolean {
  const floatRight = pos.left + size.width;
  const floatBottom = pos.top + size.height;
  const separated =
    floatRight <= anchor.left ||
    pos.left >= anchor.right ||
    floatBottom <= anchor.top ||
    pos.top >= anchor.bottom;
  return !separated;
}

const VIEWPORT = { width: 1000, height: 800 };

// ---------------------------------------------------------------------------
// Default placement when there is ample room
// ---------------------------------------------------------------------------

test("default placement: sits above a centred anchor with ample room", () => {
  const anchor = rect(400, 450, 100, 40);
  const float = { width: 200, height: 50 };
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    gap: 10,
  });

  assert.equal(result.placement, "top");
  // top = anchor.top - gap - height
  assert.equal(result.top, 400 - 10 - 50);
  // centred horizontally over the anchor
  assert.equal(result.left, 450 + 100 / 2 - 200 / 2);
  assert.equal(overlaps(result, float, anchor), false);
});

test("default placement honours an explicit preferred side (bottom)", () => {
  const anchor = rect(300, 450, 100, 40);
  const float = { width: 200, height: 50 };
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "bottom",
    gap: 12,
  });

  assert.equal(result.placement, "bottom");
  assert.equal(result.top, anchor.bottom + 12);
  assert.equal(overlaps(result, float, anchor), false);
});

// ---------------------------------------------------------------------------
// Auto-flip
// ---------------------------------------------------------------------------

test("flips top -> bottom when there is not enough room above", () => {
  // Anchor near the top edge: no room for a 50px float + gap above it.
  const anchor = rect(20, 450, 100, 40);
  const float = { width: 200, height: 50 };
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "top",
    gap: 10,
    padding: 8,
  });

  assert.equal(result.placement, "bottom");
  assert.equal(result.top, anchor.bottom + 10);
  assert.equal(overlaps(result, float, anchor), false);
});

test("flips bottom -> top when there is not enough room below", () => {
  // Anchor near the bottom edge.
  const anchor = rect(740, 450, 100, 40);
  const float = { width: 200, height: 50 };
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "bottom",
    gap: 10,
  });

  assert.equal(result.placement, "top");
  assert.equal(result.top, anchor.top - 10 - 50);
  assert.equal(overlaps(result, float, anchor), false);
});

test("flips left -> right when there is not enough room to the left", () => {
  const anchor = rect(400, 20, 60, 60);
  const float = { width: 300, height: 100 };
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "left",
    gap: 8,
  });

  assert.equal(result.placement, "right");
  assert.equal(result.left, anchor.right + 8);
  assert.equal(overlaps(result, float, anchor), false);
});

test("does NOT flip when the preferred side fits, even if opposite has more room", () => {
  // Plenty of room above; opposite (below) has even more, but we keep preferred.
  const anchor = rect(200, 450, 100, 40);
  const float = { width: 200, height: 50 };
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "top",
    gap: 10,
  });

  assert.equal(result.placement, "top");
});

test("keeps the roomier side when neither side fits", () => {
  // Tall float that fits on neither side; anchor closer to the bottom so the
  // top has more room — stay on top.
  const anchor = rect(500, 450, 100, 40);
  const float = { width: 200, height: 600 };
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "bottom",
    gap: 10,
  });

  // spaceTop = 500 - 8 = 492, spaceBottom = 800 - 540 - 8 = 252 -> flip to top.
  assert.equal(result.placement, "top");
  assert.equal(overlaps(result, float, anchor), false);
});

// ---------------------------------------------------------------------------
// Cross-axis shift / clamp
// ---------------------------------------------------------------------------

test("clamps to the right viewport edge when the anchor sits far right", () => {
  // Wide-article case: anchor near the right edge would push a wide float off
  // the screen — clamp it back inside the padding.
  const anchor = rect(400, 950, 40, 40);
  const float = { width: 300, height: 50 };
  const padding = 8;
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    padding,
  });

  assert.equal(result.left, VIEWPORT.width - float.width - padding);
  assert.ok(result.left + float.width <= VIEWPORT.width - padding);
});

test("clamps to the left viewport edge when the anchor sits far left", () => {
  const anchor = rect(400, 10, 40, 40);
  const float = { width: 300, height: 50 };
  const padding = 8;
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    padding,
  });

  assert.equal(result.left, padding);
  assert.ok(result.left >= padding);
});

test("clamps the cross-axis (vertical) for left/right placements", () => {
  // Anchor near the top edge; centring a tall float would overflow the top.
  const anchor = rect(10, 500, 60, 60);
  const float = { width: 200, height: 200 };
  const padding = 8;
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "right",
    padding,
  });

  assert.equal(result.placement, "right");
  assert.equal(result.top, padding);
  assert.ok(result.top >= padding);
});

// ---------------------------------------------------------------------------
// Margin / gap is respected
// ---------------------------------------------------------------------------

test("respects the margin (gap) between anchor and float", () => {
  const anchor = rect(400, 450, 100, 40);
  const float = { width: 200, height: 50 };

  const gap5 = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "top",
    gap: 5,
  });
  const gap25 = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "top",
    gap: 25,
  });

  assert.equal(gap5.top, 400 - 5 - 50);
  assert.equal(gap25.top, 400 - 25 - 50);
  // A larger gap pushes the float further from the anchor.
  assert.equal(anchor.top - (gap25.top + float.height), 25);
  assert.equal(anchor.top - (gap5.top + float.height), 5);
});

test("respects the gap on a bottom placement", () => {
  const anchor = rect(300, 450, 100, 40);
  const float = { width: 200, height: 50 };
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "bottom",
    gap: 16,
  });
  assert.equal(result.top - anchor.bottom, 16);
});

// ---------------------------------------------------------------------------
// Collision avoidance — never covers the anchor
// ---------------------------------------------------------------------------

test("never overlaps the anchor across a sweep of anchor positions", () => {
  const float = { width: 240, height: 120 };
  const placements = ["top", "bottom", "left", "right"] as const;
  for (let top = 0; top <= 760; top += 40) {
    for (let left = 0; left <= 960; left += 40) {
      const anchor = rect(top, left, 80, 40);
      for (const placement of placements) {
        const result = computeAnchoredPosition({
          anchor,
          float,
          viewport: VIEWPORT,
          placement,
          gap: 8,
          padding: 8,
        });
        assert.equal(
          overlaps(result, float, anchor),
          false,
          `overlap at top=${top} left=${left} placement=${placement}`,
        );
      }
    }
  }
});

test("never overlaps even when the float is larger than the viewport span on both sides", () => {
  const anchor = rect(380, 480, 60, 40);
  const float = { width: 200, height: 900 };
  const result = computeAnchoredPosition({
    anchor,
    float,
    viewport: VIEWPORT,
    placement: "top",
    gap: 8,
  });
  assert.equal(overlaps(result, float, anchor), false);
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

test("uses default placement, gap and padding when omitted", () => {
  const anchor = rect(400, 450, 100, 40);
  const float = { width: 200, height: 50 };
  const result = computeAnchoredPosition({ anchor, float, viewport: VIEWPORT });

  // default placement "top", default gap 8
  assert.equal(result.placement, "top");
  assert.equal(result.top, 400 - 8 - 50);
});
