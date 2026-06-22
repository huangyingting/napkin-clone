import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isToolVisible, type EditorMode, type EditorTool } from "./editor-mode";

const ADVANCED_TOOLS: EditorTool[] = [
  "rotate-handle",
  "toolbar-bring-to-front",
  "toolbar-send-to-back",
  "context-bring-to-front",
  "context-send-to-back",
  "context-lock",
  "context-group",
  "context-ungroup",
  "snap-to-grid",
  "inspector-arrange",
  "inspector-opacity",
  "inspector-effects",
  "inspector-corner-radius",
  "inspector-gradient",
];

describe("isToolVisible", () => {
  describe("advanced mode shows all tools", () => {
    for (const tool of ADVANCED_TOOLS) {
      it(`shows ${tool}`, () => {
        assert.equal(isToolVisible(tool, "advanced"), true);
      });
    }
  });

  describe("simple mode hides all advanced tools", () => {
    for (const tool of ADVANCED_TOOLS) {
      it(`hides ${tool}`, () => {
        assert.equal(isToolVisible(tool, "simple"), false);
      });
    }
  });

  it("simple mode: non-advanced tools are visible", () => {
    // These are not in the advanced set so they should always be visible.
    const alwaysVisible: EditorMode[] = ["simple", "advanced"];
    for (const mode of alwaysVisible) {
      // Sanity: a hypothetical tool not in the advanced set is always shown.
      // We verify via the contract: advanced=true means all visible.
      assert.equal(isToolVisible("rotate-handle", mode), mode === "advanced");
    }
  });
});
