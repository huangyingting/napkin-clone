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
import { stripe as stripeEnv, app as appEnv } from "@/lib/env";

function getStripeKey(): string {
  return stripeEnv.secretKey();
}

function getPriceId(plan: Plan): string {
  if (plan === "plus") {
    return stripeEnv.plusPriceId();
  }
  if (plan === "pro") {
    return stripeEnv.proPriceId();
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

    const appUrl = appEnv.url("http://localhost:3000");
    const stripe = await loadStripe();

    // Look up or create a Stripe customer (reuse the stored customer id; it can
    // outlive any single subscription).
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    let customerId: string | undefined = sub?.stripeCustomerId ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      customerId = customer.id;

      // Persist the customer id immediately so a retried checkout doesn't create
      // a duplicate Stripe customer.
      const now = new Date();
      const entitlements = getEntitlements(targetPlan);
      const periodEnd = new Date(
        now.getTime() + entitlements.periodDays * 24 * 60 * 60 * 1000,
      );
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: sub?.plan ?? "free",
          status: sub?.status ?? "inactive",
          stripeCustomerId: customerId,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
        update: { stripeCustomerId: customerId },
      });
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

  async cancelSubscriptionImmediately(userId: string): Promise<void> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub?.stripeSubscriptionId) return;

    const stripe = await loadStripe();
    await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
  }

  async cancelSubscription(userId: string): Promise<ChangePlanResult> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub?.stripeSubscriptionId) {
      // No Stripe subscription on record — downgrade locally
      await this._applyFreePlan(userId);
      return {
        success: true,
        plan: "free",
        message: "Subscription cancelled.",
      };
    }

    const stripe = await loadStripe();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
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

/** Minimal shape of the Stripe Subscription object fields we consume. */
export interface StripeSubscriptionLike {
  id?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  /** Unix seconds. */
  current_period_start?: number;
  /** Unix seconds. */
  current_period_end?: number;
  items?: { data?: Array<{ price?: { id?: string } }> };
}

/** The subset of subscription state a webhook event resolves to. */
export interface ReducedSubscriptionState {
  status: string;
  cancelAtPeriodEnd: boolean;
  plan?: Plan;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}

/**
 * Maps a Stripe subscription `status` to our internal status vocabulary
 * (`active` | `past_due` | `cancelled` | `inactive`). Pure.
 */
export function mapStripeSubscriptionStatus(
  status: string | undefined,
): string {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return "inactive";
  }
}

/**
 * Resolves a Stripe Price id to one of our plans using the configured price-id
 * env vars. Returns `null` when the price is unknown. Pure.
 */
export function planFromPriceId(
  priceId: string | undefined | null,
  env: Record<string, string | undefined> = process.env,
): Plan | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PLUS_PRICE_ID) return "plus";
  if (priceId === env.STRIPE_PRO_PRICE_ID) return "pro";
  return null;
}

/**
 * Pure reducer: maps a Stripe subscription event to the subscription state we
 * persist. Handles update / delete / cancel reliably:
 *
 * - `customer.subscription.deleted` → cancelled + free plan.
 * - `customer.subscription.updated` (and created) → mapped status, period
 *   window, cancellation intent, and (when resolvable) the plan from the line
 *   item price id.
 *
 * No DB or network access — unit-tested directly.
 */
export function reduceStripeSubscriptionEvent(
  eventType: string,
  sub: StripeSubscriptionLike,
  env: Record<string, string | undefined> = process.env,
): ReducedSubscriptionState {
  if (eventType === "customer.subscription.deleted") {
    return { status: "cancelled", cancelAtPeriodEnd: false, plan: "free" };
  }

  const state: ReducedSubscriptionState = {
    status: mapStripeSubscriptionStatus(sub.status),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };

  if (typeof sub.current_period_start === "number") {
    state.currentPeriodStart = new Date(sub.current_period_start * 1000);
  }
  if (typeof sub.current_period_end === "number") {
    state.currentPeriodEnd = new Date(sub.current_period_end * 1000);
  }

  const plan = planFromPriceId(sub.items?.data?.[0]?.price?.id, env);
  if (plan) state.plan = plan;

  return state;
}

