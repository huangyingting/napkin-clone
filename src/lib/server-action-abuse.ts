import {
  checkAbuseBudget,
  requireAbuseBudgetSecret,
  type AbuseBudgetNamespaceId,
} from "@/lib/abuse-budget";

export interface ServerActionAbuseDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds?: number;
}

export async function checkServerActionAbuseBudget(
  namespace: AbuseBudgetNamespaceId,
  subject: string,
): Promise<ServerActionAbuseDecision> {
  const secret = requireAbuseBudgetSecret();
  if (!secret) {
    return { allowed: true };
  }
  const result = await checkAbuseBudget({ namespace, subject, secret });
  return {
    allowed: result.allowed,
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

export function retryMessage(
  retryAfterSeconds: number | undefined,
  fallback = "Too many attempts. Please wait a moment and try again.",
): string {
  if (!retryAfterSeconds || retryAfterSeconds < 60) {
    return fallback;
  }
  return `Too many attempts. Please wait ${Math.ceil(
    retryAfterSeconds / 60,
  )} minute(s) and try again.`;
}

/**
 * Checks the abuse budget for `namespace`/`subject` and either returns the
 * result of `action()` (allowed) or the value returned by `onBlocked()`.
 *
 * The wrapper lives in a NON-"use server" module so it can be called from
 * within exported server actions without violating Next.js "use server" rules.
 */
export async function withAbuseBudget<T>(
  namespace: AbuseBudgetNamespaceId,
  subject: string,
  action: () => Promise<T>,
  onBlocked: (retryAfterSeconds: number | undefined) => T,
): Promise<T> {
  const budget = await checkServerActionAbuseBudget(namespace, subject);
  if (!budget.allowed) {
    return onBlocked(budget.retryAfterSeconds);
  }
  return action();
}
