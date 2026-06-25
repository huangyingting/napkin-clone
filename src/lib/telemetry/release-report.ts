import {
  type ProductEventName,
  type ProductTelemetryRecord,
} from "@/lib/telemetry/product";

export type ReleaseGateStatus = "passed" | "failed" | "skipped";

export interface ReleaseGateResult {
  name: string;
  status: ReleaseGateStatus;
}

export interface ReleaseReadinessReport {
  totalEvents: number;
  funnelHealth: Record<
    string,
    { starts: number; successes: number; failures: number }
  >;
  errorRates: Record<string, number>;
  performanceBuckets: Record<string, Record<string, number>>;
  gateStatus: {
    passed: number;
    failed: number;
    skipped: number;
    ready: boolean;
  };
  checklist: string[];
}

const FUNNELS = {
  import: {
    start: "product.import.started",
    success: "product.import.succeeded",
    failure: "product.import.failed",
  },
  export: {
    start: "product.export.started",
    success: "product.export.succeeded",
    failure: "product.export.failed",
  },
  aiVisual: {
    start: "product.ai.visual.started",
    success: "product.ai.visual.candidates",
    failure: "product.ai.visual.failed",
  },
  aiDeck: {
    start: "product.ai.deck.started",
    success: "product.ai.deck.candidate",
    failure: "product.ai.deck.failed",
  },
} as const satisfies Record<
  string,
  {
    start: ProductEventName;
    success: ProductEventName;
    failure: ProductEventName;
  }
>;

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

export function buildReleaseReadinessReport(
  events: readonly ProductTelemetryRecord[],
  gates: readonly ReleaseGateResult[],
): ReleaseReadinessReport {
  const counts = new Map<ProductEventName, number>();
  const performanceBuckets: Record<string, Record<string, number>> = {};

  for (const event of events) {
    counts.set(event.eventName, (counts.get(event.eventName) ?? 0) + 1);
    const durationBucket = event.fields.durationBucket;
    if (typeof durationBucket === "string") {
      performanceBuckets[event.eventName] ??= {};
      performanceBuckets[event.eventName][durationBucket] =
        (performanceBuckets[event.eventName][durationBucket] ?? 0) + 1;
    }
  }

  const funnelHealth: ReleaseReadinessReport["funnelHealth"] = {};
  const errorRates: Record<string, number> = {};
  for (const [name, funnel] of Object.entries(FUNNELS)) {
    const starts = counts.get(funnel.start) ?? 0;
    const successes = counts.get(funnel.success) ?? 0;
    const failures = counts.get(funnel.failure) ?? 0;
    funnelHealth[name] = { starts, successes, failures };
    errorRates[name] = ratio(failures, successes + failures);
  }

  const gateStatus = {
    passed: gates.filter((gate) => gate.status === "passed").length,
    failed: gates.filter((gate) => gate.status === "failed").length,
    skipped: gates.filter((gate) => gate.status === "skipped").length,
    ready: gates.length > 0 && gates.every((gate) => gate.status === "passed"),
  };

  return {
    totalEvents: events.length,
    funnelHealth,
    errorRates,
    performanceBuckets,
    gateStatus,
    checklist: buildReleaseChecklist(funnelHealth, errorRates, gateStatus),
  };
}

function buildReleaseChecklist(
  funnelHealth: ReleaseReadinessReport["funnelHealth"],
  errorRates: Record<string, number>,
  gateStatus: ReleaseReadinessReport["gateStatus"],
): string[] {
  const checklist = [
    `Automated gates: ${gateStatus.ready ? "ready" : "blocked"} (${gateStatus.passed} passed, ${gateStatus.failed} failed, ${gateStatus.skipped} skipped)`,
  ];
  for (const [name, health] of Object.entries(funnelHealth)) {
    checklist.push(
      `${name}: ${health.successes} successes, ${health.failures} failures, ${(errorRates[name] * 100).toFixed(2)}% error rate`,
    );
  }
  return checklist;
}
