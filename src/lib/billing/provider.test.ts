/**
 * Unit tests for billing provider selection (#97).
 *
 * Pure decision functions — no DB, no network. Verifies the production
 * fail-closed behaviour (criterion 2) and the mock-provider paid-plan guard
 * (criterion 3).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decideBillingProvider,
  isProductionEnv,
  BillingMisconfiguredError,
} from "@/lib/billing/provider";
import { isMockPlanChangeAllowed } from "@/lib/billing/mock-provider";

describe("isProductionEnv", () => {
  it("is true only when NODE_ENV === 'production'", () => {
    assert.strictEqual(isProductionEnv({ NODE_ENV: "production" }), true);
    assert.strictEqual(isProductionEnv({ NODE_ENV: "development" }), false);
    assert.strictEqual(isProductionEnv({ NODE_ENV: "test" }), false);
    assert.strictEqual(isProductionEnv({}), false);
  });
});

describe("decideBillingProvider", () => {
  it("selects stripe when STRIPE_SECRET_KEY is set", () => {
    assert.strictEqual(
      decideBillingProvider({ STRIPE_SECRET_KEY: "sk_test_123" }),
      "stripe",
    );
    assert.strictEqual(
      decideBillingProvider({
        STRIPE_SECRET_KEY: "sk_live_123",
        NODE_ENV: "production",
      }),
      "stripe",
    );
  });

  it("falls back to mock in non-production when Stripe is unconfigured", () => {
    assert.strictEqual(decideBillingProvider({}), "mock");
    assert.strictEqual(
      decideBillingProvider({ NODE_ENV: "development" }),
      "mock",
    );
    assert.strictEqual(decideBillingProvider({ NODE_ENV: "test" }), "mock");
  });

  it("FAILS CLOSED in production when Stripe is unconfigured", () => {
    assert.throws(
      () => decideBillingProvider({ NODE_ENV: "production" }),
      BillingMisconfiguredError,
    );
  });
});

describe("isMockPlanChangeAllowed", () => {
  it("always allows downgrade to free", () => {
    assert.strictEqual(
      isMockPlanChangeAllowed("free", { NODE_ENV: "production" }),
      true,
    );
    assert.strictEqual(
      isMockPlanChangeAllowed("free", { NODE_ENV: "development" }),
      true,
    );
  });

  it("allows paid plans in non-production", () => {
    assert.strictEqual(
      isMockPlanChangeAllowed("plus", { NODE_ENV: "development" }),
      true,
    );
    assert.strictEqual(
      isMockPlanChangeAllowed("pro", { NODE_ENV: "test" }),
      true,
    );
  });

  it("refuses paid plans in production (mock cannot take payment)", () => {
    assert.strictEqual(
      isMockPlanChangeAllowed("plus", { NODE_ENV: "production" }),
      false,
    );
    assert.strictEqual(
      isMockPlanChangeAllowed("pro", { NODE_ENV: "production" }),
      false,
    );
  });
});
