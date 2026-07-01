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
import { actionOk, type ActionResult } from "@/lib/action-result";
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
  dedupePresentationDiagnostics,
  mergePresentationDiagnostics,
} from "@/lib/presentation-vnext/diagnostic-handoff";
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
  /** AI repair/compile diagnostics from generation and preview regenerate. */
  generationDiagnostics: PresentationDiagnostic[];
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
const SAVE_CONFLICT_ERROR_MESSAGE =
  "Save conflict: another session modified this deck.";
const SAVE_DECK_REJECTED_FALLBACK_MESSAGE =
  "Couldn't save your deck. Check your connection and retry.";

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

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim();
  }
  if (typeof error === "string") {
    return error.trim();
  }
  return "";
}

export function resolveDeckSaveRejectionError(error: unknown): string {
  const details = stringifyError(error);
  if (!details) {
    return SAVE_DECK_REJECTED_FALLBACK_MESSAGE;
  }
  return `${SAVE_DECK_REJECTED_FALLBACK_MESSAGE} (${details})`;
}

interface PersistDeckV7WithRecoveryParams {
  updatedDeck: DeckV7;
  documentId: string;
  deckPort: Pick<DeckActionPort, "saveDeckJson">;
  revisionTokenRef: { current: string | null };
  lastSavedRef: { current: unknown };
  aiAppliedDeckRef: { current: DeckV7 | null };
  setV7Dirty: (dirty: boolean) => void;
  setV7Saving: (saving: boolean) => void;
  setV7SaveError: (error: string | null) => void;
  setConflictStateV7: (state: SlideEditorConflictStateV7 | null) => void;
  onAiDeckSaved: (savedDeck: DeckV7) => void;
}

export async function persistDeckV7WithRecovery({
  updatedDeck,
  documentId,
  deckPort,
  revisionTokenRef,
  lastSavedRef,
  aiAppliedDeckRef,
  setV7Dirty,
  setV7Saving,
  setV7SaveError,
  setConflictStateV7,
  onAiDeckSaved,
}: PersistDeckV7WithRecoveryParams): Promise<ActionResult> {
  setV7Saving(true);
  setV7SaveError(null);
  try {
    const saveResult = await deckPort.saveDeckJson(
      documentId,
      updatedDeck,
      revisionTokenRef.current,
    );
    if (saveResult.ok === true) {
      lastSavedRef.current = updatedDeck;
      revisionTokenRef.current = saveResult.revisionToken;
      setV7Dirty(false);
      setV7SaveError(null);
      setConflictStateV7(null);
      if (aiAppliedDeckRef.current) {
        aiAppliedDeckRef.current = null;
        onAiDeckSaved(updatedDeck);
      }
      return { ok: true, data: undefined };
    }
    if (saveResult.ok === "conflict") {
      setV7SaveError(SAVE_CONFLICT_ERROR_MESSAGE);
      setConflictStateV7({
        localDeck: updatedDeck,
        serverRevisionToken: saveResult.serverRevisionToken,
      });
      return { ok: false, error: SAVE_CONFLICT_ERROR_MESSAGE };
    }
    setV7SaveError(saveResult.error);
    return { ok: false, error: saveResult.error };
  } catch (error) {
    const rejectionError = resolveDeckSaveRejectionError(error);
    setV7SaveError(rejectionError);
    return { ok: false, error: rejectionError };
  } finally {
    setV7Saving(false);
  }
}

interface CreateSerializedDeckPersistorParams<TDeck> {
  persistDeck: (deck: TDeck) => Promise<ActionResult>;
}

export function createSerializedDeckPersistor<TDeck>({
  persistDeck,
}: CreateSerializedDeckPersistorParams<TDeck>): (
  deck: TDeck,
) => Promise<ActionResult> {
  let latestDeck: TDeck | null = null;
  let inFlightSave: Promise<ActionResult> | null = null;
  let saveAgain = false;

  return (deck: TDeck): Promise<ActionResult> => {
    latestDeck = deck;
    if (inFlightSave) {
      saveAgain = true;
      return inFlightSave;
    }

    const savePromise = (async (): Promise<ActionResult> => {
      let lastResult: ActionResult = actionOk();
      try {
        do {
          saveAgain = false;
          const deckToSave: TDeck | null = latestDeck;
          if (deckToSave === null) {
            return lastResult;
          }
          lastResult = await persistDeck(deckToSave);
          if (latestDeck !== deckToSave) {
            saveAgain = true;
          }
        } while (saveAgain);
        return lastResult;
      } finally {
        saveAgain = false;
      }
    })();

    inFlightSave = savePromise;
    void savePromise.finally(() => {
      if (inFlightSave === savePromise) {
        inFlightSave = null;
      }
    });
    return savePromise;
  };
}

interface CreateDeckAutosaveOnDueParams {
  persistDeckV7: (deck: DeckV7) => Promise<ActionResult>;
  log: typeof logInfo;
}

