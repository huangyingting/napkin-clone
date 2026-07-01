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
} from "@/test/builders/deck-v7";
import { InspectorShell } from "./inspector";
import { SlideCanvasVNext } from "./slide-canvas";
import {
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
      (element) =>
        element.type === "button" &&
        (element.props as { "aria-label"?: string })["aria-label"] ===
          "Export as PPTX",
      "Expected export button to render.",
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

      const inspectorShell = findRequiredElement(
        tree,
        (element) =>
          element.type === InspectorShell &&
          typeof (element.props as { onReplaceImage?: () => void })
            .onReplaceImage === "function",
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
        tree,
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
});
