/**
 * Brand Studio entitlement guard (issue #94).
 *
 * Server-side enforcement of the Brand Studio plan gates. The UI already hides
 * locked controls, but UI gating is not a security boundary: the brand CRUD
 * server actions and the brand logo/font upload APIs must independently verify
 * the caller's plan before mutating or accepting uploads.
 *
 * Two distinct entitlements are enforced (see `@/lib/billing/entitlement-facade`):
 *
 *   - `brandStyles` — gates brand CRUD (create/update/delete) and logo upload.
 *                     Available on Plus and Pro.
 *   - `fontUpload`  — gates custom font upload and saving a custom font family
 *                     on a brand. Available on Pro only.
 *
 * The pure decision (`brandEntitlementDecision`) and the assert guards
 * (`assertCanBrand`, `assertCanFontUpload`) are DB-free and unit tested. The
 * async helper (`resolveBrandEntitlements`) reads the caller's plan and applies
 * the same logic.
 */

import {
  FEATURE_UPGRADE_MESSAGES,
  decideEntitlement,
  resolveUserEntitlements,
} from "@/lib/billing/entitlement-facade";
import { BRAND_WEB_FONTS } from "@/lib/brand/schema";

/** The Brand Studio features that can be gated by plan. */
export type BrandEntitlementFeature = "brandStyles" | "fontUpload";

/** Resolved Brand Studio capabilities for a plan. */
export interface BrandEntitlementDecision {
  /** Allowed to create/update/delete brands and upload logos (Plus/Pro). */
  canBrand: boolean;
  /** Allowed to upload custom fonts and save custom font families (Pro). */
  canFontUpload: boolean;
}

/** Actionable upgrade message for the `brandStyles` gate. */
export const BRAND_STYLES_UPGRADE_MESSAGE =
  FEATURE_UPGRADE_MESSAGES.brandStyles;

/** Actionable upgrade message for the `fontUpload` gate. */
export const FONT_UPLOAD_UPGRADE_MESSAGE = FEATURE_UPGRADE_MESSAGES.fontUpload;

/**
 * Thrown when a user attempts a Brand Studio action their plan does not allow.
 * Carries the offending `feature` and an HTTP `status` (403) so route handlers
 * can map it to a forbidden response and server actions can surface a clear
 * upgrade message (issue #94 AC #3).
 */
export class BrandEntitlementError extends Error {
  readonly feature: BrandEntitlementFeature;
  readonly status: number;

  constructor(feature: BrandEntitlementFeature, message: string) {
    super(message);
    this.name = "BrandEntitlementError";
    this.feature = feature;
    this.status = 403;
  }
}

/**
 * Pure decision: maps a plan string to its Brand Studio capabilities. Unknown
 * plans fall back to the free tier (no capabilities) via the entitlement facade.
 */
export function brandEntitlementDecision(
  plan: string | null | undefined,
): BrandEntitlementDecision {
  return {
    canBrand: decideEntitlement(plan, "brandStyles").allowed,
    canFontUpload: decideEntitlement(plan, "fontUpload").allowed,
  };
}

/**
 * Throws {@link BrandEntitlementError} when the plan cannot use Brand Styles.
 * Used to gate brand CRUD and logo upload.
 */
export function assertCanBrand(decision: BrandEntitlementDecision): void {
  if (!decision.canBrand) {
    throw new BrandEntitlementError(
      "brandStyles",
      FEATURE_UPGRADE_MESSAGES.brandStyles,
    );
  }
}

/**
 * Throws {@link BrandEntitlementError} when the plan cannot upload custom fonts.
 * Used to gate the font upload API and saving a custom font family on a brand.
 */
export function assertCanFontUpload(decision: BrandEntitlementDecision): void {
  if (!decision.canFontUpload) {
    throw new BrandEntitlementError(
      "fontUpload",
      FEATURE_UPGRADE_MESSAGES.fontUpload,
    );
  }
}

/**
 * Pure predicate: is `fontFamily` a custom (uploaded) font rather than a curated
 * web font or the system default? A custom font is any non-empty family string
 * that is not one of the curated {@link BRAND_WEB_FONTS}. Mirrors the "Custom:"
 * detection used by the Brand Studio UI so the server gates exactly the families
 * the client treats as custom.
 */
export function isCustomFontFamily(
  fontFamily: string | null | undefined,
): boolean {
  if (typeof fontFamily !== "string") return false;
  const trimmed = fontFamily.trim();
  if (trimmed.length === 0) return false;
  return !BRAND_WEB_FONTS.some((font) => font.cssFamily === trimmed);
}

/**
 * Resolves the Brand Studio capabilities for `userId` by reading their plan from
 * the database. Unknown/missing users resolve to the free tier (no
 * capabilities), the safe default.
 */
export async function resolveBrandEntitlements(
  userId: string,
): Promise<BrandEntitlementDecision> {
  const facade = await resolveUserEntitlements(userId);
  return {
    canBrand: facade.can("brandStyles"),
    canFontUpload: facade.can("fontUpload"),
  };
}
