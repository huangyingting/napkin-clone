import { test } from "node:test";
import assert from "node:assert/strict";

import { isRailWidth, RAIL_BREAKPOINT_PX } from "./rail-state";

test("isRailWidth: returns false below breakpoint", () => {
  assert.equal(isRailWidth(0), false);
  assert.equal(isRailWidth(768), false);
  assert.equal(isRailWidth(RAIL_BREAKPOINT_PX - 1), false);
});

test("isRailWidth: returns true at breakpoint", () => {
  assert.equal(isRailWidth(RAIL_BREAKPOINT_PX), true);
});

test("isRailWidth: returns true above breakpoint", () => {
  assert.equal(isRailWidth(RAIL_BREAKPOINT_PX + 100), true);
  assert.equal(isRailWidth(1440), true);
  assert.equal(isRailWidth(2560), true);
});

test("RAIL_BREAKPOINT_PX is a positive integer", () => {
  assert.ok(Number.isInteger(RAIL_BREAKPOINT_PX));
  assert.ok(RAIL_BREAKPOINT_PX > 0);
});
