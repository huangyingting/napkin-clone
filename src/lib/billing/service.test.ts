import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PLAN_ENTITLEMENTS } from "@/lib/billing/catalog";
import {
  applyLocalPlanChange,
  getBillingState,
  recordStripeCustomer,
} from "@/lib/billing/service";
import { prisma } from "@/lib/prisma";

interface FakeUser {
  id: string;
  plan: string;
  creditBalance: number;
  creditPeriodStart: Date | null;
}

interface FakeSub {
  userId: string;
  plan: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

function makeFakeClient() {
  const users = new Map<string, FakeUser>();
  const subs = new Map<string, FakeSub>();
  const client = {
    user: {
      async findUniqueOrThrow({ where }: { where: { id: string } }) {
        const user = users.get(where.id);
        if (!user) throw new Error("User not found");
        return { ...user, subscription: subs.get(where.id) ?? null };
      },
      update({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeUser>;
      }) {
        const user = users.get(where.id);
        if (!user) throw new Error("User not found");
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
        create: FakeSub;
        update: Partial<FakeSub>;
      }) {
        const existing = subs.get(where.userId);
        if (existing) {
          Object.assign(existing, update);
          return Promise.resolve(existing);
        }
        subs.set(where.userId, create);
        return Promise.resolve(create);
      },
      update({
        where,
        data,
      }: {
        where: { userId?: string; stripeSubscriptionId?: string };
        data: Partial<FakeSub>;
      }) {
        const sub = where.userId
          ? subs.get(where.userId)
          : Array.from(subs.values()).find(
              (s) => s.stripeSubscriptionId === where.stripeSubscriptionId,
            );
        if (!sub) throw new Error("Subscription not found");
        Object.assign(sub, data);
        return Promise.resolve(sub);
      },
      findUnique({
        where,
      }: {
        where: { userId?: string; stripeSubscriptionId?: string };
      }) {
        if (where.userId)
          return Promise.resolve(subs.get(where.userId) ?? null);
        return Promise.resolve(
          Array.from(subs.values()).find(
            (s) => s.stripeSubscriptionId === where.stripeSubscriptionId,
          ) ?? null,
        );
      },
    },
    $transaction(ops: Promise<unknown>[]) {
      return Promise.all(ops);
    },
    _users: users,
    _subs: subs,
  };
  return client as unknown as typeof prisma & {
    _users: Map<string, FakeUser>;
    _subs: Map<string, FakeSub>;
  };
}

describe("billing service state", () => {
  it("centralizes credit period reset when reading billing state", async () => {
    const client = makeFakeClient();
    client._users.set("u1", {
      id: "u1",
      plan: "free",
      creditBalance: 1,
      creditPeriodStart: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });

    const state = await getBillingState("u1", client);

    assert.equal(state.plan, "free");
    assert.equal(state.creditBalance, PLAN_ENTITLEMENTS.free.creditsPerPeriod);
    assert.equal(
      client._users.get("u1")?.creditBalance,
      PLAN_ENTITLEMENTS.free.creditsPerPeriod,
    );
  });

  it("applies provider-independent local plan transitions", async () => {
    const client = makeFakeClient();
    client._users.set("u1", {
      id: "u1",
      plan: "free",
      creditBalance: 500,
      creditPeriodStart: null,
    });

    await applyLocalPlanChange("u1", "pro", { client });

    assert.equal(client._users.get("u1")?.plan, "pro");
    assert.equal(
      client._users.get("u1")?.creditBalance,
      PLAN_ENTITLEMENTS.pro.creditsPerPeriod,
    );
    assert.equal(client._subs.get("u1")?.plan, "pro");
    assert.equal(client._subs.get("u1")?.status, "active");
  });

  it("records Stripe customer ids without mutating the current plan", async () => {
    const client = makeFakeClient();
    client._users.set("u1", {
      id: "u1",
      plan: "free",
      creditBalance: 500,
      creditPeriodStart: null,
    });

    await recordStripeCustomer("u1", "cus_123", {
      client,
      fallbackPlan: "free",
      periodPlan: "pro",
    });

    assert.equal(client._users.get("u1")?.plan, "free");
    assert.equal(client._subs.get("u1")?.plan, "free");
    assert.equal(client._subs.get("u1")?.stripeCustomerId, "cus_123");
  });

  it("can preserve an existing subscription period during local free-plan fallback", async () => {
    const client = makeFakeClient();
    const periodStart = new Date("2026-06-01T00:00:00Z");
    const periodEnd = new Date("2026-07-01T00:00:00Z");
    client._users.set("u1", {
      id: "u1",
      plan: "plus",
      creditBalance: 10_000,
      creditPeriodStart: periodStart,
    });
    client._subs.set("u1", {
      userId: "u1",
      plan: "plus",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true,
    });

    await applyLocalPlanChange("u1", "free", {
      client,
      updateSubscriptionPeriodOnExisting: false,
    });

    assert.equal(client._subs.get("u1")?.plan, "free");
    assert.deepEqual(client._subs.get("u1")?.currentPeriodStart, periodStart);
    assert.deepEqual(client._subs.get("u1")?.currentPeriodEnd, periodEnd);
  });
});
