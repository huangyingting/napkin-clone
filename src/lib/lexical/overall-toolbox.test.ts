import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldShowOverallToolbox } from "./overall-toolbox";
import type { EditorContextKind } from "./editor-context";

const allKinds: EditorContextKind[] = [
  "none",
  "empty-block",
  "collapsed",
  "range",
  "visual",
];

test("shouldShowOverallToolbox returns true for 'none'", () => {
  assert.equal(shouldShowOverallToolbox("none"), true);
});

test("shouldShowOverallToolbox returns true for 'empty-block'", () => {
  assert.equal(shouldShowOverallToolbox("empty-block"), true);
});

test("shouldShowOverallToolbox returns false for 'collapsed'", () => {
  assert.equal(shouldShowOverallToolbox("collapsed"), false);
});

test("shouldShowOverallToolbox returns false for 'range'", () => {
  assert.equal(shouldShowOverallToolbox("range"), false);
});

test("shouldShowOverallToolbox returns false for 'visual'", () => {
  assert.equal(shouldShowOverallToolbox("visual"), false);
});

test("shouldShowOverallToolbox handles every known kind exactly once", () => {
  const trueKinds = allKinds.filter(shouldShowOverallToolbox);
  const falseKinds = allKinds.filter((k) => !shouldShowOverallToolbox(k));

  // Exactly 'none' and 'empty-block' should return true.
  assert.deepEqual(trueKinds.sort(), ["empty-block", "none"]);
  // All others should return false.
  assert.deepEqual(falseKinds.sort(), ["collapsed", "range", "visual"]);
});
