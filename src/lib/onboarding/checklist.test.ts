import assert from "node:assert/strict";
import test from "node:test";

import { computeOnboardingState, type OnboardingInput } from "./checklist";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function newUser(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    dismissed: false,
    hasDocuments: false,
    hasVisuals: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// show / hide
// ---------------------------------------------------------------------------

test("computeOnboardingState: new user (not dismissed) → show: true", () => {
  const { show } = computeOnboardingState(newUser());
  assert.equal(show, true);
});

test("computeOnboardingState: dismissed user → show: false", () => {
  const { show } = computeOnboardingState(newUser({ dismissed: true }));
  assert.equal(show, false);
});

test("computeOnboardingState: dismissed user → steps is empty", () => {
  const { steps } = computeOnboardingState(newUser({ dismissed: true }));
  assert.deepEqual(steps, []);
});

test("computeOnboardingState: dismissed overrides hasDocuments/hasVisuals", () => {
  const { show } = computeOnboardingState(
    newUser({ dismissed: true, hasDocuments: true, hasVisuals: true }),
  );
  assert.equal(show, false);
});

// ---------------------------------------------------------------------------
// Step count and IDs
// ---------------------------------------------------------------------------

test("computeOnboardingState: returns exactly 4 steps for new user", () => {
  const { steps } = computeOnboardingState(newUser());
  assert.equal(steps.length, 4);
});

test("computeOnboardingState: step IDs are stable and ordered", () => {
  const { steps } = computeOnboardingState(newUser());
  assert.deepEqual(
    steps.map((s) => s.id),
    ["create-doc", "generate-visual", "edit-style", "export-share"],
  );
});

// ---------------------------------------------------------------------------
// Step completion derivation
// ---------------------------------------------------------------------------

test("computeOnboardingState: hasDocuments=false → create-doc step is not done", () => {
  const { steps } = computeOnboardingState(newUser({ hasDocuments: false }));
  const step = steps.find((s) => s.id === "create-doc");
  assert.ok(step);
  assert.equal(step.done, false);
});

test("computeOnboardingState: hasDocuments=true → create-doc step is done", () => {
  const { steps } = computeOnboardingState(newUser({ hasDocuments: true }));
  const step = steps.find((s) => s.id === "create-doc");
  assert.ok(step);
  assert.equal(step.done, true);
});

test("computeOnboardingState: hasVisuals=false → generate-visual step is not done", () => {
  const { steps } = computeOnboardingState(newUser({ hasVisuals: false }));
  const step = steps.find((s) => s.id === "generate-visual");
  assert.ok(step);
  assert.equal(step.done, false);
});

test("computeOnboardingState: hasVisuals=true → generate-visual step is done", () => {
  const { steps } = computeOnboardingState(newUser({ hasVisuals: true }));
  const step = steps.find((s) => s.id === "generate-visual");
  assert.ok(step);
  assert.equal(step.done, true);
});

test("computeOnboardingState: edit-style step is always pending (no tracking signal)", () => {
  const { steps } = computeOnboardingState(
    newUser({ hasDocuments: true, hasVisuals: true }),
  );
  const step = steps.find((s) => s.id === "edit-style");
  assert.ok(step);
  assert.equal(step.done, false);
});

test("computeOnboardingState: export-share step is always pending (no tracking signal)", () => {
  const { steps } = computeOnboardingState(
    newUser({ hasDocuments: true, hasVisuals: true }),
  );
  const step = steps.find((s) => s.id === "export-share");
  assert.ok(step);
  assert.equal(step.done, false);
});

test("computeOnboardingState: all trackable steps done still shows checklist (user must dismiss)", () => {
  const { show } = computeOnboardingState(
    newUser({ hasDocuments: true, hasVisuals: true }),
  );
  assert.equal(show, true);
});

// ---------------------------------------------------------------------------
// Step descriptions include accurate credit copy
// ---------------------------------------------------------------------------

test("computeOnboardingState: create-doc step description mentions free-plan credit limit", () => {
  const { steps } = computeOnboardingState(newUser());
  const step = steps.find((s) => s.id === "create-doc");
  assert.ok(step);
  // Must reference 500 credits and the weekly cadence (from entitlements free tier)
  assert.ok(
    step.description.includes("500"),
    `expected '500' in: ${step.description}`,
  );
});

test("computeOnboardingState: export-share step description mentions PNG/PDF as free and SVG/PPTX as paid", () => {
  const { steps } = computeOnboardingState(newUser());
  const step = steps.find((s) => s.id === "export-share");
  assert.ok(step);
  assert.ok(
    step.description.includes("PNG") && step.description.includes("PDF"),
    `expected PNG/PDF mention in: ${step.description}`,
  );
  assert.ok(
    step.description.includes("SVG") && step.description.includes("PPTX"),
    `expected SVG/PPTX mention in: ${step.description}`,
  );
});
