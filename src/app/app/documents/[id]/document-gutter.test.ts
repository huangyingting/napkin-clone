import assert from "node:assert/strict";
import { test } from "node:test";

import {
  leftGutterButtonLeft,
  rightGutterButtonLeft,
  rightGutterPanelLeft,
} from "./document-gutter";

test("gutter button helpers prefer the side with available viewport space", () => {
  assert.equal(leftGutterButtonLeft({ left: 100, right: 300 }), 56);
  assert.equal(leftGutterButtonLeft({ left: 40, right: 200 }), null);
  assert.equal(rightGutterButtonLeft({ left: 100, right: 300 }, 400), 308);
  assert.equal(rightGutterButtonLeft({ left: 100, right: 360 }, 400), 56);
});

test("rightGutterPanelLeft falls back left or clamps into the viewport", () => {
  assert.equal(rightGutterPanelLeft({ left: 100, right: 300 }, 120, 500), 342);
  assert.equal(rightGutterPanelLeft({ left: 100, right: 300 }, 120, 470), 342);
  assert.equal(rightGutterPanelLeft({ left: 200, right: 360 }, 160, 400), 32);
  assert.equal(rightGutterPanelLeft({ left: 40, right: 360 }, 300, 320), 12);
});

test("rightGutterPanelLeft uses the right-side panel slot at the viewport boundary", () => {
  assert.equal(rightGutterPanelLeft({ left: 80, right: 200 }, 100, 350), 242);
});
