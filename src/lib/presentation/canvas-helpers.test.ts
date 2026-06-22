import assert from "node:assert/strict";
import { test } from "node:test";

import { clientPointToStagePct, defaultTextBoxAtPoint } from "./canvas-helpers";

// ── clientPointToStagePct ───────────────────────────────────────────────────

test("clientPointToStagePct returns 50,50 for stage center", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  const result = clientPointToStagePct(200, 100, rect);
  assert.equal(result.x, 50);
  assert.equal(result.y, 50);
});

test("clientPointToStagePct returns 0,0 for top-left corner", () => {
  const rect = { left: 0, top: 0, width: 400, height: 300 };
  const result = clientPointToStagePct(0, 0, rect);
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
});

test("clientPointToStagePct returns 100,100 for bottom-right corner", () => {
  const rect = { left: 0, top: 0, width: 400, height: 300 };
  const result = clientPointToStagePct(400, 300, rect);
  assert.equal(result.x, 100);
  assert.equal(result.y, 100);
});

test("clientPointToStagePct handles non-zero rect origin", () => {
  const rect = { left: 50, top: 25, width: 200, height: 100 };
  const result = clientPointToStagePct(100, 50, rect);
  assert.equal(result.x, 25);
  assert.equal(result.y, 25);
});

// ── defaultTextBoxAtPoint ────────────────────────────────────────────────────

test("defaultTextBoxAtPoint centers box on click point", () => {
  // Center of stage → box should be centered there
  const box = defaultTextBoxAtPoint(50, 50);
  assert.equal(box.x, 30); // 50 - 40/2
  assert.equal(box.y, 42); // 50 - 16/2
  assert.equal(box.w, 40);
  assert.equal(box.h, 16);
});

test("defaultTextBoxAtPoint clamps x to 0 at left edge", () => {
  // Click very close to left edge — box cannot go negative
  const box = defaultTextBoxAtPoint(0, 50);
  assert.equal(box.x, 0);
  assert.equal(box.y, 42);
});

test("defaultTextBoxAtPoint clamps x to max at right edge", () => {
  // Click at right edge — box should not overflow
  const box = defaultTextBoxAtPoint(100, 50);
  assert.equal(box.x, 60); // 100 - 40
  assert.equal(box.y, 42);
});

test("defaultTextBoxAtPoint clamps y to 0 at top edge", () => {
  const box = defaultTextBoxAtPoint(50, 0);
  assert.equal(box.x, 30);
  assert.equal(box.y, 0);
});

test("defaultTextBoxAtPoint clamps y to max at bottom edge", () => {
  const box = defaultTextBoxAtPoint(50, 100);
  assert.equal(box.x, 30);
  assert.equal(box.y, 84); // 100 - 16
});

test("defaultTextBoxAtPoint accepts custom width and height", () => {
  const box = defaultTextBoxAtPoint(50, 50, 20, 10);
  assert.equal(box.x, 40); // 50 - 20/2
  assert.equal(box.y, 45); // 50 - 10/2
  assert.equal(box.w, 20);
  assert.equal(box.h, 10);
});
