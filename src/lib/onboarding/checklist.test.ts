import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_CATALOG } from "@/lib/billing/catalog";

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

test("computeOnboardingState: returns exactly 2 persisted-signal steps for new user", () => {
  const { steps } = computeOnboardingState(newUser());
  assert.equal(steps.length, 2);
});

test("computeOnboardingState: step IDs are stable and ordered", () => {
  const { steps } = computeOnboardingState(newUser());
  assert.deepEqual(
    steps.map((s) => s.id),
    ["create-doc", "generate-visual"],
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

test("computeOnboardingState: all trackable steps done still shows checklist (user must dismiss)", () => {
  const { show } = computeOnboardingState(
    newUser({ hasDocuments: true, hasVisuals: true }),
  );
  assert.equal(show, true);
});

// ---------------------------------------------------------------------------
// Step descriptions keep billing copy separate from onboarding logic
// ---------------------------------------------------------------------------

test("computeOnboardingState: create-doc step description follows the billing catalog", () => {
  const { steps } = computeOnboardingState(newUser());
  const step = steps.find((s) => s.id === "create-doc");
  const freePlan = PLAN_CATALOG.free;

  assert.ok(step);
  assert.ok(
    step.description.includes(
      freePlan.entitlements.creditsPerPeriod.toLocaleString(),
    ),
    `expected credit count in: ${step.description}`,
  );
  assert.ok(
    step.description.includes(freePlan.displayName),
    `expected plan label in: ${step.description}`,
  );
});
