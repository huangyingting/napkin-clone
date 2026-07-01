import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  buildSlideToolInsertActions,
  restoreFocusAfterContextToolbarEscape,
} from "./context-toolbar";

const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);

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

afterEach(() => {
  if (originalDocumentDescriptor) {
    Object.defineProperty(globalThis, "document", originalDocumentDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, "document");
});

describe("restoreFocusAfterContextToolbarEscape", () => {
  test("prefers explicit stage-focus callback", () => {
    let callbackCalls = 0;
    let blurCalls = 0;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        activeElement: {
          blur: () => {
            blurCalls += 1;
          },
        },
      },
    });

    restoreFocusAfterContextToolbarEscape(() => {
      callbackCalls += 1;
    });

    assert.equal(callbackCalls, 1);
    assert.equal(blurCalls, 0);
  });

  test("blurs active element when callback is absent", () => {
    let blurCalls = 0;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        activeElement: {
          blur: () => {
            blurCalls += 1;
          },
        },
      },
    });

    restoreFocusAfterContextToolbarEscape(undefined);

    assert.equal(blurCalls, 1);
  });

  test("is safe when document is unavailable", () => {
    Reflect.deleteProperty(globalThis, "document");
    assert.doesNotThrow(() => restoreFocusAfterContextToolbarEscape(undefined));
  });
});
