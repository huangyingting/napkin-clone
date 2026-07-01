import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";

import { useFocusTrap } from "./use-focus-trap";

type ReactInternals = {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H: unknown;
  };
};

class FakeHTMLElement {
  focusCount = 0;
  hiddenAncestor = false;
  listener?: (event: KeyboardEvent) => void;

  constructor(private readonly focusables: FakeHTMLElement[] = []) {}

  focus(): void {
    this.focusCount += 1;
    Object.defineProperty(document, "activeElement", {
      configurable: true,
      value: this,
    });
  }

  closest(selector: string): FakeHTMLElement | null {
    return selector === "[aria-hidden='true']" && this.hiddenAncestor
      ? this
      : null;
  }

  querySelectorAll(): FakeHTMLElement[] {
    return this.focusables;
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === "keydown") {
      this.listener = listener as (event: KeyboardEvent) => void;
    }
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (type === "keydown" && this.listener === listener) {
      this.listener = undefined;
    }
  }
}

function installDom(activeElement: FakeHTMLElement) {
  const globalRef = globalThis as typeof globalThis & {
    document?: unknown;
    HTMLElement?: unknown;
  };
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalRef,
    "document",
  );
  const previousHTMLElement = Object.getOwnPropertyDescriptor(
    globalRef,
    "HTMLElement",
  );

  Object.defineProperty(globalRef, "document", {
    configurable: true,
    value: { activeElement },
  });
  Object.defineProperty(globalRef, "HTMLElement", {
    configurable: true,
    value: FakeHTMLElement,
  });

  return () => {
    if (previousDocument) {
      Object.defineProperty(globalRef, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalRef, "document");
    }
    if (previousHTMLElement) {
      Object.defineProperty(globalRef, "HTMLElement", previousHTMLElement);
    } else {
      Reflect.deleteProperty(globalRef, "HTMLElement");
    }
  };
}

function runHook(render: () => void): () => void {
  const internals = (React as unknown as ReactInternals)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals);
  const previous = internals.H;
  let cleanup: (() => void) | undefined;
  internals.H = {
    useRef: <T>(initial: T) => ({ current: initial }),
    useEffect: (effect?: () => void | (() => void)) => {
      const result = effect?.();
      if (typeof result === "function") cleanup = result;
    },
  };
  try {
    render();
  } finally {
    internals.H = previous;
  }
  return () => cleanup?.();
}

function tabEvent(shiftKey = false) {
  let prevented = 0;
  return {
    key: "Tab",
    shiftKey,
    preventDefault: () => {
      prevented += 1;
    },
    get prevented() {
      return prevented;
    },
  } as KeyboardEvent & { readonly prevented: number };
}

test("useFocusTrap focuses, wraps tab order, ignores hidden descendants, and restores focus", () => {
  const previous = new FakeHTMLElement();
  const first = new FakeHTMLElement();
  const hidden = new FakeHTMLElement();
  const last = new FakeHTMLElement();
  hidden.hiddenAncestor = true;
  const trap = new FakeHTMLElement([first, hidden, last]);
  const restoreDom = installDom(previous);
  try {
    const cleanup = runHook(() =>
      useFocusTrap({
        current: trap as unknown as HTMLElement,
      }),
    );

    assert.equal(first.focusCount, 1);
    assert.equal(typeof trap.listener, "function");

    last.focus();
    const forward = tabEvent();
    trap.listener?.(forward);
    assert.equal(forward.prevented, 1);
    assert.equal(first.focusCount, 2);

    first.focus();
    const backward = tabEvent(true);
    trap.listener?.(backward);
    assert.equal(backward.prevented, 1);
    assert.equal(last.focusCount, 2);

    trap.listener?.({
      key: "Escape",
      preventDefault: () => assert.fail("Escape should not be trapped"),
    } as unknown as KeyboardEvent);

    cleanup();
    assert.equal(previous.focusCount, 1);
    assert.equal(trap.listener, undefined);
  } finally {
    restoreDom();
  }
});

test("useFocusTrap falls back to the container when it has no focusable descendants", () => {
  const previous = new FakeHTMLElement();
  const trap = new FakeHTMLElement();
  const restoreDom = installDom(previous);
  try {
    const cleanup = runHook(() =>
      useFocusTrap({
        current: trap as unknown as HTMLElement,
      }),
    );
    assert.equal(trap.focusCount, 1);

    const event = tabEvent();
    trap.listener?.(event);
    assert.equal(event.prevented, 1);

    cleanup();
  } finally {
    restoreDom();
  }
});
