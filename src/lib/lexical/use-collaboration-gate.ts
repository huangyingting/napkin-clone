"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, HISTORIC_TAG } from "lexical";
import { useEffect, useRef } from "react";

export function collaborationEditable(canEdit: boolean, ready: boolean) {
  return canEdit && ready;
}

export function useCollaborationEditable(canEdit: boolean, ready: boolean) {
  return collaborationEditable(canEdit, ready);
}

/* node:coverage ignore next 6 */ /* Hook wiring requires React/Lexical composer context; pure gate logic is covered headlessly. */
export function useEditableGate(editable: boolean): void {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);
}
/* node:coverage ignore next 45 */ /* Fallback seeding depends on React effects and Lexical composer context, unavailable in the Node source gate. */
export function useCollaborationFallbackSeed({
  initialStateJson,
  degraded,
  synced,
}: {
  initialStateJson: string | null;
  degraded: boolean;
  synced: boolean;
}): void {
  const [editor] = useLexicalComposerContext();
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || synced || !degraded || !initialStateJson) {
      return;
    }
    const isEmpty = editor
      .getEditorState()
      .read(
        () =>
          $getRoot().getTextContent() === "" &&
          $getRoot().getChildrenSize() <= 1,
      );
    if (!isEmpty) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      try {
        const parsed = editor.parseEditorState(initialStateJson);
        editor.setEditorState(parsed, { tag: HISTORIC_TAG });
      } catch (error) {
        console.error("Failed to seed editor from database fallback", error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [editor, initialStateJson, degraded, synced]);
}
