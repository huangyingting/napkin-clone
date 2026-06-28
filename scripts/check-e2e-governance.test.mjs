import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { scanGovernance, scanText } from "./check-e2e-governance.mjs";

test("e2e governance: flags unapproved raw sleeps", () => {
  const findings = scanText(
    "e2e/example.spec.ts",
    "await page.waitForTimeout(500);",
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "wait-for-timeout");
});

test("e2e governance: accepts explicitly allowed skips", () => {
  const findings = scanText(
    "e2e/example.spec.ts",
    [
      "// e2e-governance-allow test-skip: profile tests skip without seed.",
      'test.skip(!seeded, "seed required");',
    ].join("\n"),
  );

  assert.deepEqual(findings, []);
});

test("e2e governance: flags local deck fixture factories in high-risk files", () => {
  const findings = scanText(
    "src/lib/presentation/export/deck-export.test.ts",
    "function makeDeck() { return {}; }",
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "local-fixture-factory");
});

test("e2e governance: flags oversized tests outside the allowlist", () => {
  const findings = scanText(
    "src/lib/example.test.ts",
    Array.from({ length: 1_501 }, (_, index) => `// ${index}`).join("\n"),
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "oversized-test");
});

test("e2e governance: accepts profile-gated skips and legacy allowlisted issues", () => {
  assert.deepEqual(
    scanText(
      "e2e/example.spec.ts",
      'test.skip(!process.env.E2E_PROFILE, "profile required");\n',
    ),
    [],
  );
  assert.deepEqual(
    scanText(
      "e2e/slides-smoke.spec.ts",
      "await page.waitForTimeout(100);\nDate.now();\ncatch {}\n",
    ),
    [],
  );
});

test("e2e governance: scans roots while skipping dependency directories", (t) => {
  const repoRoot = join(process.cwd(), ".squad", "e2e-governance-scan-test");
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  mkdirSync(join(repoRoot, "e2e", "nested"), { recursive: true });
  mkdirSync(join(repoRoot, "e2e", "node_modules"), { recursive: true });
  mkdirSync(join(repoRoot, "src", "lib"), { recursive: true });
  writeFileSync(
    join(repoRoot, "e2e", "nested", "bad.spec.ts"),
    "test.only('focused', async () => {});\n",
  );
  writeFileSync(
    join(repoRoot, "e2e", "node_modules", "ignored.spec.ts"),
    "test.only('ignored', async () => {});\n",
  );
  writeFileSync(
    join(repoRoot, "src", "lib", "ok.test.ts"),
    "test('ok', () => {});\n",
  );

  const findings = scanGovernance(repoRoot);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "test-only");
});

test("e2e governance CLI reports pass and failure results", (t) => {
  const scriptPath = join(process.cwd(), "scripts", "check-e2e-governance.mjs");
  const passRoot = join(process.cwd(), ".squad", "e2e-governance-cli-pass");
  const failRoot = join(process.cwd(), ".squad", "e2e-governance-cli-fail");
  t.after(() => {
    rmSync(passRoot, { recursive: true, force: true });
    rmSync(failRoot, { recursive: true, force: true });
  });
  mkdirSync(join(passRoot, "e2e"), { recursive: true });
  mkdirSync(join(failRoot, "e2e"), { recursive: true });
  writeFileSync(
    join(passRoot, "e2e", "ok.spec.ts"),
    "test('ok', async () => {});\n",
  );
  writeFileSync(
    join(failRoot, "e2e", "bad.spec.ts"),
    "test.only('bad', async () => {});\n",
  );

  const passed = spawnSync(process.execPath, [scriptPath], {
    cwd: passRoot,
    encoding: "utf8",
  });
  assert.equal(passed.status, 0);
  assert.match(passed.stdout, /passed/);

  const failed = spawnSync(process.execPath, [scriptPath], {
    cwd: failRoot,
    encoding: "utf8",
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /test-only/);
});
