import assert from "node:assert/strict";
import test from "node:test";

import {
  checkEnvironment,
  checkNodeVersion,
  describeEnvValue,
  summarize,
} from "./dev-doctor.mjs";

test("dev doctor accepts Node 22 and newer", () => {
  assert.equal(checkNodeVersion("22.11.0").status, "ok");
  assert.equal(checkNodeVersion("24.0.0").status, "ok");
  assert.equal(checkNodeVersion("20.12.0").status, "fail");
});

test("dev doctor redacts secret-like environment values", () => {
  const env = {
    AUTH_SECRET: "super-secret",
    DATABASE_URL: "file:./prisma/dev.db",
  };
  assert.equal(describeEnvValue("AUTH_SECRET", env), "set (redacted)");
  assert.equal(
    describeEnvValue("DATABASE_URL", env),
    "set to file:./prisma/dev.db",
  );
});

test("dev doctor reports missing auth secret as a repairable warning", () => {
  const results = checkEnvironment({
    DB_PROVIDER: "sqlite",
    DATABASE_URL: "file:./prisma/dev.db",
  });
  assert.equal(summarize(results).failures, 0);
  assert.equal(summarize(results).warnings, 1);
  assert.match(results.at(-1).hint, /dev:setup/);
});

test("dev doctor fails postgres without DATABASE_URL", () => {
  const results = checkEnvironment({ DB_PROVIDER: "postgres" });
  assert.equal(
    results.some((result) => result.status === "fail"),
    true,
  );
});
