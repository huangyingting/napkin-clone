/**
 * Credit metering helpers (US-010 epic).
 *
 * Pure functions for computing the credit cost of a generation request and
 * DB helpers for reading/writing a user's credit balance. The DB helpers are
 * server-only; the pure functions are safe to import anywhere.
 *
 * Credit cost model: ~1 credit per word (whitespace-split). Minimum 1.
 * Period reset: if `creditPeriodStart` is null or has elapsed past `periodDays`,
 * the balance is reset to the plan's `creditsPerPeriod`.
 */

import { getEntitlements, type Plan } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Counts the approximate number of words in `text`. Each whitespace-delimited
 * token is one word. Returns at least 1 (so a single punctuation char costs
 * something).
 */
export function countWords(text: string): number {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, tokens.length);
}

/**
 * Computes the credit cost for a generation request.
 * Currently equal to the word count (1 credit/word), capped to a reasonable max.
 */
export function computeCreditCost(text: string): number {
  return countWords(text);
}

/**
 * Pure decision: does `balance` cover `cost`? Returns `true` when the user can
 * afford the request (i.e. the balance is at least the cost). Extracted so the
 * insufficient-credit gate can be unit-tested without a DB.
 */
export function hasSufficientCredits(balance: number, cost: number): boolean {
  return balance >= cost;
}

// ---------------------------------------------------------------------------
// DB helpers (server-only)
// ---------------------------------------------------------------------------

export interface UserCreditState {
  balance: number;
  periodStart: Date;
  periodEnd: Date;
  creditsPerPeriod: number;
  plan: Plan | string;
}

/**
 * Reads the current credit state for `userId`, performing a period-reset if the
 * current period has elapsed. Returns the up-to-date balance and period dates.
 *
 * Writes to the DB only when a period reset is needed.
 */
export async function getUserCreditState(
  userId: string,
  client: typeof prisma = prisma,
): Promise<UserCreditState> {
  const user = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      plan: true,
      creditBalance: true,
      creditPeriodStart: true,
    },
  });

  const entitlements = getEntitlements(user.plan);
  const now = new Date();
  const periodMs = entitlements.periodDays * 24 * 60 * 60 * 1000;

  let periodStart: Date;
  let balance: number;

  if (!user.creditPeriodStart) {
    // First access — initialise period
    periodStart = now;
    balance = entitlements.creditsPerPeriod;
    await client.user.update({
      where: { id: userId },
      data: {
        creditBalance: balance,
        creditPeriodStart: periodStart,
      },
    });
  } else {
    const elapsed = now.getTime() - user.creditPeriodStart.getTime();
    if (elapsed >= periodMs) {
      // Period has rolled over — reset balance
      periodStart = now;
      balance = entitlements.creditsPerPeriod;
      await client.user.update({
        where: { id: userId },
        data: {
          creditBalance: balance,
          creditPeriodStart: periodStart,
        },
      });
    } else {
      periodStart = user.creditPeriodStart;
      balance = user.creditBalance;
    }
  }

  const periodEnd = new Date(periodStart.getTime() + periodMs);

  return {
    balance,
    periodStart,
    periodEnd,
    creditsPerPeriod: entitlements.creditsPerPeriod,
    plan: user.plan,
  };
}

/**
 * Atomically deducts `cost` credits from `userId`'s balance. Returns the new
 * balance. Throws `InsufficientCreditsError` when the balance would go below 0.
 *
 * The deduction is a single conditional `updateMany` guarded by
 * `creditBalance >= cost`, so the read-check-decrement is collapsed into one
 * atomic DB write: concurrent generations can never both pass and drive the
 * balance negative. When no row matches the guard (`count === 0`) the balance
 * is insufficient and we surface the same `InsufficientCreditsError` callers
 * already expect.
 *
 * A non-positive `cost` (the unlimited-credits gate, #97) is a no-op: the
 * current balance is returned without any write.
 */
export async function deductCredits(
  userId: string,
  cost: number,
  client: typeof prisma = prisma,
): Promise<number> {
  if (cost <= 0) {
    const user = await client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditBalance: true },
    });
    return user.creditBalance;
  }

  // Atomic conditional decrement: only update the row while it still covers the
  // cost. `count === 0` means the guard failed (insufficient balance).
  const result = await client.user.updateMany({
    where: { id: userId, creditBalance: { gte: cost } },
    data: { creditBalance: { decrement: cost } },
  });

  if (result.count === 0) {
    // Re-read the actual balance to report it accurately in the error.
    const user = await client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditBalance: true },
    });
    throw new InsufficientCreditsError(user.creditBalance, cost);
  }

  const updated = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: { creditBalance: true },
  });

  return updated.creditBalance;
}

/** Thrown when a user has insufficient credits for the requested operation. */
export class InsufficientCreditsError extends Error {
  readonly balance: number;
  readonly cost: number;

  constructor(balance: number, cost: number) {
    super(
      `Insufficient credits: need ${cost}, have ${balance}. Your plan's credit balance has been exhausted — upgrade or wait for your next period to reset.`,
    );
    this.name = "InsufficientCreditsError";
    this.balance = balance;
    this.cost = cost;
  }
}
