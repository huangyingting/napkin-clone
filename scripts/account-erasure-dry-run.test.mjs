import assert from "node:assert/strict";
import test from "node:test";

import { buildAccountErasureDryRunReport } from "./account-erasure-dry-run.mjs";

test("account erasure dry-run report is generic and count based", () => {
  const report = buildAccountErasureDryRunReport("user_1", [
    { model: "Comment", count: 2 },
    { model: "RateLimitHit", count: 1 },
  ]);

  assert.deepEqual(report, {
    userId: "user_1",
    ok: false,
    residualCount: 3,
    findings: [
      { model: "Comment", count: 2 },
      { model: "RateLimitHit", count: 1 },
    ],
  });
});
