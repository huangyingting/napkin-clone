import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PARSE_TIMEOUT_MS,
  ParseTimeoutError,
  withTimeout,
} from "./timeout";

test("withTimeout resolves with the value when the factory settles in time", async () => {
  const value = await withTimeout(async () => "parsed", 1000);
  assert.equal(value, "parsed");
});

test("withTimeout rejects with ParseTimeoutError when the factory hangs", async () => {
  await assert.rejects(
    () => withTimeout(() => new Promise<string>(() => {}), 10),
    (error: unknown) => {
      assert.ok(error instanceof ParseTimeoutError);
      assert.match((error as Error).message, /10ms/);
      return true;
    },
  );
});

test("withTimeout propagates a rejection from the factory unchanged", async () => {
  const boom = new Error("parser exploded");
  await assert.rejects(
    () =>
      withTimeout(async () => {
        throw boom;
      }, 1000),
    (error: unknown) => {
      assert.equal(error, boom);
      assert.ok(!(error instanceof ParseTimeoutError));
      return true;
    },
  );
});

test("withTimeout resolves a slow-but-in-time factory without firing the timeout", async () => {
  const value = await withTimeout(
    () => new Promise<number>((resolve) => setTimeout(() => resolve(42), 5)),
    1000,
  );
  assert.equal(value, 42);
});

test("DEFAULT_PARSE_TIMEOUT_MS is a sane positive default", () => {
  assert.ok(DEFAULT_PARSE_TIMEOUT_MS > 0);
});
