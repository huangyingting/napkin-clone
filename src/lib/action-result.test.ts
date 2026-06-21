import assert from "node:assert/strict";
import { test } from "node:test";

import { actionError, actionOk, type ActionResult } from "./action-result";

test("actionOk() with no payload yields a success with void data", () => {
  const result = actionOk();
  assert.deepEqual(result, { ok: true, data: undefined });
});

test("actionOk(data) carries the payload on a success result", () => {
  const result = actionOk({ id: "b1", name: "Brand" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, { id: "b1", name: "Brand" });
  }
});

test("actionError carries the message on a failure result", () => {
  const result = actionError("Invalid expiry date.");
  assert.deepEqual(result, { ok: false, error: "Invalid expiry date." });
});

test("actionError is assignable to an ActionResult of any payload type", () => {
  const result: ActionResult<{ title: string }> = actionError("Nope.");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "Nope.");
  }
});

test("the ok flag discriminates the union for narrowing", () => {
  const results: ActionResult<number>[] = [actionOk(7), actionError("bad")];
  const oks = results.filter((r) => r.ok).map((r) => r.data);
  const errors = results.filter((r) => !r.ok).map((r) => r.error);
  assert.deepEqual(oks, [7]);
  assert.deepEqual(errors, ["bad"]);
});
