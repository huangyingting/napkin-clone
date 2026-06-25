import { isPlan, type Plan } from "@/lib/billing/catalog";
import { VISUAL_KINDS, type VisualKind } from "@/lib/visual/schema";
import type { WorkspaceRole } from "@/lib/workspace/roles";

export type LiteralValidationResult<T extends string> =
  | { success: true; value: T }
  | { success: false; error: string };

function parseLiteral<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): LiteralValidationResult<T> {
  if (
    typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
  ) {
    return { success: true, value: value as T };
  }
  return {
    success: false,
    error: `${label} must be one of: ${allowed.join(", ")}`,
  };
}

function assertLiteral<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  const parsed = parseLiteral(value, allowed, label);
  if (!parsed.success) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

export const WORKSPACE_ROLE_LITERALS = [
  "OWNER",
  "EDITOR",
  "VIEWER",
] as const satisfies readonly WorkspaceRole[];

export const INVITABLE_WORKSPACE_ROLE_LITERALS = ["EDITOR", "VIEWER"] as const;

export const COMMENT_ANCHOR_TYPE_LITERALS = ["text", "visual"] as const;

export const PLAN_LITERALS = [
  "free",
  "plus",
  "pro",
] as const satisfies readonly Plan[];

export const USAGE_LEDGER_STATUS_LITERALS = [
  "reserved",
  "captured",
  "refunded",
] as const;

export const SUBSCRIPTION_STATUS_LITERALS = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
] as const;

export type UsageLedgerStatusLiteral =
  (typeof USAGE_LEDGER_STATUS_LITERALS)[number];
export type SubscriptionStatusLiteral =
  (typeof SUBSCRIPTION_STATUS_LITERALS)[number];

export function parseWorkspaceRoleLiteral(
  value: unknown,
): LiteralValidationResult<WorkspaceRole> {
  return parseLiteral(value, WORKSPACE_ROLE_LITERALS, "Workspace role");
}

export function assertWorkspaceRoleLiteral(value: unknown): WorkspaceRole {
  return assertLiteral(value, WORKSPACE_ROLE_LITERALS, "Workspace role");
}

export function parseInvitableWorkspaceRoleLiteral(
  value: unknown,
): LiteralValidationResult<(typeof INVITABLE_WORKSPACE_ROLE_LITERALS)[number]> {
  return parseLiteral(
    value,
    INVITABLE_WORKSPACE_ROLE_LITERALS,
    "Invitable workspace role",
  );
}

export function parsePlanLiteral(
  value: unknown,
): LiteralValidationResult<Plan> {
  return isPlan(value)
    ? { success: true, value }
    : {
        success: false,
        error: `Plan must be one of: ${PLAN_LITERALS.join(", ")}`,
      };
}

export function assertPlanLiteral(value: unknown): Plan {
  const parsed = parsePlanLiteral(value);
  if (!parsed.success) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

export function parseUsageLedgerStatusLiteral(
  value: unknown,
): LiteralValidationResult<UsageLedgerStatusLiteral> {
  return parseLiteral(
    value,
    USAGE_LEDGER_STATUS_LITERALS,
    "Usage ledger status",
  );
}

export function parseSubscriptionStatusLiteral(
  value: unknown,
): LiteralValidationResult<SubscriptionStatusLiteral> {
  return parseLiteral(
    value,
    SUBSCRIPTION_STATUS_LITERALS,
    "Subscription status",
  );
}

export function parseVisualKindLiteral(
  value: unknown,
): LiteralValidationResult<VisualKind> {
  return parseLiteral(value, VISUAL_KINDS, "Visual type");
}
