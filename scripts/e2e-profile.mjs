#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const env = {
  ...process.env,
  DB_PROVIDER: process.env.DB_PROVIDER ?? "sqlite",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "ci-placeholder",
  E2E_PROFILE: "1",
  E2E_WEB_SERVER: "1",
};

const steps = [
  ["npm", ["run", "db:generate"]],
  ["npm", ["run", "db:push"]],
  ["npm", ["run", "db:seed:e2e"]],
  ["npx", ["playwright", "install", "chromium"]],
  ["npx", ["playwright", "test"]],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
