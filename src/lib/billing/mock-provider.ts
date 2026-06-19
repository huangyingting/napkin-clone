/**
 * Mock / DEV billing provider (US-010 epic).
 *
 * Performs plan changes and cancellations by writing directly to the database.
 * No external service is required — works in CI, local dev, and any environment
 * without Stripe keys. This is the default provider when STRIPE_SECRET_KEY is
 * absent.
 *
 * Plan transitions:
 *  - upgrade to plus/pro: creates or updates the Subscription row; sets plan
 *    and creditBalance on the User row.
 *  - downgrade to free: same, but targets the free entitlements.
 *  - cancel: sets cancelAtPeriodEnd = true; actual downgrade happens at period
 *    end (a cron job or webhook would handle that in prod — for mock we mark it).
 */

import { prisma } from "@/lib/prisma";
import { getEntitlements, isPlan, type Plan } from "@/lib/billing/entitlements";
import type { BillingProvider, ChangePlanResult } from "@/lib/billing/provider";

export class MockBillingProvider implements BillingProvider {
  async changePlan(
    userId: string,
    targetPlan: Plan,
  ): Promise<ChangePlanResult> {
    if (!isPlan(targetPlan)) {
      return {
        success: false,
        plan: "free",
        message: `Unknown plan: ${targetPlan}.`,
      };
    }

    const entitlements = getEntitlements(targetPlan);
    const now = new Date();
    const periodEnd = new Date(
      now.getTime() + entitlements.periodDays * 24 * 60 * 60 * 1000,
    );

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          plan: targetPlan,
          creditBalance: entitlements.creditsPerPeriod,
          creditPeriodStart: now,
        },
      }),
      prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: targetPlan,
          status: "active",
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
  }

  async cancelSubscription(userId: string): Promise<ChangePlanResult> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });

    if (!sub) {
      // No active subscription — nothing to cancel
      return {
        success: true,
        plan: "free",
        message: "No active subscription to cancel.",
      };
    }

    await prisma.subscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true },
    });

    return {
      success: true,
      plan: sub.plan as Plan,
      message: `Subscription will be cancelled at the end of the current period.`,
    };
  }
}
