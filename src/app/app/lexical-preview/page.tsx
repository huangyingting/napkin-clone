import type { Metadata } from "next";

import { requireUser } from "@/lib/session";

import { LexicalEditor } from "../documents/[id]/lexical-editor";

export const metadata: Metadata = {
  title: "Lexical editor (preview) — Napkin Clone",
};

/**
 * Flagged preview route for the new Lexical block editor (US-001). It mounts the
 * minimal editor shell so later stories can build on it, without replacing the
 * current document editor. Protected like the rest of /app/*.
 */
export default async function LexicalPreviewPage() {
  await requireUser();

  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Lexical editor preview
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Early preview of the new block editor. This is a work in progress
            and does not yet replace the document editor.
          </p>
        </header>
        <LexicalEditor />
      </div>
    </main>
  );
}
