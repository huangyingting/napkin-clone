"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HISTORIC_TAG } from "lexical";
import { useCallback } from "react";

import { markdownToLexicalState } from "@/lib/lexical/from-markdown";

/**
 * Returns a stable `insertImportedMarkdown` callback that parses a Markdown
 * string into a Lexical editor state and loads it into the editor via
 * `setEditorState` (tagged as `HISTORIC_TAG` so collaboration and undo treat
 * it as a normal content replacement rather than a remote merge).
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
        editor.setEditorState(parsed, { tag: HISTORIC_TAG });
      } catch (error) {
        console.error("Failed to insert imported content into editor", error);
      }
    },
    [editor],
  );
}
