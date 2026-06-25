import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  keyboardConnectorDecision,
  nextKeyboardConnectorTargetId,
  orderedKeyboardConnectorTargets,
  startKeyboardConnectorMode,
  type KeyboardConnectorElement,
} from "./canvas-keyboard-connector";
import type { ElementBox } from "./deck";

const box = (x: number, y: number, w = 10, h = 10): ElementBox => ({
  x,
  y,
  w,
  h,
});

const element = (
  id: string,
  x: number,
  y: number,
): KeyboardConnectorElement => ({ id, box: box(x, y) });

describe("canvas-keyboard-connector", () => {
  const elements = [
    element("source", 0, 0),
    element("near", 20, 0),
    element("far", 80, 0),
    element("below", 0, 30),
  ];

  test("orders targets by distance from the source with stable tie-breaks", () => {
    assert.deepEqual(
      orderedKeyboardConnectorTargets(elements, "source").map(
        (target) => target.id,
      ),
      ["near", "below", "far"],
    );
  });

  test("starts mode at the nearest available target", () => {
    assert.deepEqual(startKeyboardConnectorMode(elements, "source"), {
      sourceId: "source",
      targetId: "near",
    });
  });

  test("does not start without a source or target", () => {
    assert.equal(startKeyboardConnectorMode(elements, "missing"), null);
    assert.equal(startKeyboardConnectorMode([elements[0]], "source"), null);
  });

  test("cycles targets forward and backward with wrapping", () => {
    const targets = orderedKeyboardConnectorTargets(elements, "source");
    assert.equal(nextKeyboardConnectorTargetId(targets, "near", 1), "below");
    assert.equal(nextKeyboardConnectorTargetId(targets, "near", -1), "far");
    assert.equal(nextKeyboardConnectorTargetId(targets, "far", 1), "near");
  });

  test("uses Tab and arrow keys to preview another target", () => {
    const mode = { sourceId: "source", targetId: "near" };
    assert.deepEqual(keyboardConnectorDecision(mode, key("Tab"), elements), {
      type: "target",
      mode: { sourceId: "source", targetId: "below" },
    });
    assert.deepEqual(
      keyboardConnectorDecision(mode, key("Tab", { shiftKey: true }), elements),
      { type: "target", mode: { sourceId: "source", targetId: "far" } },
    );
    assert.deepEqual(
      keyboardConnectorDecision(mode, key("ArrowRight"), elements),
      { type: "target", mode: { sourceId: "source", targetId: "below" } },
    );
    assert.deepEqual(
      keyboardConnectorDecision(mode, key("ArrowLeft"), elements),
      { type: "target", mode: { sourceId: "source", targetId: "far" } },
    );
  });

  test("confirms, cancels, and ignores unrelated keys", () => {
    const mode = { sourceId: "source", targetId: "near" };
    assert.deepEqual(keyboardConnectorDecision(mode, key("Enter"), elements), {
      type: "confirm",
      sourceId: "source",
      targetId: "near",
    });
    assert.deepEqual(keyboardConnectorDecision(mode, key("Escape"), elements), {
      type: "cancel",
      sourceId: "source",
    });
    assert.deepEqual(keyboardConnectorDecision(mode, key("c"), elements), {
      type: "none",
    });
  });
});

function key(keyName: string, mods: Partial<{ shiftKey: boolean }> = {}) {
  return { key: keyName, shiftKey: false, ...mods };
}
