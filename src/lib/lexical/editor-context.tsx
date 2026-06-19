"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isLinkNode } from "@lexical/link";
import { $isListNode, ListNode } from "@lexical/list";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $getSelectionStyleValueForProperty } from "@lexical/selection";
import { $getNearestNodeOfType, mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
  type ElementFormatType,
  type LexicalNode,
} from "lexical";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The single, typed snapshot of editor selection state that every contextual
 * surface (floating toolbar, insert menu, block gutter, visual controls) will
 * eventually read from instead of deriving its own. It is a strict *superset* of
 * what the four existing controls compute today:
 *
 * - `floating-toolbar.tsx` → `kind: 'range'`, `activeFormats`, `isLink`,
 *   `blockType`, `rects.selection`.
 * - `insert-menu.tsx` → `kind: 'collapsed' | 'empty-block'`, `blockKey`,
 *   `blockText`, `blockType`, `rects.block`.
 * - `block-spark.tsx` → `blockKey`, `blockText`, `rects.block` (the spark itself
 *   is pointer-hover driven, which stays local to that plugin).
 * - `visual-card.tsx` → `kind: 'visual'`, `selectedVisualId`,
 *   `selectedVisualNodeKey`.
 *
 * It is derived read-only from the Lexical selection. It never mutates the
 * document, never touches Yjs, and the only NodeKey it exposes
 * (`selectedVisualNodeKey` / `blockKey`) is a *live, transient* key for use
 * inside an immediate `editor.update()` — it is never persisted.
 */
export type EditorContextKind =
  | "range" // a non-collapsed text selection
  | "collapsed" // a collapsed caret inside a non-empty block
  | "empty-block" // a collapsed caret inside an empty paragraph
  | "visual" // a VisualNode (decorator) is selected
  | "none"; // no usable selection / editor blurred

/** Top-level block type, matching what `floating-toolbar.tsx` derives today. */
export type EditorBlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "bullet"
  | "number";

/** Inline text formats tracked on the active selection. */
export type EditorTextFormat =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "code";

/** A plain, serialisable rectangle snapshot (a frozen `DOMRect`). */
export type RectSnapshot = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type EditorContextRects = {
  /** Bounding rect of the native text selection range (floating toolbar). */
  selection: RectSnapshot | null;
  /** Bounding rect of the active top-level block element (gutter / menus). */
  block: RectSnapshot | null;
};

export type EditorContextSnapshot = {
  kind: EditorContextKind;
  /** True while the editor is editable (mirrors `editor.isEditable()`). */
  editable: boolean;
  /** True when the selection is collapsed (or absent). */
  isCollapsed: boolean;
  /** The active top-level block type, when a text selection is present. */
  blockType?: EditorBlockType;
  /** Active inline formats on the selection. */
  activeFormats: Set<EditorTextFormat>;
  /**
   * Element-level text alignment of the active block (`FORMAT_ELEMENT_COMMAND`
   * value). Empty string means the inherited/default (left) alignment.
   */
  elementFormat: ElementFormatType;
  /** Current `color` style on the selection (`""` when unset). */
  textColor: string;
  /** Current `background-color` (highlight) style on the selection (`""` when unset). */
  highlightColor: string;
  /** Whether the selection sits within a link. */
  isLink: boolean;
  /** Live Lexical key of the active top-level block (transient — never stored). */
  blockKey?: string;
  /** Plain-text content of the active top-level block. */
  blockText?: string;
  /** True when the active block is an empty paragraph. */
  isEmptyBlock: boolean;
  /** Stable `visualId` of the selected VisualNode (safe to persist/anchor). */
  selectedVisualId?: string;
  /** Live Lexical key of the selected VisualNode (transient — never stored). */
  selectedVisualNodeKey?: string;
  /** Screen rects for positioning surfaces (recompute on scroll/resize). */
  rects: EditorContextRects;
};

export const EMPTY_EDITOR_CONTEXT: EditorContextSnapshot = {
  kind: "none",
  editable: false,
  isCollapsed: true,
  activeFormats: new Set(),
  elementFormat: "",
  textColor: "",
  highlightColor: "",
  isLink: false,
  isEmptyBlock: false,
  rects: { selection: null, block: null },
};

const EditorContextValue =
  createContext<EditorContextSnapshot>(EMPTY_EDITOR_CONTEXT);

