#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = 4000;
const FIXTURE_PATH = join("e2e", ".e2e-fixture.json");

export function buildBrowserQaSummary(fixture, { port = DEFAULT_PORT } = {}) {
  const baseUrl = `http://localhost:${port}`;
  return [
    "Browser QA fixture ready.",
    `Base URL: ${baseUrl}`,
    `Owner: ${fixture.owner.email} / ${fixture.owner.password}`,
    `Viewer: ${fixture.viewer.email} / ${fixture.viewer.password}`,
    `Document: ${baseUrl}${fixture.documentPath}`,
    `Present: ${baseUrl}${fixture.presentPath}`,
    `Embed: ${baseUrl}${fixture.embedPath}`,
  ];
}

export function readFixture(repoRoot = process.cwd()) {
  const fixtureFile = join(repoRoot, FIXTURE_PATH);
  if (!existsSync(fixtureFile)) {
    throw new Error(
      `${FIXTURE_PATH} is missing; run npm run db:seed:e2e first.`,
    );
  }
  return JSON.parse(readFileSync(fixtureFile, "utf8"));
}

export function runChecked(command, args, env) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export async function waitForServer(
  url,
  child,
  { timeoutMs = 60_000, retryMs = 1000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Retry until the server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

export async function runBrowserQa({
  argv = process.argv,
  processEnv = process.env,
  runCommand = runChecked,
  readSeedFixture = readFixture,
  spawnServer = spawn,
  waitForReady = waitForServer,
  stdout = console.log,
  exit = process.exit,
} = {}) {
  const args = new Set(argv.slice(2));
  const port = Number(processEnv.PORT || DEFAULT_PORT);
  const env = {
    ...processEnv,
    DB_PROVIDER: processEnv.DB_PROVIDER || "sqlite",
    DATABASE_URL: processEnv.DATABASE_URL || "file:./prisma/dev.db",
    AUTH_SECRET: processEnv.AUTH_SECRET || "browser-qa-placeholder-secret",
    PORT: String(port),
    E2E_BASE_URL: `http://localhost:${port}`,
  };

  if (!args.has("--print-only")) {
    runCommand("npm", ["run", "db:push"], env);
    runCommand("npm", ["run", "db:seed:e2e"], env);
  }

  const fixture = readSeedFixture();
  stdout("");
  for (const line of buildBrowserQaSummary(fixture, { port })) {
    stdout(line);
  }

  if (args.has("--seed-only") || args.has("--print-only")) {
    exit(0);
    return;
  }

  stdout("\nStarting dev server. Press Ctrl-C to stop.");
  const child = spawnServer("npm", ["run", "dev"], { stdio: "inherit", env });
  const stop = () => {
    if (child.exitCode === null) child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await waitForReady(`http://127.0.0.1:${port}`, child);
  stdout(`Dev server is responsive at http://localhost:${port}.`);
  await new Promise((resolve) => child.once("exit", resolve));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  await runBrowserQa();
