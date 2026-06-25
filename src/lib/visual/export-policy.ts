import type { PlanEntitlements } from "@/lib/billing/catalog";

export type ExportEntitlements = Pick<
  PlanEntitlements,
  "svgExport" | "pptxExport" | "removeWatermark"
>;

export interface ExportPolicy {
  canSvg: boolean;
  canPptx: boolean;
  canRemoveWatermark: boolean;
  /** Watermark state callers should apply by default for this entitlement set. */
  defaultWatermark: boolean;
  showUpgrade: boolean;
}

function buildExportPolicy(
  canSvg: boolean,
  canPptx: boolean,
  canRemoveWatermark: boolean,
): ExportPolicy {
  return {
    canSvg,
    canPptx,
    canRemoveWatermark,
    defaultWatermark: !canRemoveWatermark,
    showUpgrade: !canSvg || !canPptx || !canRemoveWatermark,
  };
}

/**
 * Central export entitlement policy for UI, preflight, and export option
 * defaults. Missing entitlements fall back to free-tier behavior.
 */
export function resolveExportPolicy(
  entitlements?: ExportEntitlements,
): ExportPolicy {
  return buildExportPolicy(
    entitlements?.svgExport ?? false,
    entitlements?.pptxExport ?? false,
    entitlements?.removeWatermark ?? false,
  );
}

export function applyExportPolicyWatermark<T extends { watermark?: boolean }>(
  options: T,
  policy: ExportPolicy,
): T & { watermark: boolean } {
  return { ...options, watermark: policy.defaultWatermark };
}
