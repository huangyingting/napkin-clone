/**
 * Compatibility barrel for billing entitlements.
 *
 * Static plan metadata lives in `catalog.ts`; runtime billing feature flags live
 * in `config.ts`. Import those modules directly for new code.
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
  AI_DECK_GEN_ENABLED_ENV,
  BILLING_UNLIMITED_CREDITS_ENV,
  isAiDeckGenEnabled,
  isUnlimitedCreditsEnabled,
  parseBillingFlag,
} from "./config";
