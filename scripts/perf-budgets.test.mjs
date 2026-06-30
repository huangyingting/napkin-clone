import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  formatPerfBudgetFindings,
  runPerfBudgetCli,
  runPerfBudgetCheck,
} from "./perf-budgets.mjs";
import { createTestFixtureRoot } from "./test-fixtures.mjs";

test("runtime performance budgets stay within payload and lazy-export limits", () => {
  const report = runPerfBudgetCheck(process.cwd());
  assert.deepEqual(report.violations, [], formatPerfBudgetFindings(report));
});

test("runtime performance budgets flag static heavy imports and forbidden fields", (t) => {
  const root = createTestFixtureRoot("perf-budget-fixture", t);
  mkdirSync(join(root, "src", "lib", "visual"), { recursive: true });
  mkdirSync(join(root, "src", "lib", "document-management"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "src", "lib", "visual", "export.ts"),
    [
      'import type { Config } from "jspdf";',
      'import JSZip from "jszip";',
      'import { helper } from "@/lib/helper";',
    ].join("\n"),
  );
  writeFileSync(
    join(root, "src", "lib", "document-management", "list.ts"),
    "export const select = { contentJson: true };\n",
  );

  const report = runPerfBudgetCheck(root);
  const text = formatPerfBudgetFindings(report);

  assert.equal(report.violations.length, 2);
  assert.match(text, /Performance budget violations/);
  assert.match(text, /statically imports jszip/);
  assert.match(text, /selects contentJson/);
});

test("runtime performance budgets ignore malformed non-literal imports defensively", (t) => {
  const root = createTestFixtureRoot("perf-budget-nonliteral-import", t);
  mkdirSync(join(root, "src", "lib", "visual"), { recursive: true });
  writeFileSync(
    join(root, "src", "lib", "visual", "export.ts"),
    "import broken from packageName;\n",
  );

  const report = runPerfBudgetCheck(root);

  assert.deepEqual(report.violations, []);
});

test("runtime performance budget CLI returns status and writes findings", (t) => {
  const passRoot = createTestFixtureRoot("perf-budget-cli-pass", t);
  const failRoot = createTestFixtureRoot("perf-budget-cli-fail", t);
  mkdirSync(join(failRoot, "src", "lib", "visual"), { recursive: true });
  writeFileSync(
    join(failRoot, "src", "lib", "visual", "export.ts"),
    'import jsPDF from "jspdf";\n',
  );
  const logs = [];
  const errors = [];

  assert.equal(
    runPerfBudgetCli({
      rootDir: passRoot,
      stdout: (message) => logs.push(message),
      stderr: (message) => errors.push(message),
    }),
    0,
  );
  assert.equal(
    runPerfBudgetCli({
      rootDir: failRoot,
      stdout: (message) => logs.push(message),
      stderr: (message) => errors.push(message),
    }),
    1,
  );
  assert.match(logs[0], /passed/);
  assert.match(errors[0], /Performance budget violations/);
});

test("runtime performance budget CLI can be executed directly", (t) => {
  const root = createTestFixtureRoot("perf-budget-cli-direct", t);

  const result = spawnSync(
    process.execPath,
    [join(process.cwd(), "scripts", "perf-budgets.mjs")],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Performance budget check passed/);
  assert.equal(result.stderr, "");
});
