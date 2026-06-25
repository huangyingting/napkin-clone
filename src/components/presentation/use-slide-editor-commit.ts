"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ActionResult } from "@/lib/action-result";
import type { Deck } from "@/lib/presentation/deck";
import {
  SAVE_STATUS_LABEL,
  SLIDE_SAVE_DEBOUNCE_MS,
  resolveSaveStatus,
  shouldPersist,
  shouldScheduleAutosave,
} from "@/lib/presentation/save-status";
import {
  commitCommand,
  type CommitOptions,
  type DeckPatch,
  type SlideCommand,
} from "@/lib/presentation/slide-commands";

export type SlideDeckChangeHandler = (
  deck: Deck,
  options?: CommitOptions,
) => void;

export function appendPendingPatches(
  pendingPatchesRef: { current: DeckPatch[] },
  patches: readonly DeckPatch[],
) {
  pendingPatchesRef.current = [...pendingPatchesRef.current, ...patches];
}

export function clearPendingPatches(pendingPatchesRef: {
  current: DeckPatch[];
}) {
  pendingPatchesRef.current = [];
}

export function replacePendingPatches(
  pendingPatchesRef: { current: DeckPatch[] },
  patches: readonly DeckPatch[],
) {
  pendingPatchesRef.current = [...patches];
}

export function useSlideEditorCommit(onDeckChange: SlideDeckChangeHandler) {
  const pendingPatchesRef = useRef<DeckPatch[]>([]);

  const doCommitAndChange = useCallback(
    (deck: Deck, cmd: SlideCommand) => {
      const { result, commitOptions, patches } = commitCommand(deck, cmd);
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
    },
    [onDeckChange],
  );

  return { pendingPatchesRef, doCommitAndChange };
}

export function useSlideEditorAutosaveQueue({
  deck,
  onSave,
  pendingPatchesRef,
}: {
  deck: Deck;
  onSave: (deck: Deck, patches: DeckPatch[]) => Promise<ActionResult>;
  pendingPatchesRef: { current: DeckPatch[] };
}) {
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDeckRef = useRef<Deck>(deck);
  const lastSeenDeckRef = useRef<Deck | null>(null);
  const lastSavedSerializedRef = useRef<string | null>(null);

  const flushSave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const deckToSave = latestDeckRef.current;
    const serialized = JSON.stringify(deckToSave);
    if (!shouldPersist(lastSavedSerializedRef.current, serialized)) {
      if (latestDeckRef.current === deckToSave) {
        setIsDirty(false);
      }
      setHasSaveError(false);
      setSaveErrorMessage(null);
      return;
    }
    const patchSnapshot = pendingPatchesRef.current;
    clearPendingPatches(pendingPatchesRef);
    setIsSaving(true);
    setHasSaveError(false);
    setSaveErrorMessage(null);
    try {
      const res = await onSave(deckToSave, patchSnapshot);
      if (res.ok) {
        lastSavedSerializedRef.current = serialized;
        if (latestDeckRef.current === deckToSave) {
          setIsDirty(false);
        }
      } else {
        if (latestDeckRef.current === deckToSave) {
          replacePendingPatches(pendingPatchesRef, patchSnapshot);
        }
        setHasSaveError(true);
        setSaveErrorMessage(res.error);
      }
    } catch {
      if (latestDeckRef.current === deckToSave) {
        replacePendingPatches(pendingPatchesRef, patchSnapshot);
      }
      setHasSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, pendingPatchesRef]);

  useEffect(() => {
    latestDeckRef.current = deck;
    const lastSeen = lastSeenDeckRef.current;
    lastSeenDeckRef.current = deck;
    if (!shouldScheduleAutosave({ current: deck, lastSeen })) {
      return;
    }
    setIsDirty(true);
    setHasSaveError(false);
    setSaveErrorMessage(null);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, SLIDE_SAVE_DEBOUNCE_MS);
  }, [deck, flushSave]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  const saveStatus = resolveSaveStatus({
    isDirty,
    isSaving,
    hasError: hasSaveError,
  });

  return {
    isDirty,
    isSaving,
    hasSaveError,
    saveErrorMessage,
    saveStatus,
    saveStatusLabel: SAVE_STATUS_LABEL[saveStatus],
    flushSave,
  };
}
