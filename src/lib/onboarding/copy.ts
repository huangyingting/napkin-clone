import { PLAN_CATALOG } from "@/lib/billing/catalog";

export type OnboardingStepId = "create-doc" | "generate-visual";
export interface OnboardingStepCopy {
  label: string;
  description: string;
}

function periodLabel(days: number): string {
  if (days === 7) return "week";
  if (days === 30) return "month";
  return `${days} days`;
}

const freePlan = PLAN_CATALOG.free;

export const ONBOARDING_STEP_COPY: Record<
  OnboardingStepId,
  OnboardingStepCopy
> = {
  "create-doc": {
    label: "Create or import a document",
    description: `Click New document or import a file to get started. ${freePlan.displayName} plan includes ${freePlan.entitlements.creditsPerPeriod.toLocaleString()} AI credits/${periodLabel(freePlan.entitlements.periodDays)}.`,
  },
  "generate-visual": {
    label: "Select text → generate a visual",
    description:
      "Highlight a passage in the editor and click Generate Visual to turn it into a flowchart, mind map, or chart.",
  },
};