/**
 * Read the current {@link EditorContextSnapshot}. Must be used under an
 * {@link EditorContextProvider}; outside one it returns the empty snapshot.
 */
export function useEditorContext(): EditorContextSnapshot {
  return useContext(EditorContextValue);
}

function rectFromDOMRect(rect: DOMRect): RectSnapshot {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function getBlockType(node: LexicalNode): EditorBlockType {
  const element =
    node.getKey() === "root" ? node : (node.getTopLevelElement() ?? node);

  const listNode = $getNearestNodeOfType(node, ListNode);
  if (listNode && $isListNode(listNode)) {
    return listNode.getListType() === "number" ? "number" : "bullet";
  }
  if ($isHeadingNode(element)) {
    const tag = element.getTag();
    if (tag === "h1") return "h1";
    if (tag === "h2") return "h2";
    if (tag === "h3") return "h3";
  }
  if ($isQuoteNode(element)) {
    return "quote";
  }
  return "paragraph";
}

/** The subset of the snapshot derived purely from the Lexical editor state. */
export type SelectionDescriptor = Pick<
  EditorContextSnapshot,
  | "kind"
  | "isCollapsed"
  | "blockType"
  | "activeFormats"
  | "elementFormat"
  | "textColor"
  | "highlightColor"
  | "isLink"
  | "blockKey"
  | "blockText"
  | "isEmptyBlock"
  | "selectedVisualId"
  | "selectedVisualNodeKey"
>;

const EMPTY_DESCRIPTOR: SelectionDescriptor = {
  kind: "none",
  isCollapsed: true,
  activeFormats: new Set(),
  elementFormat: "",
  textColor: "",
  highlightColor: "",
  isLink: false,
  isEmptyBlock: false,
};

const TEXT_FORMATS: EditorTextFormat[] = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
];

/**
 * Pure selection-derivation: reads the *current* Lexical selection and returns
 * the rect-free subset of {@link EditorContextSnapshot}. Must be invoked inside
 * an `editorState.read(...)` (or `editor.update(...)`) callback so `$getSelection`
 * resolves. Exported so the derivation can be exercised headlessly in tests; the
 * provider calls it identically.
 */
export function readSelectionDescriptor(): SelectionDescriptor {
  const selection = $getSelection();

  // A selected decorator (e.g. a VisualNode) surfaces as a NodeSelection.
  if ($isNodeSelection(selection)) {
    for (const node of selection.getNodes()) {
      if (node.getType() === "visual") {
        const withId = node as LexicalNode & {
          getVisualId?: () => string;
        };
        return {
          ...EMPTY_DESCRIPTOR,
          kind: "visual",
          selectedVisualId:
            typeof withId.getVisualId === "function"
              ? withId.getVisualId()
              : undefined,
          selectedVisualNodeKey: node.getKey(),
        };
      }
    }
    return EMPTY_DESCRIPTOR;
  }

  if (!$isRangeSelection(selection)) {
    return EMPTY_DESCRIPTOR;
  }

  const anchorNode = selection.anchor.getNode();
  const topLevel =
    anchorNode.getKey() === "root" ? null : anchorNode.getTopLevelElement();

  const activeFormats = new Set<EditorTextFormat>();
  for (const format of TEXT_FORMATS) {
    if (selection.hasFormat(format)) {
      activeFormats.add(format);
    }
  }

  const isLink = selection.getNodes().some((node) => {
    const parent = node.getParent();
    return $isLinkNode(node) || (parent !== null && $isLinkNode(parent));
  });

  const blockType = getBlockType(anchorNode);
  const blockKey = topLevel?.getKey();
  const blockText = topLevel?.getTextContent() ?? "";
  const isCollapsed = selection.isCollapsed();
  const isEmptyBlock =
    isCollapsed && blockType === "paragraph" && blockText.trim() === "";

  // Element-level alignment lives on the top-level block (FORMAT_ELEMENT_COMMAND).
  const elementFormat: ElementFormatType =
    topLevel !== null ? topLevel.getFormatType() : "";
  // Inline color styles serialise into the TextNode `style` (Yjs/collab-safe).
  const textColor = $getSelectionStyleValueForProperty(selection, "color", "");
  const highlightColor = $getSelectionStyleValueForProperty(
    selection,
    "background-color",
    "",
  );

  let kind: EditorContextKind;
  if (!isCollapsed && selection.getTextContent() !== "") {
    kind = "range";
  } else if (isEmptyBlock) {
    kind = "empty-block";
  } else if (topLevel !== null) {
    kind = "collapsed";
  } else {
    kind = "none";
  }

  return {
    kind,
    isCollapsed,
    blockType,
    activeFormats,
    elementFormat,
    textColor,
    highlightColor,
    isLink,
    blockKey,
    blockText,
    isEmptyBlock,
  };
}

