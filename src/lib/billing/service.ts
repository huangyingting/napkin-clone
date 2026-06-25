import { prisma } from "@/lib/prisma";

import { getEntitlements, isPlan, type Plan } from "./catalog";

type PrismaClientLike = typeof prisma;
type BillingWriteClient = Pick<PrismaClientLike, "subscription" | "user">;

export interface BillingSubscriptionState {
  plan: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface BillingState {
  userId: string;
  plan: Plan;
  rawPlan: string;
  creditBalance: number;
  creditPeriodStart: Date;
  periodStart: Date;
  periodEnd: Date;
  creditsPerPeriod: number;
  subscription: BillingSubscriptionState | null;
}

export interface SubscriptionCancellationState {
  stripeSubscriptionId: string | null;
  status: string;
}

export interface LocalPlanChangeOptions {
  client?: PrismaClientLike;
  now?: Date;
  status?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  updateSubscriptionPeriodOnExisting?: boolean;
  cancelAtPeriodEnd?: boolean;
}

export function resolvePlan(plan: string | null | undefined): Plan {
  return isPlan(plan) ? plan : "free";
}

export function periodEndForPlan(plan: Plan, periodStart: Date): Date {
  const entitlements = getEntitlements(plan);
  return new Date(
    periodStart.getTime() + entitlements.periodDays * 24 * 60 * 60 * 1000,
  );
}

export async function getBillingState(
  userId: string,
  client: PrismaClientLike = prisma,
): Promise<BillingState> {
  const user = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      plan: true,
      creditBalance: true,
      creditPeriodStart: true,
      subscription: {
        select: {
          plan: true,
          status: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      },
    },
  });

  const plan = resolvePlan(user.plan);
  const entitlements = getEntitlements(plan);
  const now = new Date();
  const periodMs = entitlements.periodDays * 24 * 60 * 60 * 1000;

  let periodStart = user.creditPeriodStart;
  let creditBalance = user.creditBalance;

  if (!periodStart || now.getTime() - periodStart.getTime() >= periodMs) {
    periodStart = now;
    creditBalance = entitlements.creditsPerPeriod;
    await client.user.update({
      where: { id: userId },
      data: {
        creditBalance,
        creditPeriodStart: periodStart,
      },
    });
  }

  return {
    userId,
    plan,
    rawPlan: user.plan,
    creditBalance,
    creditPeriodStart: periodStart,
    periodStart,
    periodEnd: new Date(periodStart.getTime() + periodMs),
    creditsPerPeriod: entitlements.creditsPerPeriod,
    subscription: user.subscription ?? null,
  };
}

export async function getSubscriptionCancellationState(
  userId: string,
  client: PrismaClientLike = prisma,
): Promise<SubscriptionCancellationState | null> {
  return client.subscription.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true, status: true },
  });
}

