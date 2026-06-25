import assert from "node:assert/strict";
import test from "node:test";

import { assertViewModelSerializable } from "./serializable";

test("assertViewModelSerializable accepts JSON-shaped values", () => {
  assert.doesNotThrow(() =>
    assertViewModelSerializable({
      title: "Dashboard",
      count: 2,
      flags: [true, false],
      nested: { value: null },
    }),
  );
});

test("assertViewModelSerializable rejects dates, maps, sets, and undefined", () => {
  for (const value of [
    { createdAt: new Date("2026-01-01T00:00:00.000Z") },
    { tags: new Map([["a", "A"]]) },
    { ids: new Set(["a"]) },
    { missing: undefined },
  ]) {
    assert.throws(() => assertViewModelSerializable(value), /not serializable/);
  }
});
