import assert from "node:assert/strict";
import test from "node:test";

import * as documentActions from "./actions";

test("deck actions barrel closes command-save while keeping supported save entry points", () => {
  assert.equal(typeof documentActions.saveDeckJson, "function");
  assert.equal(typeof documentActions.saveDeckPatch, "function");
  assert.equal("saveDeckCommand" in documentActions, false);
});
