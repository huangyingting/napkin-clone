export type LimitEnforcement = "enforced" | "warning";
export type LimitUnit = "bytes" | "chars" | "count" | "ms" | "days";

export interface LimitDiagnosticMetadata {
  scope: string;
  metric: string;
}

export interface LimitDefinition {
  id: string;
  description: string;
  value: number;
  unit: LimitUnit;
  enforcement: LimitEnforcement;
  diagnostic: LimitDiagnosticMetadata;
  warnAt?: number;
  source?: string;
}

export interface BudgetCheckResult {
  /** Name of the metric being checked. */
  metric: string;
  /** The value that was measured. */
  actual: number;
  /** The warning threshold. */
  warnAt: number;
  /** The hard limit. */
  hardAt: number;
  /** Whether the hard limit was breached. */
  exceeded: boolean;
  /** Whether the warning threshold was crossed (but hard limit is OK). */
  warned: boolean;
}

export interface LimitCheckResult extends BudgetCheckResult {
  limit: LimitDefinition;
  diagnostic: {
    scope: string;
    metric: string;
    actual: number;
    budget: number;
  };
}

export interface BudgetExceededDiagnostic {
  code: "BUDGET_EXCEEDED";
  severity: "warning";
  scope: string;
  message: string;
  meta: {
    metric: string;
    actual: number;
    budget: number;
  };
}

export function checkBudget(
  metric: string,
  actual: number,
  warnAt: number,
  hardAt: number,
): BudgetCheckResult {
  return {
    metric,
    actual,
    warnAt,
    hardAt,
    exceeded: actual > hardAt,
    warned: actual > warnAt && actual <= hardAt,
  };
}

export function checkLimit(
  limit: LimitDefinition,
  actual: number,
): LimitCheckResult {
  const base = checkBudget(
    limit.diagnostic.metric,
    actual,
    limit.warnAt ?? limit.value,
    limit.value,
  );
  return {
    ...base,
    limit,
    diagnostic: {
      scope: limit.diagnostic.scope,
      metric: limit.diagnostic.metric,
      actual,
      budget: limit.value,
    },
  };
}

export function budgetExceededDiagnostic(
  result: Pick<LimitCheckResult, "diagnostic">,
): BudgetExceededDiagnostic {
  return {
    code: "BUDGET_EXCEEDED",
    severity: "warning",
    scope: result.diagnostic.scope,
    message: `Performance budget exceeded for ${result.diagnostic.metric}.`,
    meta: {
      metric: result.diagnostic.metric,
      actual: result.diagnostic.actual,
      budget: result.diagnostic.budget,
    },
  };
}

export function formatBytesAsMb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}
