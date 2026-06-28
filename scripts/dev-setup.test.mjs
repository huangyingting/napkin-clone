import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildLocalEnv,
  ensureLocalEnv,
  runDevSetup,
  setupCommands,
} from "./dev-setup.mjs";
import { createTestFixtureRoot } from "./test-fixtures.mjs";

function fixtureRoot(name, testContext) {
  return createTestFixtureRoot(name, testContext);
}

test("dev setup builds a local SQLite env without printing secrets", () => {
  const content = buildLocalEnv({
    authSecret: "known-secret",
    databaseUrl: "file:./prisma/dev.db",
    port: 4111,
  });
  assert.match(content, /DB_PROVIDER="sqlite"/);
  assert.match(content, /DATABASE_URL="file:\.\/prisma\/dev\.db"/);
  assert.match(content, /AUTH_SECRET="known-secret"/);
  assert.match(content, /AUTH_URL="http:\/\/localhost:4111"/);
});

test("dev setup exposes a no-db mode for worktrees with shared clients", () => {
  assert.deepEqual(setupCommands({ skipDb: true }), []);
  assert.deepEqual(
    setupCommands().map(([command, args]) => [command, args.join(" ")]),
    [
      ["npm", "run db:generate"],
      ["npm", "run db:push"],
    ],
  );
});

test("dev setup creates .env once and preserves an existing local env file", () => {
  const createdRoot = fixtureRoot("dev-setup-create-env");
  const created = ensureLocalEnv(createdRoot);

  assert.equal(created.created, true);
  assert.match(readFileSync(created.path, "utf8"), /AUTH_SECRET="/);

  const existingRoot = fixtureRoot("dev-setup-existing-env");
  writeFileSync(join(existingRoot, ".env"), "AUTH_SECRET=keep-me\n");
  const existing = ensureLocalEnv(existingRoot);

  assert.equal(existing.created, false);
  assert.equal(readFileSync(existing.path, "utf8"), "AUTH_SECRET=keep-me\n");
});

test("dev setup runner reports env state, runs db commands, and exits on failure", () => {
  const output = [];
  const commands = [];
  let exitCode;

  runDevSetup({
    argv: ["node", "dev-setup.mjs"],
    processEnv: { DB_PROVIDER: "postgres" },
    ensureEnv: () => ({ created: true, path: ".env" }),
    runCommand: (command, args, env) => {
      commands.push({ command, args, env });
      return { status: commands.length === 1 ? 0 : 5 };
    },
    stdout: (line) => output.push(line),
    exit: (code) => {
      exitCode = code;
    },
  });

  assert.equal(commands.length, 2);
  assert.equal(commands[0].env.DB_PROVIDER, "postgres");
  assert.equal(commands[0].env.DATABASE_URL, "file:./prisma/dev.db");
  assert.equal(exitCode, 5);
  assert.match(output.join("\n"), /Created \.env/);
});

test("dev setup runner supports no-db mode without running commands", () => {
  const output = [];
  const commands = [];

  runDevSetup({
    argv: ["node", "dev-setup.mjs", "--no-db"],
    processEnv: {},
    ensureEnv: () => ({ created: false, path: ".env" }),
    runCommand: (...args) => commands.push(args),
    stdout: (line) => output.push(line),
  });

  assert.deepEqual(commands, []);
  assert.match(output.join("\n"), /already exists/);
  assert.match(output.join("\n"), /Skipped database setup/);
});

test("dev setup CLI supports no-db mode in an empty fixture", (t) => {
  const root = fixtureRoot("dev-setup-cli-no-db", t);
  const scriptPath = join(process.cwd(), "scripts", "dev-setup.mjs");

  const result = spawnSync(process.execPath, [scriptPath, "--no-db"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Created \.env/);
  assert.match(result.stdout, /Skipped database setup/);
});

test("dev setup CLI runs database commands through the default runner", (t) => {
  const root = fixtureRoot("dev-setup-cli-db", t);
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const npmPath = join(binDir, "npm");
  writeFileSync(npmPath, "#!/usr/bin/env sh\nexit 0\n");
  chmodSync(npmPath, 0o755);

  const result = spawnSync(
    process.execPath,
    [join(process.cwd(), "scripts", "dev-setup.mjs")],
    {
      cwd: root,
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\$ npm run db:generate/);
  assert.match(result.stdout, /\$ npm run db:push/);
});
