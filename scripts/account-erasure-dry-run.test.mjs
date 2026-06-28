import assert from "node:assert/strict";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildAccountErasureDryRunReport,
  runAccountErasureDryRun,
} from "./account-erasure-dry-run.mjs";

test("account erasure dry-run report is generic and count based", () => {
  const report = buildAccountErasureDryRunReport("user_1", [
    { model: "Comment", count: 2 },
    { model: "RateLimitHit", count: 1 },
  ]);

  assert.deepEqual(report, {
    userId: "user_1",
    ok: false,
    residualCount: 3,
    findings: [
      { model: "Comment", count: 2 },
      { model: "RateLimitHit", count: 1 },
    ],
  });
});

test("account erasure dry-run prints usage for missing or help arguments", async (t) => {
  const originalExitCode = process.exitCode;
  t.after(() => {
    process.exitCode = originalExitCode;
  });

  const messages = [];
  process.exitCode = undefined;
  await runAccountErasureDryRun({
    argv: ["node", "script"],
    stderr: (message) => messages.push(message),
  });
  assert.equal(process.exitCode, 1);

  process.exitCode = undefined;
  await runAccountErasureDryRun({
    argv: ["node", "script", "--help"],
    stderr: (message) => messages.push(message),
  });
  assert.equal(process.exitCode, 0);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /account-erasure-dry-run/);
});

test("account erasure dry-run emits JSON and sets status from findings", async (t) => {
  const originalExitCode = process.exitCode;
  t.after(() => {
    process.exitCode = originalExitCode;
  });

  const output = [];
  process.exitCode = undefined;
  await runAccountErasureDryRun({
    argv: ["node", "script", "user_1"],
    importDeps: async () => [
      { prisma: { source: "test" } },
      {
        verifyAccountErasure: async (prisma, userId) => {
          assert.deepEqual(prisma, { source: "test" });
          assert.equal(userId, "user_1");
          return [{ model: "Document", count: 1 }];
        },
      },
    ],
    stdout: (message) => output.push(message),
  });

  assert.equal(process.exitCode, 2);
  assert.deepEqual(JSON.parse(output[0]), {
    userId: "user_1",
    ok: false,
    residualCount: 1,
    findings: [{ model: "Document", count: 1 }],
  });

  process.exitCode = undefined;
  await runAccountErasureDryRun({
    argv: ["node", "script", "user_2"],
    importDeps: async () => [
      { prisma: {} },
      { verifyAccountErasure: async () => [] },
    ],
    stdout: (message) => output.push(message),
  });
  assert.equal(process.exitCode, 0);
});

test("account erasure dry-run CLI catches dependency load failures", () => {
  const scriptPath = join(
    process.cwd(),
    "scripts",
    "account-erasure-dry-run.mjs",
  );
  const result = spawnSync(process.execPath, [scriptPath, "user_1"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Unknown file extension|Cannot find (?:module|package)|dry-run failed/,
  );
});