/**
 * Pure ordering guard for `customer.subscription.updated`.
 *
 * Stripe can redeliver and reorder webhooks, so a stale event may carry an
 * older billing period than the one we already persisted. Returns `true` only
 * when the incoming period is at least as new as the stored one (or when we
 * have no period to compare against), so out-of-order events are ignored
 * instead of reverting newer subscription state.
 */
export function shouldApplySubscriptionUpdate(
  storedPeriodEnd: Date | null | undefined,
  incomingPeriodEnd: Date | null | undefined,
): boolean {
  if (!storedPeriodEnd) return true;
  if (!incomingPeriodEnd) return false;
  return incomingPeriodEnd.getTime() >= storedPeriodEnd.getTime();
}

export async function handleStripeWebhookEvent(
  rawBody: string,
  signature: string,
): Promise<{ status: number; message: string }> {
  const webhookSecret = stripeEnv.webhookSecret();
  if (!webhookSecret) {
    return { status: 500, message: "STRIPE_WEBHOOK_SECRET not configured" };
  }

  const stripe = await loadStripe();

  let event: {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return { status: 400, message: "Webhook signature verification failed" };
  }

  // Idempotency: record the event id before applying it. A duplicate id (Stripe
  // retry/redelivery) fails the unique constraint (P2002), so we short-circuit
  // as an already-processed no-op instead of re-applying state.
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "P2002"
    ) {
      return { status: 200, message: "duplicate event ignored" };
    }
    throw err;
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
        const stripeSubscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : undefined;
        const stripeCustomerId =
          typeof session.customer === "string" ? session.customer : undefined;

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
              stripeCustomerId,
              stripeSubscriptionId,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
            update: {
              plan,
              status: "active",
              stripeCustomerId,
              stripeSubscriptionId,
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
      const stripeSub = event.data.object as StripeSubscriptionLike;
      const stripeSubscriptionId = stripeSub.id;
      if (!stripeSubscriptionId) break;
      const sub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId },
      });
      if (sub) {
        const next = reduceStripeSubscriptionEvent(event.type, stripeSub);
        // Ordering guard: ignore redeliveries that carry an older billing
        // period than the one we already persisted, so out-of-order events
        // cannot revert newer subscription state.
        if (
          !shouldApplySubscriptionUpdate(
            sub.currentPeriodEnd,
            next.currentPeriodEnd,
          )
        ) {
          return { status: 200, message: "stale subscription update ignored" };
        }
        await prisma.subscription.update({
          where: { stripeSubscriptionId },
          data: {
            status: next.status,
            cancelAtPeriodEnd: next.cancelAtPeriodEnd,
            ...(next.plan ? { plan: next.plan } : {}),
            ...(next.currentPeriodStart
              ? { currentPeriodStart: next.currentPeriodStart }
              : {}),
            ...(next.currentPeriodEnd
              ? { currentPeriodEnd: next.currentPeriodEnd }
              : {}),
          },
        });
        // Keep the user's plan in sync when the subscription's plan changes.
        if (next.plan) {
          await prisma.user.update({
            where: { id: sub.userId },
            data: { plan: next.plan },
          });
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as StripeSubscriptionLike;
      const stripeSubscriptionId = stripeSub.id;
      if (!stripeSubscriptionId) break;
      const sub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId },
      });
      if (sub) {
        const next = reduceStripeSubscriptionEvent(event.type, stripeSub);
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
            where: { stripeSubscriptionId },
            data: {
              plan: next.plan ?? "free",
              status: next.status,
              currentPeriodEnd: now,
              currentPeriodStart: now,
              cancelAtPeriodEnd: next.cancelAtPeriodEnd,
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
