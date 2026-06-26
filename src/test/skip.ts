/**
 * Shared skip helper for conditional test skips.
 *
 * Use `skipIf` instead of ad-hoc `if (cond) return;` inside test bodies.
 * The test is marked as **skipped** (not silently passed) so it appears
 * correctly in test output and can be tracked over time.
 *
 * @example
 * ```ts
 * import { test } from "node:test";
 * import { skipIf } from "@/test/skip";
 *
 * test("has edges", (t) => {
 *   skipIf(t, source.edges.length === 0, "flowchart fixture has no edges");
 *   // … assertions that need at least one edge …
 * });
 * ```
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
