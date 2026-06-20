/**
 * Unit tests for the Stripe webhook state reducer (#97, criterion 5/7).
 *
 * Pure functions only — no DB, no network. Verifies that subscription
 * update / delete / cancel events map to reliable {plan,status,period,cancel}
 * state.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mapStripeSubscriptionStatus,
  planFromPriceId,
  reduceStripeSubscriptionEvent,
  type StripeSubscriptionLike,
} from "@/lib/billing/stripe-provider";

const ENV = {
  STRIPE_PLUS_PRICE_ID: "price_plus",
  STRIPE_PRO_PRICE_ID: "price_pro",
};

describe("mapStripeSubscriptionStatus", () => {
  it("maps active/trialing → active", () => {
    assert.strictEqual(mapStripeSubscriptionStatus("active"), "active");
    assert.strictEqual(mapStripeSubscriptionStatus("trialing"), "active");
  });

  it("maps past_due/unpaid → past_due", () => {
    assert.strictEqual(mapStripeSubscriptionStatus("past_due"), "past_due");
    assert.strictEqual(mapStripeSubscriptionStatus("unpaid"), "past_due");
  });

  it("maps canceled/incomplete_expired → cancelled", () => {
    assert.strictEqual(mapStripeSubscriptionStatus("canceled"), "cancelled");
    assert.strictEqual(
      mapStripeSubscriptionStatus("incomplete_expired"),
      "cancelled",
    );
  });

  it("maps unknown/undefined → inactive", () => {
    assert.strictEqual(mapStripeSubscriptionStatus("incomplete"), "inactive");
    assert.strictEqual(mapStripeSubscriptionStatus(undefined), "inactive");
  });
});

describe("planFromPriceId", () => {
  it("resolves configured price ids to plans", () => {
    assert.strictEqual(planFromPriceId("price_plus", ENV), "plus");
    assert.strictEqual(planFromPriceId("price_pro", ENV), "pro");
  });

  it("returns null for unknown/missing price ids", () => {
    assert.strictEqual(planFromPriceId("price_other", ENV), null);
    assert.strictEqual(planFromPriceId(undefined, ENV), null);
    assert.strictEqual(planFromPriceId(null, ENV), null);
  });
});

describe("reduceStripeSubscriptionEvent — updated", () => {
  it("maps an active update with plan, period window, and no cancellation", () => {
    const start = 1_700_000_000;
    const end = start + 30 * 24 * 60 * 60;
    const sub: StripeSubscriptionLike = {
      id: "sub_1",
      status: "active",
      cancel_at_period_end: false,
      current_period_start: start,
      current_period_end: end,
      items: { data: [{ price: { id: "price_pro" } }] },
    };
    const state = reduceStripeSubscriptionEvent(
      "customer.subscription.updated",
      sub,
      ENV,
    );
    assert.strictEqual(state.status, "active");
    assert.strictEqual(state.plan, "pro");
    assert.strictEqual(state.cancelAtPeriodEnd, false);
    assert.deepStrictEqual(state.currentPeriodStart, new Date(start * 1000));
    assert.deepStrictEqual(state.currentPeriodEnd, new Date(end * 1000));
  });

  it("captures a scheduled cancellation (cancel_at_period_end)", () => {
    const sub: StripeSubscriptionLike = {
      id: "sub_1",
      status: "active",
      cancel_at_period_end: true,
      items: { data: [{ price: { id: "price_plus" } }] },
    };
    const state = reduceStripeSubscriptionEvent(
      "customer.subscription.updated",
      sub,
      ENV,
    );
    assert.strictEqual(state.status, "active");
    assert.strictEqual(state.plan, "plus");
    assert.strictEqual(state.cancelAtPeriodEnd, true);
  });

  it("maps a past_due update", () => {
    const sub: StripeSubscriptionLike = {
      id: "sub_1",
      status: "past_due",
      cancel_at_period_end: false,
    };
    const state = reduceStripeSubscriptionEvent(
      "customer.subscription.updated",
      sub,
      ENV,
    );
    assert.strictEqual(state.status, "past_due");
    assert.strictEqual(state.plan, undefined);
  });
});

describe("reduceStripeSubscriptionEvent — deleted", () => {
  it("always resolves to cancelled + free, regardless of stripe payload", () => {
    const sub: StripeSubscriptionLike = {
      id: "sub_1",
      status: "active",
      cancel_at_period_end: true,
      items: { data: [{ price: { id: "price_pro" } }] },
    };
    const state = reduceStripeSubscriptionEvent(
      "customer.subscription.deleted",
      sub,
      ENV,
    );
    assert.strictEqual(state.status, "cancelled");
    assert.strictEqual(state.plan, "free");
    assert.strictEqual(state.cancelAtPeriodEnd, false);
  });
});
