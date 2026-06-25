import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReleaseReadinessReport } from "./release-report";
import type { ProductTelemetryRecord } from "./product";

function event(
  eventName: ProductTelemetryRecord["eventName"],
  fields: ProductTelemetryRecord["fields"] = {},
): ProductTelemetryRecord {
  return {
    eventName,
    fields,
    timestamp: "2026-06-25T00:00:00.000Z",
  };
}

test("buildReleaseReadinessReport summarizes redacted aggregates", () => {
  const report = buildReleaseReadinessReport(
    [
      event("product.import.started"),
      event("product.import.succeeded", { durationBucket: "500ms-1s" }),
      event("product.export.started"),
      event("product.export.failed", {
        durationBucket: "1s-3s",
        failureReason: "server",
      }),
    ],
    [
      { name: "npm test", status: "passed" },
      { name: "lint", status: "passed" },
    ],
  );

  assert.equal(report.totalEvents, 4);
  assert.deepEqual(report.funnelHealth.import, {
    starts: 1,
    successes: 1,
    failures: 0,
  });
  assert.equal(report.errorRates.export, 1);
  assert.equal(
    report.performanceBuckets["product.import.succeeded"]["500ms-1s"],
    1,
  );
  assert.equal(report.gateStatus.ready, true);
  assert.ok(report.checklist.every((item) => !item.includes("SECRET")));
});
