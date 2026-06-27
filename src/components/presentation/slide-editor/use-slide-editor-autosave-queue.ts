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
import type { DeckPatch } from "@/lib/presentation/slide-commands";

import {
  clearPendingPatches,
  prependPendingPatches,
  replacePendingPatches,
} from "./use-slide-editor-commit";

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
  const inFlightSaveRef = useRef<Promise<void> | null>(null);
  const saveAgainRef = useRef(false);

  const flushSave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (inFlightSaveRef.current) {
      saveAgainRef.current = true;
      return inFlightSaveRef.current;
    }
    setIsSaving(true);
    const savePromise = (async () => {
      try {
        do {
          saveAgainRef.current = false;
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
          const patchSnapshot = [...pendingPatchesRef.current];
          clearPendingPatches(pendingPatchesRef);
          setHasSaveError(false);
          setSaveErrorMessage(null);
          try {
            const res = await onSave(deckToSave, patchSnapshot);
            if (res.ok) {
              lastSavedSerializedRef.current = serialized;
              if (latestDeckRef.current === deckToSave) {
                setIsDirty(false);
              }
            } else if (latestDeckRef.current === deckToSave) {
              replacePendingPatches(pendingPatchesRef, patchSnapshot);
              setHasSaveError(true);
              setSaveErrorMessage(res.error);
            } else {
              prependPendingPatches(pendingPatchesRef, patchSnapshot);
            }
          } catch {
            if (latestDeckRef.current === deckToSave) {
              replacePendingPatches(pendingPatchesRef, patchSnapshot);
              setHasSaveError(true);
            } else {
              prependPendingPatches(pendingPatchesRef, patchSnapshot);
            }
          }
          if (latestDeckRef.current !== deckToSave) {
            saveAgainRef.current = true;
          } else {
            saveAgainRef.current = false;
          }
        } while (saveAgainRef.current);
      } finally {
        saveAgainRef.current = false;
        setIsSaving(false);
      }
    })();
    // Track the in-flight save, then clear the handle only after it settles —
    // and only if it has not been replaced. This must happen *outside* the
    // async IIFE's `finally`: when the body returns synchronously (a no-op
    // flush with nothing new to persist), that `finally` runs before the
    // assignment below, so clearing the ref there would be immediately
    // clobbered by this assignment, leaving a stale resolved promise that
    // permanently blocks every later save.
    inFlightSaveRef.current = savePromise;
    void savePromise.finally(() => {
      if (inFlightSaveRef.current === savePromise) {
        inFlightSaveRef.current = null;
      }
    });
    return savePromise;
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
      saveAgainRef.current = false;
    };
  }, []);

  const saveStatus = resolveSaveStatus({
    isDirty,
    isSaving,
    hasError: hasSaveError,
  });

  return {
    flushSave,
    saveStatus,
    saveStatusLabel: SAVE_STATUS_LABEL[saveStatus],
    saveErrorMessage,
    hasUnsavedWork: isDirty || isSaving || hasSaveError,
  };
}
