"use client";

/**
 * Open/close/route state controller for the v7-only slide editor entry point.
 *
 * Development builds support only DeckV7 at runtime. Legacy deck JSON is not
 * migrated here; when no valid v7 deck is available, the editor starts from a
 * native blank DeckV7.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useCallback, useEffect, useRef, useState } from "react";

import type { DeckActionPort } from "@/lib/action-ports";
import type { ActionResult } from "@/lib/action-result";
import type { SaveDeckResult } from "@/lib/document/persistence-types";
import { isAiDeckGenClientEnabled } from "@/lib/ai/ai-deck-gen-flag";
import { isEffectivelyEmptyEditorState } from "@/lib/ai/empty-content";
import type { DeckGenerationOptions } from "@/lib/ai/use-deck-generation";
import { logInfo } from "@/lib/log";
import {
  DEFAULT_THEME_PACKAGE_ID,
  type ThemePackageId,
} from "@/lib/presentation/theme-packages";
import {
  SAVE_STATUS_LABEL,
  resolveSaveErrorMessage,
  resolveSaveStatus,
  type SaveStatus,
} from "@/lib/presentation/save-status";
import {
  createSlideAutosaveScheduler,
  type SlideAutosaveScheduler,
} from "@/lib/presentation/slide-autosave-scheduler";
import { bucketCount, emitProductTelemetry } from "@/lib/telemetry/product";
import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";
import { createBlankDeckV7 } from "@/lib/presentation-vnext/empty-deck";
import {
  decideDeckOpen,
  openAiGeneratedDeck,
  openDeckFromJson,
} from "@/lib/presentation-vnext/open-deck";
import { pickUndoFocusTarget } from "@/lib/presentation-vnext/deck-diff";
import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import {
  SAVE_CONFLICT_AUTOSAVE_BLOCKED_MESSAGE,
  hasUnresolvedDeckSaveConflict,
  updateConflictLocalDeck,
  type SlideEditorConflictStateV7,
} from "@/lib/presentation-vnext/slide-editor-collaboration-state";

/** State backing the v7 AI deck preview/diff surface. */
export interface AiPreviewStateV7 {
  /** The AI-generated v7 deck under review. */
  proposedDeck: DeckV7;
  /** The v7 deck the editor would otherwise open. */
  baselineDeck: DeckV7;
  /** Whether the source outline was trimmed to fit the input budget. */
  truncated: boolean;
  /** Generation options, re-sent verbatim on Regenerate. */
  options: DeckGenerationOptions;
  /** The document snapshot, re-sent verbatim on Regenerate / used on apply. */
  contentJson: string;
}

export interface UseSlideEditorOpenOptions {
  documentId: string;
  initialDeckJson: unknown;
  deckPort: DeckActionPort;
  initialContentJson?: string | null;
  onOpenRightSurface?: () => void;
  onCloseRightSurface?: () => void;
}

const noop = () => undefined;

type PreparedDeckV7 =
  | { ok: true; deck: DeckV7; diagnostics: PresentationDiagnostic[] }
  | {
      ok: false;
      error: string;
      diagnostics: PresentationDiagnostic[];
      validationErrors?: string[];
    };

export type SlideEditorOpenErrorV7 = {
  error: string;
  diagnostics: PresentationDiagnostic[];
  validationErrors?: string[];
};

