import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { isValidElement, type ReactElement, type ReactNode } from "react";

import type { DocumentBlock } from "@/lib/content/document-blocks";
import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";
import type { ConnectorNode, DeckV7 } from "@/lib/presentation-vnext/schema";
import {
  buildDeckV7,
  buildImageAsset,
  buildImageNode,
  buildLayoutBox,
  buildShapeNode,
  buildSlideV7,
  buildTableNode,
  buildTextContent,
  buildTextNode,
  buildVisualNode,
} from "@/test/builders/deck-v7";
import {
  SlideEditorCloseConfirmDialog,
  SlideEditorInspectorRegion,
  SlideEditorVNext,
  type SlideEditorVNextProps,
} from "./slide-editor-vnext";

type ReactInternals = {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H: unknown;
  };
};

type ElementProps = Record<string, unknown>;

type FakeEventListener = (event: Record<string, unknown>) => void;

type FakeWindow = {
  listeners: Map<string, Set<FakeEventListener>>;
  addEventListener: (type: string, listener: FakeEventListener) => void;
  removeEventListener: (type: string, listener: FakeEventListener) => void;
  dispatch: (type: string, event: Record<string, unknown>) => void;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
  matchMedia: (query: string) => MediaQueryList;
  getComputedStyle: () => Pick<
    CSSStyleDeclaration,
    "paddingLeft" | "paddingRight" | "paddingTop" | "paddingBottom"
  >;
};

type FakeBrowserGlobals = {
  window?: unknown;
  document?: unknown;
  navigator?: unknown;
  HTMLElement?: unknown;
  File?: unknown;
  ResizeObserver?: unknown;
};

class FakeHTMLElement {
  private readonly dataset: Record<string, string>;
  private readonly rect: DOMRect;
  readonly focused: { count: number };

  constructor(
    dataset: Record<string, string> = {},
    frame: DOMRect = rect(0, 0, 1000, 562.5),
    focused: { count: number } = { count: 0 },
  ) {
    this.dataset = dataset;
    this.rect = frame;
    this.focused = focused;
  }

  closest(selector: string): FakeHTMLElement | null {
    if (selector.includes("input") || selector.includes("button")) return null;
    if (selector.includes("[data-slide-canvas-vnext")) return canvasElement;
    if (selector.includes("[data-node-id]")) {
      return this.dataset.nodeId ? this : null;
    }
    if (
      selector.includes("[data-resize-handle]") ||
      selector.includes("[data-crop-handle]") ||
      selector.includes("[data-rotation-handle]") ||
      selector.includes("[data-connector-endpoint]")
    ) {
      return null;
    }
    return null;
  }

  querySelector(): FakeHTMLElement | null {
    return canvasElement;
  }

  getBoundingClientRect(): DOMRect {
    return this.rect;
  }

  focus(): void {
    this.focused.count += 1;
  }

  setPointerCapture(): void {
    // Test double for pointer capture.
  }

  releasePointerCapture(): void {
    // Test double for pointer capture.
  }
}

const canvasElement = new FakeHTMLElement(
  { slideCanvasVnext: "true" },
  rect(10, 20, 1000, 562.5),
);

class FakeFile {
  readonly name: string;
  readonly type: string;

  constructor(
    _parts: unknown[],
    name: string,
    options: { type?: string } = {},
  ) {
    this.name = name;
    this.type = options.type ?? "";
  }
}

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function installBrowserGlobals({
  desktop = false,
}: { desktop?: boolean } = {}) {
  const globalRef = globalThis as typeof globalThis & FakeBrowserGlobals;
  const previous = new Map<PropertyKey, PropertyDescriptor | undefined>(
    [
      "window",
      "document",
      "navigator",
      "HTMLElement",
      "File",
      "ResizeObserver",
    ].map((key) => [key, Object.getOwnPropertyDescriptor(globalRef, key)]),
  );
  const listeners = new Map<string, Set<FakeEventListener>>();
  const fakeWindow: FakeWindow = {
    listeners,
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set<FakeEventListener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type, listener) =>
      listeners.get(type)?.delete(listener),
    dispatch: (type, event) => {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => {
      callback(0);
      return 1;
    },
    cancelAnimationFrame: () => undefined,
    matchMedia: () =>
      ({
        matches: desktop,
        media: "(min-width: 1024px)",
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
      }) as MediaQueryList,
    getComputedStyle: () => ({
      paddingLeft: "0",
      paddingRight: "0",
      paddingTop: "0",
      paddingBottom: "0",
    }),
  };

  Object.defineProperty(globalRef, "window", {
    configurable: true,
    writable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalRef, "document", {
    configurable: true,
    writable: true,
    value: {
      querySelector: () => new FakeHTMLElement(),
    },
  });
  Object.defineProperty(globalRef, "navigator", {
    configurable: true,
    writable: true,
    value: { platform: "MacIntel", userAgent: "node" },
  });
  Object.defineProperty(globalRef, "HTMLElement", {
    configurable: true,
    writable: true,
    value: FakeHTMLElement,
  });
  Object.defineProperty(globalRef, "File", {
    configurable: true,
    writable: true,
    value: FakeFile,
  });
  Object.defineProperty(globalRef, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: class {
      observe(): void {
        // No-op in direct-render tests.
      }
      disconnect(): void {
        // No-op in direct-render tests.
      }
    },
  });

  return {
    window: fakeWindow,
    restore: () => {
      for (const key of previous.keys()) {
        const descriptor = previous.get(key);
        if (descriptor) {
          Object.defineProperty(globalRef, key, descriptor);
        } else {
          Reflect.deleteProperty(globalRef, key);
        }
      }
    },
  };
}

