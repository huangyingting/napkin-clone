import assert from "node:assert/strict";
import { test } from "node:test";

import { apiErrorMessageFromPayload } from "./error-message";

test("apiErrorMessageFromPayload returns a trimmed non-empty error string", () => {
  assert.equal(
    apiErrorMessageFromPayload({ error: "  Out of credits  " }, "fallback"),
    "Out of credits",
  );
});

test("apiErrorMessageFromPayload falls back for missing, blank, or non-string errors", () => {
  assert.equal(apiErrorMessageFromPayload({}, "fallback"), "fallback");
  assert.equal(
    apiErrorMessageFromPayload({ error: "  " }, "fallback"),
    "fallback",
  );
  assert.equal(
    apiErrorMessageFromPayload({ error: 42 }, "fallback"),
    "fallback",
  );
  assert.equal(apiErrorMessageFromPayload(null, "fallback"), "fallback");
  assert.equal(apiErrorMessageFromPayload("nope", "fallback"), "fallback");
});
