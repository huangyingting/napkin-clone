import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  checkProductionInstall,
  resolveModule,
  runProductionInstallSmoke,
} from "./production-install-smoke.mjs";

const ROOT = path.resolve("fixture-production-smoke");
const GENERATED = path.join(ROOT, "src", "generated", "prisma", "client.ts");
const PRISMA_CLI = path.join(ROOT, "node_modules", ".bin", "prisma");

function resolver(missing = new Set()) {
  return (name) => {
    if (missing.has(name)) throw new Error(`missing ${name}`);
    return `/node_modules/${name}/index.js`;
  };
}

test("checkProductionInstall passes when runtime modules and generated client are present", () => {
  const result = checkProductionInstall({
    rootDir: ROOT,
    env: {},
    resolve: resolver(),
    exists: (file) => file === GENERATED || file === PRISMA_CLI,
  });

  assert.equal(result.generatedClient, GENERATED);
  assert.ok(result.resolvedModules.some((entry) => entry.name === "next"));
});

test("checkProductionInstall points missing generated client at db:generate", () => {
  assert.throws(
    () =>
      checkProductionInstall({
        rootDir: ROOT,
        env: {},
        resolve: resolver(),
        exists: (file) => file === PRISMA_CLI,
      }),
    /Run `npm run db:generate`/,
  );
});

test("checkProductionInstall requires Prisma CLI for production generation", () => {
  assert.throws(
    () =>
      checkProductionInstall({
        rootDir: ROOT,
        env: {},
        resolve: resolver(),
        exists: (file) => file === GENERATED,
      }),
    /missing the Prisma CLI/,
  );
});

test("checkProductionInstall fails closed when Stripe env is set without package", () => {
  assert.throws(
    () =>
      checkProductionInstall({
        rootDir: ROOT,
        env: { STRIPE_SECRET_KEY: "sk_live_123" },
        resolve: resolver(new Set(["stripe"])),
        exists: (file) => file === GENERATED || file === PRISMA_CLI,
      }),
    /STRIPE_SECRET_KEY is set but the optional external `stripe` package is not installed/,
  );
});

test("checkProductionInstall checks required module resolution and optional Stripe success", () => {
  assert.throws(
    () =>
      checkProductionInstall({
        rootDir: ROOT,
        env: {},
        resolve: resolver(new Set(["next"])),
        exists: (file) => file === GENERATED || file === PRISMA_CLI,
      }),
    /missing next/,
  );

  const result = checkProductionInstall({
    rootDir: ROOT,
    env: { STRIPE_SECRET_KEY: "sk_live_123" },
    resolve: resolver(),
    exists: (file) => file === GENERATED || file === PRISMA_CLI,
  });
  assert.equal(result.generatedClient, GENERATED);
});

test("checkProductionInstall can use the default module resolver", () => {
  const result = checkProductionInstall({
    rootDir: ROOT,
    env: {},
    exists: (file) => file === GENERATED || file === PRISMA_CLI,
  });

  assert.ok(result.resolvedModules.every((entry) => entry.path));
});

test("resolveModule explains missing production dependencies", () => {
  assert.throws(
    () => resolveModule("@textiq/not-a-real-runtime-package"),
    /Production install is missing runtime module/,
  );
});

test("runProductionInstallSmoke prints the resolved module count", () => {
  const output = [];
  runProductionInstallSmoke({
    check: () => ({
      generatedClient: GENERATED,
      resolvedModules: [{ name: "next" }, { name: "react" }],
    }),
    stdout: (message) => output.push(message),
  });

  assert.match(output[0], /2 runtime modules resolved/);
});

test("production install smoke CLI reports missing fixture artifacts", (t) => {
  const root = path.join(
    process.cwd(),
    ".squad",
    "production-smoke-cli-missing",
  );
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "scripts", "production-install-smoke.mjs")],
    {
      cwd: root,
      env: { ...process.env, STRIPE_SECRET_KEY: "sk_test_missing" },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /optional external `stripe` package is not installed/,
  );
});