function createHookRenderer({
  runEffects = false,
}: { runEffects?: boolean } = {}) {
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
        useEffect: (effect?: () => void | (() => void)) => {
          hookIndex++;
          if (runEffects) effect?.();
        },
        useLayoutEffect: (effect?: () => void | (() => void)) => {
          hookIndex++;
          if (runEffects) effect?.();
        },
        useInsertionEffect: (effect?: () => void | (() => void)) => {
          hookIndex++;
          if (runEffects) effect?.();
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

function propsOf(element: ReactElement): ElementProps {
  return element.props as ElementProps;
}

function typeName(type: unknown): string {
  if (typeof type === "string") return type;
  if (typeof type === "function") return type.name;
  if (typeof type === "object" && type !== null && "displayName" in type) {
    return String((type as { displayName?: string }).displayName);
  }
  return String(type);
}

function findProps(
  tree: ReactNode,
  predicate: (props: ElementProps, element: ReactElement) => boolean,
): ElementProps {
  const element = collectElements(tree).find((candidate) =>
    predicate(propsOf(candidate), candidate),
  );
  assert.ok(element);
  return propsOf(element);
}

function maybeProps(
  tree: ReactNode,
  predicate: (props: ElementProps, element: ReactElement) => boolean,
): ElementProps | undefined {
  const element = collectElements(tree).find((candidate) =>
    predicate(propsOf(candidate), candidate),
  );
  return element ? propsOf(element) : undefined;
}

function clickByLabel(tree: ReactNode, label: string): unknown {
  const props = maybeProps(
    tree,
    (candidate) => candidate["aria-label"] === label,
  );
  assert.ok(
    props,
    `Missing aria-label ${label}. Available: ${collectElements(tree)
      .map((element) => propsOf(element)["aria-label"])
      .filter((value): value is string => typeof value === "string")
      .join(", ")}`,
  );
  const onClick = props.onClick;
  assert.equal(typeof onClick, "function", label);
  return (onClick as () => unknown)();
}

function clickPopoverTrigger(tree: ReactNode, popoverLabel: string): unknown {
  const props = findProps(
    tree,
    (candidate) =>
      candidate["aria-label"] === popoverLabel && "trigger" in candidate,
  );
  const trigger = props.trigger;
  assert.ok(isValidElement(trigger));
  const onClick = (trigger.props as ElementProps).onClick;
  assert.equal(typeof onClick, "function", popoverLabel);
  return (onClick as () => unknown)();
}

function clickByLabelPrefix(tree: ReactNode, prefix: string): unknown {
  const props = findProps(
    tree,
    (candidate) =>
      typeof candidate["aria-label"] === "string" &&
      candidate["aria-label"].startsWith(prefix),
  );
  const onClick = props.onClick;
  assert.equal(typeof onClick, "function", prefix);
  return (onClick as () => unknown)();
}

async function invokeVisibleMenuClicks(tree: ReactNode): Promise<number> {
  let invoked = 0;
  const handlerPromises: Promise<unknown>[] = [];
  for (const element of collectElements(tree)) {
    const props = propsOf(element);
    if (
      (props.role === "menuitem" ||
        props.role === "menuitemradio" ||
        props.role === "menuitemcheckbox") &&
      typeof props.onClick === "function"
    ) {
      handlerPromises.push(Promise.resolve((props.onClick as () => unknown)()));
      invoked += 1;
    }
  }
  await Promise.all(handlerPromises);
  return invoked;
}

function keyEvent(key: string, extras: Partial<Record<string, unknown>> = {}) {
  let prevented = 0;
  let stopped = 0;
  return {
    key,
    target: canvasElement,
    currentTarget: canvasElement,
    preventDefault: () => {
      prevented += 1;
    },
    stopPropagation: () => {
      stopped += 1;
    },
    get prevented() {
      return prevented;
    },
    get stopped() {
      return stopped;
    },
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...extras,
  };
}

function pointerEvent(
  x: number,
  y: number,
  extras: Partial<Record<string, unknown>> = {},
) {
  return {
    pointerId: 1,
    button: 0,
    clientX: x,
    clientY: y,
    target: canvasElement,
    currentTarget: canvasElement,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    ...extras,
  };
}

function createConnectorNode(
  overrides: Partial<ConnectorNode> = {},
): ConnectorNode {
  return {
    id: "connector-a",
    type: "connector" as const,
    role: "connector" as const,
    layout: buildLayoutBox({ frame: { x: 20, y: 50, w: 40, h: 8 }, zIndex: 6 }),
    style: { ref: "connector.primary" as const },
    content: {
      from: {
        kind: "node" as const,
        nodeId: "shape-a",
        anchor: "right" as const,
      },
      to: { kind: "point" as const, point: { x: 100, y: 50 } },
      routing: "straight" as const,
    },
    ...overrides,
  };
}

function coverageDeck() {
  const sourceNode = buildTextNode({
    id: "text-source",
    name: "Source text",
    layout: buildLayoutBox({ frame: { x: 8, y: 8, w: 34, h: 12 }, zIndex: 1 }),
    source: {
      documentId: "doc-state",
      blockId: "block-1",
      blockKind: "text",
      contentHash: "stale-hash",
      display: { blockLabel: "Old source" },
    },
  });
  const slide = buildSlideV7(
    "content",
    [
      sourceNode,
      buildTextNode({
        id: "text-a",
        role: "title",
        layout: buildLayoutBox({
          frame: { x: 10, y: 24, w: 25, h: 10 },
          zIndex: 2,
        }),
        content: buildTextContent(["Editable title"]),
      }),
      buildShapeNode({
        id: "shape-a",
        layout: buildLayoutBox({
          frame: { x: 42, y: 20, w: 20, h: 16 },
          zIndex: 3,
        }),
        content: { shape: "rect", text: buildTextContent(["Shape text"]) },
        localStyle: { fill: { type: "solid", color: "#abcdef" } },
      }),
      buildImageNode("img-001", {
        id: "image-a",
        layout: buildLayoutBox({
          frame: { x: 65, y: 20, w: 24, h: 24 },
          zIndex: 4,
        }),
        content: {
          assetId: "img-001",
          crop: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      }),
      buildVisualNode({
        id: "visual-a",
        layout: buildLayoutBox({
          frame: { x: 8, y: 42, w: 24, h: 20 },
          zIndex: 5,
        }),
      }),
      createConnectorNode(),
      buildTableNode({
        id: "table-a",
        layout: buildLayoutBox({
          frame: { x: 40, y: 46, w: 35, h: 24 },
          zIndex: 7,
        }),
      }),
    ],
    { id: "slide-a", name: "Coverage slide" },
  );
  return buildDeckV7(
    [
      slide,
      buildSlideV7("executive-summary", [buildTextNode({ id: "text-b" })], {
        id: "slide-b",
      }),
    ],
    {
      title: "Coverage deck",
      assets: {
        images: {
          "img-001": buildImageAsset("img-001", { alt: "Existing image" }),
        },
      },
    },
  );
}

function documentBlocks(): DocumentBlock[] {
  return [
    {
      kind: "text",
      blockType: "paragraph",
      blockId: "block-1",
      text: "Fresh source text",
    },
    {
      kind: "text",
      blockType: "heading",
      level: 2,
      blockId: "block-2",
      text: "Second source block",
    },
  ];
}

function diagnostics(): PresentationDiagnostic[] {
  const target = {
    scope: "node" as const,
    slideId: "slide-a",
    nodeId: "shape-a",
  };
  return [
    {
      code: "local-style-overrides",
      category: "theme",
      severity: "warning",
      target,
      message: "Shape has a local override",
      action: { type: "remove-override", target },
    },
    {
      code: "unknown-style-ref",
      category: "theme",
      severity: "warning",
      target,
      message: "Shape uses an unknown style",
      action: { type: "replace-style-ref", target },
    },
    {
      code: "slot-over-capacity",
      category: "render",
      severity: "warning",
      target: { scope: "slide", slideId: "slide-a" },
      message: "Slide is dense",
      action: {
        type: "choose-denser-layout",
        target: { scope: "slide", slideId: "slide-a" },
      },
    },
    {
      code: "stale-source",
      category: "source",
      severity: "warning",
      target: {
        scope: "source",
        slideId: "slide-a",
        nodeId: "text-source",
        blockId: "block-1",
      },
      message: "Source is stale",
      action: {
        type: "open-source-review",
        target: {
          scope: "source",
          slideId: "slide-a",
          nodeId: "text-source",
          blockId: "block-1",
        },
      },
    },
    {
      code: "missing-asset",
      category: "asset",
      severity: "error",
      target: {
        scope: "asset",
        slideId: "slide-a",
        nodeId: "image-a",
        assetId: "missing",
      },
      message: "Image asset is missing",
      action: {
        type: "open-asset-panel",
        target: {
          scope: "asset",
          slideId: "slide-a",
          nodeId: "image-a",
          assetId: "missing",
        },
      },
    },
  ];
}

function createHarness(
  overrides: Partial<SlideEditorVNextProps> = {},
  rendererOptions: { runEffects?: boolean } = {},
) {
  const renderer = createHookRenderer(rendererOptions);
  const changes: DeckV7[] = [];
  let deck = overrides.deck ?? coverageDeck();
  let saveShouldFail = false;
  let presentShouldFail = false;
  let shareShouldThrow = false;
  let exportShouldThrow = false;
  let visualShouldThrow = false;
  const calls = {
    close: 0,
    save: 0,
    present: 0,
    share: 0,
    export: 0,
    upload: 0,
    visual: 0,
    undo: 0,
    redo: 0,
  };
  const props = (): SlideEditorVNextProps => ({
    documentId: "doc-state",
    diagnostics: diagnostics(),
    hasUnsavedWork: true,
    canUndo: true,
    canRedo: true,
    onUndo: () => {
      calls.undo += 1;
    },
    onRedo: () => {
      calls.redo += 1;
    },
    documentBlocks: documentBlocks(),
    onDeckChange: (nextDeck) => {
      changes.push(nextDeck);
      deck = nextDeck;
    },
    onSave: async () => {
      calls.save += 1;
      return saveShouldFail
        ? { ok: false as const, error: "Save failed for test" }
        : { ok: true as const, data: undefined };
    },
    onClose: () => {
      calls.close += 1;
    },
    onPresent: async () => {
      calls.present += 1;
      return presentShouldFail
        ? { ok: false as const, error: "Present failed for test" }
        : { ok: true as const, data: undefined };
    },
    onShare: async () => {
      calls.share += 1;
      if (shareShouldThrow) throw new Error("share failed");
      return { ok: true as const, data: undefined };
    },
    onExportPptx: async () => {
      calls.export += 1;
      if (exportShouldThrow) throw new Error("export failed");
    },
    onUploadImage: async (file) => {
      calls.upload += 1;
      return {
        src: `https://example.com/${file.name}`,
        assetId: `asset-${calls.upload}`,
        alt: file.name,
      };
    },
    onPickVisual: async () => {
      calls.visual += 1;
      if (visualShouldThrow) throw new Error("visual failed");
      return { visualId: `visual-${calls.visual}`, alt: "Picked visual" };
    },
    ...overrides,
    deck,
  });

  return {
    calls,
    changes,
    get deck() {
      return deck;
    },
    setSaveFailure(value: boolean) {
      saveShouldFail = value;
    },
    setPresentFailure(value: boolean) {
      presentShouldFail = value;
    },
    setShareThrow(value: boolean) {
      shareShouldThrow = value;
    },
    setExportThrow(value: boolean) {
      exportShouldThrow = value;
    },
    setVisualThrow(value: boolean) {
      visualShouldThrow = value;
    },
    render() {
      return renderer.run(() => SlideEditorVNext(props()));
    },
  };
}

function contextToolbarProps(tree: ReactNode): ElementProps {
  return findProps(
    tree,
    (_props, element) => typeName(element.type) === "ContextToolbar",
  );
}

function canvasProps(tree: ReactNode): ElementProps {
  return findProps(
    tree,
    (props) => typeof props.onNodePointerDown === "function",
  );
}

function inspectorShellProps(tree: ReactNode): ElementProps {
  const region = findProps(
    tree,
    (_props, element) =>
      typeName(element.type) === "SlideEditorInspectorRegion",
  );
  const renderInspectorShell = region.renderInspectorShell;
  assert.equal(typeof renderInspectorShell, "function");
  const shell = (renderInspectorShell as () => ReactNode)();
  return findProps(
    shell,
    (_props, element) => typeName(element.type) === "InspectorShell",
  );
}

function rootProps(tree: ReactNode): ElementProps {
  return findProps(
    tree,
    (props) => props["data-slide-editor-vnext"] === "true",
  );
}

function fileInputProps(tree: ReactNode, index: number): ElementProps {
  return collectElements(tree)
    .map(propsOf)
    .filter((props) => props.type === "file")[index];
}

async function flushAsyncHandlers() {
  await Promise.resolve();
  await Promise.resolve();
}

test("SlideEditorVNext direct state coverage drives toolbar, source, diagnostics, and close flows", async () => {
  const browser = installBrowserGlobals();
  try {
    const harness = createHarness();
    let tree = harness.render();

    clickByLabel(tree, "Rename deck");
    tree = harness.render();
    const titleInput = findProps(
      tree,
      (props) => props["aria-label"] === "Deck title",
    );
    (titleInput.onChange as (event: unknown) => void)({
      currentTarget: { value: "Renamed coverage deck" },
    });
    (titleInput.onKeyDown as (event: unknown) => void)(keyEvent("Enter"));
    tree = harness.render();

    clickPopoverTrigger(tree, "Document source commands");
    tree = harness.render();

    const sourceReview = findProps(
      tree,
      (_props, element) => typeName(element.type) === "SourceReviewPanel",
    );
    assert.ok((sourceReview.items as readonly unknown[]).length > 0);
    const block = (sourceReview.sourceBlocks as readonly unknown[])[1];
    (sourceReview.onSelect as (slideId: string, nodeId: string) => void)(
      "slide-a",
      "text-source",
    );
    (sourceReview.onRefresh as (slideId: string, nodeId: string) => void)(
      "slide-a",
      "text-source",
    );
    (sourceReview.onUnlink as (slideId: string, nodeId: string) => void)(
      "slide-a",
      "text-source",
    );
    (
      sourceReview.onRelink as (
        slideId: string,
        nodeId: string,
        block: unknown,
      ) => void
    )("slide-a", "text-source", block);
    (sourceReview.onDismiss as (slideId: string, nodeId: string) => void)(
      "slide-a",
      "text-source",
    );
    (sourceReview.onRefreshAll as () => void)();
    tree = harness.render();
    assert.ok((await invokeVisibleMenuClicks(tree)) >= 2);
    tree = harness.render();

    clickPopoverTrigger(tree, "Deck chrome controls");
    tree = harness.render();
    const deckChromePanel = findProps(
      tree,
      (_props, element) => typeName(element.type) === "DeckChromePanel",
    );
    (deckChromePanel.onUpdateChrome as (patch: unknown) => void)({
      logo: { enabled: false },
    });
    (deckChromePanel.onUpdateSlideProps as (patch: unknown) => void)({
      deckChrome: { footer: { mode: "hidden" } },
    });
    tree = harness.render();

    clickPopoverTrigger(tree, "More toolbar commands");
    tree = harness.render();
    assert.ok((await invokeVisibleMenuClicks(tree)) >= 4);
    tree = harness.render();

    clickPopoverTrigger(tree, "Zoom presets");
    tree = harness.render();
    assert.ok((await invokeVisibleMenuClicks(tree)) >= 1);
    const zoomRange = findProps(
      tree,
      (props) => props["aria-label"] === "Slide zoom",
    );
    (zoomRange.onChange as (event: unknown) => void)({
      currentTarget: { value: "150" },
    });
    tree = harness.render();

    const toolbar = contextToolbarProps(tree);
    (toolbar.onInsertText as () => void)();
    (toolbar.onInsertShape as () => void)();
    await (toolbar.onInsertVisual as () => Promise<void>)();
    (toolbar.onInsertConnector as () => void)();
    (toolbar.onInsertTable as () => void)();
    (toolbar.onInsertSlide as () => void)();
    tree = harness.render();
    const addSlideDialog = findProps(
      tree,
      (props) => props["aria-label"] === "Add semantic slide",
    );
    (addSlideDialog.onKeyDown as (event: unknown) => void)(keyEvent("Escape"));
    tree = harness.render();
    (contextToolbarProps(tree).onInsertSlide as () => void)();
    tree = harness.render();
    const picker = findProps(
      tree,
      (_props, element) => typeName(element.type) === "AddSlideTemplatePicker",
    );
    (picker.onChoose as (choice: unknown) => void)({ kind: "content" });
    tree = harness.render();
    const toolbarAfterPicker = contextToolbarProps(tree);
    (toolbarAfterPicker.onDuplicateSlide as () => void)();
    (toolbarAfterPicker.onDeleteSlide as () => void)();
    (toolbarAfterPicker.onUpdateSlideLocalStyle as (patch: unknown) => void)({
      slide: { background: { type: "solid", color: "#123456" } },
    });
    tree = harness.render();

    const inspector = inspectorShellProps(tree);
    (inspector.onUpdateControls as (patch: unknown) => void)({
      density: "dense",
    });
    (inspector.onUpdateProps as (patch: unknown) => void)({
      chrome: "minimal",
    });
    (inspector.onUpdateDeckChrome as (patch: unknown) => void)({
      footer: { enabled: true, text: "Footer" },
    });
    (inspector.onUpdateSlideAttributes as (patch: unknown) => void)({
      name: "Updated slide",
      notes: "Speaker notes",
    });
    (inspector.onUpdateSlideSource as (source: unknown) => void)({
      blockId: "slide-source",
      blockKind: "text",
    });
    (inspector.onResetSlideLocalStyle as () => void)();
    (inspector.onReapplyTemplate as (kind: string) => void)("content");
    (inspector.onToggleSelectionMode as () => void)();
    (inspector.onSelectLayer as (nodeId: string) => void)("shape-a");
    (inspector.onUpdateLayer as (nodeId: string, patch: unknown) => void)(
      "shape-a",
      { locked: true, hidden: false },
    );
    (inspector.onReorderLayer as (nodeId: string, targetIndex: number) => void)(
      "shape-a",
      0,
    );
    tree = harness.render();

    const canvas = canvasProps(tree);
    (canvas.onNodeFocus as (nodeId: string, event: unknown) => void)(
      "shape-a",
      {},
    );
    tree = harness.render();
    const selectedToolbar = contextToolbarProps(tree);
    (selectedToolbar.onUpdateSelectedAttributes as (patch: unknown) => void)({
      locked: false,
    });
    (selectedToolbar.onUpdateSelectedLayout as (patch: unknown) => void)({
      frame: { x: -10, y: 4, w: 200, h: 10 },
      rotation: 361,
      zIndex: 9.8,
    });
    (selectedToolbar.onUpdateSelectedContent as (patch: unknown) => void)({
      shape: "ellipse",
    });
    (selectedToolbar.onUpdateSelectedLocalStyle as (patch: unknown) => void)({
      fill: { type: "solid", color: "#ff00ff" },
    });
    (selectedToolbar.onResetToTheme as (() => void) | undefined)?.();
    (selectedToolbar.onAlignSelection as (mode: string) => void)("left");
    (selectedToolbar.onDistributeSelection as (mode: string) => void)(
      "horizontal",
    );
    (selectedToolbar.onMatchSize as (mode: string) => void)("both");
    tree = harness.render();

    clickByLabelPrefix(tree, "Open deck diagnostics review");
    tree = harness.render();
    const review = findProps(
      tree,
      (_props, element) => typeName(element.type) === "DeckDiagnosticsReview",
    );
    const reviewDiagnostics = review.diagnostics as PresentationDiagnostic[];
    (review.onNavigate as (diagnostic: PresentationDiagnostic) => void)(
      reviewDiagnostics[0],
    );
    for (const diagnostic of reviewDiagnostics) {
      if (diagnostic.action) {
        (
          review.onAction as (
            action: unknown,
            diagnostic: PresentationDiagnostic,
          ) => void
        )(diagnostic.action, diagnostic);
      }
    }
    (
      review.onAction as (
        action: unknown,
        diagnostic: PresentationDiagnostic,
      ) => void
    )(
      {
        type: "refresh-source",
        target: {
          scope: "source",
          slideId: "slide-a",
          nodeId: "text-source",
          blockId: "block-1",
        },
      },
      reviewDiagnostics[3],
    );
    (
      review.onAction as (
        action: unknown,
        diagnostic: PresentationDiagnostic,
      ) => void
    )(
      {
        type: "unlink-source",
        target: {
          scope: "source",
          slideId: "slide-a",
          nodeId: "text-source",
          blockId: "block-1",
        },
      },
      reviewDiagnostics[3],
    );
    (
      review.onAction as (
        action: unknown,
        diagnostic: PresentationDiagnostic,
      ) => void
    )(
      {
        type: "relink-source",
        target: {
          scope: "source",
          slideId: "slide-a",
          nodeId: "text-source",
          blockId: "block-1",
        },
      },
      reviewDiagnostics[3],
    );
    (review.onClose as () => void)();
    tree = harness.render();

    harness.setSaveFailure(true);
    await clickByLabel(tree, "Present slides");
    tree = harness.render();
    assert.ok(maybeProps(tree, (props) => props.role === "alert"));
    harness.setSaveFailure(false);
    harness.setPresentFailure(true);
    await clickByLabel(tree, "Present slides");
    harness.setPresentFailure(false);
    harness.setShareThrow(true);
    await clickByLabel(tree, "Share slides");
    harness.setShareThrow(false);
    harness.setExportThrow(true);
    await (
      contextToolbarProps(harness.render())
        .onInsertVisual as () => Promise<void>
    )();
    await clickByLabel(harness.render(), "Save slide deck");
    await clickByLabel(harness.render(), "Close slide editor");
    tree = harness.render();
    const closeDialog = maybeProps(
      tree,
      (_props, element) =>
        typeName(element.type) === "SlideEditorCloseConfirmDialog",
    );
    assert.equal(harness.calls.close, 0);
    assert.ok(closeDialog);
    (closeDialog.onDiscard as () => void)();

    assert.ok(harness.changes.length >= 20);
    assert.ok(harness.calls.save >= 3);
    assert.equal(harness.calls.close, 1);
    assert.ok(harness.calls.visual >= 2);
  } finally {
    browser.restore();
  }
});

test("SlideEditorVNext direct state coverage drives keyboard, inline edit, upload, and gestures", async () => {
  const browser = installBrowserGlobals();
  try {
    const harness = createHarness();
    let tree = harness.render();
    let canvas = canvasProps(tree);

    (canvas.onNodeFocus as (nodeId: string, event: unknown) => void)(
      "text-a",
      {},
    );
    tree = harness.render();
    const frame = findProps(
      tree,
      (props) => props["data-slide-stage-frame"] === "true",
    );
    const ref = frame.ref as (el: FakeHTMLElement | null) => void;
    ref(canvasElement);
    tree = harness.render();
    (rootProps(tree).onKeyDown as (event: unknown) => void)(keyEvent("Enter"));
    tree = harness.render();
    const inlineEditor = findProps(
      tree,
      (_props, element) => typeName(element.type) === "InlineTextEditorVNext",
    );
    (inlineEditor.onTabNext as () => void)();
    (inlineEditor.onTabPrev as () => void)();
    (inlineEditor.onCommit as (nodeId: string, paragraphs: unknown) => void)(
      "text-a",
      [{ id: "p-new", text: "Committed" }],
    );
    tree = harness.render();

    const firstInput = fileInputProps(tree, 0);
    const secondInput = fileInputProps(tree, 1);
    (firstInput.ref as { current: { click: () => void } | null }).current = {
      click: () => undefined,
    };
    (secondInput.ref as { current: { click: () => void } | null }).current = {
      click: () => undefined,
    };
    const toolbar = contextToolbarProps(tree);
    (toolbar.onInsertImage as () => void)();
    (firstInput.onChange as (event: unknown) => void)({
      currentTarget: {
        files: [new FakeFile([], "insert.png", { type: "image/png" })],
        value: "x",
      },
    });
    await flushAsyncHandlers();
    canvas = canvasProps(harness.render());
    (canvas.onNodeFocus as (nodeId: string, event: unknown) => void)(
      "image-a",
      {},
    );
    tree = harness.render();
    (contextToolbarProps(tree).onReplaceImage as () => void)();
    (firstInput.onChange as (event: unknown) => void)({
      currentTarget: {
        files: [new FakeFile([], "replace.jpg", { type: "image/jpeg" })],
        value: "x",
      },
    });
    await flushAsyncHandlers();
    tree = harness.render();
    const inspector = inspectorShellProps(tree);
    (inspector.onUploadSlideBackgroundImage as () => void)();
    (secondInput.onChange as (event: unknown) => void)({
      currentTarget: {
        files: [new FakeFile([], "background.webp", { type: "image/webp" })],
        value: "x",
      },
    });
    await flushAsyncHandlers();

    canvas = canvasProps(harness.render());
    (canvas.onNodeFocus as (nodeId: string, event: unknown) => void)(
      "visual-a",
      {},
    );
    await (
      contextToolbarProps(harness.render())
        .onReplaceVisual as () => Promise<void>
    )();
    harness.setVisualThrow(true);
    await (
      contextToolbarProps(harness.render())
        .onReplaceVisual as () => Promise<void>
    )();
    harness.setVisualThrow(false);

    const rootKeyDown = rootProps(harness.render()).onKeyDown as (
      event: unknown,
    ) => void;
    rootKeyDown(keyEvent("a", { metaKey: true }));
    rootKeyDown(keyEvent("c", { metaKey: true }));
    rootKeyDown(keyEvent("v", { metaKey: true }));
    rootKeyDown(keyEvent("ArrowRight"));
    rootKeyDown(keyEvent("ArrowDown", { altKey: true, shiftKey: true }));
    rootKeyDown(keyEvent("d", { metaKey: true }));
    rootKeyDown(keyEvent("z", { metaKey: true }));
    rootKeyDown(keyEvent("z", { metaKey: true, shiftKey: true }));
    rootKeyDown(keyEvent("y", { metaKey: true }));
    rootKeyDown(keyEvent("?"));
    rootKeyDown(keyEvent("Escape"));
    tree = harness.render();

    canvas = canvasProps(tree);
    (canvas.onNodeFocus as (nodeId: string, event: unknown) => void)(
      "shape-a",
      {},
    );
    const connectorKeyDown = rootProps(harness.render()).onKeyDown as (
      event: unknown,
    ) => void;
    connectorKeyDown(keyEvent("c"));
    connectorKeyDown(keyEvent("Tab"));
    connectorKeyDown(keyEvent("Enter"));
    canvas = canvasProps(harness.render());
    (canvas.onNodeFocus as (nodeId: string, event: unknown) => void)(
      "connector-a",
      {},
    );
    (rootProps(harness.render()).onKeyDown as (event: unknown) => void)(
      keyEvent("c"),
    );

    canvas = canvasProps(harness.render());
    (canvas.onNodePointerDown as (nodeId: string, event: unknown) => void)(
      "shape-a",
      pointerEvent(520, 260),
    );
    browser.window.dispatch("pointermove", pointerEvent(620, 300));
    browser.window.dispatch("pointerup", pointerEvent(620, 300));
    canvas = canvasProps(harness.render());
    (canvas.onNodePointerDown as (nodeId: string, event: unknown) => void)(
      "shape-a",
      pointerEvent(520, 260, { altKey: true }),
    );
    browser.window.dispatch("pointermove", pointerEvent(650, 330));
    browser.window.dispatch("pointerup", pointerEvent(650, 330));
    canvas = canvasProps(harness.render());
    (
      canvas.onResizeHandlePointerDown as (
        nodeId: string,
        handle: string,
        event: unknown,
      ) => void
    )("shape-a", "se", pointerEvent(640, 340));
    browser.window.dispatch(
      "pointermove",
      pointerEvent(720, 410, { shiftKey: true }),
    );
    browser.window.dispatch("pointerup", pointerEvent(720, 410));
    canvas = canvasProps(harness.render());
    (
      canvas.onCropHandlePointerDown as (
        nodeId: string,
        handle: string,
        event: unknown,
      ) => void
    )("image-a", "left", pointerEvent(675, 230));
    browser.window.dispatch("pointermove", pointerEvent(705, 230));
    browser.window.dispatch("pointerup", pointerEvent(705, 230));
    canvas = canvasProps(harness.render());
    (
      canvas.onRotationHandlePointerDown as (
        nodeId: string,
        event: unknown,
      ) => void
    )("shape-a", pointerEvent(540, 180));
    browser.window.dispatch(
      "pointermove",
      pointerEvent(600, 220, { altKey: true }),
    );
    browser.window.dispatch("pointerup", pointerEvent(600, 220));
    canvas = canvasProps(harness.render());
    (
      canvas.onConnectorEndpointPointerDown as (
        nodeId: string,
        endpoint: string,
        event: unknown,
      ) => void
    )("connector-a", "to", pointerEvent(650, 310));
    browser.window.dispatch("pointermove", pointerEvent(830, 370));
    browser.window.dispatch("pointerup", pointerEvent(830, 370));

    const stage = findProps(
      harness.render(),
      (props) => props["data-slide-stage-shell"] === "true",
    );
    (stage.onPointerDown as (event: unknown) => void)(pointerEvent(200, 140));
    browser.window.dispatch("pointermove", pointerEvent(700, 420));
    browser.window.dispatch("pointerup", pointerEvent(700, 420));
    (stage.onDoubleClick as (event: unknown) => void)(pointerEvent(400, 240));
    (stage.onPointerMove as (event: unknown) => void)(pointerEvent(410, 250));
    (stage.onPointerLeave as () => void)();
    (stage.onClick as (event: unknown) => void)({ target: canvasElement });

    assert.ok(
      harness.changes.length >= 8,
      `changes: ${harness.changes.length}`,
    );
    assert.ok(harness.calls.upload >= 3);
    assert.ok(harness.calls.undo >= 1);
    assert.ok(harness.calls.redo >= 2);
  } finally {
    browser.restore();
  }
});

test("SlideEditorVNext direct state coverage drives desktop toolbar branches", async () => {
  const browser = installBrowserGlobals({ desktop: true });
  try {
    const harness = createHarness({}, { runEffects: true });
    harness.render();
    let tree = harness.render();

    const selects = collectElements(tree)
      .map(propsOf)
      .filter(
        (props) => typeof props.onChange === "function" && "value" in props,
      );
    assert.ok(selects.length >= 2);
    (selects[0].onChange as (event: unknown) => void)({
      currentTarget: { value: "test-package" },
    });
    (selects[1].onChange as (event: unknown) => void)({
      currentTarget: { value: "4:3" },
    });
    tree = harness.render();

    clickByLabel(tree, "Toggle snap to guides");
    clickByLabel(tree, "Copy selected nodes");
    clickByLabel(tree, "Cut selected nodes");
    clickByLabel(tree, "Paste nodes");
    clickByLabel(tree, "Keyboard shortcuts");
    await clickByLabel(tree, "Export as PPTX");
    clickByLabelPrefix(tree, "Open deck diagnostics review");
    tree = harness.render();
    const review = findProps(
      tree,
      (_props, element) => typeName(element.type) === "DeckDiagnosticsReview",
    );
    (review.onClose as () => void)();

    assert.ok(harness.calls.export >= 1);
  } finally {
    browser.restore();
  }
});

test("SlideEditorVNext exported dialog and inspector helpers cover direct branches", () => {
  const calls: string[] = [];
  const desktopRegion = SlideEditorInspectorRegion({
    isDesktopInspectorViewport: true,
    activeSlide: coverageDeck().slides[0],
    inspectorSheetOpen: false,
    onOpenMobileInspector: () => calls.push("open"),
    onCloseMobileInspector: () => calls.push("close"),
    renderInspectorShell: () =>
      React.createElement("div", null, "desktop inspector"),
  });
  assert.ok(
    collectElements(desktopRegion).some((element) =>
      String(propsOf(element).className ?? "").includes("lg:flex"),
    ),
  );

  const closedMobileRegion = SlideEditorInspectorRegion({
    isDesktopInspectorViewport: false,
    activeSlide: coverageDeck().slides[0],
    inspectorSheetOpen: false,
    onOpenMobileInspector: () => calls.push("open"),
    onCloseMobileInspector: () => calls.push("close"),
    renderInspectorShell: () =>
      React.createElement("div", null, "mobile inspector"),
  });
  clickByLabel(closedMobileRegion, "Edit slide");
  assert.deepEqual(calls, ["open"]);

  const dialog = SlideEditorCloseConfirmDialog({
    onCancel: () => calls.push("cancel"),
    onDiscard: () => calls.push("discard"),
  });
  const dialogProps = collectElements(dialog).map(propsOf);
  const buttons = dialogProps.filter(
    (props) => typeof props.onClick === "function",
  );
  assert.ok(buttons.length >= 2);
  (buttons[0].onClick as () => void)();
  (buttons[1].onClick as () => void)();
  assert.deepEqual(calls, ["open", "cancel", "discard"]);
});
