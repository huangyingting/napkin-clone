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

function runChecked(command, args, env) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 60_000;
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
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Set(process.argv.slice(2));
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const env = {
    ...process.env,
    DB_PROVIDER: process.env.DB_PROVIDER || "sqlite",
    DATABASE_URL: process.env.DATABASE_URL || "file:./prisma/dev.db",
    AUTH_SECRET: process.env.AUTH_SECRET || "browser-qa-placeholder-secret",
    PORT: String(port),
    E2E_BASE_URL: `http://localhost:${port}`,
  };

  if (!args.has("--print-only")) {
    runChecked("npm", ["run", "db:push"], env);
    runChecked("npm", ["run", "db:seed:e2e"], env);
  }

  const fixture = readFixture();
  console.log("");
  for (const line of buildBrowserQaSummary(fixture, { port })) {
    console.log(line);
  }

  if (args.has("--seed-only") || args.has("--print-only")) {
    process.exit(0);
  }

  console.log("\nStarting dev server. Press Ctrl-C to stop.");
  const child = spawn("npm", ["run", "dev"], { stdio: "inherit", env });
  const stop = () => {
    if (child.exitCode === null) child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await waitForServer(`http://127.0.0.1:${port}`, child);
  console.log(`Dev server is responsive at http://localhost:${port}.`);
  await new Promise((resolve) => child.once("exit", resolve));
}
