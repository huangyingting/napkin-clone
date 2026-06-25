import assert from "node:assert/strict";
import test from "node:test";

import {
  CI_LOCAL_ENV,
  CI_LOCAL_STAGES,
  mergedCiEnv,
  stageBanner,
} from "./ci-local.mjs";

test("ci local mirrors the GitHub CI quality gate order", () => {
  assert.deepEqual(
    CI_LOCAL_STAGES.map((stage) => stage.command.join(" ")),
    [
      "npm run db:schema:check",
      "npm run db:generate",
      "npm test",
      "npm run typecheck",
      "npm run typecheck:unused",
      "npm run lint",
      "npm run format:check",
      "npm run build",
    ],
  );
});

test("ci local forces documented SQLite CI environment", () => {
  assert.deepEqual(CI_LOCAL_ENV.DB_PROVIDER, "sqlite");
  assert.equal(
    mergedCiEnv({ DB_PROVIDER: "postgres" }).DATABASE_URL,
    "file:./prisma/dev.db",
  );
});

test("ci local stage banner includes stage position", () => {
  assert.match(stageBanner(0, 8, CI_LOCAL_STAGES[0]), /\[ci:local 1\/8\]/);
});
