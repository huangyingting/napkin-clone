"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from "lexical";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  readSelectionDescriptor,
  snapshotsEqual,
  type EditorContextKind,
  type EditorContextSnapshot,
  type RectSnapshot,
  type SelectionDescriptor,
} from "./selection-snapshot";

export type {
  EditorBlockType,
  EditorContextKind,
  EditorContextSnapshot,
  EditorTextFormat,
  RectSnapshot,
  SelectionDescriptor,
  StableSelectionSnapshot,
} from "./selection-snapshot";
export {
  readSelectionDescriptor,
  stableSelectionSnapshot,
} from "./selection-snapshot";

const EMPTY_EDITOR_CONTEXT: EditorContextSnapshot = {
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

function selectionRectForDescriptor(
  kind: EditorContextKind,
  editorRoot: HTMLElement | null,
): RectSnapshot | null {
  if (kind !== "range") {
    return null;
  }

  const nativeSelection = window.getSelection();
  if (
    !nativeSelection ||
    nativeSelection.rangeCount === 0 ||
    nativeSelection.isCollapsed ||
    editorRoot === null ||
    nativeSelection.anchorNode === null ||
    !editorRoot.contains(nativeSelection.anchorNode)
  ) {
    return null;
  }

  return rectFromDOMRect(nativeSelection.getRangeAt(0).getBoundingClientRect());
}

function buildSnapshot(
  descriptor: SelectionDescriptor,
  editable: boolean,
  blockRect: RectSnapshot | null,
  selectionRect: RectSnapshot | null,
): EditorContextSnapshot {
  return {
    ...descriptor,
    editable,
    rects: { selection: selectionRect, block: blockRect },
  };
}

/**
 * Single React/DOM boundary for selection snapshots. The descriptor is derived
 * by the pure Lexical reader in `selection-snapshot`; this provider only adds
 * transient DOM positioning rects and the live editable flag.
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

      const next = buildSnapshot(
        descriptor,
        editor.isEditable(),
        blockRect,
        selectionRectForDescriptor(descriptor.kind, editor.getRootElement()),
      );

      setSnapshot((prev) => (snapshotsEqual(prev, next) ? prev : next));
    };

    const onSelectionChange = () => recompute();
    document.addEventListener("selectionchange", onSelectionChange);

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
