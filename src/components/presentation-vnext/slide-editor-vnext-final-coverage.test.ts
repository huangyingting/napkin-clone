import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { isValidElement, type ReactElement, type ReactNode } from "react";

import type { DocumentBlock } from "@/lib/content/document-blocks";
import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";
import type { DeckV7, SlideChildNode } from "@/lib/presentation-vnext/schema";
import {
  buildDeckV7,
  buildImageAsset,
  buildImageNode,
  buildLayoutBox,
  buildShapeNode,
  buildSlideV7,
  buildTextContent,
  buildTextNode,
} from "@/test/builders/deck-v7";
import {
  SlideEditorVNext,
  type SlideEditorVNextProps,
} from "./slide-editor-vnext";

type ReactInternals = {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H: unknown;
  };
};

type ElementProps = Record<string, unknown>;
type FakeListener = (event: Record<string, unknown>) => void;

type FakeBrowserGlobals = {
  window?: unknown;
  document?: unknown;
  navigator?: unknown;
  HTMLElement?: unknown;
  File?: unknown;
  ResizeObserver?: unknown;
  setTimeout?: unknown;
  clearTimeout?: unknown;
};

class FakeHTMLElement {
  readonly focused = { count: 0 };

  constructor(
    private readonly dataset: Record<string, string> = {},
    private readonly rect: DOMRect = makeRect(0, 0, 1000, 562.5),
    private readonly menuItems: FakeHTMLElement[] = [],
  ) {}

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
    return this.menuItems[0] ?? canvasElement;
  }

  querySelectorAll(): FakeHTMLElement[] {
    return this.menuItems;
  }

  hasAttribute(name: string): boolean {
    return this.dataset[name] === "true";
  }

  getAttribute(name: string): string | null {
    return this.dataset[name] ?? null;
  }

  getBoundingClientRect(): DOMRect {
    return this.rect;
  }

  focus(): void {
    this.focused.count += 1;
  }

  click(): void {
    this.focused.count += 1;
  }

  setPointerCapture(): void {
    // Pointer capture test double.
  }

  releasePointerCapture(): void {
    // Pointer capture test double.
  }
}

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

const canvasElement = new FakeHTMLElement(
  { slideCanvasVnext: "true", nodeId: "shape-a" },
  makeRect(10, 20, 1000, 562.5),
);

function makeRect(
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

function menuContainer() {
  return new FakeHTMLElement({}, makeRect(0, 0, 1, 1), [
    new FakeHTMLElement({ role: "menuitem" }),
    new FakeHTMLElement({ role: "menuitem" }),
  ]);
}

function installBrowserGlobals({ desktop = false, syncTimers = false } = {}) {
  const globalRef = globalThis as typeof globalThis & FakeBrowserGlobals;
  const keys: (keyof FakeBrowserGlobals)[] = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "File",
    "ResizeObserver",
    "setTimeout",
    "clearTimeout",
  ];
  const previous = new Map<PropertyKey, PropertyDescriptor | undefined>(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalRef, key)]),
  );
  const listeners = new Map<string, Set<FakeListener>>();
  const fakeSetTimeout = (callback: () => void) => {
    if (syncTimers) callback();
    else setTimeout(callback, 0);
    return 1;
  };
  const fakeClearTimeout = () => undefined;

  Object.defineProperty(globalRef, "window", {
    configurable: true,
    writable: true,
    value: {
      listeners,
      addEventListener: (type: string, listener: FakeListener) => {
        const set = listeners.get(type) ?? new Set<FakeListener>();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, listener: FakeListener) => {
        listeners.get(type)?.delete(listener);
      },
      dispatch: (type: string, event: Record<string, unknown>) => {
        for (const listener of listeners.get(type) ?? []) listener(event);
      },
      setTimeout: fakeSetTimeout,
      clearTimeout: fakeClearTimeout,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
      cancelAnimationFrame: () => undefined,
      matchMedia: () =>
        ({
          matches: desktop,
          media: "(min-width: 1024px)",
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => true,
        }) as MediaQueryList,
      getComputedStyle: () => ({
        paddingLeft: "0",
        paddingRight: "0",
        paddingTop: "0",
        paddingBottom: "0",
      }),
    },
  });
  Object.defineProperty(globalRef, "document", {
    configurable: true,
    writable: true,
    value: {
      querySelector: () => canvasElement,
      activeElement: canvasElement,
      documentElement: { style: { overflow: "" } },
      body: { style: { overflow: "" }, nodeType: 1 },
    },
  });
  Object.defineProperty(globalRef, "navigator", {
    configurable: true,
    writable: true,
    value: { platform: desktop ? "MacIntel" : "Win32", userAgent: "node" },
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
        // No-op observer.
      }
      disconnect(): void {
        // No-op observer.
      }
    },
  });
  Object.defineProperty(globalRef, "setTimeout", {
    configurable: true,
    writable: true,
    value: fakeSetTimeout,
  });
  Object.defineProperty(globalRef, "clearTimeout", {
    configurable: true,
    writable: true,
    value: fakeClearTimeout,
  });

  return {
    window: globalRef.window as unknown as {
      dispatch: (type: string, event: Record<string, unknown>) => void;
    },
    restore: () => {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalRef, key, descriptor);
        else Reflect.deleteProperty(globalRef, key);
      }
    },
  };
}

