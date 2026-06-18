"use client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { EditorThemeClasses } from "lexical";

const theme: EditorThemeClasses = {
  paragraph: "mb-3 leading-7",
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
  },
};

function onError(error: Error) {
  console.error(error);
}

/**
 * Minimal Lexical rich-text editor shell. Later stories build blocks, the
 * "+"/"/" menus, the floating toolbar, and visual decorator nodes on top of
 * this. It mounts behind a flag/route and does not replace the current editor.
 */
export function LexicalEditor() {
  const initialConfig = {
    namespace: "NapkinLexicalEditor",
    theme,
    onError,
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative rounded-2xl border border-black/[.06] bg-white p-6 dark:border-white/[.08] dark:bg-zinc-950">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="Document body"
              className="min-h-[16rem] text-base text-zinc-900 outline-none dark:text-zinc-100"
            />
          }
          placeholder={
            <div className="pointer-events-none absolute left-6 top-6 text-base text-zinc-400 dark:text-zinc-500">
              Start writing…
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
      </div>
    </LexicalComposer>
  );
}
