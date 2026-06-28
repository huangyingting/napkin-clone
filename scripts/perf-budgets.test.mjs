import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  formatPerfBudgetFindings,
  runPerfBudgetCheck,
} from "./perf-budgets.mjs";

test("runtime performance budgets stay within payload and lazy-export limits", () => {
  const report = runPerfBudgetCheck(process.cwd());
  assert.deepEqual(report.violations, [], formatPerfBudgetFindings(report));
});

test("runtime performance budgets flag static heavy imports and forbidden fields", (t) => {
  const root = join(process.cwd(), ".squad", "perf-budget-fixture");
  t.after(() => rmSync(root, { recursive: true, force: true }));
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
  const root = join(process.cwd(), ".squad", "perf-budget-nonliteral-import");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src", "lib", "visual"), { recursive: true });
  writeFileSync(
    join(root, "src", "lib", "visual", "export.ts"),
    "import broken from packageName;\n",
  );

  const report = runPerfBudgetCheck(root);

  assert.deepEqual(report.violations, []);
});
