import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as React from "react";
import {
  Children,
  createElement,
  isValidElement,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Filmstrip, type FilmstripProps } from "./filmstrip";
import type {
  ResolvedDeckRenderTree,
  ResolvedRenderNode,
  ResolvedSlideRenderTree,
} from "@/lib/presentation-vnext/render-tree";

type ElementWithProps = ReactElement<Record<string, unknown>>;
type ReactInternals = {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H: unknown;
  };
};

type MockStateUpdate = { index: number; value: unknown };

function textNode(
  id: string,
  frame: { x: number; y: number; w: number; h: number },
): ResolvedRenderNode {
  return {
    id,
    type: "text",
    role: "body",
    layout: { frame, zIndex: 1 },
    style: {},
    content: {
      type: "text",
      content: { paragraphs: [{ id: `${id}-p1`, text: id }] },
    },
    source: "user",
  };
}

function slide(id: string): ResolvedSlideRenderTree {
  return {
    id,
    background: {
      fill: { type: "solid", color: "#ffffff" },
      decorationLevel: "none",
    },
    decorations: [],
    chrome: [],
    nodes: [textNode(`${id}-title`, { x: 10, y: 10, w: 80, h: 12 })],
  };
}

function renderTree(slideCount = 3): ResolvedDeckRenderTree {
  return {
    canvas: { format: "16:9", width: 100, height: 56.25, unit: "percent" },
    theme: {
      packageId: "test-package",
      tokens: {
        colors: {
          canvas: { fill: "#ffffff", text: "#111111", mutedText: "#64748b" },
          surface: { fill: "#ffffff", text: "#111111", mutedText: "#64748b" },
          accent: { fill: "#2563eb", text: "#ffffff" },
        },
        fonts: { heading: "Inter", body: "Inter" },
      },
    },
    diagnostics: [],
    slides: Array.from({ length: slideCount }, (_, index) =>
      slide(`slide-${index + 1}`),
    ),
  };
}

function filmstripProps(
  overrides: Partial<FilmstripProps> = {},
): FilmstripProps {
  return {
    renderTree: renderTree(),
    activeSlideIndex: 1,
    collapsed: false,
    onSelectSlide: () => undefined,
    onInsertSlide: () => undefined,
    onDuplicateSlide: () => undefined,
    onDeleteSlide: () => undefined,
    onMoveSlide: () => undefined,
    ...overrides,
  };
}

function findElement(
  root: ReactNode,
  predicate: (element: ElementWithProps) => boolean,
): ElementWithProps | null {
  let found: ElementWithProps | null = null;
  function visit(node: ReactNode): void {
    if (found) return;
    Children.forEach(node, (child) => {
      if (found || !isValidElement(child)) return;
      const element = child as ElementWithProps;
      if (predicate(element)) {
        found = element;
        return;
      }
      visit(element.props.children as ReactNode);
    });
  }
  visit(root);
  return found;
}

function withMockHooks<T>(callback: () => T): {
  value: T;
  refs: Array<{ current: unknown }>;
  updates: MockStateUpdate[];
} {
  const internals = (React as unknown as ReactInternals)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals, "React internals are required for filmstrip hook tests");

  const previous = internals.H;
  const refs: Array<{ current: unknown }> = [];
  const stateValues: unknown[] = [];
  const updates: MockStateUpdate[] = [];
  let stateIndex = 0;

  internals.H = {
    useState: (initial: unknown) => {
      const index = stateIndex;
      stateIndex += 1;
      if (stateValues.length <= index) {
        stateValues[index] =
          typeof initial === "function"
            ? (initial as () => unknown)()
            : initial;
      }
      return [
        stateValues[index],
        (next: unknown) => {
          const value =
            typeof next === "function"
              ? (next as (prev: unknown) => unknown)(stateValues[index])
              : next;
          stateValues[index] = value;
          updates.push({ index, value });
        },
      ];
    },
    useRef: <T>(initial: T) => {
      const ref = { current: initial };
      refs.push(ref as { current: unknown });
      return ref;
    },
    useMemo: <T>(factory: () => T) => factory(),
    useCallback: <T>(callbackFn: T) => callbackFn,
    useId: () => "filmstrip-test-id",
    useReducer: <S>(_: unknown, initial: S) => [initial, () => undefined],
    useContext: () => undefined,
    useEffect: () => undefined,
    useLayoutEffect: () => undefined,
    useInsertionEffect: () => undefined,
    useSyncExternalStore: () => undefined,
    useTransition: () => [false, () => undefined],
    useDeferredValue: <T>(value: T) => value,
  };

  try {
    return { value: callback(), refs, updates };
  } finally {
    internals.H = previous;
  }
}

