import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AI_DECK_GEN_ENABLED_ENV, isAiDeckGenEnabled } from "./config";

describe("isAiDeckGenEnabled", () => {
  it("defaults to false (production-safe) when the flag is unset", () => {
    assert.strictEqual(isAiDeckGenEnabled({}), false);
  });

  it("is enabled only when the env flag is explicitly truthy", () => {
    assert.strictEqual(
      isAiDeckGenEnabled({ [AI_DECK_GEN_ENABLED_ENV]: "true" }),
      true,
    );
    assert.strictEqual(
      isAiDeckGenEnabled({ [AI_DECK_GEN_ENABLED_ENV]: "1" }),
      true,
    );
    assert.strictEqual(
      isAiDeckGenEnabled({ [AI_DECK_GEN_ENABLED_ENV]: "false" }),
      false,
    );
  });

  it("is NOT enabled by default in production", () => {
    assert.strictEqual(isAiDeckGenEnabled({ NODE_ENV: "production" }), false);
  });
});
