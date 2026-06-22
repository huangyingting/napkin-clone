import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EXPORT_FIDELITY_MATRIX,
  getDegradedFeatures,
  getFidelity,
  getUnsupportedFeatures,
} from "@/lib/visual/export-fidelity";

test("getFidelity returns the expected level for known features", () => {
  assert.equal(getFidelity("text-content", "pptx"), "full");
  assert.equal(getFidelity("connector-elbow", "pptx"), "partial");
  assert.equal(getFidelity("source-ref-metadata", "image"), "unsupported");
  assert.equal(getFidelity("missing-feature", "pdf"), undefined);
});

test("getUnsupportedFeatures returns only unsupported entries for a target", () => {
  const unsupported = getUnsupportedFeatures("pptx");
  assert.deepEqual(
    unsupported.map((entry) => entry.feature),
    ["source-ref-metadata"],
  );
});

test("getDegradedFeatures returns partial and degraded entries for a target", () => {
  const degraded = getDegradedFeatures("pptx").map((entry) => entry.feature);
  assert.deepEqual(degraded, [
    "text-fit-mode",
    "connector-elbow",
    "image-crop",
    "shadow",
    "group-elements",
    "placeholder-element",
    "theme-typography",
    "visual-element",
  ]);
});

test("the fidelity matrix keeps every feature unique", () => {
  const features = EXPORT_FIDELITY_MATRIX.map((entry) => entry.feature);
  assert.equal(features.length, new Set(features).size);
});
