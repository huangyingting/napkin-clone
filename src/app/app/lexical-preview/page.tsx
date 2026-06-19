import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { LexicalEditor } from "../documents/[id]/lexical-editor";

export const metadata: Metadata = {
  title: "Lexical editor (preview) — Napkin Clone",
};

const SCRATCH_TITLE = "Lexical preview";

/**
 * Finds (or lazily creates) a dedicated scratch document for the current user so
 * the preview editor has a real document to save into without disturbing the
 * user's other documents. This keeps US-003's save/load flow testable during the
 * migration; US-018 binds the Lexical editor to real documents.
 */
async function getOrCreateScratchDocument(userId: string) {
  const existing = await prisma.document.findFirst({
    where: { ownerId: userId, deletedAt: null, title: SCRATCH_TITLE },
    orderBy: { createdAt: "asc" },
    select: { id: true, contentJson: true },
  });
  if (existing) {
    return existing;
  }
  return prisma.document.create({
    data: { ownerId: userId, title: SCRATCH_TITLE },
    select: { id: true, contentJson: true },
  });
}

/**
 * Flagged preview route for the new Lexical block editor. It binds the editor to
 * a per-user scratch document, loading its serialized `contentJson` as the
 * initial state and persisting edits via the debounced save action. It does not
 * yet replace the document editor.
 */
export default async function LexicalPreviewPage() {
  const user = await requireUser();
  const document = await getOrCreateScratchDocument(user.id);
  const initialStateJson = document.contentJson
    ? JSON.stringify(document.contentJson)
    : null;

  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Lexical editor preview
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Early preview of the new block editor. Your changes are saved to a
            scratch document. This is a work in progress and does not yet
            replace the document editor.
          </p>
        </header>
        <LexicalEditor
          documentId={document.id}
          initialStateJson={initialStateJson}
        />
      </div>
    </main>
  );
}