function sameFormats(
  a: Set<EditorTextFormat>,
  b: Set<EditorTextFormat>,
): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function sameRect(a: RectSnapshot | null, b: RectSnapshot | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.width === b.width &&
    a.height === b.height
  );
}

function snapshotsEqual(
  a: EditorContextSnapshot,
  b: EditorContextSnapshot,
): boolean {
  return (
    a.kind === b.kind &&
    a.editable === b.editable &&
    a.isCollapsed === b.isCollapsed &&
    a.blockType === b.blockType &&
    a.elementFormat === b.elementFormat &&
    a.textColor === b.textColor &&
    a.highlightColor === b.highlightColor &&
    a.isLink === b.isLink &&
    a.blockKey === b.blockKey &&
    a.blockText === b.blockText &&
    a.isEmptyBlock === b.isEmptyBlock &&
    a.selectedVisualId === b.selectedVisualId &&
    a.selectedVisualNodeKey === b.selectedVisualNodeKey &&
    sameFormats(a.activeFormats, b.activeFormats) &&
    sameRect(a.rects.selection, b.rects.selection) &&
    sameRect(a.rects.block, b.rects.block)
  );
}

/**
 * The single selection-derivation point for the editor. It subscribes *once* to
 * Lexical's update lifecycle (update listener + `SELECTION_CHANGE_COMMAND`) and
 * to the DOM `selectionchange` event (for native-range rects), produces an
 * {@link EditorContextSnapshot}, and exposes it via React context.
 *
 * In Phase 0 this is mounted *alongside* the existing four controls — it does
 * not replace their listeners yet. It is intentionally read-only: it never calls
 * `editor.update()`, never touches Yjs, and the live NodeKeys it surfaces are
 * transient (for an immediate update) and are never persisted.
 */
export function EditorContextProvider({ children }: { children: ReactNode }) {
  const [editor] = useLexicalComposerContext();
  const [snapshot, setSnapshot] =
    useState<EditorContextSnapshot>(EMPTY_EDITOR_CONTEXT);

  useEffect(() => {
    const recompute = () => {
      const descriptor = editor
        .getEditorState()
        .read(() => readSelectionDescriptor());

      let blockRect: RectSnapshot | null = null;
      if (descriptor.blockKey) {
        const element = editor.getElementByKey(descriptor.blockKey);
        if (element) {
          blockRect = rectFromDOMRect(element.getBoundingClientRect());
        }
      }

      let selectionRect: RectSnapshot | null = null;
      if (descriptor.kind === "range") {
        const nativeSelection = window.getSelection();
        if (nativeSelection && nativeSelection.rangeCount > 0) {
          selectionRect = rectFromDOMRect(
            nativeSelection.getRangeAt(0).getBoundingClientRect(),
          );
        }
      }

      const next: EditorContextSnapshot = {
        ...descriptor,
        editable: editor.isEditable(),
        rects: { selection: selectionRect, block: blockRect },
      };

      setSnapshot((prev) => (snapshotsEqual(prev, next) ? prev : next));
    };

    const onSelectionChange = () => {
      editor.getEditorState().read(() => {
        recompute();
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);

    // Keep the positioning rects fresh as the viewport moves under a stable
    // selection (the floating surfaces are `position: fixed`).
    const onViewportChange = () => recompute();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    const cleanup = mergeRegister(
      editor.registerUpdateListener(() => recompute()),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          recompute();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerEditableListener(() => recompute()),
    );

    recompute();

    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      cleanup();
    };
  }, [editor]);

  const value = useMemo(() => snapshot, [snapshot]);

  return (
    <EditorContextValue.Provider value={value}>
      {children}
    </EditorContextValue.Provider>
  );
}
