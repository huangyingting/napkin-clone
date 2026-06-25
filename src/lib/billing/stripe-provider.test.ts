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
  applyStripeWebhookEvent,
  mapStripeSubscriptionStatus,
  planFromPriceId,
  reduceStripeSubscriptionEvent,
  shouldApplySubscriptionUpdate,
  type StripeSubscriptionLike,
} from "@/lib/billing/stripe-provider";
import type { prisma } from "@/lib/prisma";

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

describe("shouldApplySubscriptionUpdate — ordering guard", () => {
  const older = new Date("2026-06-01T00:00:00.000Z");
  const newer = new Date("2026-07-01T00:00:00.000Z");

  it("applies when there is no stored period yet", () => {
    assert.strictEqual(shouldApplySubscriptionUpdate(null, newer), true);
    assert.strictEqual(shouldApplySubscriptionUpdate(undefined, older), true);
  });

  function makeWebhookClient(
    options: { failSubscriptionUpsert?: boolean } = {},
  ) {
    const users = new Map([
      [
        "u1",
        {
          id: "u1",
          plan: "free",
          creditBalance: 500,
          creditPeriodStart: null as Date | null,
        },
      ],
    ]);
    const subs = new Map<string, Record<string, unknown>>();
    const events = new Set<string>();
    const client = {
      user: {
        update({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) {
          const user = users.get(where.id);
          if (!user) throw new Error("user not found");
          Object.assign(user, data);
          return Promise.resolve(user);
        },
      },
      subscription: {
        upsert({
          where,
          create,
          update,
        }: {
          where: { userId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) {
          if (options.failSubscriptionUpsert) {
            throw new Error("subscription write failed");
          }
          const existing = subs.get(where.userId);
          if (existing) {
            Object.assign(existing, update);
            return Promise.resolve(existing);
          }
          subs.set(where.userId, create);
          return Promise.resolve(create);
        },
        findUnique() {
          return Promise.resolve(null);
        },
        update() {
          throw new Error("not used");
        },
      },
      stripeWebhookEvent: {
        create({ data }: { data: { id: string; type: string } }) {
          if (events.has(data.id)) {
            const err = new Error("duplicate") as Error & { code: string };
            err.code = "P2002";
            throw err;
          }
          events.add(data.id);
          return Promise.resolve(data);
        },
      },
      async $transaction<T>(fn: (tx: unknown) => Promise<T>) {
        const userSnapshot = new Map(
          Array.from(users, ([key, value]) => [key, { ...value }]),
        );
        const subSnapshot = new Map(
          Array.from(subs, ([key, value]) => [key, { ...value }]),
        );
        const eventSnapshot = new Set(events);
        try {
          return await fn(client);
        } catch (error) {
          users.clear();
          for (const [key, value] of userSnapshot) users.set(key, value);
          subs.clear();
          for (const [key, value] of subSnapshot) subs.set(key, value);
          events.clear();
          for (const event of eventSnapshot) events.add(event);
          throw error;
        }
      },
      _users: users,
      _subs: subs,
      _events: events,
    };
    return client as unknown as typeof prisma & {
      _users: typeof users;
      _subs: typeof subs;
      _events: typeof events;
    };
  }

  describe("applyStripeWebhookEvent — idempotency and atomic writes", () => {
    const checkoutEvent = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId: "u1", plan: "pro" },
          subscription: "sub_123",
          customer: "cus_123",
        },
      },
    };

    it("records the event and plan/subscription update atomically", async () => {
      const client = makeWebhookClient();

      const outcome = await applyStripeWebhookEvent(client, checkoutEvent);

      assert.equal(outcome, "success");
      assert.equal(client._events.has("evt_1"), true);
      assert.equal(client._users.get("u1")?.plan, "pro");
      assert.equal(client._subs.get("u1")?.stripeSubscriptionId, "sub_123");
    });

    it("rolls back the idempotency row and user plan when subscription persistence fails", async () => {
      const client = makeWebhookClient({ failSubscriptionUpsert: true });

      await assert.rejects(() =>
        applyStripeWebhookEvent(client, checkoutEvent),
      );

      assert.equal(client._events.has("evt_1"), false);
      assert.equal(client._users.get("u1")?.plan, "free");
      assert.equal(client._subs.size, 0);
    });

    it("rejects duplicate event ids before reapplying state", async () => {
      const client = makeWebhookClient();

      await applyStripeWebhookEvent(client, checkoutEvent);
      await assert.rejects(
        () => applyStripeWebhookEvent(client, checkoutEvent),
        { name: "DuplicateStripeWebhookEventError" },
      );

      assert.equal(client._subs.size, 1);
    });
  });

  it("applies a newer incoming period", () => {
    assert.strictEqual(shouldApplySubscriptionUpdate(older, newer), true);
  });

  it("applies an equal incoming period (idempotent retry of same state)", () => {
    assert.strictEqual(shouldApplySubscriptionUpdate(newer, newer), true);
  });

  it("ignores an older incoming period (out-of-order redelivery)", () => {
    assert.strictEqual(shouldApplySubscriptionUpdate(newer, older), false);
  });

  it("ignores an update with no incoming period when one is stored", () => {
    assert.strictEqual(shouldApplySubscriptionUpdate(newer, null), false);
    assert.strictEqual(shouldApplySubscriptionUpdate(newer, undefined), false);
  });
});
