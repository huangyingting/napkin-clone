import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { checkProductionInstall } from "./production-install-smoke.mjs";

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
