/**
 * Pure, DOM-free policy helpers for document version history (issue #158).
 *
 * Saves overwrite `Document.contentJson`/`deckJson` in place, so without
 * periodic snapshots there is no way to view or restore an earlier version once
 * a tab closes. These helpers decide *when* to capture a snapshot and *which*
 * old snapshots to prune, kept side-effect-free so they can be unit-tested
 * without a database or React.
 */

/**
 * Minimum time that must elapse since the most recent snapshot before another
 * one is recorded. Throttling avoids a new version on every keystroke/autosave
 * while still capturing the document's evolution over a session (~5 minutes).
 */
export const SNAPSHOT_MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * How many snapshots to retain per document. Older snapshots beyond this count
 * are pruned in the same save so the history table can't grow without bound.
 */
export const MAX_DOCUMENT_VERSIONS = 30;

/**
 * Decides whether a new snapshot should be taken for a document.
 *
 * Returns `true` when there is no prior snapshot (`lastAt` is `null`) or when at
 * least `intervalMs` has elapsed since the last one. `force` short-circuits the
 * throttle for meaningful events (e.g. an explicit save or a pre-restore
 * checkpoint) that should always be captured.
 */
export function shouldSnapshot(
  lastAt: Date | null,
  now: Date,
  intervalMs: number = SNAPSHOT_MIN_INTERVAL_MS,
  force: boolean = false,
): boolean {
  if (force) {
    return true;
  }
  if (lastAt === null) {
    return true;
  }
  return now.getTime() - lastAt.getTime() >= intervalMs;
}

/**
 * Given snapshot ids ordered newest-first, returns the ids that fall outside the
 * `keepLastN` retention window and should therefore be deleted. Never returns
 * the most recent `keepLastN` ids. A non-positive `keepLastN` prunes everything.
 */
export function staleVersionIds(
  idsNewestFirst: readonly string[],
  keepLastN: number = MAX_DOCUMENT_VERSIONS,
): string[] {
  if (keepLastN <= 0) {
    return [...idsNewestFirst];
  }
  return idsNewestFirst.slice(keepLastN);
}
