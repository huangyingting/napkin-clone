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
    ["source-ref-metadata", "hidden-element"],
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
    "background-gradient",
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

// ---------------------------------------------------------------------------
// New element kinds and slide features (issue #379)
// ---------------------------------------------------------------------------

test("hidden-element is unsupported on all export targets", () => {
  assert.equal(getFidelity("hidden-element", "pptx"), "unsupported");
  assert.equal(getFidelity("hidden-element", "pdf"), "unsupported");
  assert.equal(getFidelity("hidden-element", "image"), "unsupported");
  const entry = EXPORT_FIDELITY_MATRIX.find(
    (e) => e.feature === "hidden-element",
  );
  assert.ok(entry?.notes?.includes("hidden=true"), "note explains filter");
});

test("locked-element has full fidelity on all export targets", () => {
  assert.equal(getFidelity("locked-element", "pptx"), "full");
  assert.equal(getFidelity("locked-element", "pdf"), "full");
  assert.equal(getFidelity("locked-element", "image"), "full");
  const entry = EXPORT_FIDELITY_MATRIX.find(
    (e) => e.feature === "locked-element",
  );
  assert.ok(
    entry?.notes?.includes("locked only affects editor"),
    "note explains locked semantics",
  );
});

test("background-solid has full fidelity on all export targets", () => {
  assert.equal(getFidelity("background-solid", "pptx"), "full");
  assert.equal(getFidelity("background-solid", "pdf"), "full");
  assert.equal(getFidelity("background-solid", "image"), "full");
});

test("background-gradient is partial in PPTX (from-stop only) and full elsewhere", () => {
  assert.equal(getFidelity("background-gradient", "pptx"), "partial");
  assert.equal(getFidelity("background-gradient", "pdf"), "full");
  assert.equal(getFidelity("background-gradient", "image"), "full");
  const entry = EXPORT_FIDELITY_MATRIX.find(
    (e) => e.feature === "background-gradient",
  );
  assert.ok(
    entry?.notes?.includes("from"),
    "note mentions 'from' stop fallback",
  );
});

test("background-image has full fidelity on all export targets", () => {
  assert.equal(getFidelity("background-image", "pptx"), "full");
  assert.equal(getFidelity("background-image", "pdf"), "full");
  assert.equal(getFidelity("background-image", "image"), "full");
});

test("getDegradedFeatures for pptx includes the new partial entries", () => {
  const features = getDegradedFeatures("pptx").map((e) => e.feature);
  assert.ok(
    features.includes("background-gradient"),
    "background-gradient partial",
  );
});

test("getUnsupportedFeatures for all targets includes hidden-element", () => {
  for (const target of ["pptx", "pdf", "image"] as const) {
    const features = getUnsupportedFeatures(target).map((e) => e.feature);
    assert.ok(
      features.includes("hidden-element"),
      `hidden-element unsupported for ${target}`,
    );
  }
});
