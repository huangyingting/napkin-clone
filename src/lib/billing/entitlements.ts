/**
 * Compatibility barrel for billing entitlements.
 *
 * Static plan metadata lives in `catalog.ts`; runtime billing feature flags live
 * in `config.ts`. The AI deck-generation flag is re-exported from
 * `@/lib/ai/config` for legacy callers. Import owned modules directly for new
 * code.
 */

export {
  PLAN_CATALOG,
  PLAN_ENTITLEMENTS,
  PLAN_NAMES,
  getEntitlements,
  getPlanCatalogEntry,
  hasEntitlement,
  isPlan,
  type Plan,
  type PlanCatalogEntry,
  type PlanEntitlements,
} from "./catalog";

export {
  BILLING_UNLIMITED_CREDITS_ENV,
  isUnlimitedCreditsEnabled,
  parseBillingFlag,
} from "./config";

export { AI_DECK_GEN_ENABLED_ENV, isAiDeckGenEnabled } from "@/lib/ai/config";