export async function getBillingSubscription(
  userId: string,
  client: PrismaClientLike = prisma,
): Promise<BillingSubscriptionState | null> {
  return client.subscription.findUnique({
    where: { userId },
    select: {
      plan: true,
      status: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  });
}

export async function applyLocalPlanChange(
  userId: string,
  targetPlan: Plan,
  options: LocalPlanChangeOptions = {},
): Promise<void> {
  const {
    client = prisma,
    now = new Date(),
    status = "active",
    stripeCustomerId,
    stripeSubscriptionId,
    currentPeriodStart = now,
    currentPeriodEnd = periodEndForPlan(targetPlan, currentPeriodStart),
    updateSubscriptionPeriodOnExisting = true,
    cancelAtPeriodEnd = false,
  } = options;

  await client.$transaction(async (tx) =>
    writeLocalPlanChange(tx, userId, targetPlan, {
      status,
      stripeCustomerId,
      stripeSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      updateSubscriptionPeriodOnExisting,
      cancelAtPeriodEnd,
    }),
  );
}

export async function writeLocalPlanChange(
  client: BillingWriteClient,
  userId: string,
  targetPlan: Plan,
  options: Required<
    Pick<
      LocalPlanChangeOptions,
      | "status"
      | "currentPeriodStart"
      | "currentPeriodEnd"
      | "updateSubscriptionPeriodOnExisting"
      | "cancelAtPeriodEnd"
    >
  > &
    Pick<LocalPlanChangeOptions, "stripeCustomerId" | "stripeSubscriptionId">,
): Promise<void> {
  const entitlements = getEntitlements(targetPlan);

  await client.user.update({
    where: { id: userId },
    data: {
      plan: targetPlan,
      creditBalance: entitlements.creditsPerPeriod,
      creditPeriodStart: options.currentPeriodStart,
    },
  });
  await client.subscription.upsert({
    where: { userId },
    create: {
      userId,
      plan: targetPlan,
      status: options.status,
      stripeCustomerId: options.stripeCustomerId,
      stripeSubscriptionId: options.stripeSubscriptionId,
      currentPeriodStart: options.currentPeriodStart,
      currentPeriodEnd: options.currentPeriodEnd,
      cancelAtPeriodEnd: options.cancelAtPeriodEnd,
    },
    update: {
      plan: targetPlan,
      status: options.status,
      ...(options.stripeCustomerId !== undefined
        ? { stripeCustomerId: options.stripeCustomerId }
        : {}),
      ...(options.stripeSubscriptionId !== undefined
        ? { stripeSubscriptionId: options.stripeSubscriptionId }
        : {}),
      ...(options.updateSubscriptionPeriodOnExisting
        ? {
            currentPeriodStart: options.currentPeriodStart,
            currentPeriodEnd: options.currentPeriodEnd,
          }
        : {}),
      cancelAtPeriodEnd: options.cancelAtPeriodEnd,
    },
  });
}

export async function recordStripeCustomer(
  userId: string,
  stripeCustomerId: string,
  options: {
    client?: PrismaClientLike;
    fallbackPlan?: Plan;
    periodPlan?: Plan;
    fallbackStatus?: string;
    now?: Date;
  } = {},
): Promise<void> {
  const {
    client = prisma,
    fallbackPlan = "free",
    periodPlan = fallbackPlan,
    fallbackStatus = "inactive",
    now = new Date(),
  } = options;
  await client.subscription.upsert({
    where: { userId },
    create: {
      userId,
      plan: fallbackPlan,
      status: fallbackStatus,
      stripeCustomerId,
      currentPeriodStart: now,
      currentPeriodEnd: periodEndForPlan(periodPlan, now),
      cancelAtPeriodEnd: false,
    },
    update: { stripeCustomerId },
  });
}

export async function markSubscriptionCancelAtPeriodEnd(
  userId: string,
  cancelAtPeriodEnd = true,
  client: PrismaClientLike = prisma,
): Promise<void> {
  await client.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd },
  });
}

export interface LocalSubscriptionUpdate {
  status: string;
  cancelAtPeriodEnd: boolean;
  plan?: Plan;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}

export function shouldApplySubscriptionUpdate(
  storedPeriodEnd: Date | null | undefined,
  incomingPeriodEnd: Date | null | undefined,
): boolean {
  if (!storedPeriodEnd) return true;
  if (!incomingPeriodEnd) return false;
  return incomingPeriodEnd.getTime() >= storedPeriodEnd.getTime();
}

export async function applyLocalSubscriptionUpdate(
  stripeSubscriptionId: string,
  next: LocalSubscriptionUpdate,
  client: PrismaClientLike = prisma,
): Promise<"applied" | "missing" | "stale"> {
  return client.$transaction(async (tx) =>
    writeLocalSubscriptionUpdate(tx, stripeSubscriptionId, next),
  );
}

export async function writeLocalSubscriptionUpdate(
  client: BillingWriteClient,
  stripeSubscriptionId: string,
  next: LocalSubscriptionUpdate,
): Promise<"applied" | "missing" | "stale"> {
  const sub = await client.subscription.findUnique({
    where: { stripeSubscriptionId },
  });
  if (!sub) return "missing";
  if (
    !shouldApplySubscriptionUpdate(sub.currentPeriodEnd, next.currentPeriodEnd)
  ) {
    return "stale";
  }

  await client.subscription.update({
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

  if (next.plan) {
    await client.user.update({
      where: { id: sub.userId },
      data: { plan: next.plan },
    });
  }

  return "applied";
}

export async function applyLocalSubscriptionDeleted(
  stripeSubscriptionId: string,
  next: LocalSubscriptionUpdate,
  client: PrismaClientLike = prisma,
  now: Date = new Date(),
): Promise<"applied" | "missing"> {
  return client.$transaction(async (tx) =>
    writeLocalSubscriptionDeleted(tx, stripeSubscriptionId, next, now),
  );
}

export async function writeLocalSubscriptionDeleted(
  client: BillingWriteClient,
  stripeSubscriptionId: string,
  next: LocalSubscriptionUpdate,
  now: Date = new Date(),
): Promise<"applied" | "missing"> {
  const sub = await client.subscription.findUnique({
    where: { stripeSubscriptionId },
  });
  if (!sub) return "missing";

  await writeLocalPlanChange(client, sub.userId, "free", {
    status: next.status,
    stripeCustomerId: sub.stripeCustomerId,
    stripeSubscriptionId,
    currentPeriodStart: now,
    currentPeriodEnd: now,
    updateSubscriptionPeriodOnExisting: true,
    cancelAtPeriodEnd: next.cancelAtPeriodEnd,
  });

  return "applied";
}
