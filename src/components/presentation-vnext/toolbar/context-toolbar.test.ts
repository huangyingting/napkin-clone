import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { restoreFocusAfterContextToolbarEscape } from "./context-toolbar";

const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);

afterEach(() => {
  if (originalDocumentDescriptor) {
    Object.defineProperty(globalThis, "document", originalDocumentDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, "document");
});

test("restoreFocusAfterContextToolbarEscape prefers explicit stage-focus callback", () => {
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

test("restoreFocusAfterContextToolbarEscape blurs active element when callback is absent", () => {
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

test("restoreFocusAfterContextToolbarEscape is safe when document is unavailable", () => {
  Reflect.deleteProperty(globalThis, "document");
  assert.doesNotThrow(() => restoreFocusAfterContextToolbarEscape(undefined));
});
