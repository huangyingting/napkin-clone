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
import { SLIDE_SAVE_DEBOUNCE_MS } from "@/lib/presentation/save-status";
import { bucketCount, emitProductTelemetry } from "@/lib/telemetry/product";
import {
  createBlankDeckV7,
  openDeckFromJson,
  type DeckV7,
} from "@/lib/presentation-vnext";

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
  const [conflictStateV7, setConflictStateV7] = useState<{
    localDeck: DeckV7;
    serverRevisionToken: string | null;
  } | null>(null);

  const aiEnabled = isAiDeckGenClientEnabled();
  const lastSavedRef = useRef<unknown>(initialDeckJson);
  const revisionTokenRef = useRef<string | null>(null);
  const v7AutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiAppliedDeckRef = useRef<DeckV7 | null>(null);

  useEffect(() => {
    return () => {
      if (v7AutosaveTimerRef.current !== null) {
        clearTimeout(v7AutosaveTimerRef.current);
        v7AutosaveTimerRef.current = null;
      }
    };
  }, []);

  const fallbackDeck = useCallback(
    () => createBlankDeckV7({ documentId }),
    [documentId],
  );

  const finishOpenV7 = useCallback(
    (startDeck: DeckV7) => {
      setDeckV7(startDeck);
      setPendingJson(null);
      setAiPreviewV7(null);
      setOpen(true);
      onOpenRightSurface();
    },
    [onOpenRightSurface],
  );

  const prepareOpenV7 = useCallback(async (): Promise<DeckV7> => {
    let fetchedRaw: unknown = null;
    try {
      const fetched = await deckPort.fetchDeckJson(documentId);
      fetchedRaw = fetched.deckJson;
      revisionTokenRef.current = fetched.revisionToken;
    } catch {
      // Network/auth error: fall back to the last in-memory deck, then blank v7.
    }

    const rawCandidate = fetchedRaw ?? lastSavedRef.current;
    if (rawCandidate) {
      const openResult = openDeckFromJson(rawCandidate);
      if (openResult.ok) return openResult.deck;
    }

    return fallbackDeck();
  }, [deckPort, documentId, fallbackDeck]);

  const openDerivedV7 = useCallback(async () => {
    aiAppliedDeckRef.current = null;
    finishOpenV7(await prepareOpenV7());
  }, [finishOpenV7, prepareOpenV7]);

  const openWithAiDeckV7 = useCallback(
    (aiDeck: DeckV7) => {
      aiAppliedDeckRef.current = aiDeck;
      emitProductTelemetry("product.ai.deck.applied", {
        editDistanceBucket: bucketCount(aiDeck.slides.length),
        slideCount: aiDeck.slides.length,
      });
      finishOpenV7(aiDeck);
    },
    [finishOpenV7],
  );

  const showAiPreviewV7 = useCallback(
    async (
      proposedDeck: DeckV7,
      truncated: boolean,
      options: DeckGenerationOptions,
      json: string,
    ) => {
      const baselineDeck = await prepareOpenV7();
      setPendingJson(null);
      setAiPreviewV7({
        proposedDeck,
        baselineDeck,
        truncated,
        options,
        contentJson: json,
      });
    },
    [prepareOpenV7],
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
    setPendingJson(null);
    setPendingThemePackageId(DEFAULT_THEME_PACKAGE_ID);
    setEmptyDocument(false);
    setAiPreviewV7(null);
    setConflictStateV7(null);
    aiAppliedDeckRef.current = null;
    if (v7AutosaveTimerRef.current !== null) {
      clearTimeout(v7AutosaveTimerRef.current);
      v7AutosaveTimerRef.current = null;
    }
    onCloseRightSurface();
  }, [onCloseRightSurface]);

  const handleSaveV7 = useCallback(
    async (updatedDeck: DeckV7): Promise<ActionResult> => {
      const saveResult = await deckPort.saveDeckJson(
        documentId,
        updatedDeck,
        revisionTokenRef.current,
      );
      if (saveResult.ok === true) {
        lastSavedRef.current = updatedDeck;
        revisionTokenRef.current = saveResult.revisionToken;

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
        setConflictStateV7({
          localDeck: updatedDeck,
          serverRevisionToken: saveResult.serverRevisionToken,
        });
        return {
          ok: false,
          error: "Save conflict: another session modified this deck.",
        };
      }
      return { ok: false, error: saveResult.error };
    },
    [deckPort, documentId],
  );

  const handleDeckV7Change = useCallback(
    (updatedDeck: DeckV7) => {
      setDeckV7(updatedDeck);
      if (v7AutosaveTimerRef.current !== null) {
        clearTimeout(v7AutosaveTimerRef.current);
      }
      v7AutosaveTimerRef.current = setTimeout(() => {
        v7AutosaveTimerRef.current = null;
        void handleSaveV7(updatedDeck).then((result) => {
          if (!result.ok) {
            logInfo("editor.slide-editor", "v7-autosave-error", {
              error: result.error,
            });
          }
        });
      }, SLIDE_SAVE_DEBOUNCE_MS);
    },
    [handleSaveV7],
  );

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
        setDeckV7(openResult.ok ? openResult.deck : fallbackDeck());
      } catch {
        // Best-effort: keep the user's local deck if fetch fails.
      }
    })();
  }, [deckPort, documentId, fallbackDeck]);

  const handleConflictDismissV7 = useCallback(() => {
    setConflictStateV7(null);
  }, []);

  return {
    open,
    deckV7,
    setDeckV7,
    handleDeckV7Change,
    handleSaveV7,
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