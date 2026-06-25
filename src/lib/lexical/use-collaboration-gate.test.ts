import assert from "node:assert/strict";
import { test } from "node:test";

import { collaborationEditable } from "./use-collaboration-gate";

test("collaboration editable gate requires permission and readiness", () => {
  assert.equal(collaborationEditable(true, true), true);
  assert.equal(collaborationEditable(false, true), false);
  assert.equal(collaborationEditable(true, false), false);
  assert.equal(collaborationEditable(false, false), false);
});
