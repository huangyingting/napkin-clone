/**
 * Billing runtime configuration.
 *
 * Keep environment reads separate from the pure plan catalog so billing metadata
 * remains import-safe across server and client code.
 */

import { parseBooleanFlag } from "@/lib/config/flags";

/**
 * Environment variable that gates the "unlimited credits" behaviour. When set
 * to a truthy value (`1`, `true`, `yes`, `on`) authenticated users are never
 * metered. It defaults to OFF, so production is metered unless an operator
 * explicitly opts in.
 */
export const BILLING_UNLIMITED_CREDITS_ENV = "BILLING_UNLIMITED_CREDITS";

export type BillingProviderKind = "stripe" | "mock";

/** Thrown when billing is misconfigured for the current environment. */
export class BillingMisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingMisconfiguredError";
  }
}

/**
 * Parses a boolean-ish environment flag. Recognises `1/true/yes/on` (any case)
 * as `true`; everything else (including `undefined`) is `false`.
 */
export function parseBillingFlag(value: string | null | undefined): boolean {
  return parseBooleanFlag(value);
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

/** Returns true when running in a production environment. */
export function isProductionEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Pure decision: which billing provider should be used for the given env?
 *
 * - Stripe is "configured" when `STRIPE_SECRET_KEY` is set → use Stripe.
 * - Otherwise, in NON-production, fall back to the mock provider (CI/local dev).
 * - Otherwise, in PRODUCTION with no Stripe key → FAIL CLOSED: throw rather than
 *   silently serving paid billing through the mock provider.
 */
export function decideBillingProvider(
  env: Record<string, string | undefined> = process.env,
): BillingProviderKind {
  if (env.STRIPE_SECRET_KEY) return "stripe";

  if (isProductionEnv(env)) {
    throw new BillingMisconfiguredError(
      "Billing is misconfigured: STRIPE_SECRET_KEY is not set in production. " +
        "Refusing to fall back to the mock billing provider (fail-closed).",
    );
  }

  return "mock";
}
