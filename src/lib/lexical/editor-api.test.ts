import assert from "node:assert/strict";
import { test } from "node:test";

import { createEditorPlugin } from "./editor-api";

test("core editor plugin facade registers stable plugin ids", () => {
  const plugin = createEditorPlugin("example", () => "rendered");

  assert.equal(plugin.id, "example");
  assert.equal(plugin.render(), "rendered");
});
