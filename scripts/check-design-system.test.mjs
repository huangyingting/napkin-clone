import assert from "node:assert/strict";
import test from "node:test";

import { scanText } from "./check-design-system.mjs";

test("design-system check: flags raw numeric z-index classes", () => {
  const findings = scanText(
    "src/components/example.tsx",
    '<div className="fixed z-50" />',
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "raw-z-index");
  assert.equal(findings[0].match, "z-50");
});

test("design-system check: accepts named semantic z-index utilities", () => {
  const findings = scanText(
    "src/components/example.tsx",
    '<div className="fixed z-toast" />',
  );

  assert.deepEqual(findings, []);
});

test("design-system check: flags raw arbitrary hex color classes", () => {
  const findings = scanText(
    "src/app/app/example.tsx",
    '<div className="bg-[#ffffff]" />',
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "raw-hex-class");
  assert.equal(findings[0].match, "bg-[#ffffff]");
});

test("design-system check: ignores token-owned UI primitive hex values", () => {
  const findings = scanText(
    "src/components/ui/color-picker.tsx",
    'const white = "#ffffff";',
  );

  assert.deepEqual(findings, []);
});

test("design-system check: flags raw arbitrary radius classes outside token layers", () => {
  const findings = scanText(
    "src/app/app/example.tsx",
    '<div className="rounded-[4px]" />',
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "raw-radius-class");
  assert.equal(findings[0].match, "rounded-[4px]");
});

test("design-system check: accepts DS token radius classes", () => {
  const findings = scanText(
    "src/app/app/example.tsx",
    '<div className="rounded-[var(--ds-radius-sm,8px)]" />',
  );

  assert.deepEqual(findings, []);
});

test("design-system check: flags raw arbitrary shadow classes outside token layers", () => {
  const findings = scanText(
    "src/app/app/example.tsx",
    '<div className="shadow-[0_4px_12px_rgba(0,0,0,0.2)]" />',
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "raw-shadow-class");
  assert.equal(findings[0].match, "shadow-[0_4px_12px_rgba(0,0,0,0.2)]");
});

test("design-system check: flags non-DS neutral utility classes", () => {
  const findings = scanText(
    "src/components/example.tsx",
    '<div className="bg-zinc-100 text-gray-900" />',
  );

  assert.equal(findings.length, 2);
  assert.equal(findings[0].rule, "non-ds-neutral-class");
  assert.equal(findings[1].match, "text-gray-900");
});
