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
