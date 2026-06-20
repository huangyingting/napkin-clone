import { test } from "node:test";
import assert from "node:assert/strict";

import {
  rightSurfaceReducer,
  shouldSuppressFloatPopover,
  INITIAL_RIGHT_SURFACE_STATE,
} from "./right-surface-coordinator";

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

test("initial state: slideEditorOpen is false", () => {
  assert.equal(INITIAL_RIGHT_SURFACE_STATE.slideEditorOpen, false);
});

// ---------------------------------------------------------------------------
// Reducer: OPEN_SLIDE_EDITOR
// ---------------------------------------------------------------------------

test("OPEN_SLIDE_EDITOR: sets slideEditorOpen to true", () => {
  const next = rightSurfaceReducer(INITIAL_RIGHT_SURFACE_STATE, {
    type: "OPEN_SLIDE_EDITOR",
  });
  assert.equal(next.slideEditorOpen, true);
});

test("OPEN_SLIDE_EDITOR: is idempotent when already open", () => {
  const open = { slideEditorOpen: true };
  const next = rightSurfaceReducer(open, { type: "OPEN_SLIDE_EDITOR" });
  assert.equal(next.slideEditorOpen, true);
});

// ---------------------------------------------------------------------------
// Reducer: CLOSE_SLIDE_EDITOR
// ---------------------------------------------------------------------------

test("CLOSE_SLIDE_EDITOR: sets slideEditorOpen to false", () => {
  const opened = rightSurfaceReducer(INITIAL_RIGHT_SURFACE_STATE, {
    type: "OPEN_SLIDE_EDITOR",
  });
  const closed = rightSurfaceReducer(opened, { type: "CLOSE_SLIDE_EDITOR" });
  assert.equal(closed.slideEditorOpen, false);
});

test("CLOSE_SLIDE_EDITOR: is idempotent when already closed", () => {
  const next = rightSurfaceReducer(INITIAL_RIGHT_SURFACE_STATE, {
    type: "CLOSE_SLIDE_EDITOR",
  });
  assert.equal(next.slideEditorOpen, false);
});

// ---------------------------------------------------------------------------
// Reducer: immutability
// ---------------------------------------------------------------------------

test("reducer does not mutate the input state", () => {
  const before = { ...INITIAL_RIGHT_SURFACE_STATE };
  rightSurfaceReducer(INITIAL_RIGHT_SURFACE_STATE, {
    type: "OPEN_SLIDE_EDITOR",
  });
  assert.deepEqual(INITIAL_RIGHT_SURFACE_STATE, before);
});

test("reducer returns a new object on state change", () => {
  const next = rightSurfaceReducer(INITIAL_RIGHT_SURFACE_STATE, {
    type: "OPEN_SLIDE_EDITOR",
  });
  assert.notEqual(next, INITIAL_RIGHT_SURFACE_STATE);
});

// ---------------------------------------------------------------------------
// shouldSuppressFloatPopover
// ---------------------------------------------------------------------------

test("shouldSuppressFloatPopover: false when slide editor is closed", () => {
  assert.equal(shouldSuppressFloatPopover({ slideEditorOpen: false }), false);
});

test("shouldSuppressFloatPopover: true when slide editor is open", () => {
  assert.equal(shouldSuppressFloatPopover({ slideEditorOpen: true }), true);
});

test("shouldSuppressFloatPopover: reflects current coordinator state (open → close)", () => {
  const opened = rightSurfaceReducer(INITIAL_RIGHT_SURFACE_STATE, {
    type: "OPEN_SLIDE_EDITOR",
  });
  assert.equal(shouldSuppressFloatPopover(opened), true);

  const closed = rightSurfaceReducer(opened, { type: "CLOSE_SLIDE_EDITOR" });
  assert.equal(shouldSuppressFloatPopover(closed), false);
});
