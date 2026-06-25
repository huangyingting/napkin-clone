/**
 * BillingProvider interface and provider factory (US-010 epic).
 *
 * The interface is intentionally thin: it covers the three lifecycle actions
 * the billing dashboard needs (upgrade, downgrade, cancel) and is implemented
 * by both the DEV/MOCK provider (always available, no external keys) and the
 * Stripe adapter (loaded only when STRIPE_SECRET_KEY is set).
 *
 * The factory `getBillingProvider()` checks the environment and returns the
 * appropriate provider. It falls back to the mock in CI and local dev, but
 * FAILS CLOSED in production: if Stripe is not configured (or its SDK cannot be
 * loaded) it throws rather than silently serving paid billing through the mock.
 */

import type { Plan } from "@/lib/billing/catalog";
import {
  decideBillingProvider,
  isProductionEnv,
  BillingMisconfiguredError,
} from "@/lib/billing/config";
export {
  decideBillingProvider,
  isProductionEnv,
  BillingMisconfiguredError,
} from "@/lib/billing/config";
export type { BillingProviderKind } from "@/lib/billing/config";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ChangePlanResult {
  success: boolean;
  /** The new plan after the operation. */
  plan: Plan;
  /** Human-readable message suitable for display. */
  message: string;
  /** For Stripe: a URL to redirect the user to (checkout session, portal). */
  redirectUrl?: string;
}

export interface BillingProvider {
  /**
   * Switch the user to a new plan. For paid upgrades the Stripe adapter may
   * return a `redirectUrl` (checkout session); the mock applies the change
   * directly.
   */
  changePlan(userId: string, targetPlan: Plan): Promise<ChangePlanResult>;

  /**
   * Cancel the user's active subscription. Schedules cancellation at the end
   * of the current billing period (`cancelAtPeriodEnd = true`).
   */
  cancelSubscription(userId: string): Promise<ChangePlanResult>;

  /**
   * Immediately cancel the user's Stripe subscription (no period-end grace).
   *
   * Used during account deletion so billing stops right away. The mock
   * provider is a no-op because it has no real Stripe subscription to cancel.
   */
  cancelSubscriptionImmediately(userId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Returns `true` when an account-deletion flow should attempt to cancel the
 * user's Stripe subscription before deleting the user row.
 *
 * Conditions:
 * - The subscription row exists and has a `stripeSubscriptionId` (i.e. a real
 *   Stripe subscription was created for this user).
 * - The subscription is not already in a terminal `cancelled` state (calling
 *   Stripe on a cancelled subscription is unnecessary and may throw).
 */
export function shouldCancelSubscription(
  sub:
    | { stripeSubscriptionId: string | null; status: string }
    | null
    | undefined,
): boolean {
  if (!sub?.stripeSubscriptionId) return false;
  return sub.status !== "cancelled";
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _provider: BillingProvider | null = null;

/**
 * Returns the singleton `BillingProvider` for the current environment.
 *
 * Provider selection is delegated to {@link decideBillingProvider}:
 * - Stripe when `STRIPE_SECRET_KEY` is set.
 * - Mock in non-production when Stripe is not configured.
 * - In production without Stripe, it throws (fail-closed).
 *
 * When Stripe IS configured but its SDK cannot be loaded, we FAIL CLOSED in
 * production (throw) rather than silently degrading to the mock provider; in
 * non-production we degrade to the mock so local dev keeps working.
 *
 * The Stripe adapter is loaded lazily via a dynamic import so the module graph
 * doesn't pull in `stripe` unless it is actually installed.
 */
export async function getBillingProvider(): Promise<BillingProvider> {
  if (_provider) return _provider;

  const kind = decideBillingProvider();

  if (kind === "stripe") {
    try {
      const { StripeBillingProvider } =
        await import("@/lib/billing/stripe-provider");
      _provider = new StripeBillingProvider();
      return _provider;
    } catch (err) {
      if (isProductionEnv()) {
        throw new BillingMisconfiguredError(
          "Stripe is configured but its provider could not be loaded in " +
            "production. Refusing to fall back to the mock billing provider " +
            `(fail-closed). Cause: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Non-production: degrade to the mock so local dev/CI keeps working.
    }
  }

  const { MockBillingProvider } = await import("@/lib/billing/mock-provider");
  _provider = new MockBillingProvider();
  return _provider;
}
