import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildWorktreeEnv,
  inspectWorktree,
  runDevWorktree,
  sanitizeWorktreeName,
  worktreeInstructions,
} from "./dev-worktree.mjs";
import { createTestFixtureRoot } from "./test-fixtures.mjs";

function fixtureRoot(name, testContext) {
  return createTestFixtureRoot(name, testContext);
}

test("worktree helper sanitizes names for SQLite filenames", () => {
  assert.equal(sanitizeWorktreeName("N17 Dev Bootstrap"), "n17-dev-bootstrap");
  assert.equal(sanitizeWorktreeName("!!!"), "worktree");
});

test("worktree helper builds isolated env file content", () => {
  const content = buildWorktreeEnv({
    worktreeName: "Feature X",
    authSecret: "secret",
    port: 4222,
  });
  assert.match(content, /DATABASE_URL="file:\.\/prisma\/dev\.feature-x\.db"/);
  assert.match(content, /AUTH_URL="http:\/\/localhost:4222"/);
});

test("worktree helper prints source command and generated-client repair hint", () => {
  const instructions = worktreeInstructions({ envFile: ".env.worktree" });
  assert.match(instructions.join("\n"), /set -a/);
  assert.match(instructions.join("\n"), /npm run db:generate/);
});

test("worktree helper inspects shared and local worktree artifacts", () => {
  const root = fixtureRoot("dev-worktree-inspection");
  mkdirSync(join(root, "shared-node-modules"), { recursive: true });
  symlinkSync("shared-node-modules", join(root, "node_modules"));
  mkdirSync(join(root, "src", "generated"), { recursive: true });
  mkdirSync(join(root, ".next"), { recursive: true });
  writeFileSync(join(root, ".next", "BUILD_ID"), "fixture-build");

  const checks = inspectWorktree(root);

  assert.deepEqual(
    checks.map(({ path, exists, symlink }) => [path, exists, symlink]),
    [
      ["node_modules", true, true],
      ["src/generated", true, false],
      [".next", true, false],
      ["storage", false, false],
    ],
  );
});

test("worktree helper runner creates env, storage, and diagnostic output", () => {
  const root = fixtureRoot("dev-worktree-runner");
  mkdirSync(join(root, "shared-node-modules"), { recursive: true });
  symlinkSync("shared-node-modules", join(root, "node_modules"));
  mkdirSync(join(root, ".next"), { recursive: true });
  const output = [];

  runDevWorktree({
    repoRoot: root,
    stdout: (line) => output.push(line),
  });

  assert.match(output.join("\n"), /Created \.env\.worktree/);
  assert.match(output.join("\n"), /node_modules: symlink/);
  assert.match(output.join("\n"), /remove \.next/);
  assert.match(output.join("\n"), /do not share \.next/);
});

test("worktree helper runner preserves an existing env file", () => {
  const root = fixtureRoot("dev-worktree-existing-env");
  writeFileSync(join(root, ".env.worktree"), "AUTH_SECRET=keep\n");
  const output = [];

  runDevWorktree({
    repoRoot: root,
    stdout: (line) => output.push(line),
  });

  assert.match(output.join("\n"), /already exists/);
});

test("worktree helper CLI runs in a fixture worktree", (t) => {
  const root = fixtureRoot("dev-worktree-cli", t);
  const scriptPath = join(process.cwd(), "scripts", "dev-worktree.mjs");

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Created \.env\.worktree/);
  assert.match(result.stdout, /Run with isolated env/);
});
