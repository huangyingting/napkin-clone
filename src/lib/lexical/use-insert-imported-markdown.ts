"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useCallback } from "react";

import { markdownToLexicalState } from "@/lib/content";
import { IMPORT_TAG } from "@/lib/content";

/**
 * Returns a stable `insertImportedMarkdown` callback that parses a Markdown
 * string into a Lexical editor state and loads it into the editor via
 * `setEditorState`, tagged as `IMPORT_TAG`.
 *
 * The import is a user-initiated content replacement, so it must both persist
 * to the database and sync to collaborators. Tagging it `IMPORT_TAG` (rather
 * than `HISTORIC_TAG`, which the autosave handler and the Yjs binding both
 * skip) ensures the autosave path processes it and the change propagates to the
 * shared room.
 *
 * The callback replaces the editor's entire content — suitable for the
 * "import into this document" use-case where the user has explicitly chosen to
 * replace what is there (or the document is empty). The caller is responsible
 * for confirming with the user when the document is non-empty.
 */
export function useInsertImportedMarkdown(): (markdown: string) => void {
  const [editor] = useLexicalComposerContext();

  return useCallback(
    (markdown: string) => {
      try {
        const stateJson = markdownToLexicalState(markdown);
        const parsed = editor.parseEditorState(stateJson);
        editor.setEditorState(parsed, { tag: IMPORT_TAG });
      } catch (error) {
        console.error("Failed to insert imported content into editor", error);
      }
    },
    [editor],
  );
}
