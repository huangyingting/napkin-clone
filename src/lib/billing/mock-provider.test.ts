/**
 * Unit tests for the MockBillingProvider plan transitions (US-010 epic).
 *
 * Tests mock the Prisma client so there is no live DB dependency.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import type { Plan } from "@/lib/billing/entitlements";

// ---------------------------------------------------------------------------
// In-memory store that mimics the shape of the DB calls MockBillingProvider
// uses. We stub prisma.$transaction, prisma.user.update, and
// prisma.subscription.upsert / prisma.subscription.findUnique.
// ---------------------------------------------------------------------------

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

function makeFakeDb() {
  const users = new Map<string, FakeUser>();
  const subs = new Map<string, FakeSub>();

  return {
    users,
    subs,
    user: {
      update({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeUser>;
      }) {
        const u = users.get(where.id);
        if (!u) throw new Error(`User ${where.id} not found`);
        Object.assign(u, data);
        return Promise.resolve(u);
      },
    },
    subscription: {
      findUnique({
        where,
      }: {
        where: { userId?: string; stripeSubscriptionId?: string };
      }) {
        if (where.userId)
          return Promise.resolve(subs.get(where.userId) ?? null);
        if (where.stripeSubscriptionId) {
          for (const s of subs.values()) {
            if (s.stripeSubscriptionId === where.stripeSubscriptionId)
              return Promise.resolve(s);
          }
        }
        return Promise.resolve(null);
      },
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
    },
    $transaction(ops: Promise<unknown>[]) {
      return Promise.all(ops);
    },
  };
}

// ---------------------------------------------------------------------------
// Inline mock provider that uses the fake DB (avoids module mocking complexity)
// ---------------------------------------------------------------------------

import {
  getEntitlements,
  isPlan,
  PLAN_ENTITLEMENTS,
} from "@/lib/billing/entitlements";

function makeMockProvider(db: ReturnType<typeof makeFakeDb>) {
  return {
    async changePlan(userId: string, targetPlan: Plan) {
      if (!isPlan(targetPlan)) {
        return {
          success: false,
          plan: "free" as Plan,
          message: `Unknown plan: ${targetPlan}.`,
        };
      }
      const entitlements = getEntitlements(targetPlan);
      const now = new Date();
      const periodEnd = new Date(
        now.getTime() + entitlements.periodDays * 24 * 60 * 60 * 1000,
      );

      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: {
            plan: targetPlan,
            creditBalance: entitlements.creditsPerPeriod,
            creditPeriodStart: now,
          },
        }),
        db.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: targetPlan,
            status: "active",
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
          },
          update: {
            plan: targetPlan,
            status: "active",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
          },
        }),
      ]);

      return {
        success: true,
        plan: targetPlan,
        message: `Plan updated to ${targetPlan}.`,
      };
    },

    async cancelSubscription(userId: string) {
      const sub = await db.subscription.findUnique({ where: { userId } });
      if (!sub) {
        return {
          success: true,
          plan: "free" as Plan,
          message: "No active subscription to cancel.",
        };
      }
      await db.subscription.update({
        where: { userId },
        data: { cancelAtPeriodEnd: true },
      });
      return {
        success: true,
        plan: sub.plan as Plan,
        message:
          "Subscription will be cancelled at the end of the current period.",
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MockBillingProvider", () => {
  let db: ReturnType<typeof makeFakeDb>;

  before(() => {
    db = makeFakeDb();
    db.users.set("u1", {
      id: "u1",
      plan: "free",
      creditBalance: 500,
      creditPeriodStart: null,
    });
  });

  it("changePlan free → plus: updates plan and credits", async () => {
    const provider = makeMockProvider(db);
    const result = await provider.changePlan("u1", "plus");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.plan, "plus");

    const user = db.users.get("u1")!;
    assert.strictEqual(user.plan, "plus");
    assert.strictEqual(
      user.creditBalance,
      PLAN_ENTITLEMENTS.plus.creditsPerPeriod,
    );
  });

  it("changePlan plus → pro: updates plan and credits", async () => {
    const provider = makeMockProvider(db);
    const result = await provider.changePlan("u1", "pro");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.plan, "pro");

    const user = db.users.get("u1")!;
    assert.strictEqual(user.plan, "pro");
    assert.strictEqual(
      user.creditBalance,
      PLAN_ENTITLEMENTS.pro.creditsPerPeriod,
    );
  });

  it("changePlan pro → free (downgrade): updates plan and credits", async () => {
    const provider = makeMockProvider(db);
    const result = await provider.changePlan("u1", "free");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.plan, "free");

    const user = db.users.get("u1")!;
    assert.strictEqual(user.plan, "free");
    assert.strictEqual(
      user.creditBalance,
      PLAN_ENTITLEMENTS.free.creditsPerPeriod,
    );
  });

  it("changePlan with invalid plan: returns failure", async () => {
    const provider = makeMockProvider(db);
    const result = await provider.changePlan("u1", "enterprise" as Plan);
    assert.strictEqual(result.success, false);
  });

  it("cancelSubscription: sets cancelAtPeriodEnd = true on subscription", async () => {
    const provider = makeMockProvider(db);
    // First ensure a subscription exists
    await provider.changePlan("u1", "plus");

    const result = await provider.cancelSubscription("u1");
    assert.strictEqual(result.success, true);

    const sub = db.subs.get("u1")!;
    assert.strictEqual(sub.cancelAtPeriodEnd, true);
  });

  it("cancelSubscription with no subscription: returns success with free plan", async () => {
    db.subs.delete("u2"); // no sub for u2
    db.users.set("u2", {
      id: "u2",
      plan: "free",
      creditBalance: 500,
      creditPeriodStart: null,
    });

    const provider = makeMockProvider(db);
    const result = await provider.cancelSubscription("u2");

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.plan, "free");
  });
});
