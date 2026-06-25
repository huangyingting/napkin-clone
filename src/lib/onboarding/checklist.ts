/**
 * Pure onboarding decision logic — no DB calls, no side effects.
 *
 * Given observable user facts, returns whether to show the onboarding
 * checklist and which core steps are already done.
 *
 * Steps map to the persisted first-run signals:
 *   1. Create or import a document
 *   2. Select text → generate a visual
 *
 * Dismissal/completion is explicit: dismissing the checklist persists
 * User.onboardingDismissed, and completion of the tracked steps alone does not
 * suppress the checklist.
 */

import { ONBOARDING_STEP_COPY, type OnboardingStepId } from "./copy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingInput {
  /** True when the user has explicitly dismissed (or completed) onboarding. */
  dismissed: boolean;
  /** True when the user owns ≥1 non-deleted document. */
  hasDocuments: boolean;
  /** True when the user has generated ≥1 visual across their documents. */
  hasVisuals: boolean;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  description: string;
  /** Whether the user has demonstrably completed this step. */
  done: boolean;
}

export interface OnboardingState {
  /** Whether the checklist should be rendered. */
  show: boolean;
  /** Ordered list of onboarding steps (empty when show is false). */
  steps: OnboardingStep[];
}

// ---------------------------------------------------------------------------
// Pure decision function
// ---------------------------------------------------------------------------

/**
 * Computes whether to show the onboarding checklist and which steps are done.
 *
 * Once `dismissed` is true the checklist is suppressed for good, regardless
 * of step completion. This is the server-persisted gate (User.onboardingDismissed).
 */
export function computeOnboardingState(
  input: OnboardingInput,
): OnboardingState {
  if (input.dismissed) {
    return { show: false, steps: [] };
  }

  const steps: OnboardingStep[] = [
    {
      id: "create-doc",
      ...ONBOARDING_STEP_COPY["create-doc"],
      done: input.hasDocuments,
    },
    {
      id: "generate-visual",
      ...ONBOARDING_STEP_COPY["generate-visual"],
      done: input.hasVisuals,
    },
  ];

  return { show: true, steps };
}
