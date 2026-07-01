// e2e-governance-allow oversized-test: slide editor failure coverage stays centralized until shared editor harnesses are split out.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as React from "react";
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import {
  buildDeckV7,
  buildImageNode,
  buildShapeNode,
  buildSlideV7,
  buildTextNode,
} from "@/test/builders/deck-v7";
import { InspectorShell } from "./inspector";
import { SlideCanvasVNext } from "./slide-canvas";
import { StageNodeContextMenu } from "./stage-context-menu";
import {
  SlideEditorInspectorRegion,
  SlideEditorVNext,
  type SlideEditorVNextImageUploadResult,
  type SlideEditorVNextProps,
} from "./slide-editor-vnext";

type ReactInternals = {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H: unknown;
  };
};

type ElementLike = ReactElement<Record<string, unknown>>;

function collectElements(
  node: ReactNode,
  predicate: (element: ElementLike) => boolean,
  collected: ElementLike[] = [],
): ElementLike[] {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, predicate, collected);
    return collected;
  }
  if (!isValidElement(node)) return collected;
  const element = node as ElementLike;
  if (predicate(element)) collected.push(element);
  const props = element.props as { children?: ReactNode };
  collectElements(props.children, predicate, collected);
  return collected;
}

function flattenText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (!isValidElement(node)) return "";
  const props = node.props as { children?: ReactNode };
  return flattenText(props.children);
}

function createHookRenderer() {
  const internals = (React as unknown as ReactInternals)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals, "React internals were unavailable for hook rendering.");
  const reactInternals = internals;

  const slots: unknown[] = [];

  function run<T>(renderComponent: () => T): T {
    let hookIndex = 0;
    const previous = reactInternals.H;

    const dispatcher = {
      useState: <S>(initial: S | (() => S)) => {
        const slotIndex = hookIndex++;
        if (!(slotIndex in slots)) {
          slots[slotIndex] =
            typeof initial === "function" ? (initial as () => S)() : initial;
        }
        const setState = (next: S | ((previousState: S) => S)) => {
          const previousState = slots[slotIndex] as S;
          slots[slotIndex] =
            typeof next === "function"
              ? (next as (previousState: S) => S)(previousState)
              : next;
        };
        return [slots[slotIndex] as S, setState] as const;
      },
      useReducer: <S, A>(
        reducer: (state: S, action: A) => S,
        initialArg: S,
        init?: (arg: S) => S,
      ) => {
        const slotIndex = hookIndex++;
        if (!(slotIndex in slots)) {
          slots[slotIndex] = init ? init(initialArg) : initialArg;
        }
        const dispatch = (action: A) => {
          slots[slotIndex] = reducer(slots[slotIndex] as S, action);
        };
        return [slots[slotIndex] as S, dispatch] as const;
      },
      useRef: <T>(initial: T) => {
        const slotIndex = hookIndex++;
        if (!(slotIndex in slots)) slots[slotIndex] = { current: initial };
        return slots[slotIndex] as { current: T };
      },
      useMemo: <T>(factory: () => T) => {
        hookIndex++;
        return factory();
      },
      useCallback: <T>(callback: T) => {
        hookIndex++;
        return callback;
      },
      useId: () => {
        const slotIndex = hookIndex++;
        if (!(slotIndex in slots))
          slots[slotIndex] = `fake-react-id-${slotIndex}`;
        return slots[slotIndex] as string;
      },
      useContext: () => {
        hookIndex++;
        return undefined;
      },
      useEffect: () => {
        hookIndex++;
      },
      useLayoutEffect: () => {
        hookIndex++;
      },
      useInsertionEffect: () => {
        hookIndex++;
      },
      useSyncExternalStore: <T>(
        _subscribe: (_callback: () => void) => () => void,
        getSnapshot: () => T,
        getServerSnapshot?: () => T,
      ) => {
        hookIndex++;
        return getServerSnapshot ? getServerSnapshot() : getSnapshot();
      },
      useTransition: () => {
        hookIndex++;
        return [false, (callback?: () => void) => callback?.()] as const;
      },
      useDeferredValue: <T>(value: T) => {
        hookIndex++;
        return value;
      },
      useImperativeHandle: () => {
        hookIndex++;
      },
    };

    reactInternals.H = dispatcher;
    try {
      return renderComponent();
    } finally {
      reactInternals.H = previous;
    }
  }

  return { run };
}

function findRequiredElement(
  root: ReactNode,
  predicate: (element: ElementLike) => boolean,
  message: string,
): ElementLike {
  const [element] = collectElements(root, predicate);
  assert.ok(element, message);
  return element;
}

function buildEditorDeck(): DeckV7 {
  const imageNodeId = "image-primary";
  return buildDeckV7(
    [
      buildSlideV7(
        "content",
        [
          buildImageNode("img-001", {
            id: imageNodeId,
            name: "Primary image",
            content: { assetId: "img-001", alt: "Primary image" },
          }),
        ],
        { id: "slide-1", name: "Slide 1" },
      ),
    ],
    {
      title: "Failure coverage deck",
    },
  );
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function withWindow<T>(run: () => Promise<T> | T): Promise<T> {
  const globalWithWindow = globalThis as {
    window?: { setTimeout: typeof setTimeout };
  };
  const previousWindow = globalWithWindow.window;
  globalWithWindow.window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
  };
  try {
    return await run();
  } finally {
    if (previousWindow === undefined)
      Reflect.deleteProperty(globalWithWindow, "window");
    else globalWithWindow.window = previousWindow;
  }
}

type PointerListenerType = "pointermove" | "pointerup" | "pointercancel";

type MockElementFactory = (args?: {
  closestMap?: Record<string, unknown>;
  queryMap?: Record<string, unknown>;
  rect?: { left: number; top: number; width: number; height: number };
}) => HTMLElement;

function withPointerWindow<T>(
  run: (
    listeners: Map<PointerListenerType, (event: PointerEvent) => void>,
  ) => T,
): T {
  const globalWithWindow = globalThis as {
    window?: {
      setTimeout: typeof setTimeout;
      addEventListener: (
        type: PointerListenerType,
        listener: (event: PointerEvent) => void,
      ) => void;
      removeEventListener: (
        type: PointerListenerType,
        listener: (event: PointerEvent) => void,
      ) => void;
    };
  };
  const previousWindow = globalWithWindow.window;
  const listeners = new Map<
    PointerListenerType,
    (event: PointerEvent) => void
  >();
  globalWithWindow.window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  try {
    return run(listeners);
  } finally {
    if (previousWindow === undefined)
      Reflect.deleteProperty(globalWithWindow, "window");
    else globalWithWindow.window = previousWindow;
  }
}

function withMockHTMLElement<T>(
  run: (createElement: MockElementFactory) => T,
): T {
  const globalWithHTMLElement = globalThis as typeof globalThis & {
    HTMLElement?: typeof HTMLElement;
  };
  const previousHTMLElement = globalWithHTMLElement.HTMLElement;

  class MockHTMLElement {
    private readonly closestMap: Record<string, unknown>;
    private readonly queryMap: Record<string, unknown>;
    private readonly rect: {
      left: number;
      top: number;
      width: number;
      height: number;
    };

    constructor(args?: {
      closestMap?: Record<string, unknown>;
      queryMap?: Record<string, unknown>;
      rect?: { left: number; top: number; width: number; height: number };
    }) {
      this.closestMap = args?.closestMap ?? {};
      this.queryMap = args?.queryMap ?? {};
      this.rect = args?.rect ?? { left: 0, top: 0, width: 1000, height: 500 };
    }

    closest(selector: string): Element | null {
      return (this.closestMap[selector] ?? null) as Element | null;
    }

    querySelector(selector: string): Element | null {
      return (this.queryMap[selector] ?? null) as Element | null;
    }

    getBoundingClientRect(): DOMRect {
      const { left, top, width, height } = this.rect;
      return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      } as DOMRect;
    }

    setPointerCapture() {
      // Pointer capture is intentionally inert in these component tests.
    }

    releasePointerCapture() {
      // Pointer capture is intentionally inert in these component tests.
    }
  }

  globalWithHTMLElement.HTMLElement =
    MockHTMLElement as unknown as typeof HTMLElement;
  try {
    return run((args) => new MockHTMLElement(args) as unknown as HTMLElement);
  } finally {
    if (previousHTMLElement === undefined) {
      Reflect.deleteProperty(globalWithHTMLElement, "HTMLElement");
    } else {
      globalWithHTMLElement.HTMLElement = previousHTMLElement;
    }
  }
}

function stageCanvasFrom(root: ReactNode): ReactElement {
  return findRequiredElement(
    root,
    (element) => element.type === SlideCanvasVNext,
    "Expected stage canvas to render.",
  );
}

function nodePointerDownFrom(
  root: ReactNode,
): NonNullable<
  React.ComponentProps<typeof SlideCanvasVNext>["onNodePointerDown"]
> {
  const onNodePointerDown = (
    stageCanvasFrom(root).props as {
      onNodePointerDown?: React.ComponentProps<
        typeof SlideCanvasVNext
      >["onNodePointerDown"];
    }
  ).onNodePointerDown;
  assert.ok(onNodePointerDown);
  return onNodePointerDown;
}

function focusNode(root: ReactNode, nodeId: string) {
  const onNodeFocus = (
    stageCanvasFrom(root).props as {
      onNodeFocus?: React.ComponentProps<
        typeof SlideCanvasVNext
      >["onNodeFocus"];
    }
  ).onNodeFocus;
  assert.ok(onNodeFocus);
  onNodeFocus(nodeId, {} as React.FocusEvent);
}

