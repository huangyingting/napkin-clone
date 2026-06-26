import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { DocumentListActionPort } from "@/lib/action-ports";
import type { DashboardDocument } from "@/lib/document/list";

import type { DocumentCardData } from "./document-card";
import {
  isCurrentDocumentTrashOperation,
  recordDocumentTrashOperation,
} from "./document-list-async-ordering";

const UNDO_DURATION_MS = 6000;

export function useOptimisticDocumentTrash(
  documents: DashboardDocument[],
  actions: Pick<DocumentListActionPort, "deleteDocument" | "restoreDocument">,
) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [restored, setRestored] = useState<DashboardDocument[]>([]);
  const [undo, setUndo] = useState<DashboardDocument | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationSeqRef = useRef(0);
  const latestOperationByDocumentRef = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const handleDelete = useCallback(
    (data: DocumentCardData) => {
      const full = documents.find((document) => document.id === data.id);
      const stash: DashboardDocument = full
        ? { ...full, title: data.title }
        : {
            ...data,
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
            tags: [],
          };
      setRemovedIds((prev) => new Set(prev).add(data.id));
      setRestored((prev) => prev.filter((item) => item.id !== data.id));
      setUndo(stash);
      setErrorMessage(null);
      const operationSeq = recordDocumentTrashOperation(
        latestOperationByDocumentRef.current,
        data.id,
        operationSeqRef.current,
      );
      operationSeqRef.current = operationSeq;
      clearTimer();
      timerRef.current = setTimeout(() => setUndo(null), UNDO_DURATION_MS);
      startTransition(async () => {
        try {
          await actions.deleteDocument(data.id);
        } catch {
          if (
            !isCurrentDocumentTrashOperation(
              latestOperationByDocumentRef.current,
              data.id,
              operationSeq,
            )
          ) {
            return;
          }
          setRemovedIds((prev) => {
            const next = new Set(prev);
            next.delete(data.id);
            return next;
          });
          setRestored((prev) => [
            stash,
            ...prev.filter((item) => item.id !== data.id),
          ]);
          setUndo((current) => (current?.id === data.id ? null : current));
          setErrorMessage(
            "Could not move the document to trash. It was restored.",
          );
        }
      });
    },
    [actions, clearTimer, documents],
  );

  const handleUndo = useCallback(() => {
    if (!undo) return;
    const data = undo;
    setUndo(null);
    setErrorMessage(null);
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
    const operationSeq = recordDocumentTrashOperation(
      latestOperationByDocumentRef.current,
      data.id,
      operationSeqRef.current,
    );
    operationSeqRef.current = operationSeq;
    startTransition(async () => {
      try {
        await actions.restoreDocument(data.id);
      } catch {
        if (
          !isCurrentDocumentTrashOperation(
            latestOperationByDocumentRef.current,
            data.id,
            operationSeq,
          )
        ) {
          return;
        }
        setRemovedIds((prev) => new Set(prev).add(data.id));
        setRestored((prev) => prev.filter((item) => item.id !== data.id));
        setErrorMessage("Could not restore the document. It remains in trash.");
      }
    });
  }, [actions, undo, clearTimer]);

  const base = documents.filter((document) => !removedIds.has(document.id));
  const baseIds = new Set(base.map((document) => document.id));
  const extra = restored.filter(
    (item) => !baseIds.has(item.id) && !removedIds.has(item.id),
  );

  return {
    combinedDocuments: [...extra, ...base],
    removedIds,
    undo,
    errorMessage,
    handleDelete,
    handleUndo,
  };
}
