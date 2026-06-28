import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  scanNextBuildConstraints,
  scanText,
} from "./check-next-build-constraints.mjs";
import { createTestFixtureRoot } from "./test-fixtures.mjs";

test("next build guard flags imported proxy matcher config", () => {
  const findings = scanText(
    "src/proxy.ts",
    'import { routeProtectionPolicy } from "@/lib/auth/route-protection-policy";\nexport const config = { matcher: routeProtectionPolicy.proxy.matcher };\n',
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "next-nonliteral-config");
});

test("next build guard allows literal proxy matcher config", () => {
  const findings = scanText(
    "src/proxy.ts",
    'export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };\n',
  );

  assert.deepEqual(findings, []);
});

test("next build guard flags nonliteral runtime declarations", () => {
  const findings = scanText(
    "src/app/api/example/route.ts",
    'import { runtime } from "./config";\nexport const runtime = runtime;\n',
  );

  assert.equal(findings[0].rule, "next-nonliteral-config");
});

test("next build guard flags use-server type and value re-exports", () => {
  const findings = scanText(
    "src/app/app/example/actions.ts",
    '"use server";\nexport type Result = { ok: boolean };\nexport { helper } from "@/lib/helper";\nexport async function save() {}\n',
  );

  assert.deepEqual(
    findings.map((finding) => finding.rule),
    ["use-server-non-action-export", "use-server-non-action-export"],
  );
});

test("next build guard handles directives, unterminated exports, and runtime literals", () => {
  assert.deepEqual(
    scanText(
      "src/app/app/example/actions.ts",
      '\uFEFF// comment\n\n"use server";\nexport const value = 1;\n',
    ).map((finding) => finding.rule),
    ["use-server-non-action-export"],
  );
  assert.equal(
    scanText(
      "src/app/api/example/route.ts",
      "export const runtime = 'deno'",
    ).at(-1).rule,
    "next-invalid-runtime",
  );
  assert.deepEqual(
    scanText(
      "src/app/api/example/route.ts",
      'export const dynamic = "force-dynamic";',
    ),
    [],
  );
});

test("next build guard scans source files and skips unsupported files", (t) => {
  const repoRoot = createTestFixtureRoot("next-build-scan-test", t);
  mkdirSync(join(repoRoot, "src", "app", "api", "example"), {
    recursive: true,
  });
  writeFileSync(
    join(repoRoot, "src", "app", "api", "example", "route.ts"),
    "const runtimeValue = 'nodejs';\nexport const runtime = runtimeValue;\n",
  );
  writeFileSync(
    join(repoRoot, "src", "app", "api", "example", "notes.md"),
    "export const runtime = runtimeValue;\n",
  );

  const findings = scanNextBuildConstraints(repoRoot);

  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((finding) => finding.rule),
    ["next-nonliteral-config", "next-invalid-runtime"],
  );
});

test("next build guard returns no findings without a src tree", (t) => {
  const repoRoot = createTestFixtureRoot("next-build-no-src-test", t);

  assert.deepEqual(scanNextBuildConstraints(repoRoot), []);
});

test("next build CLI reports pass and failure results", (t) => {
  const scriptPath = join(
    process.cwd(),
    "scripts",
    "check-next-build-constraints.mjs",
  );
  const passRoot = createTestFixtureRoot("next-build-cli-pass", t);
  const failRoot = createTestFixtureRoot("next-build-cli-fail", t);
  mkdirSync(join(passRoot, "src", "app"), { recursive: true });
  mkdirSync(join(failRoot, "src", "app"), { recursive: true });
  writeFileSync(
    join(passRoot, "src", "app", "page.tsx"),
    "export default function Page() { return null; }\n",
  );
  writeFileSync(
    join(failRoot, "src", "app", "page.tsx"),
    "const r = 'nodejs';\nexport const runtime = r;\n",
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
  assert.match(failed.stderr, /next-nonliteral-config/);
});
