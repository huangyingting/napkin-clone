import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildBrowserQaSummary,
  readFixture,
  runBrowserQa,
  runChecked,
  waitForServer,
} from "./browser-qa.mjs";

function fixtureRoot(name) {
  const root = join(process.cwd(), ".squad", "test-fixtures", name);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  return root;
}

test("browser QA summary prints deterministic URLs and credentials", () => {
  const lines = buildBrowserQaSummary(
    {
      owner: { email: "owner@example.test", password: "owner-pw" },
      viewer: { email: "viewer@example.test", password: "viewer-pw" },
      documentPath: "/app/documents/doc1",
      presentPath: "/present/share1",
      embedPath: "/embed/share1",
    },
    { port: 4555 },
  );

  assert.match(
    lines.join("\n"),
    /http:\/\/localhost:4555\/app\/documents\/doc1/,
  );
  assert.match(lines.join("\n"), /Owner: owner@example\.test \/ owner-pw/);
  assert.match(lines.join("\n"), /Viewer: viewer@example\.test \/ viewer-pw/);
});

test("browser QA fixture reader reports the seed command when the fixture is absent", () => {
  const root = fixtureRoot("browser-qa-missing-fixture");

  assert.throws(
    () => readFixture(root),
    /e2e\/\.e2e-fixture\.json is missing; run npm run db:seed:e2e first/,
  );
});

test("browser QA fixture reader parses the generated e2e fixture", () => {
  const root = fixtureRoot("browser-qa-present-fixture");
  mkdirSync(join(root, "e2e"), { recursive: true });
  writeFileSync(
    join(root, "e2e", ".e2e-fixture.json"),
    JSON.stringify({ owner: { email: "owner@example.test" } }),
  );

  assert.deepEqual(readFixture(root), {
    owner: { email: "owner@example.test" },
  });
});

test("browser QA checked runner exits with the failing command status", () => {
  const originalExit = process.exit;
  let exitCode;
  process.exit = (code) => {
    exitCode = code;
    throw new Error("captured exit");
  };

  try {
    assert.throws(
      () =>
        runChecked(process.execPath, ["-e", "process.exit(7)"], process.env),
      /captured exit/,
    );
    assert.equal(exitCode, 7);
  } finally {
    process.exit = originalExit;
  }
});

test("browser QA server waiter fails fast when the dev server exits early", async () => {
  await assert.rejects(
    waitForServer("http://127.0.0.1:9", { exitCode: 3 }),
    /Dev server exited early with code 3/,
  );
});

test("browser QA server waiter resolves once the dev server responds", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 204 });
  try {
    await waitForServer("http://127.0.0.1:4000", { exitCode: null });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("browser QA server waiter retries transient fetch failures and times out", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error("not ready");
    }
    return { status: 503 };
  };
  try {
    await assert.rejects(
      waitForServer(
        "http://127.0.0.1:4000",
        { exitCode: null },
        {
          timeoutMs: 2,
          retryMs: 1,
        },
      ),
      /Timed out waiting/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls > 0, true);
});

test("browser QA runner seeds, prints, and exits for seed-only mode", async () => {
  const commands = [];
  const output = [];
  let exitCode;

  await runBrowserQa({
    argv: ["node", "browser-qa.mjs", "--seed-only"],
    processEnv: { PORT: "4555", DB_PROVIDER: "postgres" },
    runCommand: (command, args, env) => {
      commands.push({ command, args, env });
    },
    readSeedFixture: () => ({
      owner: { email: "owner@example.test", password: "owner-pw" },
      viewer: { email: "viewer@example.test", password: "viewer-pw" },
      documentPath: "/app/documents/doc1",
      presentPath: "/present/share1",
      embedPath: "/embed/share1",
    }),
    stdout: (line) => output.push(line),
    exit: (code) => {
      exitCode = code;
    },
  });

  assert.deepEqual(
    commands.map((entry) => entry.args.join(" ")),
    ["run db:push", "run db:seed:e2e"],
  );
  assert.equal(commands[0].env.DB_PROVIDER, "postgres");
  assert.equal(commands[0].env.E2E_BASE_URL, "http://localhost:4555");
  assert.equal(exitCode, 0);
  assert.match(output.join("\n"), /Browser QA fixture ready/);
});

test("browser QA runner print-only skips seeding", async () => {
  const commands = [];
  let exitCode;

  await runBrowserQa({
    argv: ["node", "browser-qa.mjs", "--print-only"],
    processEnv: {},
    runCommand: (...args) => commands.push(args),
    readSeedFixture: () => ({
      owner: { email: "owner@example.test", password: "owner-pw" },
      viewer: { email: "viewer@example.test", password: "viewer-pw" },
      documentPath: "/doc",
      presentPath: "/present",
      embedPath: "/embed",
    }),
    stdout: () => {},
    exit: (code) => {
      exitCode = code;
    },
  });

  assert.deepEqual(commands, []);
  assert.equal(exitCode, 0);
});

test("browser QA runner starts and stops the dev server in interactive mode", async () => {
  const output = [];
  let killedWith;
  const child = {
    exitCode: null,
    kill: (signal) => {
      killedWith = signal;
      child.exitCode = 0;
    },
    once: (event, callback) => {
      if (event === "exit") callback(0);
      return child;
    },
  };

  await runBrowserQa({
    argv: ["node", "browser-qa.mjs"],
    processEnv: {},
    runCommand: () => {},
    readSeedFixture: () => ({
      owner: { email: "owner@example.test", password: "owner-pw" },
      viewer: { email: "viewer@example.test", password: "viewer-pw" },
      documentPath: "/doc",
      presentPath: "/present",
      embedPath: "/embed",
    }),
    spawnServer: () => child,
    waitForReady: async () => {
      process.emit("SIGTERM");
    },
    stdout: (line) => output.push(line),
  });

  assert.equal(killedWith, "SIGTERM");
  assert.match(output.join("\n"), /Dev server is responsive/);
});

test("browser QA CLI prints an existing fixture in print-only mode", (t) => {
  const root = fixtureRoot("browser-qa-cli-print-only");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "e2e"), { recursive: true });
  writeFileSync(
    join(root, "e2e", ".e2e-fixture.json"),
    JSON.stringify({
      owner: { email: "owner@example.test", password: "owner-pw" },
      viewer: { email: "viewer@example.test", password: "viewer-pw" },
      documentPath: "/doc",
      presentPath: "/present",
      embedPath: "/embed",
    }),
  );

  const result = spawnSync(
    process.execPath,
    [join(process.cwd(), "scripts", "browser-qa.mjs"), "--print-only"],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Browser QA fixture ready/);
});
