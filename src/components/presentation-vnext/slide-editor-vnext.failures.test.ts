import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as React from "react";
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
  type MouseEvent,
} from "react";

import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import {
  buildDeckV7,
  buildImageNode,
  buildSlideV7,
  buildTextNode,
} from "@/test/builders/deck-v7";
import { InspectorShell } from "./inspector";
import { SlideCanvasVNext } from "./slide-canvas";
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

function collectElements(
  node: ReactNode,
  predicate: (element: ReactElement) => boolean,
  collected: ReactElement[] = [],
): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, predicate, collected);
    return collected;
  }
  if (!isValidElement(node)) return collected;
  if (predicate(node)) collected.push(node);
  const props = node.props as { children?: ReactNode };
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

  const slots: unknown[] = [];

  function run<T>(renderComponent: () => T): T {
    let hookIndex = 0;
    const previous = internals.H;

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

    internals.H = dispatcher;
    try {
      return renderComponent();
    } finally {
      internals.H = previous;
    }
  }

  return { run };
}

function findRequiredElement(
  root: ReactNode,
  predicate: (element: ReactElement) => boolean,
  message: string,
): ReactElement {
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
  const globalWithWindow = globalThis as typeof globalThis & {
    window?: { setTimeout: typeof setTimeout };
  };
  const previousWindow = globalWithWindow.window;
  globalWithWindow.window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
  };
  try {
    return await run();
  } finally {
    if (previousWindow === undefined) delete globalWithWindow.window;
    else globalWithWindow.window = previousWindow;
  }
}

function withMockHTMLElement<T>(
  run: (
    createElement: (args?: {
      closestMap?: Record<string, unknown>;
      queryMap?: Record<string, unknown>;
      rect?: { left: number; top: number; width: number; height: number };
    }) => HTMLElement,
  ) => T,
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

      const stageCanvas = findRequiredElement(
        tree,
        (element) =>
          element.type === SlideCanvasVNext &&
          typeof (
            element.props as {
              onNodeClick?: (nodeId: string, event: MouseEvent) => void;
            }
          ).onNodeClick === "function",
        "Expected stage canvas with node click handler.",
      );

      const onNodeClick = (
        stageCanvas.props as {
          onNodeClick?: (nodeId: string, event: MouseEvent) => void;
        }
      ).onNodeClick;
      assert.ok(onNodeClick);
      onNodeClick("image-primary", {
        shiftKey: false,
        metaKey: false,
      } as MouseEvent);

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
  });
});
