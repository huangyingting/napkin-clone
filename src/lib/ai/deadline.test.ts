import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATE_TIMEOUT_MS,
  GenerateTimeoutError,
  withAbortDeadline,
} from "./deadline";

test("resolves with the value when factory settles before the deadline", async () => {
  const result = await withAbortDeadline(
    (_signal) => Promise.resolve("ok"),
    1000,
  );
  assert.equal(result, "ok");
});

test("rejects with GenerateTimeoutError when the factory hangs past the deadline", async () => {
  await assert.rejects(
    () => withAbortDeadline((_signal) => new Promise(() => {}), 10),
    (error: unknown) => {
      assert.ok(error instanceof GenerateTimeoutError);
      assert.match((error as Error).message, /10ms/);
      return true;
    },
  );
});

test("aborts the signal when the deadline fires", async () => {
  let capturedSignal: AbortSignal | undefined;
  await assert.rejects(
    () =>
      withAbortDeadline((signal) => {
        capturedSignal = signal;
        return new Promise(() => {});
      }, 10),
    (error: unknown) => error instanceof GenerateTimeoutError,
  );
  assert.ok(capturedSignal?.aborted, "signal must be aborted after timeout");
});

test("propagates factory rejections unchanged (not wrapped as timeout)", async () => {
  const boom = new Error("network");
  await assert.rejects(
    () => withAbortDeadline(() => Promise.reject(boom), 1000),
    (error: unknown) => {
      assert.equal(error, boom);
      assert.ok(!(error instanceof GenerateTimeoutError));
      return true;
    },
  );
});

test("resolves a slow-but-in-time factory without firing the deadline", async () => {
  const result = await withAbortDeadline(
    (_signal) =>
      new Promise<number>((resolve) => setTimeout(() => resolve(42), 5)),
    1000,
  );
  assert.equal(result, 42);
});

test("GENERATE_TIMEOUT_MS is a sane positive default", () => {
  assert.ok(GENERATE_TIMEOUT_MS > 0);
  assert.ok(GENERATE_TIMEOUT_MS >= 30_000, "deadline should be >= 30s");
});
