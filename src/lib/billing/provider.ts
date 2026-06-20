/**
 * BillingProvider interface and provider factory (US-010 epic).
 *
 * The interface is intentionally thin: it covers the three lifecycle actions
 * the billing dashboard needs (upgrade, downgrade, cancel) and is implemented
 * by both the DEV/MOCK provider (always available, no external keys) and the
 * Stripe adapter (loaded only when STRIPE_SECRET_KEY is set).
 *
 * The factory `getBillingProvider()` checks the environment and returns the
 * appropriate provider, falling back gracefully to the mock in CI and local dev.
 */

import type { Plan } from "@/lib/billing/entitlements";

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
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _provider: BillingProvider | null = null;

/**
 * Returns the singleton `BillingProvider` for the current environment.
 *
 * - When `STRIPE_SECRET_KEY` is set, loads and returns the Stripe adapter.
 * - Otherwise, returns the MockBillingProvider (safe for CI and local dev).
 *
 * The Stripe adapter is loaded lazily via a dynamic `require` so that the
 * module graph doesn't pull in `stripe` unless it is actually installed.
 */
export async function getBillingProvider(): Promise<BillingProvider> {
  if (_provider) return _provider;

  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const { StripeBillingProvider } =
        await import("@/lib/billing/stripe-provider");
      _provider = new StripeBillingProvider();
      return _provider;
    } catch {
      // stripe package not installed — fall through to mock
    }
  }

  const { MockBillingProvider } = await import("@/lib/billing/mock-provider");
  _provider = new MockBillingProvider();
  return _provider;
}

