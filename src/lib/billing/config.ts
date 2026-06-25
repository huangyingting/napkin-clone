/**
 * Billing runtime feature flags.
 *
 * Keep environment reads separate from the pure plan catalog so billing metadata
 * remains import-safe across server and client code.
 */

/**
 * Environment variable that gates the "unlimited credits" behaviour. When set
 * to a truthy value (`1`, `true`, `yes`, `on`) authenticated users are never
 * metered. It defaults to OFF, so production is metered unless an operator
 * explicitly opts in.
 */
export const BILLING_UNLIMITED_CREDITS_ENV = "BILLING_UNLIMITED_CREDITS";

/**
 * Environment variable that gates the AI deck-generation feature (issue #265).
 * When set to a truthy value (`1`, `true`, `yes`, `on`) the
 * `POST /api/generate-deck` route is enabled. It defaults to OFF, so the route
 * stays disabled (returns 404) unless an operator explicitly opts in.
 */
export const AI_DECK_GEN_ENABLED_ENV = "AI_DECK_GEN_ENABLED";

/**
 * Parses a boolean-ish environment flag. Recognises `1/true/yes/on` (any case)
 * as `true`; everything else (including `undefined`) is `false`.
 */
export function parseBillingFlag(value: string | null | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/**
 * Returns whether unlimited AI credits are enabled for the current environment.
 *
 * Pure: pass an explicit `env` in tests; defaults to `process.env`.
 */
export function isUnlimitedCreditsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return parseBillingFlag(env[BILLING_UNLIMITED_CREDITS_ENV]);
}

/**
 * Returns whether the AI deck-generation route is enabled for the current
 * environment.
 *
 * Pure: pass an explicit `env` in tests; defaults to `process.env`.
 */
export function isAiDeckGenEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return parseBillingFlag(env[AI_DECK_GEN_ENABLED_ENV]);
}
