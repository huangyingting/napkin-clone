"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { deleteDocument, restoreDocument } from "./actions";
import { DocumentCard, type DocumentCardData } from "./document-card";
import { NewDocumentButton } from "./new-document-button";

/** How long the "Document deleted — Undo" affordance stays visible. */
const UNDO_DURATION_MS = 6000;

const primaryButtonClass =
  "flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200";

function UndoToast({ title, onUndo }: { title: string; onUndo: () => void }) {
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-center gap-4 rounded-full border border-white/10 bg-zinc-900 px-5 py-3 text-sm text-white shadow-lg dark:border-black/20 dark:bg-zinc-100 dark:text-zinc-900"
      >
        <span className="truncate">
          Document deleted
          <span className="hidden text-zinc-400 sm:inline dark:text-zinc-500">
            {" "}
            — “{title}”
          </span>
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-full font-semibold text-indigo-300 underline-offset-2 transition hover:underline dark:text-indigo-600"
        >
          Undo
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Renders the dashboard document grid (or the empty state) and owns the
 * soft-delete lifecycle so the transient undo affordance can live above the
 * individual cards.
 *
 * Deletion is optimistic: the deleted id is hidden immediately and
 * `deleteDocument` (soft delete) runs in a transition while the server
 * revalidation reconciles the list. A single "Document deleted — Undo" toast is
 * shown for {@link UNDO_DURATION_MS} (>= the required 5s).
 *
 * Undo must restore the card instantly, but by the time it is clicked the
 * delete's `revalidatePath` has already dropped the document from the server
 * `documents` prop — so simply un-hiding the id is not enough. We keep the
 * deleted document's data (`restored`) and re-insert it locally until the
 * `restoreDocument` revalidation brings it back into `documents` (at which point
 * the duplicate guard drops the local copy).
 */
export function DocumentList({ documents }: { documents: DocumentCardData[] }) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [restored, setRestored] = useState<DocumentCardData[]>([]);
  const [undo, setUndo] = useState<DocumentCardData | null>(null);
  const [, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const handleDelete = useCallback(
    (data: DocumentCardData) => {
      setRemovedIds((prev) => new Set(prev).add(data.id));
      setRestored((prev) => prev.filter((item) => item.id !== data.id));
      setUndo(data);
      clearTimer();
      timerRef.current = setTimeout(() => setUndo(null), UNDO_DURATION_MS);
      startTransition(async () => {
        await deleteDocument(data.id);
      });
    },
    [clearTimer],
  );

  const handleUndo = useCallback(() => {
    if (!undo) {
      return;
    }
    const data = undo;
    setUndo(null);
    clearTimer();
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(data.id);
      return next;
    });
    setRestored((prev) => [
      data,
      ...prev.filter((item) => item.id !== data.id),
    ]);
    startTransition(async () => {
      await restoreDocument(data.id);
    });
  }, [undo, clearTimer]);

  const base = documents.filter((document) => !removedIds.has(document.id));
  const baseIds = new Set(base.map((document) => document.id));
  const extra = restored.filter(
    (item) => !baseIds.has(item.id) && !removedIds.has(item.id),
  );
  const visible = [...extra, ...base];

  return (
    <>
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center dark:border-white/15 dark:bg-zinc-950">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              No documents yet
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Create your first document to start turning text into visuals.
            </p>
          </div>
          <NewDocumentButton className={primaryButtonClass}>
            Create your first document
          </NewDocumentButton>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((document) => (
            <DocumentCard
              key={document.id}
              id={document.id}
              title={document.title}
              editedLabel={document.editedLabel}
              workspaceName={document.workspaceName}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      {undo && <UndoToast title={undo.title} onUndo={handleUndo} />}
    </>
  );
}