class FakeElement {
  dataset: { slideIndex?: string };

  constructor(slideIndex: string) {
    this.dataset = { slideIndex };
  }

  closest(): FakeElement {
    return this;
  }
}

function withFilmstripGlobals(
  run: (targetForIndex: (index: number) => unknown) => void,
) {
  const originalWindow = globalThis.window;
  const originalHTMLElement = globalThis.HTMLElement;

  (globalThis as unknown as { window: unknown }).window = {
    setTimeout: (callback: () => void) => {
      callback();
      return 0;
    },
  };
  (globalThis as unknown as { HTMLElement: unknown }).HTMLElement =
    FakeElement as unknown as typeof HTMLElement;

  try {
    run((index) => new FakeElement(String(index)));
  } finally {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
    (globalThis as unknown as { HTMLElement: unknown }).HTMLElement =
      originalHTMLElement;
  }
}

describe("Filmstrip ARIA pattern and keyboard behavior", () => {
  test("renders as a labelled list without listbox/option roles", () => {
    const html = renderToStaticMarkup(
      createElement(Filmstrip, filmstripProps()),
    );

    assert.match(html, /aria-label="Slide filmstrip"/);
    assert.match(html, /aria-label="Slides"/);
    assert.doesNotMatch(html, /role="listbox"/);
    assert.doesNotMatch(html, /role="option"/);
    assert.match(html, /Go to slide 2/);
    assert.match(html, /Duplicate slide 2/);
    assert.match(html, /Delete slide 2/);
    assert.match(html, /aria-current="true"/);
  });

  test("keeps Arrow/Home/End/Delete/Alt+Arrow behavior, focus restore, and announcements", () => {
    const selected: number[] = [];
    const deleted: string[] = [];
    const moved: Array<[string, number]> = [];
    const props = filmstripProps({
      onSelectSlide: (index) => selected.push(index),
      onDeleteSlide: (slideId) => deleted.push(slideId),
      onMoveSlide: (slideId, targetIndex) => moved.push([slideId, targetIndex]),
    });
    const {
      value: element,
      refs,
      updates,
    } = withMockHooks(() => Filmstrip(props));
    const list = findElement(element, (candidate) => candidate.type === "ol");
    assert.ok(list, "expected filmstrip list");

    const onKeyDown = (
      list.props as {
        onKeyDown?: (event: KeyboardEvent<HTMLOListElement>) => void;
      }
    ).onKeyDown;
    assert.equal(typeof onKeyDown, "function");

    const selectors: string[] = [];
    let focusCalls = 0;
    refs[0]!.current = {
      querySelector: (selector: string) => {
        selectors.push(selector);
        return { focus: () => (focusCalls += 1) };
      },
    };

    withFilmstripGlobals((targetForIndex) => {
      const keyEvent = (
        key: string,
        options: { altKey?: boolean; slideIndex?: number } = {},
      ) =>
        ({
          key,
          altKey: options.altKey ?? false,
          target: targetForIndex(options.slideIndex ?? props.activeSlideIndex),
          preventDefault: () => undefined,
        }) as unknown as KeyboardEvent<HTMLOListElement>;

      onKeyDown!(keyEvent("ArrowRight"));
      onKeyDown!(keyEvent("Home"));
      onKeyDown!(keyEvent("End"));
      onKeyDown!(keyEvent("ArrowRight", { altKey: true }));
      onKeyDown!(keyEvent("Delete"));
    });

    assert.deepEqual(selected, [2, 0, 2]);
    assert.deepEqual(moved, [["slide-2", 2]]);
    assert.deepEqual(deleted, ["slide-2"]);
    assert.equal(focusCalls, 5);
    assert.ok(
      selectors.some((selector) =>
        selector.includes(
          `[data-slide-index="2"] button[aria-label^="Go to slide"]`,
        ),
      ),
    );
    assert.ok(
      selectors.some((selector) =>
        selector.includes(
          `[data-slide-index="1"] button[aria-label^="Go to slide"]`,
        ),
      ),
    );

    const statusUpdates = updates
      .filter((update) => update.index === 0)
      .map((update) => update.value);
    assert.ok(statusUpdates.includes("Moved slide 2 to 3."));
    assert.ok(statusUpdates.includes("Deleted slide 2."));
  });
});
