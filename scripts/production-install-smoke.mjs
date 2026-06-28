#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);

const requiredRuntimeModules = [
  "@prisma/client",
  "@prisma/adapter-better-sqlite3",
  "@prisma/adapter-pg",
  "better-sqlite3",
  "dotenv",
  "next",
  "next-auth",
  "pg",
  "react",
  "react-dom",
];

export function resolveModule(name) {
  try {
    return require.resolve(name, { paths: [repoRoot] });
  } catch (error) {
    throw new Error(
      `Production install is missing runtime module \"${name}\". ` +
        "If this is a production dependency, move it to dependencies and run npm ci.",
      { cause: error },
    );
  }
}

export function checkProductionInstall({
  rootDir = repoRoot,
  env = process.env,
  resolve = resolveModule,
  exists = fs.existsSync,
} = {}) {
  const resolvedModules = requiredRuntimeModules.map((name) => ({
    name,
    path: resolve(name),
  }));

  const generatedClient = path.join(
    rootDir,
    "src",
    "generated",
    "prisma",
    "client.ts",
  );
  const prismaCli = path.join(rootDir, "node_modules", ".bin", "prisma");
  if (!exists(prismaCli)) {
    throw new Error(
      "Production install is missing the Prisma CLI at node_modules/.bin/prisma. " +
        "`prisma` must stay in dependencies because production installs run `npm run db:generate`.",
    );
  }

  if (!exists(generatedClient)) {
    throw new Error(
      "Generated Prisma client is missing at src/generated/prisma/client.ts. " +
        "Run `npm run db:generate` after installing dependencies.",
    );
  }

  if (env.STRIPE_SECRET_KEY) {
    try {
      resolve("stripe");
    } catch (error) {
      throw new Error(
        "STRIPE_SECRET_KEY is set but the optional external `stripe` package is not installed. " +
          "Install `stripe` in the deployment artifact or unset Stripe billing env vars so billing fails closed.",
        { cause: error },
      );
    }
  }

  return { generatedClient, resolvedModules };
}

export function runProductionInstallSmoke({
  check = checkProductionInstall,
  stdout = console.log,
} = {}) {
  const result = check();
  stdout(
    `Production install smoke passed (${result.resolvedModules.length} runtime modules resolved; Prisma client present).`,
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    runProductionInstallSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
