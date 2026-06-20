/**
 * Pure onboarding decision logic — no DB calls, no side effects.
 *
 * Given observable user facts, returns whether to show the onboarding
 * checklist and which core steps are already done.
 *
 * Steps map to the core first-run path:
 *   1. Create or import a document
 *   2. Select text → generate a visual
 *   3. Edit style (colors, layout)
 *   4. Export or share
 *
 * Steps 3–4 have no persisted completion signal so they are always shown
 * as pending, guiding new users towards the full workflow.
 */

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
  id: string;
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
      label: "Create or import a document",
      description:
        "Click New document or import a file to get started. Free plan includes 500 AI credits/week.",
      done: input.hasDocuments,
    },
    {
      id: "generate-visual",
      label: "Select text → generate a visual",
      description:
        "Highlight a passage in the editor and click Generate Visual to turn it into a flowchart, mind map, or chart.",
      done: input.hasVisuals,
    },
    {
      id: "edit-style",
      label: "Edit style (colors, layout)",
      description:
        "Use the style panel to adjust colors, icons, and layout. Brand Styles are available on Plus and Pro plans.",
      done: false,
    },
    {
      id: "export-share",
      label: "Export or share",
      description:
        "Export as PNG or PDF (free). SVG and PPTX exports, plus watermark removal, are available on Plus/Pro plans.",
      done: false,
    },
  ];

  return { show: true, steps };
}
