import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { canvasArrangeShortcutKind } from "./canvas-runtime";

describe("canvas-runtime", () => {
  test("maps bare bracket keys to forward/backward arrange commands", () => {
    assert.equal(canvasArrangeShortcutKind(key("]")), "forward");
    assert.equal(canvasArrangeShortcutKind(key("[")), "backward");
  });

  test("maps modified bracket keys to front/back arrange commands", () => {
    assert.equal(
      canvasArrangeShortcutKind(key("]", { ctrlKey: true })),
      "front",
    );
    assert.equal(
      canvasArrangeShortcutKind(key("[", { ctrlKey: true })),
      "back",
    );
    assert.equal(
      canvasArrangeShortcutKind(key("]", { metaKey: true })),
      "front",
    );
    assert.equal(
      canvasArrangeShortcutKind(key("[", { metaKey: true })),
      "back",
    );
  });

  test("rejects unsupported modifier combinations and non-bracket keys", () => {
    assert.equal(canvasArrangeShortcutKind(key("]", { shiftKey: true })), null);
    assert.equal(canvasArrangeShortcutKind(key("[", { altKey: true })), null);
    assert.equal(canvasArrangeShortcutKind(key("ArrowRight")), null);
  });
});

function key(
  name: string,
  mods: Partial<{
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  }> = {},
) {
  return {
    key: name,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  };
}
