import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { isValidElement, type ReactElement, type ReactNode } from "react";

import {
  buildDeckV7,
  buildSlideV7,
  buildTextNode,
} from "@/test/builders/deck-v7";
import { DeckDiagnosticsReview } from "./deck-diagnostics-review";
import {
  DeckGenerationDiagnosticsNotice,
  DeckGenerationPreviewVNext,
} from "./deck-generation-preview-vnext";

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
        useId: () => `preview-test-id-${hookIndex++}`,
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

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (!isValidElement(node)) return "";
  return textContent((node.props as { children?: ReactNode }).children);
}

function previewDecks() {
  const baseline = buildDeckV7([
    buildSlideV7("content", [buildTextNode({ id: "text-a" })], {
      id: "slide-a",
      notes: "Baseline",
    }),
  ]);
  const proposal = buildDeckV7([
    buildSlideV7("content", [buildTextNode({ id: "text-a" })], {
      id: "slide-a",
      notes: "Changed",
    }),
    buildSlideV7("content", [buildTextNode({ id: "text-b" })], {
      id: "slide-b",
      notes: "Added",
    }),
  ]);
  return { baseline, proposal };
}

test("DeckGenerationPreviewVNext routes review, apply, derive, and cancel actions", async () => {
  const { baseline, proposal } = previewDecks();
  const calls: string[] = [];
  const applied: unknown[] = [];
  const hookRenderer = createHookRenderer();

  const firstTree = hookRenderer.run(() =>
    DeckGenerationPreviewVNext({
      proposedDeck: proposal,
      baselineDeck: baseline,
      truncated: true,
      generationDiagnostics: [
        {
          code: "unsupported-template-control",
          category: "validation",
          severity: "warning",
          message: "Layout repaired",
          target: { scope: "deck" },
        },
        {
          code: "unsupported-template-control",
          category: "validation",
          severity: "warning",
          message: "Layout repaired",
          target: { scope: "deck" },
        },
      ],
      contentJson: "{}",
      options: { length: "short" },
      onApply: (deck, diagnostics) => {
        calls.push("apply");
        applied.push(deck, diagnostics);
      },
      onDerive: () => calls.push("derive"),
      onCancel: () => calls.push("cancel"),
    }),
  );
  const firstElements = collectElements(firstTree);
  const notice = firstElements.find(
    (element) => element.type === DeckGenerationDiagnosticsNotice,
  );
  assert.ok(notice);
  (notice.props as { onReview: () => void }).onReview();

  const actionResults: unknown[] = [];
  for (const label of ["Cancel", "Use derived deck instead", "Apply"]) {
    const button = firstElements.find(
      (element) =>
        textContent((element.props as { children?: ReactNode }).children) ===
        label,
    );
    assert.ok(button, `Missing ${label} button`);
    actionResults.push((button.props as { onClick: () => unknown }).onClick());
  }
  await Promise.all(actionResults);

  const secondTree = hookRenderer.run(() =>
    DeckGenerationPreviewVNext({
      proposedDeck: proposal,
      baselineDeck: baseline,
      truncated: true,
      generationDiagnostics: [
        {
          code: "unsupported-template-control",
          category: "validation",
          severity: "warning",
          message: "Layout repaired",
          target: { scope: "deck" },
        },
      ],
      contentJson: "{}",
      options: { length: "short" },
      onApply: () => undefined,
      onDerive: () => undefined,
      onCancel: () => undefined,
    }),
  );

  assert.deepEqual(calls, ["cancel", "derive", "apply"]);
  assert.equal(applied[0], proposal);
  assert.deepEqual(applied[1], [
    {
      code: "unsupported-template-control",
      category: "validation",
      severity: "warning",
      message: "Layout repaired",
      target: { scope: "deck" },
    },
  ]);
  assert.ok(
    collectElements(secondTree).some(
      (element) => element.type === DeckDiagnosticsReview,
    ),
  );
});
