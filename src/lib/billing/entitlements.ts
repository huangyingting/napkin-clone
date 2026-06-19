/**
 * Entitlements — plan definitions and per-tier feature flags (US-010 epic).
 *
 * Pure module: no DB calls, no side effects. Import from anywhere (server or
 * client) to decide what a user's plan allows.
 *
 * Tiers:
 *  - free  — 500 credits/week, PNG/PDF export, watermark present
 *  - plus  — 10 000 credits/month, SVG/PPTX export, brand styles, no watermark
 *  - pro   — 30 000 credits/month, all Plus + font upload, custom branding, top-ups
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Plan = "free" | "plus" | "pro";

export interface PlanEntitlements {
  /** Total AI credits granted at the start of each billing period. */
  creditsPerPeriod: number;
  /** Billing period length in days (7 for Free/weekly, 30 for Plus/Pro). */
  periodDays: number;
  /** Allow SVG export (paid tiers only). */
  svgExport: boolean;
  /** Allow PPTX export (paid tiers only). */
  pptxExport: boolean;
  /** Allow saving and applying Brand Styles. */
  brandStyles: boolean;
  /** Remove the "Napkin Clone" watermark from exports. */
  removeWatermark: boolean;
  /** Allow uploading custom fonts. */
  fontUpload: boolean;
  /** Allow purchasing credit top-ups. */
  topUps: boolean;
}

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------

export const PLAN_ENTITLEMENTS: Record<Plan, PlanEntitlements> = {
  free: {
    creditsPerPeriod: 500,
    periodDays: 7,
    svgExport: false,
    pptxExport: false,
    brandStyles: false,
    removeWatermark: false,
    fontUpload: false,
    topUps: false,
  },
  plus: {
    creditsPerPeriod: 10_000,
    periodDays: 30,
    svgExport: true,
    pptxExport: true,
    brandStyles: true,
    removeWatermark: true,
    fontUpload: false,
    topUps: false,
  },
  pro: {
    creditsPerPeriod: 30_000,
    periodDays: 30,
    svgExport: true,
    pptxExport: true,
    brandStyles: true,
    removeWatermark: true,
    fontUpload: true,
    topUps: true,
  },
};

export const PLAN_NAMES: Record<Plan, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when `value` is a valid {@link Plan} string. */
export function isPlan(value: unknown): value is Plan {
  return value === "free" || value === "plus" || value === "pro";
}

/**
 * Returns the entitlements for the given plan string. Falls back to `"free"`
 * when the value is not a recognised plan (safe default).
 */
export function getEntitlements(
  plan: string | null | undefined,
): PlanEntitlements {
  if (isPlan(plan)) {
    return PLAN_ENTITLEMENTS[plan];
  }
  return PLAN_ENTITLEMENTS.free;
}

/**
 * Checks whether the given plan includes a specific entitlement feature.
 * Returns `false` for unrecognised plan values (safe default = free tier).
 */
export function hasEntitlement<K extends keyof PlanEntitlements>(
  plan: string | null | undefined,
  feature: K,
): boolean {
  return Boolean(getEntitlements(plan)[feature]);
}
