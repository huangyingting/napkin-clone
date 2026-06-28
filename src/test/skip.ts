/**
 * Shared skip helper for conditional test skips.
 *
 * Use `skipIf` instead of ad-hoc `if (cond) return;` inside test bodies.
 * The test is marked as **skipped** (not silently passed) so it appears
 * correctly in test output and can be tracked over time.
 *
 * This keeps conditionally unavailable coverage visible in test output.
 */
import type { TestContext } from "node:test";

export function skipIf(
  t: TestContext,
  condition: boolean,
  message?: string,
): void {
  if (condition) {
    t.skip(message);
  }
}