export function useSlideEditorOpen({
  documentId,
  initialDeckJson,
  deckPort,
  initialContentJson = null,
  onOpenRightSurface = noop,
  onCloseRightSurface = noop,
}: UseSlideEditorOpenOptions) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const [pendingJson, setPendingJson] = useState<string | null>(null);
  const [pendingThemePackageId, setPendingThemePackageId] =
    useState<ThemePackageId>(DEFAULT_THEME_PACKAGE_ID);
  const [emptyDocument, setEmptyDocument] = useState(false);
  const [aiPreviewV7, setAiPreviewV7] = useState<AiPreviewStateV7 | null>(null);
  const [deckV7, setDeckV7] = useState<DeckV7 | null>(null);
  const [deckOpenDiagnosticsV7, setDeckOpenDiagnosticsV7] = useState<
    PresentationDiagnostic[]
  >([]);
  const [deckOpenErrorV7, setDeckOpenErrorV7] =
    useState<SlideEditorOpenErrorV7 | null>(null);
  const [v7Dirty, setV7Dirty] = useState(false);
  const [v7Saving, setV7Saving] = useState(false);
  const [v7SaveError, setV7SaveError] = useState<string | null>(null);
  const [undoStackV7, setUndoStackV7] = useState<DeckV7[]>([]);
  const [redoStackV7, setRedoStackV7] = useState<DeckV7[]>([]);
  const [conflictStateV7, setConflictStateV7] =
    useState<SlideEditorConflictStateV7 | null>(null);
  const [undoRedoFocusV7, setUndoRedoFocusV7] = useState<{
    nodeId: string;
    token: number;
  } | null>(null);

  const aiEnabled = isAiDeckGenClientEnabled();
  const lastSavedRef = useRef<unknown>(initialDeckJson);
  const revisionTokenRef = useRef<string | null>(null);
  const aiAppliedDeckRef = useRef<DeckV7 | null>(null);
  const focusTokenRef = useRef(0);
  const autosaveSchedulerRef = useRef<SlideAutosaveScheduler<DeckV7> | null>(
    null,
  );

  const persistDeckV7 = useCallback(
    async (updatedDeck: DeckV7): Promise<ActionResult> => {
      setV7Saving(true);
      setV7SaveError(null);
      const saveResult = await deckPort.saveDeckJson(
        documentId,
        updatedDeck,
        revisionTokenRef.current,
      );
      if (saveResult.ok === true) {
        lastSavedRef.current = updatedDeck;
        revisionTokenRef.current = saveResult.revisionToken;
        setV7Dirty(false);
        setV7Saving(false);
        setV7SaveError(null);

        if (aiAppliedDeckRef.current) {
          aiAppliedDeckRef.current = null;
          emitProductTelemetry("product.ai.deck.saved", {
            editDistanceBucket: bucketCount(updatedDeck.slides.length),
            slideCount: updatedDeck.slides.length,
          });
        }

        return { ok: true, data: undefined };
      }
      if (saveResult.ok === "conflict") {
        const error = "Save conflict: another session modified this deck.";
        setV7Saving(false);
        setV7SaveError(error);
        setConflictStateV7({
          localDeck: updatedDeck,
          serverRevisionToken: saveResult.serverRevisionToken,
        });
        return {
          ok: false,
          error,
        };
      }
      setV7Saving(false);
      setV7SaveError(saveResult.error);
      return { ok: false, error: saveResult.error };
    },
    [deckPort, documentId],
  );

  useEffect(() => {
    const scheduler = createSlideAutosaveScheduler<DeckV7>({
      onDue: (deck) => {
        void persistDeckV7(deck).then((result) => {
          if (!result.ok) {
            logInfo("editor.slide-editor", "v7-autosave-error", {
              error: result.error,
            });
          }
        });
      },
    });
    autosaveSchedulerRef.current = scheduler;
    return () => {
      scheduler.cancel();
      if (autosaveSchedulerRef.current === scheduler) {
        autosaveSchedulerRef.current = null;
      }
    };
  }, [persistDeckV7]);

  const cancelAutosaveV7 = useCallback(() => {
    autosaveSchedulerRef.current?.cancel();
  }, []);

  const fallbackDeck = useCallback(
    () => createBlankDeckV7({ documentId }),
    [documentId],
  );

  const finishOpenV7 = useCallback(
    (startDeck: DeckV7, diagnostics: PresentationDiagnostic[] = []) => {
      setDeckV7(startDeck);
      setDeckOpenDiagnosticsV7(diagnostics);
      setDeckOpenErrorV7(null);
      setV7Dirty(false);
      setV7Saving(false);
      setV7SaveError(null);
      setUndoStackV7([]);
      setRedoStackV7([]);
      setUndoRedoFocusV7(null);
      setPendingJson(null);
      setAiPreviewV7(null);
      setOpen(true);
      onOpenRightSurface();
    },
    [onOpenRightSurface],
  );

  const enterRecoveryV7 = useCallback(
    (info: SlideEditorOpenErrorV7) => {
      aiAppliedDeckRef.current = null;
      cancelAutosaveV7();
      setDeckV7(null);
      setDeckOpenDiagnosticsV7(info.diagnostics);
      setDeckOpenErrorV7(info);
      setPendingJson(null);
      setAiPreviewV7(null);
      setV7Dirty(false);
      setV7Saving(false);
      setV7SaveError(info.error);
      setUndoStackV7([]);
      setRedoStackV7([]);
      setUndoRedoFocusV7(null);
      setOpen(true);
      onOpenRightSurface();
    },
    [cancelAutosaveV7, onOpenRightSurface],
  );

  const prepareOpenV7 = useCallback(async (): Promise<PreparedDeckV7> => {
    let fetchedRaw: unknown = null;
    try {
      const fetched = await deckPort.fetchDeckJson(documentId);
      if (!fetched.ok) {
        return {
          ok: false,
          error: fetched.error,
          diagnostics: [],
        };
      }
      fetchedRaw = fetched.deckJson;
      revisionTokenRef.current = fetched.revisionToken;
    } catch {
      // Network/auth error: fall back to the last in-memory deck, then blank v7.
    }

    const rawCandidate = fetchedRaw ?? lastSavedRef.current ?? null;
    const decision = decideDeckOpen(rawCandidate);
    if (decision.mode === "blank") {
      return { ok: true, deck: fallbackDeck(), diagnostics: [] };
    }
    if (decision.mode === "open") {
      return {
        ok: true,
        deck: decision.deck,
        diagnostics: decision.diagnostics,
      };
    }
    return {
      ok: false,
      error: decision.error,
      diagnostics: decision.diagnostics,
      validationErrors: decision.errors,
    };
  }, [deckPort, documentId, fallbackDeck]);

  const openDerivedV7 = useCallback(async () => {
    aiAppliedDeckRef.current = null;
    const prepared = await prepareOpenV7();
    if (prepared.ok) {
      finishOpenV7(prepared.deck, prepared.diagnostics);
      return;
    }
    enterRecoveryV7({
      error: prepared.error,
      diagnostics: prepared.diagnostics,
      validationErrors: prepared.validationErrors,
    });
  }, [enterRecoveryV7, finishOpenV7, prepareOpenV7]);

  const openWithAiDeckV7 = useCallback(
    (aiDeck: DeckV7) => {
      // Route AI proposals through the same open boundary so a malformed deck
      // surfaces recovery diagnostics instead of silently blanking the editor.
      const opened = openAiGeneratedDeck(aiDeck);
      if (!opened.ok) {
        enterRecoveryV7({
          error: opened.error,
          diagnostics: opened.diagnostics,
          validationErrors: opened.errors,
        });
        return;
      }
      aiAppliedDeckRef.current = opened.deck;
      emitProductTelemetry("product.ai.deck.applied", {
        editDistanceBucket: bucketCount(opened.deck.slides.length),
        slideCount: opened.deck.slides.length,
      });
      finishOpenV7(opened.deck, opened.diagnostics);
    },
    [enterRecoveryV7, finishOpenV7],
  );

  const showAiPreviewV7 = useCallback(
    async (
      proposedDeck: DeckV7,
      truncated: boolean,
      options: DeckGenerationOptions,
      json: string,
    ) => {
      const preparedBaseline = await prepareOpenV7();
      const baselineDeck = preparedBaseline.ok
        ? preparedBaseline.deck
        : fallbackDeck();
      setPendingJson(null);
      setAiPreviewV7({
        proposedDeck,
        baselineDeck,
        truncated,
        options,
        contentJson: json,
      });
    },
    [fallbackDeck, prepareOpenV7],
  );

  const effectiveContentJson = useCallback(
    (liveJson: string) => {
      if (
        isEffectivelyEmptyEditorState(liveJson) &&
        initialContentJson &&
        !isEffectivelyEmptyEditorState(initialContentJson)
      ) {
        return initialContentJson;
      }
      return liveJson;
    },
    [initialContentJson],
  );

  const handleOpen = useCallback(async () => {
    const liveJson = JSON.stringify(editor.getEditorState().toJSON());
    const contentJson = effectiveContentJson(liveJson);

    if (aiEnabled) {
      setEmptyDocument(isEffectivelyEmptyEditorState(contentJson));
      setPendingThemePackageId(DEFAULT_THEME_PACKAGE_ID);
      setPendingJson(contentJson);
      return;
    }

    await openDerivedV7();
  }, [aiEnabled, editor, effectiveContentJson, openDerivedV7]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setDeckV7(null);
    setDeckOpenDiagnosticsV7([]);
    setDeckOpenErrorV7(null);
    setV7Dirty(false);
    setV7Saving(false);
    setV7SaveError(null);
    setUndoStackV7([]);
    setRedoStackV7([]);
    setUndoRedoFocusV7(null);
    setPendingJson(null);
    setPendingThemePackageId(DEFAULT_THEME_PACKAGE_ID);
    setEmptyDocument(false);
    setAiPreviewV7(null);
    setConflictStateV7(null);
    aiAppliedDeckRef.current = null;
    cancelAutosaveV7();
    onCloseRightSurface();
  }, [cancelAutosaveV7, onCloseRightSurface]);

  const handleSaveV7 = useCallback(
    async (updatedDeck: DeckV7): Promise<ActionResult> => {
      // Manual save supersedes any debounced autosave: drop the pending timer so
      // a stale autosave can't fire after we report success (V7-008).
      cancelAutosaveV7();
      return persistDeckV7(updatedDeck);
    },
    [cancelAutosaveV7, persistDeckV7],
  );

  const scheduleAutosaveV7 = useCallback((updatedDeck: DeckV7) => {
    autosaveSchedulerRef.current?.schedule(updatedDeck);
  }, []);

  const focusAfterHistoryV7 = useCallback(
    (fromDeck: DeckV7, toDeck: DeckV7) => {
      const target = pickUndoFocusTarget(fromDeck, toDeck);
      if (target) {
        focusTokenRef.current += 1;
        setUndoRedoFocusV7({ nodeId: target, token: focusTokenRef.current });
      }
    },
    [],
  );

  const handleDeckV7Change = useCallback(
    (updatedDeck: DeckV7) => {
      if (hasUnresolvedDeckSaveConflict(conflictStateV7)) {
        setConflictStateV7(
          updateConflictLocalDeck(conflictStateV7, updatedDeck),
        );
        setDeckV7(updatedDeck);
        setV7Dirty(true);
        setV7SaveError(SAVE_CONFLICT_AUTOSAVE_BLOCKED_MESSAGE);
        return;
      }
      setUndoStackV7((stack) =>
        deckV7 ? [...stack, deckV7].slice(-50) : stack,
      );
      setRedoStackV7([]);
      setDeckV7(updatedDeck);
      setV7Dirty(true);
      setV7SaveError(null);
      scheduleAutosaveV7(updatedDeck);
    },
    [conflictStateV7, deckV7, scheduleAutosaveV7],
  );

  const handleUndoV7 = useCallback(() => {
    if (hasUnresolvedDeckSaveConflict(conflictStateV7)) return;
    setUndoStackV7((stack) => {
      const previous = stack.at(-1);
      if (!previous || !deckV7) return stack;
      setRedoStackV7((redoStack) => [...redoStack, deckV7].slice(-50));
      focusAfterHistoryV7(deckV7, previous);
      setDeckV7(previous);
      setV7Dirty(true);
      setV7SaveError(null);
      scheduleAutosaveV7(previous);
      return stack.slice(0, -1);
    });
  }, [conflictStateV7, deckV7, focusAfterHistoryV7, scheduleAutosaveV7]);

  const handleRedoV7 = useCallback(() => {
    if (hasUnresolvedDeckSaveConflict(conflictStateV7)) return;
    setRedoStackV7((stack) => {
      const next = stack.at(-1);
      if (!next || !deckV7) return stack;
      setUndoStackV7((undoStack) => [...undoStack, deckV7].slice(-50));
      focusAfterHistoryV7(deckV7, next);
      setDeckV7(next);
      setV7Dirty(true);
      setV7SaveError(null);
      scheduleAutosaveV7(next);
      return stack.slice(0, -1);
    });
  }, [conflictStateV7, deckV7, focusAfterHistoryV7, scheduleAutosaveV7]);

  const handleOpenDialogApply = useCallback(
    ({
      deckV7: generatedV7,
      truncated,
      options,
    }: {
      deckV7: DeckV7;
      truncated: boolean;
      options: DeckGenerationOptions;
    }) => {
      if (!pendingJson) return;
      void showAiPreviewV7(generatedV7, truncated, options, pendingJson);
    },
    [pendingJson, showAiPreviewV7],
  );

  const handleOpenDialogDerive = useCallback(() => {
    if (!pendingJson) return;
    void openDerivedV7();
  }, [openDerivedV7, pendingJson]);

  const handleOpenDialogClose = useCallback(() => {
    setPendingJson(null);
    setPendingThemePackageId(DEFAULT_THEME_PACKAGE_ID);
    setEmptyDocument(false);
  }, []);

  const handleAiPreviewV7Apply = useCallback(
    (applied: DeckV7) => {
      if (aiPreviewV7) {
        openWithAiDeckV7(applied);
      }
    },
    [aiPreviewV7, openWithAiDeckV7],
  );

  const handleAiPreviewV7Derive = useCallback(() => {
    if (aiPreviewV7) {
      void openDerivedV7();
    }
  }, [aiPreviewV7, openDerivedV7]);

  const handleAiPreviewV7Cancel = useCallback(() => {
    setAiPreviewV7(null);
  }, []);

  const handleConflictKeepMineV7 = useCallback(
    async (localDeck: DeckV7, serverToken: string | null) => {
      const res: SaveDeckResult = await deckPort.saveDeckJson(
        documentId,
        localDeck,
        serverToken,
      );
      if (res.ok === true) {
        lastSavedRef.current = localDeck;
        revisionTokenRef.current = res.revisionToken;
        setConflictStateV7(null);
        setV7Dirty(false);
        setV7Saving(false);
        setV7SaveError(null);
      } else if (res.ok === "conflict") {
        setConflictStateV7({
          localDeck,
          serverRevisionToken: res.serverRevisionToken,
        });
        throw new Error("Still conflicted - try again.");
      } else {
        throw new Error(res.error);
      }
    },
    [deckPort, documentId],
  );

  const handleConflictUseTheirsV7 = useCallback(() => {
    setConflictStateV7(null);
    void (async () => {
      try {
        const fetched = await deckPort.fetchDeckJson(documentId);
        if (!fetched.ok) {
          setV7SaveError(fetched.error);
          return;
        }
        revisionTokenRef.current = fetched.revisionToken;
        lastSavedRef.current = fetched.deckJson;
        const openResult = openDeckFromJson(fetched.deckJson);
        if (openResult.ok) {
          setDeckV7(openResult.deck);
          setDeckOpenDiagnosticsV7(openResult.diagnostics);
          setDeckOpenErrorV7(null);
          setV7Dirty(false);
          setV7Saving(false);
          setV7SaveError(null);
          setUndoStackV7([]);
          setRedoStackV7([]);
        } else {
          enterRecoveryV7({
            error: openResult.error,
            diagnostics: openResult.diagnostics,
            validationErrors: openResult.errors,
          });
        }
      } catch {
        // Best-effort: keep the user's local deck if fetch fails.
      }
    })();
  }, [deckPort, documentId, enterRecoveryV7]);

  const handleConflictDismissV7 = useCallback(() => {
    setConflictStateV7(null);
  }, []);

  const saveStatus: SaveStatus = resolveSaveStatus({
    isDirty: v7Dirty,
    isSaving: v7Saving,
    hasError: v7SaveError !== null,
  });

  return {
    open,
    deckV7,
    deckOpenDiagnosticsV7,
    deckOpenErrorV7,
    saveStatus,
    saveStatusLabel: SAVE_STATUS_LABEL[saveStatus],
    saveErrorMessage: resolveSaveErrorMessage(v7SaveError),
    hasUnsavedWork: v7Dirty || v7Saving || v7SaveError !== null,
    setDeckV7,
    handleDeckV7Change,
    handleSaveV7,
    handleUndoV7,
    handleRedoV7,
    undoRedoFocusV7,
    canUndoV7:
      !hasUnresolvedDeckSaveConflict(conflictStateV7) && undoStackV7.length > 0,
    canRedoV7:
      !hasUnresolvedDeckSaveConflict(conflictStateV7) && redoStackV7.length > 0,
    handleOpen,
    handleClose,
    aiEnabled,
    pendingJson,
    pendingThemePackageId,
    emptyDocument,
    handleOpenDialogApply,
    handleOpenDialogDerive,
    handleOpenDialogClose,
    aiPreviewV7,
    handleAiPreviewV7Apply,
    handleAiPreviewV7Derive,
    handleAiPreviewV7Cancel,
    conflictStateV7,
    handleConflictKeepMineV7,
    handleConflictUseTheirsV7,
    handleConflictDismissV7,
  };
}
