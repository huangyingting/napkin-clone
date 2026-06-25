import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isVisualStyleThemeId,
  resolveVisualThemeBridge,
} from "@/lib/visual/deck-visual-theme-bridge";

test("visual theme bridge recognizes visual-content themes independently", () => {
  assert.equal(isVisualStyleThemeId("indigo"), true);
  assert.equal(isVisualStyleThemeId("brand:acme"), false);
});

test("visual theme bridge prefers element theme over deck visual defaults", () => {
  const bridge = resolveVisualThemeBridge("ocean", {
    styleThemeId: "indigo",
    transparentBackground: true,
  });

  assert.deepEqual(bridge, {
    styleThemeId: "ocean",
    transparentBackground: true,
    origin: "element",
  });
});

test("visual theme bridge falls back to visual payload when optional defaults are absent", () => {
  assert.deepEqual(resolveVisualThemeBridge(undefined, undefined), {
    transparentBackground: false,
    origin: "visual",
  });
});
