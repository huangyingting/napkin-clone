import assert from "node:assert/strict";
import test from "node:test";

import { scanText } from "./check-e2e-governance.mjs";

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
    "src/lib/visual/deck-export.test.ts",
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
