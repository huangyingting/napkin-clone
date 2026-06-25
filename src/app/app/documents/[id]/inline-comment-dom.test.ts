import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeCommentCardPosition,
  normalizeInlineAnchorText,
  preferredRightSideCardLeft,
  type AnchorPosition,
} from "./inline-comment-dom";

function anchor(partial: Partial<AnchorPosition> = {}): AnchorPosition {
  return {
    text: "Paragraph",
    top: 120,
    iconLeft: 820,
    markerLeft: 820,
    ...partial,
  };
}

test("normalizeInlineAnchorText collapses whitespace and truncates", () => {
  assert.equal(normalizeInlineAnchorText("  Hello\n\nworld  "), "Hello world");
  assert.equal(normalizeInlineAnchorText("x".repeat(400)).length, 280);
});

test("preferredRightSideCardLeft places the card after the gutter button", () => {
  assert.equal(preferredRightSideCardLeft(anchor({ iconLeft: 100 })), 144);
});

test("computeCommentCardPosition clamps card to viewport", () => {
  const result = computeCommentCardPosition({
    anchor: anchor({ top: 5, iconLeft: 980 }),
    viewportWidth: 1000,
    viewportHeight: 300,
    measuredWidth: 240,
    measuredHeight: 120,
  });

  assert.equal(result.top, 10);
  assert.equal(result.left, 724);
  assert.equal(result.maxHeight, 280);
});
