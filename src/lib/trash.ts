/* node:coverage ignore start */
/* Coverage rationale: trash module prose and type contract are documentation/type-only. */
/**
 * Trash / recovery-window utilities.
 *
 * RECOVERY WINDOW: Documents are soft-deleted by stamping `deletedAt`. They
 * remain restorable for SOFT_DELETE_RETENTION_MS (30 days). After that window
 * they are eligible for permanent purge by the maintenance sweep.
 *
 * Eligibility rules:
 *   - deletedAt === null          → not in trash; getTrashStatus returns null
 *   - deletedAt + window > now    → within window; recoverable, time remaining
 *   - deletedAt + window ≤ now   → past window; purge-eligible, 0 ms remaining
 */

/**
 * 30-day soft-delete recovery window (ms).
 * Documents soft-deleted beyond this duration are eligible for permanent purge.
 */
export const SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type TrashStatus = {
  /** Milliseconds remaining in the recovery window (0 when past the window). */
  remainingMs: number;
  /** True when the recovery window has elapsed — document is purgeable. */
  purgeEligible: boolean;
};
/* node:coverage ignore stop */

/**
 * Returns the trash status for a document given its `deletedAt` timestamp.
 *
 * - Returns `null` when `deletedAt` is null (document is not in trash).
 * - Returns `{ remainingMs: N, purgeEligible: false }` while within the window.
 * - Returns `{ remainingMs: 0, purgeEligible: true }` when the window has passed.
 *
 * The optional `now` parameter (default: `new Date()`) allows deterministic
 * testing without time-mocking.
 */
export function getTrashStatus(
  deletedAt: Date | null,
  now: Date = new Date(),
): TrashStatus | null {
  if (!deletedAt) return null;
  const elapsed = now.getTime() - deletedAt.getTime();
  const remainingMs = Math.max(0, SOFT_DELETE_RETENTION_MS - elapsed);
  return { remainingMs, purgeEligible: remainingMs === 0 };
}
