/**
 * Pure export-capability resolver — derives what a user can do in export UIs
 * from their plan entitlements.
 *
 * Keeping this logic here (not inside a React component) makes it easily
 * testable in Node without a DOM.
 */

import type { PlanEntitlements } from "@/lib/billing/catalog";
import { resolveExportPolicy } from "@/lib/visual/export-policy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportCapabilities {
  /** User may export in SVG format. */
  canSvg: boolean;
  /** User may export in PPTX format. */
  canPptx: boolean;
  /** User may remove the "TextIQ" watermark from exports. */
  canRemoveWatermark: boolean;
  /**
   * True when at least one feature is locked — the UI should surface an
   * upgrade prompt so free users understand why options are disabled.
   */
  showUpgrade: boolean;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Given a (possibly absent) entitlements snapshot, returns a structured set
 * of export capability flags.
 *
 * Falls back to free-tier defaults when `entitlements` is `undefined` so that
 * unresolved / unauthenticated states are safe.
 */
export function resolveExportCapabilities(
  entitlements?: Pick<
    PlanEntitlements,
    "svgExport" | "pptxExport" | "removeWatermark"
  >,
): ExportCapabilities {
  const policy = resolveExportPolicy(entitlements);
  return {
    canSvg: policy.canSvg,
    canPptx: policy.canPptx,
    canRemoveWatermark: policy.canRemoveWatermark,
    showUpgrade: policy.showUpgrade,
  };
}
