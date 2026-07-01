import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildSlideToolInsertActions } from "./context-toolbar";

describe("buildSlideToolInsertActions", () => {
  test("returns all current-object insertion actions in stable order", () => {
    const actions = buildSlideToolInsertActions({
      onInsertText: () => undefined,
      onInsertShape: () => undefined,
      onInsertImage: () => undefined,
      onInsertVisual: () => undefined,
      onInsertConnector: () => undefined,
      onInsertTable: () => undefined,
    });

    assert.deepEqual(
      actions.map((action) => action.label),
      [
        "Insert text",
        "Insert shape",
        "Insert image",
        "Insert visual",
        "Insert connector",
        "Insert table",
      ],
    );
  });

  test("omits actions when callbacks are unavailable", () => {
    const actions = buildSlideToolInsertActions({
      onInsertText: () => undefined,
      onInsertTable: () => undefined,
    });

    assert.deepEqual(
      actions.map((action) => action.label),
      ["Insert text", "Insert table"],
    );
  });

  test("preserves callback wiring for keyboard-triggered inserts", () => {
    const calls: string[] = [];
    const actions = buildSlideToolInsertActions({
      onInsertText: () => calls.push("text"),
      onInsertShape: () => calls.push("shape"),
      onInsertImage: () => calls.push("image"),
      onInsertVisual: () => calls.push("visual"),
      onInsertConnector: () => calls.push("connector"),
      onInsertTable: () => calls.push("table"),
    });

    for (const action of actions) {
      action.onClick();
    }

    assert.deepEqual(calls, [
      "text",
      "shape",
      "image",
      "visual",
      "connector",
      "table",
    ]);
  });
});
