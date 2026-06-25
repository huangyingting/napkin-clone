import { prisma } from "@/lib/prisma";

import {
  getEntitlements,
  hasEntitlement,
  isPlan,
  type Plan,
  type PlanEntitlements,
} from "./catalog";

export type EntitlementFeature = {
  [K in keyof PlanEntitlements]: PlanEntitlements[K] extends boolean
    ? K
    : never;
}[keyof PlanEntitlements];

export const FEATURE_UPGRADE_MESSAGES: Record<EntitlementFeature, string> = {
  svgExport:
    "SVG export requires a Plus or Pro plan. Upgrade your plan to export SVG files.",
  pptxExport:
    "PPTX export requires a Plus or Pro plan. Upgrade your plan to export PowerPoint files.",
  brandStyles:
    "Brand Studio requires a Plus or Pro plan. Upgrade your plan to create and manage brand styles.",
  removeWatermark:
    "Watermark removal requires a Plus or Pro plan. Upgrade your plan to export without the TextIQ watermark.",
  fontUpload:
    "Custom font upload requires a Pro plan. Upgrade to Pro to upload and use custom fonts.",
};

export interface EntitlementFacade {
  plan: Plan;
  entitlements: PlanEntitlements;
  can(feature: EntitlementFeature): boolean;
  upgradeMessage(feature: EntitlementFeature): string;
}

export function createEntitlementFacade(
  plan: string | null | undefined,
): EntitlementFacade {
  const resolvedPlan = isPlan(plan) ? plan : "free";
  const entitlements = getEntitlements(resolvedPlan);
  return {
    plan: resolvedPlan,
    entitlements,
    can(feature) {
      return hasEntitlement(resolvedPlan, feature);
    },
    upgradeMessage(feature) {
      return getUpgradeMessage(feature);
    },
  };
}

export function getUpgradeMessage(feature: EntitlementFeature): string {
  return FEATURE_UPGRADE_MESSAGES[feature];
}

export function canUseFeature(
  plan: string | null | undefined,
  feature: EntitlementFeature,
): boolean {
  return createEntitlementFacade(plan).can(feature);
}

export class EntitlementGateError extends Error {
  readonly feature: EntitlementFeature;
  readonly status = 403;

  constructor(
    feature: EntitlementFeature,
    message = getUpgradeMessage(feature),
  ) {
    super(message);
    this.name = "EntitlementGateError";
    this.feature = feature;
  }
}

export function assertFeatureAllowed(
  facade: EntitlementFacade,
  feature: EntitlementFeature,
): void {
  if (!facade.can(feature)) {
    throw new EntitlementGateError(feature, facade.upgradeMessage(feature));
  }
}

export async function resolveUserEntitlements(
  userId: string,
): Promise<EntitlementFacade> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  return createEntitlementFacade(dbUser?.plan);
}
