import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SlideEditorVNext } from "./slide-editor-vnext";
import {
  buildDeckV7,
  buildImageNode,
  buildShapeNode,
  buildSlideV7,
  buildTableNode,
  buildTextNode,
  buildVisualNode,
} from "@/test/builders/deck-v7";

type ReactInternals = {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H: unknown;
  };
};

function createHookRenderer() {
  const internals = (React as unknown as ReactInternals)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals);
  const slots: unknown[] = [];

  return {
    run<T>(render: () => T): T {
      let hookIndex = 0;
      const previous = internals.H;
      internals.H = {
        useState: <S>(initial: S | (() => S)) => {
          const slot = hookIndex++;
          if (!(slot in slots)) {
            slots[slot] =
              typeof initial === "function" ? (initial as () => S)() : initial;
          }
          const setState = (next: S | ((previous: S) => S)) => {
            const previousValue = slots[slot] as S;
            slots[slot] =
              typeof next === "function"
                ? (next as (previous: S) => S)(previousValue)
                : next;
          };
          return [slots[slot] as S, setState] as const;
        },
        useReducer: <S, A>(reducer: (state: S, action: A) => S, initial: S) => {
          const slot = hookIndex++;
          if (!(slot in slots)) slots[slot] = initial;
          const dispatch = (action: A) => {
            slots[slot] = reducer(slots[slot] as S, action);
          };
          return [slots[slot] as S, dispatch] as const;
        },
        useRef: <T>(initial: T) => {
          const slot = hookIndex++;
          if (!(slot in slots)) slots[slot] = { current: initial };
          return slots[slot] as { current: T };
        },
        useMemo: <T>(factory: () => T) => {
          hookIndex++;
          return factory();
        },
        useCallback: <T>(callback: T) => {
          hookIndex++;
          return callback;
        },
        useId: () => `fake-id-${hookIndex++}`,
        useEffect: () => {
          hookIndex++;
        },
        useLayoutEffect: () => {
          hookIndex++;
        },
        useInsertionEffect: () => {
          hookIndex++;
        },
        useContext: () => {
          hookIndex++;
          return undefined;
        },
        useTransition: () => {
          hookIndex++;
          return [false, (callback?: () => void) => callback?.()] as const;
        },
        useDeferredValue: <T>(value: T) => {
          hookIndex++;
          return value;
        },
        useSyncExternalStore: <T>(
          _subscribe: () => () => void,
          getSnapshot: () => T,
        ) => {
          hookIndex++;
          return getSnapshot();
        },
        useImperativeHandle: () => {
          hookIndex++;
        },
      };
      try {
        return render();
      } finally {
        internals.H = previous;
      }
    },
  };
}

type FakeEventTarget = {
  value: string;
  checked: boolean;
  files: File[];
  closest: () => null;
  focus: () => void;
};

function collectElements(node: ReactNode, elements: ReactElement[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, elements);
    return elements;
  }
  if (!isValidElement(node)) return elements;
  elements.push(node);
  collectElements((node.props as { children?: ReactNode }).children, elements);
  return elements;
}

function mixedDeck() {
  return buildDeckV7([
    buildSlideV7(
      "content",
      [
        buildTextNode({ id: "text-1", role: "title" }),
        buildShapeNode({ id: "shape-1" }),
        buildImageNode("img-001", { id: "image-1" }),
        buildVisualNode({ id: "visual-1" }),
        buildTableNode({ id: "table-1" }),
      ],
      { id: "slide-1", name: "Mixed slide" },
    ),
    buildSlideV7("content", [buildTextNode({ id: "text-2" })], {
      id: "slide-2",
      name: "Summary slide",
    }),
  ]);
}

test("SlideEditorVNext renders the full editor shell for mixed slide content", () => {
  const deck = mixedDeck();
  const actionOk = async () => ({ ok: true as const, data: undefined });

  const html = renderToStaticMarkup(
    createElement(SlideEditorVNext, {
      documentId: "doc-render",
      deck,
      onDeckChange: () => undefined,
      onSave: actionOk,
      onClose: () => undefined,
      onPresent: actionOk,
      onShare: actionOk,
      onExportPptx: async () => undefined,
      onUploadImage: async () => ({
        src: "https://example.com/replacement.png",
        assetId: "replacement",
      }),
    }),
  );

  assert.match(html, /Slide editing tools/);
  assert.match(html, /Mixed slide/);
});

test("SlideEditorVNext top-level handlers tolerate no-op editor callbacks", async () => {
  const actionOk = async () => ({ ok: true as const, data: undefined });
  const tree = createHookRenderer().run(() =>
    SlideEditorVNext({
      documentId: "doc-render",
      deck: mixedDeck(),
      onDeckChange: () => undefined,
      onSave: actionOk,
      onClose: () => undefined,
      onPresent: actionOk,
      onShare: actionOk,
      onExportPptx: async () => undefined,
      onUploadImage: async () => ({ src: "", assetId: "replacement" }),
    }),
  );

  const previousHTMLElement = Object.getOwnPropertyDescriptor(
    globalThis,
    "HTMLElement",
  );
  const fakeTarget: FakeEventTarget = {
    value: "1",
    checked: true,
    files: [],
    closest: () => null,
    focus: () => undefined,
  };
  const event = {
    key: "Escape",
    button: 0,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    currentTarget: fakeTarget,
    target: fakeTarget,
  };
  let invoked = 0;
  const handlerPromises: Promise<unknown>[] = [];

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    writable: true,
    value: class FakeHTMLElement {},
  });
  try {
    for (const element of collectElements(tree)) {
      const props = element.props as Record<string, unknown>;
      for (const name of ["onClick", "onKeyDown", "onChange"]) {
        const handler = props[name];
        if (typeof handler !== "function") continue;
        const result = handler(event);
        invoked += 1;
        handlerPromises.push(Promise.resolve(result));
      }
    }
    await Promise.all(handlerPromises);
  } finally {
    if (previousHTMLElement) {
      Object.defineProperty(globalThis, "HTMLElement", previousHTMLElement);
    } else {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    }
  }

  assert.ok(invoked > 10);
});
