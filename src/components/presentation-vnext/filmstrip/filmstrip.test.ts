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
import { FilmstripSlide } from "./filmstrip-slide";
import { MIN_DECK_SLIDES_MESSAGE } from "@/lib/presentation-vnext";
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

function withMockHooks<T>(
  callback: () => T,
  options: { stateOverrides?: Map<number, unknown> } = {},
): {
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
          options.stateOverrides?.get(index) ??
          (typeof initial === "function"
            ? (initial as () => unknown)()
            : initial);
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

  test("handles keyboard slide selection/reorder/delete flows with focus restore and announcements", () => {
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

      onKeyDown!(keyEvent("ArrowLeft"));
      onKeyDown!(keyEvent("ArrowRight"));
      onKeyDown!(keyEvent("Home"));
      onKeyDown!(keyEvent("End"));
      onKeyDown!(keyEvent("Enter", { slideIndex: 0 }));
      onKeyDown!(keyEvent(" ", { slideIndex: 2 }));
      onKeyDown!(keyEvent("ArrowLeft", { altKey: true }));
      onKeyDown!(keyEvent("ArrowRight", { altKey: true }));
      onKeyDown!(keyEvent("Delete"));
      onKeyDown!(keyEvent("Backspace", { slideIndex: 2 }));
    });

    assert.deepEqual(selected, [0, 2, 0, 2, 0, 2]);
    assert.deepEqual(moved, [
      ["slide-2", 0],
      ["slide-2", 2],
    ]);
    assert.deepEqual(deleted, ["slide-2", "slide-3"]);
    assert.equal(focusCalls, 8);
    assert.ok(
      selectors.some((selector) =>
        selector.includes(
          `[data-slide-index="0"] button[aria-label^="Go to slide"]`,
        ),
      ),
    );
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
    assert.ok(statusUpdates.includes("Moved slide 2 to 1."));
    assert.ok(statusUpdates.includes("Moved slide 2 to 3."));
    assert.ok(statusUpdates.includes("Deleted slide 2."));
    assert.ok(statusUpdates.includes("Deleted slide 3."));
  });

  test("announces the minimum-slide invariant and blocks deletion in one-slide decks", () => {
    const deleted: string[] = [];
    const props = filmstripProps({
      renderTree: renderTree(1),
      activeSlideIndex: 0,
      onDeleteSlide: (slideId) => deleted.push(slideId),
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

    refs[0]!.current = { querySelector: () => null };

    withFilmstripGlobals((targetForIndex) => {
      onKeyDown!({
        key: "Delete",
        target: targetForIndex(0),
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent<HTMLOListElement>);
    });

    assert.deepEqual(deleted, []);
    const statusUpdates = updates
      .filter((update) => update.index === 0)
      .map((update) => update.value);
    assert.ok(statusUpdates.includes(MIN_DECK_SLIDES_MESSAGE));
  });

  test("removes filmstrip tab stops when collapsed", () => {
    const html = renderToStaticMarkup(
      createElement(Filmstrip, filmstripProps({ collapsed: true })),
    );

    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /aria-label="Slides"[^>]*tabindex="-1"/);
    assert.match(
      html,
      /aria-label="Go to slide 1"[^>]*disabled=""[^>]*tabindex="-1"/,
    );
    assert.match(
      html,
      /aria-label="Add slide"[^>]*disabled=""[^>]*tabindex="-1"/,
    );
  });
});

describe("Filmstrip reduced-motion class guards", () => {
  test("adds reduced-motion guards for filmstrip preview and collapse chrome transitions", () => {
    const html = renderToStaticMarkup(
      withMockHooks(() => Filmstrip(filmstripProps()), {
        stateOverrides: new Map([
          [
            1,
            {
              isDragging: true,
              dragSourceIndex: 1,
              dragTargetIndex: 2,
              dragPreview: {
                index: 1,
                x: 16,
                y: 24,
                width: 96,
                offsetX: 12,
                offsetY: 8,
              },
            },
          ],
        ]),
      }).value,
    );

    assert.match(
      html,
      /transition-transform duration-150 ease-out motion-reduce:rotate-0 motion-reduce:transition-none/,
    );
    assert.match(
      html,
      /transition-opacity duration-150 motion-reduce:transition-none/,
    );
  });

  test("adds reduced-motion guards for drag-state and thumbnail/action transitions", () => {
    const deck = renderTree();
    const slideTree = deck.slides[0]!;
    const html = renderToStaticMarkup(
      createElement(FilmstripSlide, {
        slideTree,
        canvas: deck.canvas,
        index: 0,
        isActive: true,
        slideId: slideTree.id,
        totalSlides: deck.slides.length,
        isDragging: true,
        onSelect: () => undefined,
        onDuplicate: () => undefined,
        onDelete: () => undefined,
        onPointerDown: () => undefined,
      }),
    );

    assert.match(
      html,
      /transition-\[opacity,transform\] duration-150 ease-out motion-reduce:transition-none scale-\[0\.98\] opacity-40 motion-reduce:scale-100/,
    );
    assert.match(
      html,
      /transition-transform duration-150 ease-out motion-reduce:transition-none/,
    );
    assert.match(
      html,
      /transition-\[box-shadow\] duration-150 ease-out motion-reduce:transition-none/,
    );
    assert.match(
      html,
      /transition-opacity motion-reduce:transition-none focus-within:opacity-100 group-hover:opacity-100/,
    );
  });
});
