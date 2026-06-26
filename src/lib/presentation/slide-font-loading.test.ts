import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadSlideFonts } from "./slide-font-loading";

describe("loadSlideFonts (non-DOM)", () => {
  it("resolves without throwing when document is unavailable", async () => {
    assert.equal(typeof document, "undefined");
    await assert.doesNotReject(() => loadSlideFonts());
    await assert.doesNotReject(() => loadSlideFonts(["inter"]));
  });
});
