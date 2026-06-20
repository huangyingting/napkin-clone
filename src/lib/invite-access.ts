/**
 * Pure, framework-free workspace-invite access policy (issue #103).
 *
 * The join flow (`/app/join/[token]`) must make ONE consistent, auditable
 * decision about whether a given invite link may currently be accepted: it has
 * to honour revocation, expiry, a per-link usage cap, and — critically — never
 * trust the role stored on the link blindly. Centralizing that decision here as
 * a single pure function keeps it unit-testable without a database and keeps the
 * route from re-implementing (and drifting on) the rules.
 *
 * Hardening controls implemented:
 *   - revocation  — `isRevoked` denies immediately.
 *   - expiry      — `expiresAt` (null = never); once reached the link is denied.
 *   - usage cap   — `maxUses` (null = unlimited); once `useCount >= maxUses`
 *                   the link is exhausted and denied.
 *   - role guard  — the stored role must be within the invitable workspace
 *                   roles; anything else (e.g. a tampered "OWNER" or an unknown
 *                   value) is denied rather than silently honoured.
 *
 * No React / Next / Prisma imports — safe to run server-side and unit-test
 * under `node --test` + `tsx`.
 */

import {
  isInvitableWorkspaceRole,
  type InvitableWorkspaceRole,
} from "@/lib/workspace/roles";

/** Structured reason an invite acceptance was denied (for logging/UX copy). */
export type InviteDenyReason =
  | "revoked"
  | "expired"
  | "exhausted"
  | "invalid-role";

/**
 * Result of an invite-access evaluation. On `allow`, the validated role is
 * surfaced so callers grant membership with the server-validated role rather
 * than the raw stored string.
 */
export type InviteAccessDecision =
  | { allow: true; role: InvitableWorkspaceRole }
  | { allow: false; reason: InviteDenyReason };

/**
 * The invite link's current state plus a clock. All fields are primitives/dates
 * so this can be populated directly from a Prisma `select`.
 */
export type InviteAccessInput = {
  /** Whether the link has been revoked by a workspace owner. */
  isRevoked: boolean;
  /** The raw role stored on the link (validated, not trusted, here). */
  role: string;
  /** Link expiry timestamp (`null` = never expires). */
  expiresAt: Date | null;
  /** Maximum accepted joins (`null` = unlimited). */
  maxUses: number | null;
  /** Number of accepted joins so far. */
  useCount: number;
  /** Clock injection point for deterministic tests (default `new Date()`). */
  now?: Date;
};

/**
 * Decides whether an invite link may currently be accepted.
 *
 * Denies (in order) when: the link is revoked, expired, exhausted (usage cap
 * reached), or carries a role outside the invitable set. Otherwise allows and
 * returns the server-validated role.
 */
export function evaluateInviteAccess(
  input: InviteAccessInput,
): InviteAccessDecision {
  const now = input.now ?? new Date();

  if (input.isRevoked) {
    return { allow: false, reason: "revoked" };
  }

  if (input.expiresAt !== null && input.expiresAt.getTime() <= now.getTime()) {
    return { allow: false, reason: "expired" };
  }

  if (input.maxUses !== null && input.useCount >= input.maxUses) {
    return { allow: false, reason: "exhausted" };
  }

  if (!isInvitableWorkspaceRole(input.role)) {
    return { allow: false, reason: "invalid-role" };
  }

  return { allow: true, role: input.role };
}

/** Convenience boolean wrapper around {@link evaluateInviteAccess}. */
export function isInviteAccessAllowed(input: InviteAccessInput): boolean {
  return evaluateInviteAccess(input).allow;
}

/** Human-readable explanation for each deny reason (used by the join UI). */
export const INVITE_DENY_MESSAGES: Record<InviteDenyReason, string> = {
  revoked: "This invite link has been revoked by a workspace owner.",
  expired: "This invite link has expired.",
  exhausted: "This invite link has reached its maximum number of uses.",
  "invalid-role":
    "This invite link is misconfigured and can no longer be used.",
};

/**
 * Prisma `select` field set needed to evaluate invite access. Spread into the
 * join route's `select` so the consumer pulls exactly the policy columns the
 * pure function needs (and nothing drifts when a new policy field is added).
 */
export const INVITE_ACCESS_SELECT = {
  isRevoked: true,
  role: true,
  expiresAt: true,
  maxUses: true,
  useCount: true,
} as const;

/** The invite-link shape produced by {@link INVITE_ACCESS_SELECT}. */
export type InviteAccessFields = {
  isRevoked: boolean;
  role: string;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
};

/**
 * Maps an invite-link row (selected via {@link INVITE_ACCESS_SELECT}) plus an
 * optional clock to an {@link InviteAccessInput}, so the route doesn't repeat
 * the field-name mapping.
 */
export function toInviteAccessInput(
  link: InviteAccessFields,
  now?: Date,
): InviteAccessInput {
  return {
    isRevoked: link.isRevoked,
    role: link.role,
    expiresAt: link.expiresAt,
    maxUses: link.maxUses,
    useCount: link.useCount,
    now,
  };
}
