/**
 * Maintenance / purge utilities.
 *
 * Exports pure, testable predicate/decision functions used by the server-side
 * maintenance sweep, plus a module-level in-memory throttle guard so the
 * global sweep (deleteMany across all users) runs at most once per
 * PURGE_MIN_INTERVAL_MS regardless of how many concurrent dashboard requests
 * arrive.
 *
 * Architecture:
 *   - Pure helpers (shouldRunPurge, isInviteLinkPurgeEligible) are fully
 *     testable under `node --test` with no framework dependencies.
 *   - The module-level `lastGlobalPurgeAt` guard is an in-memory timestamp;
 *     it resets on process restart (acceptable — the purge is idempotent and
 *     the miss cost is just one extra sweep at startup).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum gap between successive global maintenance sweeps (5 minutes). */
export const PURGE_MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * How long after an invite link becomes inactive (revoked, expired, or
 * exhausted) before its row (and cascaded InviteLinkUse audit rows) are
 * eligible for permanent purge.  Kept at 7 days so workspace owners retain
 * a short-term audit window.
 */
export const INVITE_LINK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pure helpers (no DB, no framework — safe for node:test)
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the global purge sweep should run.
 *
 * @param lastRunAt - `Date.now()` value at the last completed sweep, or
 *   `null` if the sweep has never run in this process.
 * @param now       - Current `Date.now()` value (injected for testability).
 * @param intervalMs - Minimum gap between sweeps.
 */
export function shouldRunPurge(
  lastRunAt: number | null,
  now: number,
  intervalMs: number,
): boolean {
  return lastRunAt === null || now - lastRunAt >= intervalMs;
}

/**
 * Returns `true` when an invite-link row is eligible for permanent purge.
 *
 * A link is "dead" when it is revoked, expired, or exhausted (usage cap
 * reached).  A dead link becomes purgeable once its `createdAt` timestamp
 * is older than `retentionMs` — this preserves a short audit window.
 *
 * Because `revokedAt` and `exhaustedAt` are not tracked, `createdAt` is the
 * age anchor for all three cases.  Expired links additionally use `expiresAt`
 * as the age anchor when it is further in the past than `createdAt`.
 *
 * @param link        - Subset of InviteLink fields needed for the decision.
 * @param now         - Current instant (injected for testability).
 * @param retentionMs - Retention window (default: INVITE_LINK_RETENTION_MS).
 */
export function isInviteLinkPurgeEligible(
  link: {
    isRevoked: boolean;
    expiresAt: Date | null;
    maxUses: number | null;
    useCount: number;
    createdAt: Date;
  },
  now: Date,
  retentionMs: number = INVITE_LINK_RETENTION_MS,
): boolean {
  const isDead =
    link.isRevoked ||
    (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) ||
    (link.maxUses !== null && link.useCount >= link.maxUses);

  if (!isDead) return false;

  // Use the later of createdAt and expiresAt (when present) as the
  // "dead-since" anchor so recently-expired links still get their window.
  const anchor =
    link.expiresAt !== null &&
    link.expiresAt.getTime() > link.createdAt.getTime()
      ? link.expiresAt
      : link.createdAt;

  return now.getTime() - anchor.getTime() >= retentionMs;
}

// ---------------------------------------------------------------------------
// Module-level throttle guard
// ---------------------------------------------------------------------------

/**
 * Timestamp (from Date.now()) of the last completed global sweep, or null
 * if none has run in this process.  Intentionally module-level so it
 * survives across concurrent requests within the same process.
 */
let lastGlobalPurgeAt: number | null = null;

/**
 * Returns `true` when the global maintenance sweep should run right now,
 * updating the guard if so.  Call this *before* issuing any DB writes;
 * the guard is updated optimistically so concurrent calls in the same tick
 * don't all race through.
 */
export function acquirePurgeLock(now: number = Date.now()): boolean {
  if (!shouldRunPurge(lastGlobalPurgeAt, now, PURGE_MIN_INTERVAL_MS)) {
    return false;
  }
  lastGlobalPurgeAt = now;
  return true;
}

/**
 * Resets the in-process throttle guard.  Used only in tests to restore a
 * clean state between cases.
 */
export function resetPurgeLockForTesting(): void {
  lastGlobalPurgeAt = null;
}
