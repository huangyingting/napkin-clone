import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatPerfBudgetFindings,
  runPerfBudgetCheck,
} from "./perf-budgets.mjs";

test("runtime performance budgets stay within payload and lazy-export limits", () => {
  const report = runPerfBudgetCheck(process.cwd());
  assert.deepEqual(report.violations, [], formatPerfBudgetFindings(report));
});