function clickNode(
  root: ReactNode,
  listeners: Map<PointerListenerType, (event: PointerEvent) => void>,
  createElement: MockElementFactory,
  nodeId: string,
  options: {
    clientX?: number;
    clientY?: number;
    canvasRect?: { left: number; top: number; width: number; height: number };
    shiftKey?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
  } = {},
) {
  const canvasElement = createElement({
    rect: options.canvasRect ?? { left: 0, top: 0, width: 1000, height: 1000 },
  });
  const currentTarget = createElement({
    closestMap: {
      '[data-slide-canvas-vnext="true"]': canvasElement,
    },
  });
  const clientX = options.clientX ?? 100;
  const clientY = options.clientY ?? 100;
  nodePointerDownFrom(root)(nodeId, {
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
    shiftKey: options.shiftKey ?? false,
    metaKey: options.metaKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    altKey: options.altKey ?? false,
    target: currentTarget,
    currentTarget,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  } as unknown as React.PointerEvent);
  listeners.get("pointerup")?.({
    clientX,
    clientY,
  } as PointerEvent);
}

describe("SlideEditorVNext failure-state coverage", () => {
  test("shows role=alert export failures and clears the banner on retry", async () => {
    const hookRenderer = createHookRenderer();
    let exportAttempts = 0;

    const props: SlideEditorVNextProps = {
      documentId: "doc-1",
      deck: buildEditorDeck(),
      onDeckChange: () => undefined,
      onExportPptx: async () => {
        exportAttempts += 1;
        if (exportAttempts === 1) throw new Error("export failed");
      },
    };

    let tree = hookRenderer.run(() => SlideEditorVNext(props));
    const exportButton = findRequiredElement(
      tree,
      (element) => {
        if (element.type !== "button") return false;
        const buttonProps = element.props as {
          "aria-label"?: string;
          role?: string;
          children?: ReactNode;
        };
        return (
          buttonProps["aria-label"] === "Export as PPTX" ||
          (buttonProps.role === "menuitem" &&
            flattenText(buttonProps.children).includes("Export PPTX"))
        );
      },
      "Expected export command to render.",
    );

    const clickExport = (exportButton.props as { onClick?: () => void })
      .onClick;
    assert.equal(typeof clickExport, "function");
    clickExport?.();
    await flushAsyncWork();

    tree = hookRenderer.run(() => SlideEditorVNext(props));
    const exportAlert = findRequiredElement(
      tree,
      (element) =>
        element.type === "div" &&
        (element.props as { role?: string }).role === "alert",
      "Expected export failure alert banner.",
    );
    assert.match(
      flattenText(exportAlert),
      /PPTX export failed\. Please try again\./,
    );

    clickExport?.();
    await flushAsyncWork();

    tree = hookRenderer.run(() => SlideEditorVNext(props));
    const lingeringAlerts = collectElements(
      tree,
      (element) =>
        element.type === "div" &&
        (element.props as { role?: string }).role === "alert",
    );
    assert.equal(
      lingeringAlerts.length,
      0,
      "Expected export retry to clear the alert banner.",
    );
  });

  test("gates present/share roundtrip callbacks behind save success", async () => {
    const hookRenderer = createHookRenderer();
    let saveAttempts = 0;
    let presentAttempts = 0;
    let shareAttempts = 0;

    const props: SlideEditorVNextProps = {
      documentId: "doc-1",
      deck: buildEditorDeck(),
      onDeckChange: () => undefined,
      onSave: async () => {
        saveAttempts += 1;
        if (saveAttempts === 1) {
          return { ok: false, error: "Save failed before routing." };
        }
        return { ok: true, data: undefined };
      },
      onPresent: async () => {
        presentAttempts += 1;
        return { ok: true, data: undefined };
      },
      onShare: async () => {
        shareAttempts += 1;
        return { ok: true, data: undefined };
      },
    };

    let tree = hookRenderer.run(() => SlideEditorVNext(props));
    const presentButton = findRequiredElement(
      tree,
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] ===
          "Present slides",
      "Expected present roundtrip button.",
    );
    const shareButton = findRequiredElement(
      tree,
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] ===
          "Share slides",
      "Expected share roundtrip button.",
    );

    const clickPresent = (presentButton.props as { onClick?: () => void })
      .onClick;
    const clickShare = (shareButton.props as { onClick?: () => void }).onClick;
    assert.equal(typeof clickPresent, "function");
    assert.equal(typeof clickShare, "function");

    clickPresent?.();
    await flushAsyncWork();
    assert.equal(
      presentAttempts,
      0,
      "Present callback should not run when save fails.",
    );

    tree = hookRenderer.run(() => SlideEditorVNext(props));
    const firstAlert = findRequiredElement(
      tree,
      (element) =>
        element.type === "div" &&
        (element.props as { role?: string }).role === "alert",
      "Expected toolbar failure alert after failed save.",
    );
    assert.match(flattenText(firstAlert), /Save failed before routing\./);

    clickShare?.();
    await flushAsyncWork();
    assert.equal(shareAttempts, 1);
    assert.equal(presentAttempts, 0);
  });

  test("covers image replacement invalid file, upload failure, and successful retry", async () => {
    await withWindow(async () => {
      const hookRenderer = createHookRenderer();
      let currentDeck = buildEditorDeck();
      let uploadAttempts = 0;

      const onUploadImage =
        async (): Promise<SlideEditorVNextImageUploadResult> => {
          uploadAttempts += 1;
          if (uploadAttempts === 1) {
            throw new Error("upload failed");
          }
          return {
            src: "https://example.com/image-replacement.png",
            assetId: "img-replaced",
            alt: "Replaced image",
          };
        };

      const renderTree = () =>
        hookRenderer.run(() =>
          SlideEditorVNext({
            documentId: "doc-1",
            deck: currentDeck,
            onDeckChange: (nextDeck) => {
              currentDeck = nextDeck;
            },
            onUploadImage,
          }),
        );

      let tree = renderTree();

      focusNode(tree, "image-primary");

      tree = renderTree();

      const hasReplaceImageAction = (element: ReactElement): boolean =>
        element.type === InspectorShell &&
        typeof (element.props as { onReplaceImage?: () => void })
          .onReplaceImage === "function";
      const resolveInspectorSurface = (root: ReactNode): ReactNode => {
        if (collectElements(root, hasReplaceImageAction).length > 0)
          return root;
        const inspectorRegion = findRequiredElement(
          root,
          (element) =>
            element.type === SlideEditorInspectorRegion &&
            typeof (element.props as { renderInspectorShell?: () => ReactNode })
              .renderInspectorShell === "function",
          "Expected inspector region shell renderer.",
        );
        return (
          inspectorRegion.props as { renderInspectorShell: () => ReactNode }
        ).renderInspectorShell();
      };
      const inspectorSurface = resolveInspectorSurface(tree);

      const inspectorShell = findRequiredElement(
        inspectorSurface,
        hasReplaceImageAction,
        "Expected inspector shell replace-image action.",
      );

      const triggerReplaceImage = (
        inspectorShell.props as {
          onReplaceImage?: () => void;
        }
      ).onReplaceImage;
      assert.ok(triggerReplaceImage);

      const fileInput = findRequiredElement(
        tree,
        (element) =>
          element.type === "input" &&
          (element.props as { type?: string }).type === "file",
        "Expected hidden file input for image replacement.",
      );

      const onImageFileChange = (
        fileInput.props as {
          onChange?: (event: {
            currentTarget: {
              files?: File[];
              value: string;
            };
          }) => void;
        }
      ).onChange;
      assert.ok(onImageFileChange);

      triggerReplaceImage?.();
      onImageFileChange?.({
        currentTarget: {
          files: [{ type: "text/plain", name: "not-image.txt" } as File],
          value: "dummy",
        },
      });

      tree = renderTree();
      const invalidTypeAlert = findRequiredElement(
        tree,
        (element) =>
          element.type === "div" &&
          (element.props as { role?: string }).role === "alert",
        "Expected invalid file type alert.",
      );
      assert.match(
        flattenText(invalidTypeAlert),
        /Choose an image file to replace the selected image\./,
      );

      triggerReplaceImage?.();
      onImageFileChange?.({
        currentTarget: {
          files: [{ type: "image/png", name: "upload-fails.png" } as File],
          value: "dummy",
        },
      });
      await flushAsyncWork();

      tree = renderTree();
      const failedUploadAlert = findRequiredElement(
        tree,
        (element) =>
          element.type === "div" &&
          (element.props as { role?: string }).role === "alert",
        "Expected upload failure alert.",
      );
      assert.match(
        flattenText(failedUploadAlert),
        /Image replacement failed\. Please try another file\./,
      );

      triggerReplaceImage?.();
      onImageFileChange?.({
        currentTarget: {
          files: [{ type: "image/png", name: "upload-succeeds.png" } as File],
          value: "dummy",
        },
      });
      await flushAsyncWork();

      tree = renderTree();
      const finalAlerts = collectElements(
        tree,
        (element) =>
          element.type === "div" &&
          (element.props as { role?: string }).role === "alert",
      );
      assert.equal(
        finalAlerts.length,
        0,
        "Expected successful retry to clear alert.",
      );

      const activeSlide = currentDeck.slides[0];
      const replacedNode = activeSlide.children.find(
        (node) => node.id === "image-primary",
      );
      assert.ok(replacedNode && replacedNode.type === "image");
      assert.equal(replacedNode.content.assetId, "img-replaced");

      const selectedInspectorShell = findRequiredElement(
        resolveInspectorSurface(tree),
        (element) => element.type === InspectorShell,
        "Expected inspector shell to remain rendered.",
      );
      assert.deepEqual(
        (selectedInspectorShell.props as { selectedIds?: string[] })
          .selectedIds,
        ["image-primary"],
        "Expected image replacement retry to preserve selected image node.",
      );
    });
  });

  test("shift-marquee adds framed nodes to the existing selection", () => {
    withMockHTMLElement((createElement) =>
      withPointerWindow((listeners) => {
        const hookRenderer = createHookRenderer();
        const currentDeck = buildDeckV7([
          buildSlideV7(
            "content",
            [
              buildTextNode({
                id: "already-selected",
                layout: { frame: { x: 10, y: 10, w: 10, h: 10 }, zIndex: 1 },
              }),
              buildTextNode({
                id: "marquee-target",
                layout: { frame: { x: 50, y: 10, w: 10, h: 10 }, zIndex: 2 },
              }),
            ],
            { id: "slide-marquee-additive", name: "Slide 1" },
          ),
        ]);

        const renderTree = () =>
          hookRenderer.run(() =>
            SlideEditorVNext({
              documentId: "doc-marquee-additive",
              deck: currentDeck,
              onDeckChange: () => undefined,
            }),
          );
        const stageCanvasFrom = (root: ReactNode) =>
          findRequiredElement(
            root,
            (element) => element.type === SlideCanvasVNext,
            "Expected stage canvas to render.",
          );

        let tree = renderTree();
        focusNode(tree, "already-selected");

        tree = renderTree();
        const stageShell = findRequiredElement(
          tree,
          (element) =>
            element.type === "div" &&
            (element.props as { "data-slide-stage-shell"?: string })[
              "data-slide-stage-shell"
            ] === "true" &&
            typeof (element.props as { onPointerDown?: unknown })
              .onPointerDown === "function",
          "Expected stage shell with pointerdown handler.",
        );
        const onPointerDown = (
          stageShell.props as {
            onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
          }
        ).onPointerDown;
        assert.ok(onPointerDown);
        const canvasElement = createElement({
          rect: { left: 0, top: 0, width: 1000, height: 1000 },
        });
        const target = createElement({
          closestMap: {
            '[data-slide-canvas-vnext="true"]': canvasElement,
          },
        });
        let prevented = false;

        onPointerDown({
          button: 0,
          pointerId: 1,
          clientX: 400,
          clientY: 50,
          shiftKey: true,
          metaKey: false,
          ctrlKey: false,
          target,
          currentTarget: {
            setPointerCapture: () => undefined,
            releasePointerCapture: () => undefined,
          },
          preventDefault: () => {
            prevented = true;
          },
        } as unknown as React.PointerEvent<HTMLDivElement>);

        assert.equal(prevented, true);
        const pointerMove = listeners.get("pointermove");
        assert.ok(pointerMove, "Expected marquee to register pointermove.");
        pointerMove({ clientX: 700, clientY: 300 } as PointerEvent);

        tree = renderTree();
        const selection = (
          stageCanvasFrom(tree).props as {
            selection?: { nodeIds?: ReadonlySet<string> };
          }
        ).selection;
        assert.ok(selection?.nodeIds?.has("already-selected"));
        assert.ok(selection?.nodeIds?.has("marquee-target"));
      }),
    );
  });

  test("mod+a selects all editable slide nodes", async () => {
    await withWindow(() => {
      const hookRenderer = createHookRenderer();
      const currentDeck = buildDeckV7([
        buildSlideV7(
          "content",
          [
            buildTextNode({
              id: "select-all-first",
              layout: { frame: { x: 10, y: 10, w: 10, h: 10 }, zIndex: 1 },
            }),
            buildTextNode({
              id: "select-all-second",
              layout: { frame: { x: 50, y: 10, w: 10, h: 10 }, zIndex: 2 },
            }),
          ],
          { id: "slide-select-all", name: "Slide 1" },
        ),
      ]);

      const renderTree = () =>
        hookRenderer.run(() =>
          SlideEditorVNext({
            documentId: "doc-select-all",
            deck: currentDeck,
            onDeckChange: () => undefined,
          }),
        );

      let tree = renderTree();
      const editorRoot = findRequiredElement(
        tree,
        (element) =>
          element.type === "div" &&
          (element.props as { "data-slide-editor-vnext"?: string })[
            "data-slide-editor-vnext"
          ] === "true" &&
          typeof (element.props as { onKeyDown?: unknown }).onKeyDown ===
            "function",
        "Expected editor root with keydown handler.",
      );
      const onKeyDown = (
        editorRoot.props as {
          onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
        }
      ).onKeyDown;
      assert.ok(onKeyDown);
      let prevented = false;
      onKeyDown({
        key: "a",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        target: null,
        preventDefault: () => {
          prevented = true;
        },
      } as unknown as KeyboardEvent<HTMLDivElement>);

      assert.equal(prevented, true);
      tree = renderTree();
      const stageCanvas = findRequiredElement(
        tree,
        (element) => element.type === SlideCanvasVNext,
        "Expected stage canvas after select-all.",
      );
      const selection = (
        stageCanvas.props as {
          selection?: { nodeIds?: ReadonlySet<string> };
        }
      ).selection;
      assert.ok(selection?.nodeIds?.has("select-all-first"));
      assert.ok(selection?.nodeIds?.has("select-all-second"));
    });
  });

  test("space selects and shift-space toggles the focused stage node", async () => {
    await withWindow(() => {
      const hookRenderer = createHookRenderer();
      const currentDeck = buildDeckV7([
        buildSlideV7(
          "content",
          [
            buildTextNode({
              id: "space-target",
              layout: { frame: { x: 10, y: 10, w: 10, h: 10 }, zIndex: 1 },
            }),
          ],
          { id: "slide-space-select", name: "Slide 1" },
        ),
      ]);

      const renderTree = () =>
        hookRenderer.run(() =>
          SlideEditorVNext({
            documentId: "doc-space-select",
            deck: currentDeck,
            onDeckChange: () => undefined,
          }),
        );
      const stageCanvasFrom = (root: ReactNode) =>
        findRequiredElement(
          root,
          (element) => element.type === SlideCanvasVNext,
          "Expected stage canvas to render.",
        );
      const keyDownFrom = (root: ReactNode) =>
        (
          findRequiredElement(
            root,
            (element) =>
              element.type === "div" &&
              (element.props as { "data-slide-editor-vnext"?: string })[
                "data-slide-editor-vnext"
              ] === "true" &&
              typeof (element.props as { onKeyDown?: unknown }).onKeyDown ===
                "function",
            "Expected editor root with keydown handler.",
          ).props as {
            onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
          }
        ).onKeyDown;

      let tree = renderTree();
      const onNodeFocus = (
        stageCanvasFrom(tree).props as {
          onNodeFocus?: (nodeId: string) => void;
        }
      ).onNodeFocus;
      assert.ok(onNodeFocus);
      onNodeFocus("space-target");

      tree = renderTree();
      let prevented = false;
      keyDownFrom(tree)?.({
        key: " ",
        shiftKey: false,
        target: null,
        preventDefault: () => {
          prevented = true;
        },
      } as unknown as KeyboardEvent<HTMLDivElement>);

      assert.equal(prevented, true);
      tree = renderTree();
      let selection = (
        stageCanvasFrom(tree).props as {
          selection?: { nodeIds?: ReadonlySet<string> };
        }
      ).selection;
      assert.ok(selection?.nodeIds?.has("space-target"));

      keyDownFrom(tree)?.({
        key: " ",
        shiftKey: true,
        target: null,
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent<HTMLDivElement>);

      tree = renderTree();
      selection = (
        stageCanvasFrom(tree).props as {
          selection?: { nodeIds?: ReadonlySet<string> };
        }
      ).selection;
      assert.equal(selection?.nodeIds?.has("space-target"), false);
    });
  });

  test("inline edit keeps stage hover preselection for other nodes", () => {
    withMockHTMLElement((createElement) => {
      const hookRenderer = createHookRenderer();
      const currentDeck = buildDeckV7([
        buildSlideV7(
          "content",
          [
            buildTextNode({
              id: "editing-node",
              layout: { frame: { x: 10, y: 10, w: 20, h: 10 }, zIndex: 1 },
            }),
            buildTextNode({
              id: "hover-other",
              layout: { frame: { x: 50, y: 10, w: 20, h: 10 }, zIndex: 2 },
            }),
          ],
          { id: "slide-inline-hover", name: "Slide 1" },
        ),
      ]);

      const renderTree = () =>
        hookRenderer.run(() =>
          SlideEditorVNext({
            documentId: "doc-inline-hover",
            deck: currentDeck,
            onDeckChange: () => undefined,
          }),
        );
      const stageCanvasFrom = (root: ReactNode) =>
        findRequiredElement(
          root,
          (element) => element.type === SlideCanvasVNext,
          "Expected stage canvas to render.",
        );

      let tree = renderTree();
      focusNode(tree, "editing-node");
      tree = renderTree();
      clickNode(tree, new Map(), createElement, "editing-node", {
        clientX: 120,
        clientY: 120,
      });

      tree = renderTree();
      const stageShell = findRequiredElement(
        tree,
        (element) =>
          element.type === "div" &&
          (element.props as { "data-slide-stage-shell"?: string })[
            "data-slide-stage-shell"
          ] === "true" &&
          typeof (element.props as { onPointerMove?: unknown })
            .onPointerMove === "function",
        "Expected stage shell with pointermove handler.",
      );
      const onPointerMove = (
        stageShell.props as {
          onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
        }
      ).onPointerMove;
      assert.ok(onPointerMove);
      const canvasElement = createElement({
        rect: { left: 0, top: 0, width: 1000, height: 1000 },
      });
      const target = createElement({
        closestMap: {
          '[data-slide-canvas-vnext="true"]': canvasElement,
        },
      });

      onPointerMove({
        clientX: 550,
        clientY: 150,
        target,
      } as unknown as React.PointerEvent<HTMLDivElement>);

      tree = renderTree();
      const stageCanvas = stageCanvasFrom(tree);
      assert.equal(
        (stageCanvas.props as { hoveredNodeId?: string | null }).hoveredNodeId,
        "hover-other",
      );
    });
  });

  test("right-clicking a stage node selects it for context actions", () => {
    withMockHTMLElement((createElement) => {
      const hookRenderer = createHookRenderer();
      const currentDeck = buildDeckV7([
        buildSlideV7(
          "content",
          [
            buildTextNode({
              id: "context-text",
              layout: { frame: { x: 20, y: 20, w: 30, h: 12 }, zIndex: 1 },
              content: {
                paragraphs: [{ id: "context-text-p1", text: "Context menu" }],
              },
            }),
          ],
          { id: "slide-context-menu", name: "Slide 1" },
        ),
      ]);

      const renderTree = () =>
        hookRenderer.run(() =>
          SlideEditorVNext({
            documentId: "doc-context-menu",
            deck: currentDeck,
            onDeckChange: () => undefined,
          }),
        );

      let tree = renderTree();
      const stageShell = findRequiredElement(
        tree,
        (element) =>
          element.type === "div" &&
          (element.props as { "data-slide-stage-shell"?: string })[
            "data-slide-stage-shell"
          ] === "true" &&
          typeof (element.props as { onContextMenu?: unknown })
            .onContextMenu === "function",
        "Expected stage shell with contextmenu handler.",
      );
      const onContextMenu = (
        stageShell.props as {
          onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
        }
      ).onContextMenu;
      assert.ok(onContextMenu);
      const canvasElement = createElement({
        rect: { left: 100, top: 200, width: 1000, height: 500 },
      });
      const target = createElement({
        closestMap: {
          '[data-slide-canvas-vnext="true"]': canvasElement,
        },
      });
      let prevented = false;
      let stopped = false;

      onContextMenu({
        clientX: 360,
        clientY: 330,
        target,
        preventDefault: () => {
          prevented = true;
        },
        stopPropagation: () => {
          stopped = true;
        },
      } as unknown as MouseEvent<HTMLDivElement>);

      assert.equal(prevented, true);
      assert.equal(stopped, true);
      tree = renderTree();
      const stageCanvas = findRequiredElement(
        tree,
        (element) => element.type === SlideCanvasVNext,
        "Expected stage canvas after context-menu selection.",
      );
      const selection = (
        stageCanvas.props as { selection?: { nodeIds?: ReadonlySet<string> } }
      ).selection;
      assert.ok(selection?.nodeIds?.has("context-text"));
    });
  });

  test("context menu detaches a bound connector endpoint", async () => {
    await withWindow(() =>
      withMockHTMLElement((createElement) => {
        const hookRenderer = createHookRenderer();
        let currentDeck = buildDeckV7([
          buildSlideV7(
            "content",
            [
              buildTextNode({
                id: "detach-a",
                layout: { frame: { x: 10, y: 10, w: 12, h: 12 }, zIndex: 1 },
              }),
              buildTextNode({
                id: "detach-b",
                layout: { frame: { x: 60, y: 10, w: 12, h: 12 }, zIndex: 2 },
              }),
              {
                id: "detach-connector",
                type: "connector" as const,
                role: "connector" as const,
                layout: { frame: { x: 22, y: 16, w: 38, h: 1 }, zIndex: 3 },
                style: { ref: "connector.primary" as const },
                content: {
                  from: {
                    kind: "node" as const,
                    nodeId: "detach-a",
                    anchor: "right" as const,
                  },
                  to: {
                    kind: "node" as const,
                    nodeId: "detach-b",
                    anchor: "left" as const,
                  },
                  routing: "straight" as const,
                },
              },
            ],
            { id: "slide-detach-connector", name: "Slide 1" },
          ),
        ]);

        const renderTree = () =>
          hookRenderer.run(() =>
            SlideEditorVNext({
              documentId: "doc-detach-connector",
              deck: currentDeck,
              onDeckChange: (nextDeck) => {
                currentDeck = nextDeck;
              },
            }),
          );

        let tree = renderTree();
        const stageShell = findRequiredElement(
          tree,
          (element) =>
            element.type === "div" &&
            (element.props as { "data-slide-stage-shell"?: string })[
              "data-slide-stage-shell"
            ] === "true" &&
            typeof (element.props as { onContextMenu?: unknown })
              .onContextMenu === "function",
          "Expected stage shell with contextmenu handler.",
        );
        const onContextMenu = (
          stageShell.props as {
            onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
          }
        ).onContextMenu;
        assert.ok(onContextMenu);
        const canvasElement = createElement({
          rect: { left: 0, top: 0, width: 1000, height: 1000 },
        });
        const target = createElement({
          closestMap: {
            '[data-slide-canvas-vnext="true"]': canvasElement,
          },
        });

        onContextMenu({
          clientX: 410,
          clientY: 165,
          target,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        } as unknown as MouseEvent<HTMLDivElement>);

        tree = renderTree();
        const menu = findRequiredElement(
          tree,
          (element) => element.type === StageNodeContextMenu,
          "Expected stage context menu to render.",
        );
        const detachStart = (
          menu.props as { onDetachConnectorFrom?: () => void }
        ).onDetachConnectorFrom;
        assert.equal(typeof detachStart, "function");
        detachStart?.();

        const connector = currentDeck.slides[0]?.children.find(
          (node) => node.id === "detach-connector" && node.type === "connector",
        );
        assert.ok(connector && connector.type === "connector");
        assert.equal(connector.content.from.kind, "point");
        if (connector.content.from.kind === "point") {
          assert.deepEqual(connector.content.from.point, { x: 0, y: 0 });
        }
      }),
    );
  });

  test("moving a node shows the live position badge", () => {
    withMockHTMLElement((createElement) =>
      withPointerWindow((listeners) => {
        const hookRenderer = createHookRenderer();
        const currentDeck = buildDeckV7([
          buildSlideV7(
            "content",
            [
              buildTextNode({
                id: "badge-move-node",
                layout: { frame: { x: 20, y: 20, w: 30, h: 12 }, zIndex: 1 },
              }),
            ],
            { id: "slide-badge-move", name: "Slide 1" },
          ),
        ]);

        const renderTree = () =>
          hookRenderer.run(() =>
            SlideEditorVNext({
              documentId: "doc-badge-move",
              deck: currentDeck,
              onDeckChange: () => undefined,
            }),
          );

        let tree = renderTree();
        const stageCanvas = findRequiredElement(
          tree,
          (element) => element.type === SlideCanvasVNext,
          "Expected stage canvas to render.",
        );
        const onNodePointerDown = (
          stageCanvas.props as {
            onNodePointerDown?: (
              nodeId: string,
              event: React.PointerEvent,
            ) => void;
          }
        ).onNodePointerDown;
        assert.ok(onNodePointerDown);
        const canvasElement = createElement({
          rect: { left: 0, top: 0, width: 1000, height: 1000 },
        });
        const currentTarget = createElement({
          closestMap: {
            '[data-slide-canvas-vnext="true"]': canvasElement,
          },
        });

        onNodePointerDown("badge-move-node", {
          button: 0,
          pointerId: 1,
          clientX: 200,
          clientY: 200,
          shiftKey: false,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          target: currentTarget,
          currentTarget,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        } as unknown as React.PointerEvent);
        listeners.get("pointermove")?.({
          clientX: 250,
          clientY: 220,
          altKey: true,
        } as PointerEvent);

        tree = renderTree();
        const badge = findRequiredElement(
          tree,
          (element) =>
            element.type === "div" &&
            (element.props as { "data-stage-gesture-badge"?: string })[
              "data-stage-gesture-badge"
            ] === "true",
          "Expected live move badge.",
        );
        assert.equal(flattenText(badge), "25, 22");
      }),
    );
  });

  test("dragging an already-selected text node does not enter inline edit", () => {
    withMockHTMLElement((createElement) =>
      withPointerWindow((listeners) => {
        const hookRenderer = createHookRenderer();
        const currentDeck = buildDeckV7([
          buildSlideV7(
            "content",
            [
              buildTextNode({
                id: "drag-selected-text",
                layout: { frame: { x: 20, y: 20, w: 30, h: 12 }, zIndex: 1 },
              }),
            ],
            { id: "slide-drag-selected-text", name: "Slide 1" },
          ),
        ]);

        const renderTree = () =>
          hookRenderer.run(() =>
            SlideEditorVNext({
              documentId: "doc-drag-selected-text",
              deck: currentDeck,
              onDeckChange: () => undefined,
            }),
          );
        const stageCanvasFrom = (root: ReactNode) =>
          findRequiredElement(
            root,
            (element) => element.type === SlideCanvasVNext,
            "Expected stage canvas to render.",
          );

        let tree = renderTree();
        focusNode(tree, "drag-selected-text");

        tree = renderTree();
        const selectedStageCanvas = stageCanvasFrom(tree);
        const selectedNodePointerDown = (
          selectedStageCanvas.props as {
            onNodePointerDown?: (
              nodeId: string,
              event: React.PointerEvent,
            ) => void;
          }
        ).onNodePointerDown;
        assert.ok(selectedNodePointerDown);
        const canvasElement = createElement({
          rect: { left: 0, top: 0, width: 1000, height: 1000 },
        });
        const currentTarget = createElement({
          closestMap: {
            '[data-slide-canvas-vnext="true"]': canvasElement,
          },
        });
        selectedNodePointerDown("drag-selected-text", {
          button: 0,
          pointerId: 1,
          clientX: 200,
          clientY: 200,
          shiftKey: false,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          target: currentTarget,
          currentTarget,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        } as unknown as React.PointerEvent);
        listeners.get("pointermove")?.({
          clientX: 250,
          clientY: 220,
          altKey: true,
        } as PointerEvent);
        listeners.get("pointerup")?.({
          clientX: 250,
          clientY: 220,
        } as PointerEvent);
        tree = renderTree();
        const updatedStageCanvas = stageCanvasFrom(tree);
        const hiddenNodeIds = (
          updatedStageCanvas.props as { hiddenNodeIds?: ReadonlySet<string> }
        ).hiddenNodeIds;
        assert.notEqual(hiddenNodeIds?.has("drag-selected-text"), true);
      }),
    );
  });

  test("dragging a preselected overlapping node moves it instead of the selected node", () => {
    withMockHTMLElement((createElement) =>
      withPointerWindow((listeners) => {
        const hookRenderer = createHookRenderer();
        let currentDeck = buildDeckV7([
          buildSlideV7(
            "content",
            [
              buildTextNode({
                id: "selected-under",
                layout: { frame: { x: 20, y: 20, w: 30, h: 12 }, zIndex: 1 },
              }),
              buildTextNode({
                id: "preselected-over",
                layout: { frame: { x: 20, y: 20, w: 30, h: 12 }, zIndex: 2 },
              }),
            ],
            { id: "slide-overlap-drag", name: "Slide 1" },
          ),
        ]);

        const renderTree = () =>
          hookRenderer.run(() =>
            SlideEditorVNext({
              documentId: "doc-overlap-drag",
              deck: currentDeck,
              onDeckChange: (nextDeck) => {
                currentDeck = nextDeck;
              },
            }),
          );

        let tree = renderTree();
        focusNode(tree, "selected-under");

        tree = renderTree();
        const canvasElement = createElement({
          rect: { left: 0, top: 0, width: 1000, height: 1000 },
        });
        const currentTarget = createElement({
          closestMap: {
            '[data-slide-canvas-vnext="true"]': canvasElement,
          },
        });
        nodePointerDownFrom(tree)("preselected-over", {
          button: 0,
          pointerId: 1,
          clientX: 250,
          clientY: 250,
          shiftKey: false,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          target: currentTarget,
          currentTarget,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        } as unknown as React.PointerEvent);
        listeners.get("pointermove")?.({
          clientX: 350,
          clientY: 250,
          altKey: false,
          shiftKey: false,
        } as PointerEvent);
        listeners.get("pointerup")?.({
          clientX: 350,
          clientY: 250,
        } as PointerEvent);

        const [selectedUnder, preselectedOver] =
          currentDeck.slides[0]?.children ?? [];
        assert.equal(selectedUnder?.id, "selected-under");
        assert.equal(preselectedOver?.id, "preselected-over");
        assert.equal(selectedUnder?.layout?.frame.x, 20);
        assert.equal(preselectedOver?.layout?.frame.x, 30);
      }),
    );
  });

  test("pressing another node exits the first node's inline edit", () => {
    withMockHTMLElement((createElement) =>
      withPointerWindow((listeners) => {
        const hookRenderer = createHookRenderer();
        const currentDeck = buildDeckV7([
          buildSlideV7(
            "content",
            [
              buildTextNode({
                id: "edit-first",
                layout: { frame: { x: 10, y: 10, w: 25, h: 12 }, zIndex: 1 },
              }),
              buildTextNode({
                id: "press-second",
                layout: { frame: { x: 60, y: 10, w: 25, h: 12 }, zIndex: 2 },
              }),
            ],
            { id: "slide-exit-edit", name: "Slide 1" },
          ),
        ]);

        const renderTree = () =>
          hookRenderer.run(() =>
            SlideEditorVNext({
              documentId: "doc-exit-edit",
              deck: currentDeck,
              onDeckChange: () => undefined,
            }),
          );
        const stageCanvasFrom = (root: ReactNode) =>
          findRequiredElement(
            root,
            (element) => element.type === SlideCanvasVNext,
            "Expected stage canvas to render.",
          );
        const hiddenNodeIdsFrom = (root: ReactNode) =>
          (
            stageCanvasFrom(root).props as {
              hiddenNodeIds?: ReadonlySet<string>;
            }
          ).hiddenNodeIds;
        const pointerDownFrom = (root: ReactNode) =>
          (
            stageCanvasFrom(root).props as {
              onNodePointerDown?: (
                nodeId: string,
                event: React.PointerEvent,
              ) => void;
            }
          ).onNodePointerDown;

        const canvasElement = createElement({
          rect: { left: 0, top: 0, width: 1000, height: 1000 },
        });
        const currentTarget = createElement({
          closestMap: {
            '[data-slide-canvas-vnext="true"]': canvasElement,
          },
        });
        const pressNode = (
          pointerDown: (nodeId: string, event: React.PointerEvent) => void,
          nodeId: string,
          clientX: number,
        ) => {
          pointerDown(nodeId, {
            button: 0,
            pointerId: 1,
            clientX,
            clientY: 120,
            shiftKey: false,
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            target: currentTarget,
            currentTarget,
            preventDefault: () => undefined,
            stopPropagation: () => undefined,
          } as unknown as React.PointerEvent);
          listeners.get("pointerup")?.({
            clientX,
            clientY: 120,
          } as PointerEvent);
        };

        let tree = renderTree();
        focusNode(tree, "edit-first");

        tree = renderTree();
        const selectedPointerDown = pointerDownFrom(tree);
        assert.ok(selectedPointerDown);
        pressNode(selectedPointerDown, "edit-first", 120);

        tree = renderTree();
        assert.ok(
          hiddenNodeIdsFrom(tree)?.has("edit-first"),
          "Expected first node to enter inline edit mode.",
        );

        const pressSecondPointerDown = pointerDownFrom(tree);
        assert.ok(pressSecondPointerDown);
        pressNode(pressSecondPointerDown, "press-second", 620);

        tree = renderTree();
        assert.notEqual(
          hiddenNodeIdsFrom(tree)?.has("edit-first"),
          true,
          "Expected pressing another node to exit the first node's inline edit.",
        );
      }),
    );
  });

  test("alt-dragging a node duplicates it at the drop point", () => {
    withMockHTMLElement((createElement) =>
      withPointerWindow((listeners) => {
        const hookRenderer = createHookRenderer();
        let currentDeck = buildDeckV7([
          buildSlideV7(
            "content",
            [
              buildTextNode({
                id: "alt-drag-source",
                layout: { frame: { x: 20, y: 20, w: 30, h: 12 }, zIndex: 1 },
              }),
            ],
            { id: "slide-alt-drag", name: "Slide 1" },
          ),
        ]);

        const renderTree = () =>
          hookRenderer.run(() =>
            SlideEditorVNext({
              documentId: "doc-alt-drag",
              deck: currentDeck,
              onDeckChange: (nextDeck) => {
                currentDeck = nextDeck;
              },
            }),
          );
        const stageCanvasFrom = (root: ReactNode) =>
          findRequiredElement(
            root,
            (element) => element.type === SlideCanvasVNext,
            "Expected stage canvas to render.",
          );

        let tree = renderTree();
        const stageCanvas = stageCanvasFrom(tree);
        const onNodePointerDown = (
          stageCanvas.props as {
            onNodePointerDown?: (
              nodeId: string,
              event: React.PointerEvent,
            ) => void;
          }
        ).onNodePointerDown;
        assert.ok(onNodePointerDown);

        const canvasElement = createElement({
          rect: { left: 0, top: 0, width: 1000, height: 1000 },
        });
        const currentTarget = createElement({
          closestMap: {
            '[data-slide-canvas-vnext="true"]': canvasElement,
          },
        });
        onNodePointerDown("alt-drag-source", {
          button: 0,
          pointerId: 1,
          clientX: 200,
          clientY: 200,
          shiftKey: false,
          metaKey: false,
          ctrlKey: false,
          altKey: true,
          target: currentTarget,
          currentTarget,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        } as unknown as React.PointerEvent);
        listeners.get("pointermove")?.({
          clientX: 350,
          clientY: 260,
          altKey: true,
          shiftKey: false,
        } as PointerEvent);
        listeners.get("pointerup")?.({
          clientX: 350,
          clientY: 260,
        } as PointerEvent);

        const children = currentDeck.slides[0]?.children ?? [];
        assert.equal(
          children.length,
          2,
          "Expected the original plus one duplicate.",
        );
        const original = children.find((node) => node.id === "alt-drag-source");
        assert.ok(original);
        assert.deepEqual(
          original.layout?.frame,
          { x: 20, y: 20, w: 30, h: 12 },
          "Expected the original to stay in place.",
        );
        const duplicate = children.find(
          (node) => node.id !== "alt-drag-source",
        );
        assert.ok(duplicate, "Expected a duplicate node to be created.");
        const frame = duplicate.layout?.frame;
        assert.ok(frame);
        assert.ok(
          frame.x > 20 && frame.y > 20,
          "Expected the duplicate to land at the moved position.",
        );

        tree = renderTree();
        const updatedStageCanvas = stageCanvasFrom(tree);
        const selectedNodeIds = (
          updatedStageCanvas.props as {
            selection?: { nodeIds?: ReadonlySet<string> };
          }
        ).selection?.nodeIds;
        assert.equal(
          selectedNodeIds?.has(duplicate.id),
          true,
          "Expected the duplicate to become selected.",
        );
      }),
    );
  });

  test("resizing a node shows the live size badge", () => {
    withMockHTMLElement((createElement) =>
      withPointerWindow((listeners) => {
        const hookRenderer = createHookRenderer();
        const currentDeck = buildDeckV7([
          buildSlideV7(
            "content",
            [
              buildTextNode({
                id: "badge-resize-node",
                layout: { frame: { x: 20, y: 20, w: 30, h: 12 }, zIndex: 1 },
              }),
            ],
            { id: "slide-badge-resize", name: "Slide 1" },
          ),
        ]);

        const renderTree = () =>
          hookRenderer.run(() =>
            SlideEditorVNext({
              documentId: "doc-badge-resize",
              deck: currentDeck,
              onDeckChange: () => undefined,
            }),
          );

        let tree = renderTree();
        const stageCanvas = findRequiredElement(
          tree,
          (element) => element.type === SlideCanvasVNext,
          "Expected stage canvas to render.",
        );
        const onResizeHandlePointerDown = (
          stageCanvas.props as {
            onResizeHandlePointerDown?: (
              nodeId: string,
              handle: "se",
              event: React.PointerEvent,
            ) => void;
          }
        ).onResizeHandlePointerDown;
        assert.ok(onResizeHandlePointerDown);
        const canvasElement = createElement({
          rect: { left: 0, top: 0, width: 1000, height: 1000 },
        });
        const currentTarget = createElement({
          closestMap: {
            '[data-slide-canvas-vnext="true"]': canvasElement,
          },
        });

        onResizeHandlePointerDown("badge-resize-node", "se", {
          button: 0,
          pointerId: 1,
          clientX: 500,
          clientY: 320,
          altKey: false,
          target: currentTarget,
          currentTarget,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        } as unknown as React.PointerEvent);
        listeners.get("pointermove")?.({
          clientX: 550,
          clientY: 350,
          altKey: true,
        } as PointerEvent);

        tree = renderTree();
        const badge = findRequiredElement(
          tree,
          (element) =>
            element.type === "div" &&
            (element.props as { "data-stage-gesture-badge"?: string })[
              "data-stage-gesture-badge"
            ] === "true",
          "Expected live resize badge.",
        );
        assert.equal(flattenText(badge), "35 × 15");
      }),
    );
  });

  test("bare c connects exactly two selected nodes", async () => {
    await withWindow(() =>
      withMockHTMLElement((createElement) =>
        withPointerWindow((listeners) => {
          const hookRenderer = createHookRenderer();
          let currentDeck = buildDeckV7([
            buildSlideV7(
              "content",
              [
                buildTextNode({
                  id: "connect-a",
                  layout: { frame: { x: 10, y: 10, w: 12, h: 12 }, zIndex: 1 },
                }),
                buildTextNode({
                  id: "connect-b",
                  layout: { frame: { x: 60, y: 10, w: 12, h: 12 }, zIndex: 2 },
                }),
              ],
              { id: "slide-connect-pair", name: "Slide 1" },
            ),
          ]);

          const renderTree = () =>
            hookRenderer.run(() =>
              SlideEditorVNext({
                documentId: "doc-connect-pair",
                deck: currentDeck,
                onDeckChange: (nextDeck) => {
                  currentDeck = nextDeck;
                },
              }),
            );
          const editorRootFrom = (root: ReactNode) =>
            findRequiredElement(
              root,
              (element) =>
                element.type === "div" &&
                (element.props as { "data-slide-editor-vnext"?: string })[
                  "data-slide-editor-vnext"
                ] === "true" &&
                typeof (element.props as { onKeyDown?: unknown }).onKeyDown ===
                  "function",
              "Expected editor root with keydown handler.",
            );

          let tree = renderTree();
          focusNode(tree, "connect-a");
          tree = renderTree();
          clickNode(tree, listeners, createElement, "connect-b", {
            clientX: 660,
            clientY: 160,
            shiftKey: true,
          });

          tree = renderTree();
          const onKeyDown = (
            editorRootFrom(tree).props as {
              onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
            }
          ).onKeyDown;
          assert.ok(onKeyDown);
          let prevented = false;
          onKeyDown({
            key: "c",
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            target: null,
            preventDefault: () => {
              prevented = true;
            },
          } as unknown as KeyboardEvent<HTMLDivElement>);

          assert.equal(prevented, true);
          const connector = currentDeck.slides[0]?.children.find(
            (node) => node.type === "connector",
          );
          assert.ok(connector);
          assert.equal(connector.content.from.kind, "node");
          assert.equal(connector.content.to.kind, "node");
          if (connector.content.from.kind === "node") {
            assert.equal(connector.content.from.nodeId, "connect-a");
          }
          if (connector.content.to.kind === "node") {
            assert.equal(connector.content.to.nodeId, "connect-b");
          }
        }),
      ),
    );
  });

  test("bare c starts connector mode and Enter confirms target", async () => {
    await withWindow(() => {
      const hookRenderer = createHookRenderer();
      let currentDeck = buildDeckV7([
        buildSlideV7(
          "content",
          [
            buildTextNode({
              id: "connect-source",
              layout: { frame: { x: 10, y: 10, w: 12, h: 12 }, zIndex: 1 },
            }),
            buildTextNode({
              id: "connect-target",
              layout: { frame: { x: 60, y: 10, w: 12, h: 12 }, zIndex: 2 },
            }),
          ],
          { id: "slide-connect-mode", name: "Slide 1" },
        ),
      ]);

      const renderTree = () =>
        hookRenderer.run(() =>
          SlideEditorVNext({
            documentId: "doc-connect-mode",
            deck: currentDeck,
            onDeckChange: (nextDeck) => {
              currentDeck = nextDeck;
            },
          }),
        );
      const stageCanvasFrom = (root: ReactNode) =>
        findRequiredElement(
          root,
          (element) => element.type === SlideCanvasVNext,
          "Expected stage canvas to render.",
        );
      const keyDownFrom = (root: ReactNode) =>
        (
          findRequiredElement(
            root,
            (element) =>
              element.type === "div" &&
              (element.props as { "data-slide-editor-vnext"?: string })[
                "data-slide-editor-vnext"
              ] === "true" &&
              typeof (element.props as { onKeyDown?: unknown }).onKeyDown ===
                "function",
            "Expected editor root with keydown handler.",
          ).props as {
            onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
          }
        ).onKeyDown;

      let tree = renderTree();
      focusNode(tree, "connect-source");

      tree = renderTree();
      keyDownFrom(tree)?.({
        key: "c",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: null,
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent<HTMLDivElement>);

      tree = renderTree();
      const selection = (
        stageCanvasFrom(tree).props as {
          selection?: { nodeIds?: ReadonlySet<string> };
        }
      ).selection;
      assert.ok(selection?.nodeIds?.has("connect-source"));
      assert.ok(selection?.nodeIds?.has("connect-target"));

      keyDownFrom(tree)?.({
        key: "Enter",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: null,
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent<HTMLDivElement>);

      const connector = currentDeck.slides[0]?.children.find(
        (node) => node.type === "connector",
      );
      assert.ok(connector);
      assert.equal(connector.content.from.kind, "node");
      assert.equal(connector.content.to.kind, "node");
    });
  });

  test("bare c cycles the selected connector end anchor", async () => {
    await withWindow(() => {
      const hookRenderer = createHookRenderer();
      let currentDeck = buildDeckV7([
        buildSlideV7(
          "content",
          [
            buildTextNode({
              id: "anchor-a",
              layout: { frame: { x: 10, y: 10, w: 12, h: 12 }, zIndex: 1 },
            }),
            buildTextNode({
              id: "anchor-b",
              layout: { frame: { x: 60, y: 10, w: 12, h: 12 }, zIndex: 2 },
            }),
            {
              id: "anchor-connector",
              type: "connector" as const,
              role: "connector" as const,
              layout: { frame: { x: 22, y: 16, w: 38, h: 1 }, zIndex: 3 },
              style: { ref: "connector.primary" as const },
              content: {
                from: {
                  kind: "node" as const,
                  nodeId: "anchor-a",
                  anchor: "right" as const,
                },
                to: {
                  kind: "node" as const,
                  nodeId: "anchor-b",
                  anchor: "left" as const,
                },
                routing: "straight" as const,
              },
            },
          ],
          { id: "slide-anchor-cycle", name: "Slide 1" },
        ),
      ]);

      const renderTree = () =>
        hookRenderer.run(() =>
          SlideEditorVNext({
            documentId: "doc-anchor-cycle",
            deck: currentDeck,
            onDeckChange: (nextDeck) => {
              currentDeck = nextDeck;
            },
          }),
        );
      let tree = renderTree();
      focusNode(tree, "anchor-connector");

      tree = renderTree();
      const editorRoot = findRequiredElement(
        tree,
        (element) =>
          element.type === "div" &&
          (element.props as { "data-slide-editor-vnext"?: string })[
            "data-slide-editor-vnext"
          ] === "true" &&
          typeof (element.props as { onKeyDown?: unknown }).onKeyDown ===
            "function",
        "Expected editor root with keydown handler.",
      );
      const onKeyDown = (
        editorRoot.props as {
          onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
        }
      ).onKeyDown;
      assert.ok(onKeyDown);
      onKeyDown({
        key: "c",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: null,
        preventDefault: () => undefined,
      } as unknown as KeyboardEvent<HTMLDivElement>);

      const connector = currentDeck.slides[0]?.children.find(
        (node) => node.id === "anchor-connector" && node.type === "connector",
      );
      assert.ok(connector && connector.type === "connector");
      assert.equal(connector.content.to.kind, "node");
      if (connector.content.to.kind === "node") {
        assert.equal(connector.content.to.anchor, "right");
      }
    });
  });

  test("supports keyboard rotation with shifted bracket shortcuts", () => {
    withMockHTMLElement(() => {
      const hookRenderer = createHookRenderer();
      let currentDeck = buildDeckV7(
        [
          buildSlideV7(
            "content",
            [
              buildImageNode("img-001", {
                id: "image-primary",
                name: "Primary image",
                layout: { frame: { x: 12, y: 16, w: 36, h: 48 }, zIndex: 1 },
              }),
            ],
            { id: "slide-rotation", name: "Slide 1" },
          ),
        ],
        { title: "Keyboard rotation deck" },
      );

      const renderTree = () =>
        hookRenderer.run(() =>
          SlideEditorVNext({
            documentId: "doc-rotation",
            deck: currentDeck,
            onDeckChange: (nextDeck) => {
              currentDeck = nextDeck;
            },
          }),
        );

      let tree = renderTree();
      focusNode(tree, "image-primary");

      tree = renderTree();
      const editorRoot = findRequiredElement(
        tree,
        (element) =>
          element.type === "div" &&
          (element.props as { "data-slide-editor-vnext"?: string })[
            "data-slide-editor-vnext"
          ] === "true" &&
          typeof (element.props as { onKeyDown?: unknown }).onKeyDown ===
            "function",
        "Expected editor root with keydown handler.",
      );
      const onKeyDown = (
        editorRoot.props as {
          onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
        }
      ).onKeyDown;
      assert.ok(onKeyDown);
      let prevented = false;
      onKeyDown?.({
        key: "{",
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: null,
        preventDefault: () => {
          prevented = true;
        },
      } as unknown as KeyboardEvent<HTMLDivElement>);

      assert.equal(prevented, true);
      const rotatedNode = currentDeck.slides[0]?.children[0];
      assert.ok(rotatedNode?.layout);
      assert.equal(rotatedNode.layout.rotation, -1);

      tree = renderTree();
      const stageLiveRegion = findRequiredElement(
        tree,
        (element) =>
          element.type === "div" &&
          (element.props as { "aria-live"?: string })["aria-live"] ===
            "polite" &&
          flattenText(element).includes("Rotated Primary image to 359°"),
        "Expected keyboard rotation announcement in the stage live region.",
      );
      assert.match(
        flattenText(stageLiveRegion),
        /Rotated Primary image to 359°/,
      );
    });
  });

  describe("SlideEditorVNext empty-canvas double-click behavior", () => {
    test("inserts a text node at the canvas point and enters inline edit mode", () => {
      withMockHTMLElement((createElement) => {
        const hookRenderer = createHookRenderer();
        let deckChangeCount = 0;
        let currentDeck = buildDeckV7(
          [buildSlideV7("content", [], { id: "slide-empty", name: "Slide 1" })],
          { title: "Double-click insertion deck" },
        );

        const renderTree = () =>
          hookRenderer.run(() =>
            SlideEditorVNext({
              documentId: "doc-double-click",
              deck: currentDeck,
              onDeckChange: (nextDeck) => {
                deckChangeCount += 1;
                currentDeck = nextDeck;
              },
            }),
          );

        let tree = renderTree();
        const stageShell = findRequiredElement(
          tree,
          (element) =>
            element.type === "div" &&
            (element.props as { "data-slide-stage-shell"?: string })[
              "data-slide-stage-shell"
            ] === "true" &&
            typeof (element.props as { onDoubleClick?: unknown })
              .onDoubleClick === "function",
          "Expected stage shell with double-click handler.",
        );
        const onStageDoubleClick = (
          stageShell.props as {
            onDoubleClick?: (event: MouseEvent<HTMLDivElement>) => void;
          }
        ).onDoubleClick;
        assert.ok(onStageDoubleClick);

        const canvasElement = createElement({
          rect: { left: 100, top: 200, width: 1000, height: 500 },
        });
        const target = createElement({
          closestMap: {
            '[data-slide-canvas-vnext="true"]': canvasElement,
          },
        });

        onStageDoubleClick?.({
          clientX: 850,
          clientY: 450,
          target,
        } as unknown as MouseEvent<HTMLDivElement>);

        assert.equal(deckChangeCount, 1, "Expected one deck update.");
        const inserted = currentDeck.slides[0]?.children.at(-1);
        assert.ok(inserted && inserted.type === "text");
        assert.equal(currentDeck.slides[0]?.children.length, 1);
        assert.deepEqual(inserted.layout?.frame, {
          x: 54,
          y: 44,
          w: 42,
          h: 12,
        });

        tree = renderTree();
        const stageCanvas = findRequiredElement(
          tree,
          (element) => element.type === SlideCanvasVNext,
          "Expected stage canvas to render.",
        );
        const hiddenNodeIds = (
          stageCanvas.props as {
            hiddenNodeIds?: ReadonlySet<string>;
          }
        ).hiddenNodeIds;
        assert.ok(hiddenNodeIds?.has(inserted.id));

        const selection = (
          stageCanvas.props as {
            selection?: { nodeIds?: ReadonlySet<string> };
          }
        ).selection;
        assert.ok(
          selection?.nodeIds?.has(inserted.id),
          "Expected inserted node to be selected.",
        );
      });
    });

    test("double-clicking an existing text node enters edit mode without inserting", () => {
      const hookRenderer = createHookRenderer();
      let deckChangeCount = 0;
      let currentDeck = buildDeckV7([
        buildSlideV7(
          "content",
          [
            buildTextNode({
              id: "existing-text",
              layout: { frame: { x: 20, y: 24, w: 36, h: 12 }, zIndex: 1 },
            }),
          ],
          { id: "slide-with-text", name: "Slide 1" },
        ),
      ]);

      const renderTree = () =>
        hookRenderer.run(() =>
          SlideEditorVNext({
            documentId: "doc-node-double-click",
            deck: currentDeck,
            onDeckChange: (nextDeck) => {
              deckChangeCount += 1;
              currentDeck = nextDeck;
            },
          }),
        );

      let tree = renderTree();
      const stageCanvas = findRequiredElement(
        tree,
        (element) =>
          element.type === SlideCanvasVNext &&
          typeof (
            element.props as {
              onNodeDoubleClick?: (nodeId: string, event: MouseEvent) => void;
            }
          ).onNodeDoubleClick === "function",
        "Expected stage canvas with node double-click handler.",
      );
      const onNodeDoubleClick = (
        stageCanvas.props as {
          onNodeDoubleClick?: (nodeId: string, event: MouseEvent) => void;
        }
      ).onNodeDoubleClick;
      assert.ok(onNodeDoubleClick);
      onNodeDoubleClick?.("existing-text", {} as MouseEvent);

      tree = renderTree();
      assert.equal(
        deckChangeCount,
        0,
        "Expected no deck mutation on node edit.",
      );
      assert.equal(
        currentDeck.slides[0]?.children.length,
        1,
        "Expected existing node count to remain unchanged.",
      );

      const updatedStageCanvas = findRequiredElement(
        tree,
        (element) => element.type === SlideCanvasVNext,
        "Expected stage canvas after node double-click.",
      );
      const hiddenNodeIds = (
        updatedStageCanvas.props as {
          hiddenNodeIds?: ReadonlySet<string>;
        }
      ).hiddenNodeIds;
      assert.ok(hiddenNodeIds?.has("existing-text"));
    });

    test("clicking the already-selected text node enters edit mode at the click point", () => {
      withMockHTMLElement((createElement) =>
        withPointerWindow((listeners) => {
          const hookRenderer = createHookRenderer();
          const currentDeck = buildDeckV7([
            buildSlideV7(
              "content",
              [
                buildTextNode({
                  id: "selected-text",
                  layout: {
                    frame: { x: 20, y: 24, w: 36, h: 12 },
                    zIndex: 1,
                  },
                  content: {
                    paragraphs: [
                      {
                        id: "selected-text-p1",
                        text: "Place the caret here",
                      },
                    ],
                  },
                }),
              ],
              { id: "slide-with-selected-text", name: "Slide 1" },
            ),
          ]);

          const renderTree = () =>
            hookRenderer.run(() =>
              SlideEditorVNext({
                documentId: "doc-selected-click",
                deck: currentDeck,
                onDeckChange: () => undefined,
              }),
            );
          const stageCanvasFrom = (root: ReactNode) =>
            findRequiredElement(
              root,
              (element) => element.type === SlideCanvasVNext,
              "Expected stage canvas to render.",
            );

          let tree = renderTree();
          focusNode(tree, "selected-text");

          tree = renderTree();
          const selectedStageCanvas = stageCanvasFrom(tree);
          const onNodePointerDown = (
            selectedStageCanvas.props as {
              onNodePointerDown?: (
                nodeId: string,
                event: React.PointerEvent,
              ) => void;
            }
          ).onNodePointerDown;
          assert.ok(onNodePointerDown);
          const canvasElement = createElement({
            rect: { left: 0, top: 0, width: 1000, height: 1000 },
          });
          const currentTarget = createElement({
            closestMap: {
              '[data-slide-canvas-vnext="true"]': canvasElement,
            },
          });
          onNodePointerDown("selected-text", {
            button: 0,
            pointerId: 1,
            clientX: 372,
            clientY: 246,
            shiftKey: false,
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            target: currentTarget,
            currentTarget,
            preventDefault: () => undefined,
            stopPropagation: () => undefined,
          } as unknown as React.PointerEvent);
          listeners.get("pointerup")?.({
            clientX: 372,
            clientY: 246,
          } as PointerEvent);

          tree = renderTree();
          const updatedStageCanvas = stageCanvasFrom(tree);
          const hiddenNodeIds = (
            updatedStageCanvas.props as {
              hiddenNodeIds?: ReadonlySet<string>;
            }
          ).hiddenNodeIds;
          assert.ok(
            hiddenNodeIds?.has("selected-text"),
            "Expected selected text click to enter inline edit mode.",
          );
        }),
      );
    });

    test("clicking an already-selected shape does not enter inline edit", () => {
      withMockHTMLElement((createElement) =>
        withPointerWindow((listeners) => {
          const hookRenderer = createHookRenderer();
          const currentDeck = buildDeckV7([
            buildSlideV7(
              "content",
              [
                buildShapeNode({
                  id: "empty-shape",
                  layout: {
                    frame: { x: 20, y: 24, w: 36, h: 12 },
                    zIndex: 1,
                  },
                  content: { shape: "rect" },
                }),
              ],
              { id: "slide-with-empty-shape", name: "Slide 1" },
            ),
          ]);

          const renderTree = () =>
            hookRenderer.run(() =>
              SlideEditorVNext({
                documentId: "doc-selected-empty-shape-click",
                deck: currentDeck,
                onDeckChange: () => undefined,
              }),
            );
          const stageCanvasFrom = (root: ReactNode) =>
            findRequiredElement(
              root,
              (element) => element.type === SlideCanvasVNext,
              "Expected stage canvas to render.",
            );

          let tree = renderTree();
          focusNode(tree, "empty-shape");

          tree = renderTree();
          const selectedStageCanvas = stageCanvasFrom(tree);
          const onNodePointerDown = (
            selectedStageCanvas.props as {
              onNodePointerDown?: (
                nodeId: string,
                event: React.PointerEvent,
              ) => void;
            }
          ).onNodePointerDown;
          assert.ok(onNodePointerDown);
          const canvasElement = createElement({
            rect: { left: 0, top: 0, width: 1000, height: 1000 },
          });
          const currentTarget = createElement({
            closestMap: {
              '[data-slide-canvas-vnext="true"]': canvasElement,
            },
          });
          onNodePointerDown("empty-shape", {
            button: 0,
            pointerId: 1,
            clientX: 372,
            clientY: 246,
            shiftKey: false,
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            target: currentTarget,
            currentTarget,
            preventDefault: () => undefined,
            stopPropagation: () => undefined,
          } as unknown as React.PointerEvent);
          listeners.get("pointerup")?.({
            clientX: 372,
            clientY: 246,
          } as PointerEvent);

          tree = renderTree();
          const updatedStageCanvas = stageCanvasFrom(tree);
          const hiddenNodeIds = (
            updatedStageCanvas.props as {
              hiddenNodeIds?: ReadonlySet<string>;
            }
          ).hiddenNodeIds;
          assert.notEqual(
            hiddenNodeIds?.has("empty-shape"),
            true,
            "Expected selected shape click to stay out of inline edit mode.",
          );
        }),
      );
    });
  });

  describe("SlideEditorVNext semantic hit testing parity", () => {
    test("semantic click selects covered text under a large covering shape", () => {
      withMockHTMLElement((createElement) =>
        withPointerWindow((listeners) => {
          const hookRenderer = createHookRenderer();
          let currentDeck = buildDeckV7([
            buildSlideV7(
              "content",
              [
                buildTextNode({
                  id: "covered-text",
                  layout: { frame: { x: 10, y: 40, w: 80, h: 20 }, zIndex: 1 },
                  content: {
                    paragraphs: [
                      {
                        id: "covered-text-p1",
                        text: "Quarterly revenue growth reached 37 percent.",
                      },
                    ],
                  },
                }),
                buildShapeNode({
                  id: "cover-shape",
                  layout: { frame: { x: 0, y: 0, w: 100, h: 100 }, zIndex: 20 },
                  content: { shape: "rect" },
                }),
              ],
              { id: "slide-overlap", name: "Slide 1" },
            ),
          ]);

          const renderTree = () =>
            hookRenderer.run(() =>
              SlideEditorVNext({
                documentId: "doc-semantic-click",
                deck: currentDeck,
                onDeckChange: (nextDeck) => {
                  currentDeck = nextDeck;
                },
              }),
            );

          let tree = renderTree();
          clickNode(tree, listeners, createElement, "cover-shape", {
            clientX: 220,
            clientY: 450,
            canvasRect: { left: 100, top: 200, width: 1000, height: 500 },
          });

          tree = renderTree();
          const updatedCanvas = findRequiredElement(
            tree,
            (element) => element.type === SlideCanvasVNext,
            "Expected updated stage canvas.",
          );
          const selection = (
            updatedCanvas.props as {
              selection?: { nodeIds?: ReadonlySet<string> };
            }
          ).selection;
          assert.ok(
            selection?.nodeIds?.has("covered-text"),
            "Expected semantic click to select the covered text node.",
          );
        }),
      );
    });

    test("Alt+] cycles to covered nodes for select-under parity", async () => {
      await withWindow(async () =>
        withMockHTMLElement((createElement) =>
          withPointerWindow((listeners) => {
            const hookRenderer = createHookRenderer();
            let currentDeck = buildDeckV7([
              buildSlideV7(
                "content",
                [
                  buildTextNode({
                    id: "covered-text",
                    layout: {
                      frame: { x: 10, y: 40, w: 80, h: 20 },
                      zIndex: 1,
                    },
                    content: {
                      paragraphs: [
                        {
                          id: "covered-text-p1",
                          text: "Quarterly revenue growth reached 37 percent.",
                        },
                      ],
                    },
                  }),
                  buildShapeNode({
                    id: "cover-shape",
                    layout: {
                      frame: { x: 0, y: 0, w: 100, h: 100 },
                      zIndex: 20,
                    },
                    content: { shape: "rect" },
                  }),
                ],
                { id: "slide-select-under", name: "Slide 1" },
              ),
            ]);

            const renderTree = () =>
              hookRenderer.run(() =>
                SlideEditorVNext({
                  documentId: "doc-select-under",
                  deck: currentDeck,
                  onDeckChange: (nextDeck) => {
                    currentDeck = nextDeck;
                  },
                }),
              );

            let tree = renderTree();
            clickNode(tree, listeners, createElement, "cover-shape", {
              clientX: 500,
              clientY: 300,
              canvasRect: { left: 100, top: 200, width: 1000, height: 500 },
            });

            tree = renderTree();
            const editorRoot = findRequiredElement(
              tree,
              (element) =>
                element.type === "div" &&
                (element.props as { "data-slide-editor-vnext"?: string })[
                  "data-slide-editor-vnext"
                ] === "true" &&
                typeof (element.props as { onKeyDown?: unknown }).onKeyDown ===
                  "function",
              "Expected editor root keydown handler.",
            );
            const onEditorKeyDown = (
              editorRoot.props as {
                onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
              }
            ).onKeyDown;
            assert.ok(onEditorKeyDown, "Expected editor keydown handler.");
            let prevented = false;
            onEditorKeyDown?.({
              key: "]",
              altKey: true,
              target: createElement(),
              preventDefault: () => {
                prevented = true;
              },
            } as unknown as KeyboardEvent<HTMLDivElement>);

            tree = renderTree();
            const updatedCanvas = findRequiredElement(
              tree,
              (element) => element.type === SlideCanvasVNext,
              "Expected stage canvas after Alt+] cycle.",
            );
            const selection = (
              updatedCanvas.props as {
                selection?: { nodeIds?: ReadonlySet<string> };
              }
            ).selection;
            assert.equal(
              prevented,
              true,
              "Expected Alt+] keydown to be handled.",
            );
            assert.ok(
              selection?.nodeIds?.has("covered-text"),
              "Expected Alt+] to cycle to the covered text node.",
            );
          }),
        ),
      );
    });
  });
});
