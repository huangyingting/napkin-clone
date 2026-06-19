/**
 * Stripe billing provider (US-010 epic) — ENV-GATED.
 *
 * This module is only loaded (via dynamic import in provider.ts) when the
 * STRIPE_SECRET_KEY environment variable is set. The app builds, tests, and
 * runs without it. Stripe's Node SDK (`stripe`) is an optional dependency —
 * install it separately (`npm install stripe`) before enabling this path.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY         — Stripe secret key (sk_test_… or sk_live_…)
 *   STRIPE_PLUS_PRICE_ID      — Stripe Price id for the Plus plan
 *   STRIPE_PRO_PRICE_ID       — Stripe Price id for the Pro plan
 *   STRIPE_WEBHOOK_SECRET     — Signing secret for webhook verification
 *   NEXT_PUBLIC_APP_URL       — Base URL for redirect after checkout
 *
 * Webhook route: POST /api/billing/webhook
 * Events handled: checkout.session.completed, customer.subscription.updated,
 *                 customer.subscription.deleted
 *
 * NOTE: The webhook handler lives in src/app/api/billing/webhook/route.ts
 * and shares the same event-handling logic via `handleStripeWebhookEvent`.
 */

import { prisma } from "@/lib/prisma";
import { getEntitlements, isPlan, type Plan } from "@/lib/billing/entitlements";
import type { BillingProvider, ChangePlanResult } from "@/lib/billing/provider";

function getStripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return key;
}

function getPriceId(plan: Plan): string {
  if (plan === "plus") {
    const id = process.env.STRIPE_PLUS_PRICE_ID;
    if (!id) throw new Error("STRIPE_PLUS_PRICE_ID is not set");
    return id;
  }
  if (plan === "pro") {
    const id = process.env.STRIPE_PRO_PRICE_ID;
    if (!id) throw new Error("STRIPE_PRO_PRICE_ID is not set");
    return id;
  }
  throw new Error(`No Stripe price for plan: ${plan}`);
}

// Dynamic Stripe import (SDK is optional — ignore at bundle time, load at runtime)
async function loadStripe() {
  try {
    // webpackIgnore prevents Turbopack/webpack from statically resolving this
    // module at build time so the app builds without the `stripe` package.
    const mod = await import(
      /* webpackIgnore: true */
      "stripe" as string
    );
    const StripeClass = (mod as { default?: unknown }).default ?? mod;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (StripeClass as any)(getStripeKey(), {
      apiVersion: "2024-06-20",
    });
  } catch {
    throw new Error(
      "The `stripe` package is not installed. Run `npm install stripe` to enable Stripe billing.",
    );
  }
}

export class StripeBillingProvider implements BillingProvider {
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

    if (targetPlan === "free") {
      // Downgrade — cancel active Stripe subscription and set free plan locally
      return this.cancelSubscription(userId);
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const stripe = await loadStripe();

    // Look up or create a Stripe customer
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    let customerId: string | undefined = sub?.externalId ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: getPriceId(targetPlan), quantity: 1 }],
      success_url: `${appUrl}/app/settings/billing?success=1`,
      cancel_url: `${appUrl}/app/settings/billing?cancelled=1`,
      metadata: { userId, plan: targetPlan },
    });

    return {
      success: true,
      plan: targetPlan,
      message: "Redirecting to Stripe checkout…",
      redirectUrl: session.url ?? undefined,
    };
  }

  async cancelSubscription(userId: string): Promise<ChangePlanResult> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub?.externalId) {
      // No Stripe subscription on record — downgrade locally
      await this._applyFreePlan(userId);
      return {
        success: true,
        plan: "free",
        message: "Subscription cancelled.",
      };
    }

    const stripe = await loadStripe();
    await stripe.subscriptions.update(sub.externalId, {
      cancel_at_period_end: true,
    });

    await prisma.subscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true },
    });

    return {
      success: true,
      plan: sub.plan as Plan,
      message:
        "Subscription will be cancelled at the end of the current period.",
    };
  }

  private async _applyFreePlan(userId: string): Promise<void> {
    const entitlements = getEntitlements("free");
    const now = new Date();
    const periodEnd = new Date(
      now.getTime() + entitlements.periodDays * 24 * 60 * 60 * 1000,
    );

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          plan: "free",
          creditBalance: entitlements.creditsPerPeriod,
          creditPeriodStart: now,
        },
      }),
      prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: "free",
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
        update: {
          plan: "free",
          status: "active",
          cancelAtPeriodEnd: false,
        },
      }),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Webhook event handler (shared with /api/billing/webhook)
// ---------------------------------------------------------------------------

export async function handleStripeWebhookEvent(
  rawBody: string,
  signature: string,
): Promise<{ status: number; message: string }> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return { status: 500, message: "STRIPE_WEBHOOK_SECRET not configured" };
  }

  const stripe = await loadStripe();

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return { status: 400, message: "Webhook signature verification failed" };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = (session.metadata as Record<string, string>)?.userId;
      const plan = (session.metadata as Record<string, string>)?.plan;
      if (userId && isPlan(plan)) {
        const entitlements = getEntitlements(plan);
        const now = new Date();
        const periodEnd = new Date(
          now.getTime() + entitlements.periodDays * 24 * 60 * 60 * 1000,
        );
        const externalSubId =
          typeof session.subscription === "string"
            ? session.subscription
            : undefined;

        await prisma.$transaction([
          prisma.user.update({
            where: { id: userId },
            data: {
              plan,
              creditBalance: entitlements.creditsPerPeriod,
              creditPeriodStart: now,
            },
          }),
          prisma.subscription.upsert({
            where: { userId },
            create: {
              userId,
              plan,
              status: "active",
              externalId: externalSubId,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
            update: {
              plan,
              status: "active",
              externalId: externalSubId,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
          }),
        ]);
      }
      break;
    }

    case "customer.subscription.updated": {
      const stripeSub = event.data.object;
      const externalId = stripeSub.id as string;
      const sub = await prisma.subscription.findUnique({
        where: { externalId },
      });
      if (sub) {
        const status =
          (stripeSub.status as string) === "active" ? "active" : "past_due";
        const cancelAtPeriodEnd = Boolean(stripeSub.cancel_at_period_end);
        await prisma.subscription.update({
          where: { externalId },
          data: { status, cancelAtPeriodEnd },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const stripeSub = event.data.object;
      const externalId = stripeSub.id as string;
      const sub = await prisma.subscription.findUnique({
        where: { externalId },
      });
      if (sub) {
        const entitlements = getEntitlements("free");
        const now = new Date();
        await prisma.$transaction([
          prisma.user.update({
            where: { id: sub.userId },
            data: {
              plan: "free",
              creditBalance: entitlements.creditsPerPeriod,
              creditPeriodStart: now,
            },
          }),
          prisma.subscription.update({
            where: { externalId },
            data: {
              plan: "free",
              status: "cancelled",
              currentPeriodEnd: now,
              currentPeriodStart: now,
              cancelAtPeriodEnd: false,
            },
          }),
        ]);
      }
      break;
    }

    default:
      // Unhandled event type — log and ignore
      break;
  }

  return { status: 200, message: "ok" };
}