export function createDeckAutosaveOnDue({
  persistDeckV7,
  log,
}: CreateDeckAutosaveOnDueParams): (deck: DeckV7) => void {
  return (deck: DeckV7) => {
    void persistDeckV7(deck)
      .then((result) => {
        if (!result.ok) {
          log("editor.slide-editor", "v7-autosave-error", {
            error: result.error,
          });
        }
      })
      .catch((error: unknown) => {
        log("editor.slide-editor", "v7-autosave-error", {
          error: resolveDeckSaveRejectionError(error),
        });
      });
  };
}

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
  const inFlightPersistV7Ref = useRef<Promise<ActionResult> | null>(null);
  const latestPersistDeckV7Ref = useRef<DeckV7 | null>(null);
  const saveAgainPersistV7Ref = useRef(false);

  const persistDeckV7WithSingleWrite = useCallback(
    async (updatedDeck: DeckV7): Promise<ActionResult> => {
      return persistDeckV7WithRecovery({
        updatedDeck,
        documentId,
        deckPort,
        revisionTokenRef,
        lastSavedRef,
        aiAppliedDeckRef,
        setV7Dirty,
        setV7Saving,
        setV7SaveError,
        setConflictStateV7,
        onAiDeckSaved: (savedDeck) => {
          emitProductTelemetry("product.ai.deck.saved", {
            editDistanceBucket: bucketCount(savedDeck.slides.length),
            slideCount: savedDeck.slides.length,
          });
        },
      });
    },
    [deckPort, documentId],
  );
  const persistDeckV7 = useCallback(
    (updatedDeck: DeckV7): Promise<ActionResult> => {
      latestPersistDeckV7Ref.current = updatedDeck;
      if (inFlightPersistV7Ref.current) {
        saveAgainPersistV7Ref.current = true;
        return inFlightPersistV7Ref.current;
      }
      const savePromise = (async (): Promise<ActionResult> => {
        let lastResult: ActionResult = actionOk();
        try {
          do {
            saveAgainPersistV7Ref.current = false;
            const deckToSave = latestPersistDeckV7Ref.current;
            if (deckToSave === null) {
              return lastResult;
            }
            lastResult = await persistDeckV7WithSingleWrite(deckToSave);
            if (latestPersistDeckV7Ref.current !== deckToSave) {
              saveAgainPersistV7Ref.current = true;
            }
          } while (saveAgainPersistV7Ref.current);
          return lastResult;
        } finally {
          saveAgainPersistV7Ref.current = false;
        }
      })();
      inFlightPersistV7Ref.current = savePromise;
      void savePromise.finally(() => {
        if (inFlightPersistV7Ref.current === savePromise) {
          inFlightPersistV7Ref.current = null;
        }
      });
      return savePromise;
    },
    [persistDeckV7WithSingleWrite],
  );

  useEffect(() => {
    const onDue = createDeckAutosaveOnDue({
      persistDeckV7,
      log: logInfo,
    });
    const scheduler = createSlideAutosaveScheduler<DeckV7>({
      onDue,
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
    (aiDeck: DeckV7, generationDiagnostics: PresentationDiagnostic[] = []) => {
      // Route AI proposals through the same open boundary so a malformed deck
      // surfaces recovery diagnostics instead of silently blanking the editor.
      const opened = openAiGeneratedDeck(aiDeck);
      if (!opened.ok) {
        enterRecoveryV7({
          error: opened.error,
          diagnostics: mergePresentationDiagnostics(
            generationDiagnostics,
            opened.diagnostics,
          ),
          validationErrors: opened.errors,
        });
        return;
      }
      const mergedDiagnostics = mergePresentationDiagnostics(
        generationDiagnostics,
        opened.diagnostics,
      );
      aiAppliedDeckRef.current = opened.deck;
      emitProductTelemetry("product.ai.deck.applied", {
        editDistanceBucket: bucketCount(opened.deck.slides.length),
        slideCount: opened.deck.slides.length,
      });
      finishOpenV7(opened.deck, mergedDiagnostics);
    },
    [enterRecoveryV7, finishOpenV7],
  );

  const showAiPreviewV7 = useCallback(
    async (
      proposedDeck: DeckV7,
      truncated: boolean,
      generationDiagnostics: PresentationDiagnostic[],
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
        generationDiagnostics: dedupePresentationDiagnostics(
          generationDiagnostics,
        ),
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
      diagnostics,
      options,
    }: {
      deckV7: DeckV7;
      truncated: boolean;
      diagnostics: PresentationDiagnostic[];
      options: DeckGenerationOptions;
    }) => {
      if (!pendingJson) return;
      void showAiPreviewV7(
        generatedV7,
        truncated,
        diagnostics,
        options,
        pendingJson,
      );
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
    (applied: DeckV7, generationDiagnostics: PresentationDiagnostic[]) => {
      if (aiPreviewV7) {
        openWithAiDeckV7(applied, generationDiagnostics);
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