function createHookRenderer({ runEffects = false } = {}) {
  const internals = (React as unknown as ReactInternals)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals);
  const slots: unknown[] = [];
  const cleanups: (() => void)[] = [];

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
        useId: () => `final-id-${hookIndex++}`,
        useEffect: (effect?: () => void | (() => void)) => {
          hookIndex++;
          if (!runEffects) return;
          const cleanup = effect?.();
          if (typeof cleanup === "function") cleanups.push(cleanup);
        },
        useLayoutEffect: (effect?: () => void | (() => void)) => {
          hookIndex++;
          if (!runEffects) return;
          const cleanup = effect?.();
          if (typeof cleanup === "function") cleanups.push(cleanup);
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
    cleanup() {
      for (const cleanup of cleanups.splice(0)) cleanup();
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

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (!isValidElement(node)) return "";
  return textContent((node.props as { children?: ReactNode }).children);
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

function clickByLabel(tree: ReactNode, label: string): unknown {
  const props = findProps(
    tree,
    (candidate) => candidate["aria-label"] === label,
  );
  assert.equal(typeof props.onClick, "function", label);
  return (props.onClick as () => unknown)();
}

function clickByLabelPrefix(tree: ReactNode, prefix: string): unknown {
  const props = findProps(
    tree,
    (candidate) =>
      typeof candidate["aria-label"] === "string" &&
      candidate["aria-label"].startsWith(prefix),
  );
  assert.equal(typeof props.onClick, "function", prefix);
  return (props.onClick as () => unknown)();
}

function clickButtonByText(tree: ReactNode, text: string): unknown {
  const props = findProps(
    tree,
    (candidate, element) =>
      typeof candidate.onClick === "function" &&
      typeName(element.type) === "button" &&
      textContent(element).trim() === text,
  );
  return (props.onClick as () => unknown)();
}

function clickPopoverTrigger(tree: ReactNode, popoverLabel: string): unknown {
  const popover = findProps(
    tree,
    (candidate) =>
      candidate["aria-label"] === popoverLabel && "trigger" in candidate,
  );
  const trigger = popover.trigger;
  assert.ok(isValidElement(trigger));
  const onClick = (trigger.props as ElementProps).onClick;
  assert.equal(typeof onClick, "function", popoverLabel);
  return (onClick as () => unknown)();
}

function panelWithText(tree: ReactNode, text: string): ElementProps {
  return findProps(
    tree,
    (props, element) =>
      typeof props.onKeyDown === "function" &&
      typeof props.id === "string" &&
      textContent(element).includes(text),
  );
}

function driveMenuKeyBranches(panel: ElementProps) {
  const container = menuContainer();
  (panel.ref as { current: FakeHTMLElement | null } | undefined)!.current =
    container;
  const firstItem = container.querySelectorAll()[0];
  const arrow = keyEvent("ArrowDown", { target: firstItem });
  (panel.onKeyDown as (event: unknown) => void)(arrow);
  const escape = keyEvent("Escape");
  (panel.onKeyDown as (event: unknown) => void)(escape);
  assert.equal(arrow.prevented, 1);
  assert.equal(escape.stopped, 1);
}

function connectorNode(): SlideChildNode {
  return {
    id: "connector-a",
    type: "connector",
    role: "connector",
    layout: buildLayoutBox({ frame: { x: 24, y: 48, w: 42, h: 8 }, zIndex: 6 }),
    style: { ref: "connector.primary" },
    content: {
      from: { kind: "node", nodeId: "shape-a", anchor: "right" },
      to: { kind: "point", point: { x: 80, y: 52 } },
      routing: "straight",
    },
  };
}

function finalDeck(): DeckV7 {
  return buildDeckV7(
    [
      buildSlideV7(
        "content",
        [
          buildTextNode({
            id: "text-source",
            source: {
              documentId: "doc-final",
              blockId: "block-1",
              blockKind: "text",
              contentHash: "old-hash",
            },
            content: buildTextContent(["Old source"]),
          }),
          buildTextNode({
            id: "text-a",
            role: "title",
            layout: buildLayoutBox({ frame: { x: 10, y: 12, w: 36, h: 10 } }),
            content: buildTextContent(["Title"]),
          }),
          buildShapeNode({
            id: "shape-a",
            layout: buildLayoutBox({ frame: { x: 50, y: 20, w: 24, h: 16 } }),
            content: { shape: "rect" },
          }),
          buildImageNode("img-001", {
            id: "image-a",
            content: { assetId: "img-001" },
          }),
          connectorNode(),
        ],
        { id: "slide-a", name: "Final slide" },
      ),
      buildSlideV7("executive-summary", [buildTextNode({ id: "text-b" })], {
        id: "slide-b",
      }),
    ],
    {
      title: "Final coverage deck",
      assets: { images: { "img-001": buildImageAsset("img-001") } },
    },
  );
}

function documentBlocks(): DocumentBlock[] {
  return [
    {
      kind: "text",
      blockType: "paragraph",
      blockId: "block-1",
      text: "Fresh source",
    },
    {
      kind: "text",
      blockType: "heading",
      level: 2,
      blockId: "block-2",
      text: "Second source",
    },
  ];
}

function diagnostics(): PresentationDiagnostic[] {
  return [
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
      message: "Missing image",
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
      message: "Stale source",
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
  ];
}

function createHarness(
  overrides: Partial<SlideEditorVNextProps> = {},
  rendererOptions: { runEffects?: boolean } = {},
) {
  const renderer = createHookRenderer(rendererOptions);
  const changes: DeckV7[] = [];
  let deck = overrides.deck ?? finalDeck();
  const calls = {
    close: 0,
    save: 0,
    present: 0,
    share: 0,
    export: 0,
    refresh: 0,
  };
  let saveFailure: string | null = null;
  let presentThrows = false;
  let shareThrows = false;

  const props = (): SlideEditorVNextProps => ({
    documentId: "doc-final",
    diagnostics: diagnostics(),
    documentBlocks: documentBlocks(),
    hasUnsavedWork: true,
    saveStatus: "error",
    saveStatusLabel: "Save needs attention",
    saveErrorMessage: "Offline",
    canUndo: true,
    canRedo: true,
    onUndo: () => undefined,
    onRedo: () => undefined,
    onDeckChange: (nextDeck) => {
      changes.push(nextDeck);
      deck = nextDeck;
    },
    onSave: async () => {
      calls.save += 1;
      return saveFailure
        ? { ok: false as const, error: saveFailure }
        : { ok: true as const, data: undefined };
    },
    onClose: () => {
      calls.close += 1;
    },
    onPresent: async () => {
      calls.present += 1;
      if (presentThrows) throw new Error("present failed");
      return { ok: true as const, data: undefined };
    },
    onShare: async () => {
      calls.share += 1;
      if (shareThrows) throw new Error("share failed");
      return { ok: true as const, data: undefined };
    },
    onExportPptx: async () => {
      calls.export += 1;
    },
    onUploadImage: async (file) => ({
      src: `https://example.com/${file.name}`,
      assetId: `asset-${file.name}`,
      alt: file.name,
    }),
    onRefreshSource: async () => {
      calls.refresh += 1;
      return {
        contentPatch: {
          paragraphs: [{ id: "p-refresh", text: "Host refresh" }],
        },
        source: {
          documentId: "doc-final",
          blockId: "block-host",
          blockKind: "text",
          contentHash: "host-hash",
        },
      };
    },
    ...overrides,
    deck,
  });

  return {
    calls,
    changes,
    renderer,
    setSaveFailure(message: string | null) {
      saveFailure = message;
    },
    setPresentThrows(value: boolean) {
      presentThrows = value;
    },
    setShareThrows(value: boolean) {
      shareThrows = value;
    },
    render() {
      return renderer.run(() => SlideEditorVNext(props()));
    },
  };
}

function canvasProps(tree: ReactNode): ElementProps {
  return findProps(tree, (props) => typeof props.onNodeFocus === "function");
}

function contextToolbarProps(tree: ReactNode): ElementProps {
  return findProps(
    tree,
    (_props, element) => typeName(element.type) === "ContextToolbar",
  );
}

function rootProps(tree: ReactNode): ElementProps {
  return findProps(
    tree,
    (props) => props["data-slide-editor-vnext"] === "true",
  );
}

function stageProps(tree: ReactNode): ElementProps {
  return findProps(tree, (props) => props["data-slide-stage-shell"] === "true");
}

function inspectorProps(tree: ReactNode): ElementProps {
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

function fileInputProps(tree: ReactNode, index: number): ElementProps {
  return collectElements(tree)
    .map(propsOf)
    .filter((props) => props.type === "file")[index];
}

test("SlideEditorVNext final coverage drives save-first errors and unsaved close dialog", async () => {
  const browser = installBrowserGlobals({ syncTimers: true });
  try {
    const harness = createHarness({}, { runEffects: true });
    let tree = harness.render();

    harness.setSaveFailure("Save blocked before present");
    await clickByLabel(tree, "Present slides");
    tree = harness.render();
    assert.equal(harness.calls.present, 0);
    assert.ok(maybeProps(tree, (props) => props.role === "alert"));

    harness.setSaveFailure(null);
    harness.setPresentThrows(true);
    await clickByLabel(tree, "Present slides");
    harness.setPresentThrows(false);
    harness.setShareThrows(true);
    await clickByLabel(harness.render(), "Share slides");
    harness.setShareThrows(false);

    const beforeUnload = {
      preventDefault: () => undefined,
      returnValue: undefined,
    };
    browser.window.dispatch("beforeunload", beforeUnload);
    assert.equal(beforeUnload.returnValue, "");

    clickByLabel(harness.render(), "Close slide editor");
    tree = harness.render();
    const dialog = findProps(
      tree,
      (_props, element) =>
        typeName(element.type) === "SlideEditorCloseConfirmDialog",
    );
    (dialog.onCancel as () => void)();
    assert.equal(harness.calls.close, 0);

    clickByLabel(harness.render(), "Close slide editor");
    tree = harness.render();
    const discardDialog = findProps(
      tree,
      (_props, element) =>
        typeName(element.type) === "SlideEditorCloseConfirmDialog",
    );
    (discardDialog.onDiscard as () => void)();
    assert.equal(harness.calls.close, 1);
    assert.ok(harness.calls.save >= 3);
    harness.renderer.cleanup();
  } finally {
    browser.restore();
  }
});

test("SlideEditorVNext final coverage drives mobile menus, notes, zoom, and picker branches", () => {
  const browser = installBrowserGlobals({ syncTimers: true });
  try {
    const harness = createHarness({}, { runEffects: true });
    let tree = harness.render();

    clickByLabel(tree, "Hide slide thumbnails");
    clickButtonByText(tree, "Notes");
    tree = harness.render();
    const region = findProps(
      tree,
      (_props, element) =>
        typeName(element.type) === "SlideEditorInspectorRegion",
    );
    assert.equal(region.inspectorSheetOpen, true);

    clickPopoverTrigger(tree, "Document source commands");
    tree = harness.render();
    driveMenuKeyBranches(panelWithText(tree, "Sync from document"));

    clickPopoverTrigger(tree, "More toolbar commands");
    tree = harness.render();
    driveMenuKeyBranches(panelWithText(tree, "Snap to guides"));
    const ratioCommand = findProps(
      tree,
      (props, element) =>
        props.role === "menuitemradio" && textContent(element).includes("4:3"),
    );
    (ratioCommand.onClick as () => void)();

    clickPopoverTrigger(tree, "Zoom presets");
    tree = harness.render();
    driveMenuKeyBranches(panelWithText(tree, "Fit"));

    clickPopoverTrigger(tree, "Footer status");
    tree = harness.render();
    driveMenuKeyBranches(panelWithText(tree, "Normal mode"));

    const zoomRange = findProps(
      tree,
      (props) => props["aria-label"] === "Slide zoom",
    );
    (zoomRange.onChange as (event: unknown) => void)({
      currentTarget: { value: "125" },
    });

    const toolbar = contextToolbarProps(harness.render());
    (toolbar.onInsertSlide as () => void)();
    tree = harness.render();
    const picker = findProps(
      tree,
      (_props, element) => typeName(element.type) === "AddSlideTemplatePicker",
    );
    (picker.onChoose as (choice: unknown) => void)({
      kind: "content",
      layoutId: "body",
    });

    assert.ok(harness.changes.length >= 1);
    harness.renderer.cleanup();
  } finally {
    browser.restore();
  }
});

test("SlideEditorVNext final coverage drives selected source, diagnostics, file refs, and focus escape", async () => {
  const browser = installBrowserGlobals({ syncTimers: true });
  try {
    const harness = createHarness({}, { runEffects: true });
    let tree = harness.render();
    const frame = findProps(
      tree,
      (props) => props["data-slide-stage-frame"] === "true",
    );
    (frame.ref as (el: FakeHTMLElement | null) => void)(canvasElement);

    const firstInput = fileInputProps(tree, 0);
    (firstInput.ref as { current: FakeHTMLElement | null }).current =
      new FakeHTMLElement();

    (canvasProps(harness.render()).onNodeFocus as (nodeId: string) => void)(
      "text-source",
    );
    tree = harness.render();
    const inspector = inspectorProps(tree);
    await (inspector.onRefreshSelectedSource as () => Promise<void>)();
    (inspector.onUnlinkSelectedSource as () => void)();
    (inspector.onRelinkSelectedSource as (block: unknown) => void)(
      (inspector.sourceBlocks as readonly unknown[])[1],
    );
    (inspector.onUpdateSelectedSource as (source: unknown) => void)({
      documentId: "doc-final",
      blockId: "manual",
      blockKind: "text",
    });
    tree = harness.render();

    const sourceReview = findProps(
      tree,
      (_props, element) => typeName(element.type) === "SourceReviewPanel",
    );
    (sourceReview.onRefresh as (slideId: string, nodeId: string) => void)(
      "slide-a",
      "text-source",
    );
    (sourceReview.onDismiss as (slideId: string, nodeId: string) => void)(
      "slide-a",
      "text-source",
    );
    (sourceReview.onRefreshAll as () => void)();

    clickByLabelPrefix(harness.render(), "Open deck diagnostics review");
    tree = harness.render();
    const review = findProps(
      tree,
      (_props, element) => typeName(element.type) === "DeckDiagnosticsReview",
    );
    const reviewDiagnostics = review.diagnostics as PresentationDiagnostic[];
    for (const diagnostic of reviewDiagnostics) {
      if (!diagnostic.action) continue;
      (
        review.onAction as (
          action: unknown,
          diagnostic: PresentationDiagnostic,
        ) => void
      )(diagnostic.action, diagnostic);
    }

    (canvasProps(harness.render()).onNodeFocus as (nodeId: string) => void)(
      "shape-a",
    );
    tree = harness.render();
    const toolbar = contextToolbarProps(tree);
    (toolbar.onRequestStageFocus as () => void)();
    (toolbar.onUpdateSelectedAttributes as (patch: unknown) => void)({
      hidden: true,
    });
    (rootProps(harness.render()).onKeyDown as (event: unknown) => void)(
      keyEvent("Escape"),
    );
    (contextToolbarProps(harness.render()).onRequestStageFocus as () => void)();

    assert.ok(harness.changes.length >= 5);
    harness.renderer.cleanup();
  } finally {
    browser.restore();
  }
});

test("SlideEditorVNext final coverage drives clipboard grouping and context menu callbacks", () => {
  const browser = installBrowserGlobals({ syncTimers: true });
  try {
    const harness = createHarness({}, { runEffects: true });
    let tree = harness.render();
    const rootKeyDown = rootProps(tree).onKeyDown as (event: unknown) => void;

    rootKeyDown(keyEvent("a", { metaKey: true }));
    rootKeyDown(keyEvent("c", { metaKey: true }));
    rootKeyDown(keyEvent("v", { metaKey: true }));
    rootKeyDown(keyEvent("g", { metaKey: true }));
    rootKeyDown(keyEvent("y", { metaKey: true }));
    rootKeyDown(keyEvent("ArrowLeft"));
    rootKeyDown(keyEvent("ArrowDown", { altKey: true, shiftKey: true }));
    rootKeyDown(keyEvent("d", { metaKey: true }));
    tree = harness.render();

    (canvasProps(tree).onNodeFocus as (nodeId: string) => void)("shape-a");
    tree = harness.render();
    (stageProps(tree).onContextMenu as (event: unknown) => void)(
      pointerEvent(580, 260),
    );
    tree = harness.render();
    const contextMenu = findProps(
      tree,
      (_props, element) => typeName(element.type) === "StageNodeContextMenu",
    );
    (contextMenu.onSelectCandidate as (nodeId: string) => void)("shape-a");
    (contextMenu.onDuplicate as () => void)();
    (contextMenu.onCopy as () => void)();
    (contextMenu.onPaste as () => void)();
    (contextMenu.onBringToFront as () => void)();
    (contextMenu.onSendToBack as () => void)();
    (contextMenu.onToggleLock as () => void)();
    (contextMenu.onEdit as () => void)();
    (contextMenu.onClose as () => void)();

    assert.ok(harness.changes.length >= 4);
    harness.renderer.cleanup();
  } finally {
    browser.restore();
  }
});
