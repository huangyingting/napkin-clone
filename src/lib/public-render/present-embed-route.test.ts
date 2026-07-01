import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPresentEmbedRenderInput } from "./present-embed-route";

test("buildPresentEmbedRenderInput resolves via embed share policy", () => {
  assert.deepEqual(buildPresentEmbedRenderInput("shared-doc-share123"), {
    params: { shareId: "shared-doc-share123" },
    mode: "embed",
    projection: "presentation",
  });
});
