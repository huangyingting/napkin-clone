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
    "image-fit-none",
    "image-mask",
    "shadow",
    "group-elements",
    "placeholder-element",
    "theme-typography",
    "visual-element",
  ]);
});

test("image-crop note no longer claims crop metadata is absent", () => {
  const entry = EXPORT_FIDELITY_MATRIX.find((e) => e.feature === "image-crop");
  assert.ok(entry, "image-crop entry must exist");
  assert.ok(
    entry.notes && !entry.notes.includes("is not"),
    "image-crop note must not claim crop metadata is not preserved",
  );
  assert.ok(
    entry.notes && entry.notes.includes("raster fallback"),
    "image-crop note must mention raster fallback",
  );
});

test("image-fit-fill has full fidelity across all targets", () => {
  assert.equal(getFidelity("image-fit-fill", "pptx"), "full");
  assert.equal(getFidelity("image-fit-fill", "pdf"), "full");
  assert.equal(getFidelity("image-fit-fill", "image"), "full");
});

test("image-fit-none is partial in PPTX due to raster fallback", () => {
  assert.equal(getFidelity("image-fit-none", "pptx"), "partial");
  assert.equal(getFidelity("image-fit-none", "pdf"), "full");
  assert.equal(getFidelity("image-fit-none", "image"), "full");
  const entry = EXPORT_FIDELITY_MATRIX.find(
    (e) => e.feature === "image-fit-none",
  );
  assert.ok(entry?.notes?.includes("raster fallback"));
});

test("image-mask is partial in PPTX due to raster fallback", () => {
  assert.equal(getFidelity("image-mask", "pptx"), "partial");
  assert.equal(getFidelity("image-mask", "pdf"), "full");
  assert.equal(getFidelity("image-mask", "image"), "full");
  const entry = EXPORT_FIDELITY_MATRIX.find((e) => e.feature === "image-mask");
  assert.ok(entry?.notes?.includes("raster fallback"));
});

test("the fidelity matrix keeps every feature unique", () => {
  const features = EXPORT_FIDELITY_MATRIX.map((entry) => entry.feature);
  assert.equal(features.length, new Set(features).size);
});
