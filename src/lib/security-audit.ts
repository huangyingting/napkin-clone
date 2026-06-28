import { REDACTED, logInfo, normalizeLogKey } from "@/lib/log";

export const SECURITY_AUDIT_SCOPE = "security.audit";

export type SecurityAuditEventName =
  | "auth.password_reset.requested"
  | "auth.password_reset.consumed"
  | "auth.email_verification.requested"
  | "auth.email_verification.consumed"
  | "account.deletion.completed"
  | "account.deletion.erasure_verification_failed"
  | "account.deletion.billing_reconciliation_required"
  | "billing.webhook.processed";

export type SecurityAuditOutcome =
  | "accepted"
  /* node:coverage ignore next -- Type union members are erased by TypeScript. */
  | "sent"
  | "already_verified"
  | "success"
  | "rejected"
  | "duplicate"
  | "stale"
  | "missing"
  | "failed"
  | "ignored";

export type SecurityAuditContext = Partial<{
  userId: string;
  workspaceId: string;
  accountId: string;
  subscriptionId: string;
  stripeEventId: string;
  eventType: string;
  outcome: SecurityAuditOutcome;
  reason: string;
  status: string;
  /* node:coverage ignore next -- Type-only context field is erased by TypeScript. */
  plan: string;
  feature: string;
  count: number;
  idempotent: boolean;
}>;

type AuditScalar = string | number | boolean | null;

export interface SecurityAuditLogRecord {
  level: "info";
  scope: typeof SECURITY_AUDIT_SCOPE;
  timestamp: string;
  message: SecurityAuditEventName;
  event: SecurityAuditEventName;
  [key: string]: unknown;
}

const FORBIDDEN_KEY_PARTS = [
  "email",
  "password",
  "token",
  "secret",
  "signature",
  "callback",
  "prompt",
  "card",
  "cookie",
  "authorization",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RAW_TOKEN_PATTERN =
  /^(?:sk|rk|pk|whsec|tok|seti|pi|cs)_[A-Za-z0-9_=-]{8,}$|^[A-Za-z0-9_-]{32,}$/;
const CARD_LIKE_PATTERN = /(?:\d[ -]*?){13,19}/;

function isAuditScalar(value: unknown): value is AuditScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isForbiddenKey(key: string): boolean {
  const normalized = normalizeLogKey(key);
  return FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part));
}

function isUnsafeString(value: string): boolean {
  const trimmed = value.trim();
  return (
    EMAIL_PATTERN.test(trimmed) ||
    RAW_TOKEN_PATTERN.test(trimmed) ||
    CARD_LIKE_PATTERN.test(trimmed) ||
    /^https?:\/\//i.test(trimmed) ||
    /^bearer\s+/i.test(trimmed)
  );
}

export function sanitizeSecurityAuditContext(
  context: Record<string, unknown> = {},
): Record<string, AuditScalar | typeof REDACTED> {
  const sanitized: Record<string, AuditScalar | typeof REDACTED> = {};

  for (const [key, value] of Object.entries(context)) {
    if (isForbiddenKey(key) || !isAuditScalar(value)) {
      sanitized[key] = REDACTED;
      continue;
    }
    sanitized[key] =
      typeof value === "string" && isUnsafeString(value) ? REDACTED : value;
  }

  return sanitized;
}

export function buildSecurityAuditLog(
  event: SecurityAuditEventName,
  context: Record<string, unknown> = {},
): SecurityAuditLogRecord {
  /*! node:coverage ignore next 9 -- Log record object values are asserted; tsx maps the literal as uncovered. */
  return {
    ...sanitizeSecurityAuditContext(context),
    level: "info",
    scope: SECURITY_AUDIT_SCOPE,
    timestamp: new Date().toISOString(),
    message: event,
    event,
  };
}

export function logSecurityAudit(
  event: SecurityAuditEventName,
  context: SecurityAuditContext = {},
): void {
  const record = buildSecurityAuditLog(event, context);
  logInfo(SECURITY_AUDIT_SCOPE, event, record);
}
