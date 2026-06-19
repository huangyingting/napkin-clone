"use client";

import { useInsertImportedMarkdown } from "@/lib/lexical/use-insert-imported-markdown";
import { ImportButton } from "@/components/editor/import-button";

/**
 * Lexical plugin that renders the import button inline in the editor toolbar.
 * When a file is successfully parsed, its Markdown content is loaded directly
 * into the current editor state.
 */
export function ImportPlugin() {
  const insertMarkdown = useInsertImportedMarkdown();

  return <ImportButton onImport={insertMarkdown} label="Import" compact />;
}
