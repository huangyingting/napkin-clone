"use client";

/**
 * Open/close/route state controller for the slide editor entry-point.
 *
 * Encapsulates all state and handlers that were previously inline in
 * SlideEditorButton: deck loading, AI deck generation flow, save/autosave,
 * conflict recovery, and live document re-sync. The button component
 * becomes purely presentational.
 *
 * Key flows:
 * - Deterministic open: fetches the freshest deckJson from the server,
 *   falls back to last-saved / freshly-derived base deck.
 * - AI open (when the client flag is set): shows a chooser first, then
 *   optionally a preview/diff before applying.
 * - Conflict recovery: surfaces a dialog when a save returns "conflict".
 * - Live re-sync: debounced Lexical update listener updates freshDeck while
 *   the panel is open.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { BrandListPort, DeckActionPort } from "@/lib/action-ports";
import type { ActionResult } from "@/lib/action-result";
import type { SaveDeckResult } from "@/lib/document/persistence-types";
import { isAiDeckGenClientEnabled } from "@/lib/ai/ai-deck-gen-flag";
import { isEffectivelyEmptyEditorState } from "@/lib/ai/empty-content";
import type { DeckGenerationOptions } from "@/lib/ai/use-deck-generation";
import { deckEditDistance } from "@/lib/ai/deck-metrics";
import { logInfo } from "@/lib/log";
import { buildDeckFromBlocks, type Deck } from "@/lib/presentation/deck";
import type { DeckPatch } from "@/lib/presentation/slide-commands";
import {
  computeDeckContentHash,
  isDeckStale,
  stampDeckContentHash,
} from "@/lib/presentation/deck-hash";
import { pickFreshestDeck } from "@/lib/presentation/fresh-deck";
import { inferPresentationTheme } from "@/lib/presentation/infer-theme";
import {
  DEFAULT_THEME_PACKAGE_ID,
  resolveThemePackageId,
  type ThemePackageId,
} from "@/lib/presentation/theme-packages";
import { SLIDE_SAVE_DEBOUNCE_MS } from "@/lib/presentation/save-status";
import { attemptPatchAutosave } from "@/lib/presentation/patch-autosave";
import { mergeSwatches } from "@/lib/presentation/text-style";
import { stripOrphanedVisuals } from "@/lib/presentation/strip-orphans";
import { collectDocumentBlocks } from "@/lib/content";
import type { DocumentBlock, DocumentTextBlock } from "@/lib/content";
import { bucketCount, emitProductTelemetry } from "@/lib/telemetry/product";
import type { Visual } from "@/lib/visual/schema";
import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import {
  openDeckFromJson,
  looksLikeDeckV7,
} from "@/lib/presentation-vnext/open-deck";

/** The freshly-derived open context captured from the live Lexical state. */
interface OpenContext {
  baseDeck: Deck;
  currentContentHash: string;
  visualMap: Map<string, Visual>;
  knownVisualIds: Set<string>;
  /** All source document blocks, for source-link refresh and relinking. */
  documentBlocks: DocumentBlock[];
  /** The document's text blocks, for the "From document" quick-insert panel. */
  documentTextBlocks: DocumentTextBlock[];
}

/** State backing the AI deck preview/diff surface (issue #269). */
export interface AiPreviewState {
  /** The AI-generated deck under review. */
  proposedDeck: Deck;
  /** The deck the editor would otherwise open — the diff baseline. */
  baselineDeck: Deck;
  /** Embedded visuals so the preview thumbnails render real content. */
  visuals: ReadonlyMap<string, Visual>;
  /** Whether the source outline was trimmed to fit the input budget. */
  truncated: boolean;
  /** Generation options, re-sent verbatim on Regenerate. */
  options: DeckGenerationOptions;
  /** The document snapshot, re-sent verbatim on Regenerate / used on apply. */
  contentJson: string;
}

/** State backing the v7 AI deck preview/diff surface. */
export interface AiPreviewStateV7 {
  /** The AI-generated v7 deck under review. */
  proposedDeck: DeckV7;
  /**
   * The v7 deck the editor would otherwise open (migrated from v6 baseline
   * if the stored deck is still v6).
   */
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
  brandPort: BrandListPort;
  initialContentJson?: string | null;
  onOpenRightSurface?: () => void;
  onCloseRightSurface?: () => void;
}

const noop = () => undefined;

export function useSlideEditorOpen({
  documentId,
  initialDeckJson,
  deckPort,
  brandPort,
  initialContentJson = null,
  onOpenRightSurface = noop,
  onCloseRightSurface = noop,
}: UseSlideEditorOpenOptions) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  // When the AI entry point is enabled, opening shows a chooser first; this
  // holds the document content captured at chooser-open time so the choice
  // (generate vs derive) operates on a consistent snapshot.
  const [pendingJson, setPendingJson] = useState<string | null>(null);
  const [pendingThemePackageId, setPendingThemePackageId] =
    useState<ThemePackageId>(DEFAULT_THEME_PACKAGE_ID);
  // True when the document is genuinely empty (both the live editor state and
  // the DB-persisted initial content are effectively empty). Gates the AI
  // generate option off and surfaces a friendly "add content first" message in
  // the chooser instead of letting the request 400 (issue #280).
  const [emptyDocument, setEmptyDocument] = useState(false);
  // The AI deck preview/diff (issue #269). Set after a successful generation so
  // the user reviews the proposed deck (against the baseline the editor would
  // otherwise open) BEFORE it opens — opening is non-destructive and only
  // happens on "Apply". `null` whenever no proposal is under review.
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);
  // v7 AI preview: set when the AI generation returns a DeckV7. Shown via
  // DeckGenerationPreviewVNext. Mutually exclusive with aiPreview.
  const [aiPreviewV7, setAiPreviewV7] = useState<AiPreviewStateV7 | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  // v7 editor state: set when the stored/AI-generated deck is DeckV7.
  // Mutually exclusive with `deck` — only one is non-null at a time.
  const [deckV7, setDeckV7] = useState<DeckV7 | null>(null);
  // Ref kept in sync every render so the live-resync effect (below) can read
  // the latest deck without adding `deck` to its dependency array — which would
  // cause the Lexical listener to be torn down and re-registered on every deck
  // edit (issue #295).
  const deckRef = useRef<Deck | null>(null);
  // Keep deckRef in sync after every render so the live-resync timeout (below)
  // always reads the latest deck. useLayoutEffect runs synchronously post-DOM,
  // before the browser paints — safe because the timeout fires well after.
  useLayoutEffect(() => {
    deckRef.current = deck;
  });
  // The freshly-derived deck and its content hash, captured at open from the
  // live Lexical state. Drives the "Sync from document" merge and the
  // staleness banner without ever reaching back into Lexical from the editor.
  const [freshDeck, setFreshDeck] = useState<Deck | null>(null);
  const [stale, setStale] = useState(false);
  const [visuals, setVisuals] = useState<ReadonlyMap<string, Visual>>(
    () => new Map(),
  );
  // The document's text blocks, surfaced in the editor's "From document"
  // quick-insert panel so reused document text is one click away.
  const [documentTextBlocks, setDocumentTextBlocks] = useState<
    readonly DocumentTextBlock[]
  >([]);
  const [documentBlocks, setDocumentBlocks] = useState<
    readonly DocumentBlock[]
  >([]);
  // The current user's brand-kit colors, surfaced first in the editor's color
  // pickers. Best-effort: brands are per-user (not document-scoped), loaded
  // once on mount; failures leave the pickers on their default swatches.
  const [brandSwatches, setBrandSwatches] = useState<readonly string[]>([]);

  const aiEnabled = isAiDeckGenClientEnabled();

  // Tracks the most recently saved deck so subsequent opens use fresh data
  // even without a server round-trip succeeding (e.g. offline).
  const lastSavedRef = useRef<unknown>(initialDeckJson);

  // The revision token from the most recent fetch or successful save. Passed to
  // saveDeckJson as the clientToken for optimistic locking. null until the first
  // successful fetch or save.
  const revisionTokenRef = useRef<string | null>(null);

  // Debounced v7 autosave timer. Fires SLIDE_SAVE_DEBOUNCE_MS after the last
  // onDeckChange call when the v7 editor is open.
  const v7AutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Conflict recovery dialog state (#404). When a save returns ok: "conflict"
  // the dialog opens with the local deck snapshot and the server's current
  // revision token. Closed by user action or after successful recovery.
  const [conflictState, setConflictState] = useState<{
    localDeck: Deck;
    serverRevisionToken: string | null;
  } | null>(null);

  // v7 conflict recovery state. Mirrors conflictState but carries a DeckV7
  // snapshot so the v7 editor can recover without coercing through the v6 type.
  const [conflictStateV7, setConflictStateV7] = useState<{
    localDeck: DeckV7;
    serverRevisionToken: string | null;
  } | null>(null);

  // The deck the editor opened with when it originated from an AI "Apply"
  // (issue #270). Set on apply, consumed once on the FIRST successful save to
  // log a content-free post-apply edit-distance signal, then cleared. `null`
  // whenever the open did not originate from AI.
  const aiAppliedDeckRef = useRef<Deck | null>(null);

  // Load the user's brand-kit palettes once the editor is first opened so the
  // color pickers can offer brand colors first. Deferred until `open` to avoid
  // a brand query for users who never touch the slide editor.
  useEffect(() => {
    if (!open || brandSwatches.length > 0) return;
    let cancelled = false;
    void brandPort
      .listBrands()
      .then((brands) => {
        if (cancelled) return;
        const swatches = mergeSwatches(
          ...brands.map((brand) => [
            ...(brand.palette ?? []),
            brand.background,
            brand.nodeFill,
            brand.nodeStroke,
            brand.edgeColor,
            brand.nodeText,
          ]),
        );
        setBrandSwatches(swatches);
      })
      .catch(() => {
        // Brand swatches are a best-effort enhancement; ignore failures.
      });
    return () => {
      cancelled = true;
    };
  }, [brandPort, open, brandSwatches.length]);

  // Build the base deck + visual inventory from a serialised document snapshot.
  // Stamp the freshly-derived deck with the *current* document content hash so a
  // deck saved from it is never falsely flagged as stale on reopen. A fresh
  // derivation inherits the document's dominant visual theme (or `indigo` when
  // none).
  const buildOpenContext = useCallback(
    (json: string): OpenContext => {
      const blocks = collectDocumentBlocks(json);
      const derived = buildDeckFromBlocks(
        blocks,
        inferPresentationTheme(blocks),
        {
          documentId,
        },
      );
      const currentContentHash = computeDeckContentHash(derived);
      const baseDeck = stampDeckContentHash(derived, currentContentHash);

      // Map every embedded visual so the slide previews can render real content
      // without ever reaching back into Lexical/Yjs state.
      const visualMap = new Map<string, Visual>();
      for (const block of blocks) {
        if (block.kind === "visual") {
          visualMap.set(block.visualId, block.visual);
        }
      }
      return {
        baseDeck,
        currentContentHash,
        visualMap,
        knownVisualIds: new Set(visualMap.keys()),
        documentBlocks: blocks,
        documentTextBlocks: blocks.filter(
          (block): block is DocumentTextBlock => block.kind === "text",
        ),
      };
    },
    [documentId],
  );

  // Live document→deck re-sync while the slide editor panel is open (issue
  // #295). Registers a Lexical update listener only while `open` is true;
  // debounces re-derivation (~350 ms) so rapid keystrokes don't thrash. Reads
  // the current deck through `deckRef` so the effect deps stay stable and the
  // listener is NOT torn-down/re-registered on every deck edit. Cleanup
  // unsubscribes the listener AND cancels any pending debounce — no leak on
  // panel-close or unmount.
  useEffect(() => {
    if (!open) return;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = editor.registerUpdateListener(({ editorState }) => {
      const json = JSON.stringify(editorState.toJSON());
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(() => {
        timerId = null;
        const ctx = buildOpenContext(json);
        setFreshDeck(stripOrphanedVisuals(ctx.baseDeck, ctx.knownVisualIds));
        setVisuals(ctx.visualMap);
        setDocumentBlocks(ctx.documentBlocks);
        setDocumentTextBlocks(ctx.documentTextBlocks);
        if (deckRef.current !== null) {
          setStale(isDeckStale(deckRef.current, ctx.currentContentHash));
        }
      }, 350);
    });
    return () => {
      unsubscribe();
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };
  }, [editor, open, buildOpenContext]);

  // Cleanup v7 autosave timer on unmount to prevent dangling timers.
  useEffect(() => {
    return () => {
      if (v7AutosaveTimerRef.current !== null) {
        clearTimeout(v7AutosaveTimerRef.current);
        v7AutosaveTimerRef.current = null;
      }
    };
  }, []);

  // Commit the prepared deck into editor state and reveal the SlideEditor panel.
  const finishOpen = useCallback(
    (startDeck: Deck, ctx: OpenContext) => {
      setVisuals(ctx.visualMap);
      setDocumentBlocks(ctx.documentBlocks);
      setDocumentTextBlocks(ctx.documentTextBlocks);
      setDeck(startDeck);
      setDeckV7(null); // v6 path — clear any residual v7 state
      // freshDeck (current document) drives the merge; strip orphans so visual
      // elements always resolve to a renderable visual.
      setFreshDeck(stripOrphanedVisuals(ctx.baseDeck, ctx.knownVisualIds));
      setStale(isDeckStale(startDeck, ctx.currentContentHash));
      setPendingJson(null);
      setAiPreview(null);
      setAiPreviewV7(null);
      setOpen(true);
      onOpenRightSurface();
    },
    [onOpenRightSurface],
  );

  // v7 open path: commits a DeckV7 into editor state. No staleness/freshDeck
  // needed for the v7 surface (it re-derives on edit). Preserves document
  // blocks and visuals for the side panel.
  const finishOpenV7 = useCallback(
    (startDeck: DeckV7, ctx: OpenContext) => {
      setVisuals(ctx.visualMap);
      setDocumentBlocks(ctx.documentBlocks);
      setDocumentTextBlocks(ctx.documentTextBlocks);
      setDeckV7(startDeck);
      setDeck(null); // v7 path — clear any residual v6 state
      setFreshDeck(null);
      setStale(false);
      setPendingJson(null);
      setAiPreview(null);
      setAiPreviewV7(null);
      setOpen(true);
      onOpenRightSurface();
    },
    [onOpenRightSurface],
  );

  // Deterministic open path (the default and the universal fallback). Seeds from
  // the freshest of server deckJson / last saved / freshly-derived base deck.
  // Prepare the deterministic baseline the editor would otherwise open: the
  // freshest of server deckJson / last saved / freshly-derived base deck.
  const prepareOpen = useCallback(
    async (json: string): Promise<{ startDeck: Deck; ctx: OpenContext }> => {
      const ctx = buildOpenContext(json);

      // Fetch the freshest deckJson from the server; fall back gracefully.
      let fetchedRaw: unknown = null;
      try {
        const fetched = await deckPort.fetchDeckJson(documentId);
        fetchedRaw = fetched.deckJson;
        revisionTokenRef.current = fetched.revisionToken;
      } catch {
        // Network/auth error — proceed with lastSavedRef as fallback.
      }

      const startDeck = stripOrphanedVisuals(
        pickFreshestDeck(fetchedRaw, lastSavedRef.current, ctx.baseDeck),
        ctx.knownVisualIds,
      );
      return { startDeck, ctx };
    },
    [buildOpenContext, deckPort, documentId],
  );

  /**
   * Resolve the freshest stored deck as a `DeckV7`. If the stored deck is v7,
   * parses it directly. If it is v6 (or absent), migrates via `openDeckFromJson`.
   * Returns the v7 deck or null when migration fails.
   */
  const prepareOpenV7 = useCallback(
    async (
      json: string,
    ): Promise<{ startDeckV7: DeckV7; ctx: OpenContext } | null> => {
      const ctx = buildOpenContext(json);

      let fetchedRaw: unknown = null;
      try {
        const fetched = await deckPort.fetchDeckJson(documentId);
        fetchedRaw = fetched.deckJson;
        revisionTokenRef.current = fetched.revisionToken;
      } catch {
        // Network/auth error — fall through to derive.
      }

      // Pick the freshest raw candidate, then open as v7 (migrate if needed).
      const rawCandidate = fetchedRaw ?? lastSavedRef.current;
      const openResult = rawCandidate ? openDeckFromJson(rawCandidate) : null;

      if (openResult?.ok) {
        return { startDeckV7: openResult.deck, ctx };
      }
      // Fallback: migrate the freshly-derived v6 base deck.
      const migrated = openDeckFromJson(ctx.baseDeck as unknown);
      if (migrated.ok) {
        return { startDeckV7: migrated.deck, ctx };
      }
      return null;
    },
    [buildOpenContext, deckPort, documentId],
  );

  // Deterministic open path (the default and the universal fallback).
  const openDerived = useCallback(
    async (json: string) => {
      // A derived open never originates from AI apply — drop any baseline.
      aiAppliedDeckRef.current = null;
      const { startDeck, ctx } = await prepareOpen(json);
      finishOpen(startDeck, ctx);
    },
    [prepareOpen, finishOpen],
  );

  // v7 deterministic open path: opens with SlideEditorVNext when the stored
  // deck is (or can be migrated to) DeckV7.
  const openDerivedV7 = useCallback(
    async (json: string) => {
      aiAppliedDeckRef.current = null;
      const result = await prepareOpenV7(json);
      if (!result) {
        // Migration failed — fall back to v6 path.
        return openDerived(json);
      }
      finishOpenV7(result.startDeckV7, result.ctx);
    },
    [prepareOpenV7, finishOpenV7, openDerived],
  );

  // AI open path: a freshly generated deck (already normalized and
  // safeParseDeck-valid) is stamped with the current
  // document hash so it isn't falsely flagged stale, then flowed through the
  // same strip-orphans pipeline as a derived deck. This is the
  // APPLY point of issue #269: it runs only after the user reviews the preview
  // and presses "Apply", and remains non-destructive (the AI deck becomes the
  // editor's history baseline; nothing is persisted until the first edit/save).
  const openWithAiDeck = useCallback(
    (aiDeck: Deck, json: string) => {
      const ctx = buildOpenContext(json);
      const stamped = stampDeckContentHash(aiDeck, ctx.currentContentHash);
      const startDeck = stripOrphanedVisuals(stamped, ctx.knownVisualIds);
      // Record the applied AI deck as the baseline for the post-apply
      // edit-distance signal (issue #270), captured after the same open
      // pipeline the editor uses so the first save is compared like-for-like.
      aiAppliedDeckRef.current = startDeck;
      emitProductTelemetry("product.ai.deck.applied", {
        editDistanceBucket: bucketCount(
          deckEditDistance(ctx.baseDeck, startDeck).distance,
        ),
        slideCount: startDeck.slides.length,
      });
      setAiPreview(null);
      setAiPreviewV7(null);
      finishOpen(startDeck, ctx);
    },
    [buildOpenContext, finishOpen],
  );

  // v7 AI apply path: opens SlideEditorVNext with the AI-generated v7 deck.
  const openWithAiDeckV7 = useCallback(
    (aiDeck: DeckV7, json: string) => {
      const ctx = buildOpenContext(json);
      emitProductTelemetry("product.ai.deck.applied", {
        editDistanceBucket: bucketCount(aiDeck.slides.length),
        slideCount: aiDeck.slides.length,
      });
      setAiPreview(null);
      setAiPreviewV7(null);
      finishOpenV7(aiDeck, ctx);
    },
    [buildOpenContext, finishOpenV7],
  );

  // A successful AI generation lands here (issue #269): instead of auto-opening
  // the editor, compute the deterministic baseline and present the preview/diff.
  // The user reviews, then Applies (→ openWithAiDeck) or falls back to derive.
  const showAiPreview = useCallback(
    async (
      proposedDeck: Deck,
      truncated: boolean,
      options: DeckGenerationOptions,
      json: string,
    ) => {
      const { startDeck, ctx } = await prepareOpen(json);
      setPendingJson(null);
      setAiPreview({
        proposedDeck,
        baselineDeck: startDeck,
        visuals: ctx.visualMap,
        truncated,
        options,
        contentJson: json,
      });
    },
    [prepareOpen],
  );

  // v7 AI preview path: shown when the generation response includes a DeckV7.
  const showAiPreviewV7 = useCallback(
    async (
      proposedDeck: DeckV7,
      truncated: boolean,
      options: DeckGenerationOptions,
      json: string,
    ) => {
      const result = await prepareOpenV7(json);
      setPendingJson(null);
      // Use the v7 baseline from storage, or migrate the proposed deck as the
      // baseline fallback (they'll look the same in the diff, which is fine
      // since the stored deck is essentially empty / v6).
      const baselineDeck = result?.startDeckV7 ?? proposedDeck;
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

  const handleOpen = useCallback(async () => {
    const liveJson = JSON.stringify(editor.getEditorState().toJSON());

    // v7 dispatch: if the stored/last-saved deck is v7, open the vNext editor.
    if (
      looksLikeDeckV7(lastSavedRef.current) ||
      looksLikeDeckV7(initialDeckJson)
    ) {
      if (aiEnabled) {
        // Show AI chooser with v7 baseline available.
        let effectiveJson = liveJson;
        if (
          isEffectivelyEmptyEditorState(liveJson) &&
          initialContentJson &&
          !isEffectivelyEmptyEditorState(initialContentJson)
        ) {
          effectiveJson = initialContentJson;
        }
        setEmptyDocument(isEffectivelyEmptyEditorState(effectiveJson));
        setPendingThemePackageId(DEFAULT_THEME_PACKAGE_ID);
        setPendingJson(effectiveJson);
        return;
      }
      await openDerivedV7(liveJson);
      return;
    }

    if (aiEnabled) {
      // Prefer the freshest NON-empty snapshot so a still-seeding editor (collab
      // degraded/connecting; LocalFallbackSeedPlugin seeds via a deferred
      // microtask — #257) doesn't break AI generation with an empty-outline 400
      // (#280). Fall back to the DB-persisted initial content when the live
      // state is still empty; only when BOTH are empty is the document genuinely
      // empty and the AI option is gated off.
      let effectiveJson = liveJson;
      if (
        isEffectivelyEmptyEditorState(liveJson) &&
        initialContentJson &&
        !isEffectivelyEmptyEditorState(initialContentJson)
      ) {
        effectiveJson = initialContentJson;
      }
      setEmptyDocument(isEffectivelyEmptyEditorState(effectiveJson));
      const { startDeck } = await prepareOpen(effectiveJson);
      const themeId = String((startDeck as any).design?.themeId ?? "");
      setPendingThemePackageId(
        resolveThemePackageId(themeId) ?? DEFAULT_THEME_PACKAGE_ID,
      );
      // Defer the heavy open work until the user picks generate vs derive.
      setPendingJson(effectiveJson);
      return;
    }
    await openDerived(liveJson);
  }, [
    editor,
    aiEnabled,
    openDerived,
    openDerivedV7,
    initialContentJson,
    initialDeckJson,
    prepareOpen,
  ]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setDeck(null);
    setDeckV7(null);
    setFreshDeck(null);
    setDocumentBlocks([]);
    setDocumentTextBlocks([]);
    setStale(false);
    setPendingJson(null);
    setPendingThemePackageId(DEFAULT_THEME_PACKAGE_ID);
    setEmptyDocument(false);
    setAiPreview(null);
    setAiPreviewV7(null);
    setConflictStateV7(null);
    aiAppliedDeckRef.current = null;
    if (v7AutosaveTimerRef.current !== null) {
      clearTimeout(v7AutosaveTimerRef.current);
      v7AutosaveTimerRef.current = null;
    }
    onCloseRightSurface();
  }, [onCloseRightSurface]);

  const handleSave = useCallback(
    async (
      updatedDeck: Deck,
      patches: DeckPatch[] = [],
    ): Promise<ActionResult> => {
      const result = await attemptPatchAutosave(
        documentId,
        updatedDeck,
        patches,
        revisionTokenRef.current,
        deckPort.saveDeckPatch,
        deckPort.saveDeckJson,
      );

      if (result.ok === true) {
        lastSavedRef.current = updatedDeck;
        revisionTokenRef.current = result.revisionToken;

        const aiBaseline = aiAppliedDeckRef.current;
        if (aiBaseline) {
          aiAppliedDeckRef.current = null;
          try {
            const distance = deckEditDistance(aiBaseline, updatedDeck);
            logInfo("editor.slide-editor", "ai-deck-post-apply-edit", {
              slidesAdded: distance.slidesAdded,
              slidesRemoved: distance.slidesRemoved,
              slidesChanged: distance.slidesChanged,
              elementDelta: distance.elementDelta,
              distance: distance.distance,
            });
            emitProductTelemetry("product.ai.deck.saved", {
              editDistanceBucket: bucketCount(distance.distance),
              slideCount: updatedDeck.slides.length,
            });
          } catch {
            // Best-effort.
          }
        }
        return { ok: true, data: undefined };
      }
      if (result.ok === "conflict") {
        setConflictState({
          localDeck: updatedDeck,
          serverRevisionToken: result.serverRevisionToken,
        });
        return {
          ok: false,
          error: "Save conflict: another session modified this deck.",
        };
      }
      return { ok: false, error: result.error };
    },
    [deckPort, documentId],
  );

  // Conflict recovery: "Keep mine" — force-save the local snapshot using the
  // server's current token so the CAS check passes (#404).
  const handleConflictKeepMine = useCallback(
    async (localDeck: Deck, serverToken: string | null) => {
      const res: SaveDeckResult = await deckPort.saveDeckJson(
        documentId,
        localDeck,
        serverToken,
      );
      if (res.ok === true) {
        lastSavedRef.current = localDeck;
        revisionTokenRef.current = res.revisionToken;
        setConflictState(null);
      } else if (res.ok === "conflict") {
        // Another concurrent write raced us again; update the token and retry.
        setConflictState({
          localDeck,
          serverRevisionToken: res.serverRevisionToken,
        });
        throw new Error("Still conflicted — try again.");
      } else {
        throw new Error(res.error);
      }
    },
    [deckPort, documentId],
  );

  // Conflict recovery: "Use theirs" — reload the server deck and discard local
  // changes (#404). We re-fetch to get the latest revision token.
  const handleConflictUseTheirs = useCallback(() => {
    setConflictState(null);
    void (async () => {
      try {
        const fetched = await deckPort.fetchDeckJson(documentId);
        revisionTokenRef.current = fetched.revisionToken;
        if (fetched.deckJson) {
          lastSavedRef.current = fetched.deckJson;
          // Route to v7 or v6 editor based on the fetched schema version.
          if (looksLikeDeckV7(fetched.deckJson)) {
            const openResult = openDeckFromJson(fetched.deckJson);
            if (openResult.ok) {
              setDeckV7(openResult.deck);
              setDeck(null);
            }
          } else {
            // Update the editor deck via setDeck so the open editor reflects
            // the server state.
            const { safeParseDeck } =
              await import("@/lib/presentation/deck-schema");
            const parsed = safeParseDeck(fetched.deckJson);
            if (parsed.success) {
              setDeck(parsed.data);
              setDeckV7(null);
            }
          }
        }
      } catch {
        // Best-effort — user will see the existing (local) deck if fetch fails.
      }
    })();
  }, [deckPort, documentId]);

  // v7 save path: persists a DeckV7 directly via saveDeckJson. The CAS writer
  // on the server is updated to validate v7 via safeParseDeckV7.
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

  // v7 autosave: debounces saves after each onDeckChange call and updates
  // the deckV7 state so the in-memory copy stays current. Save errors
  // (including conflicts) are surfaced via conflictStateV7; non-conflict errors
  // are logged so they are never silently discarded.
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
            // Conflicts are already surfaced via conflictStateV7 (set inside
            // handleSaveV7). Log other errors so they are never invisible.
            logInfo("editor.slide-editor", "v7-autosave-error", {
              error: result.error,
            });
          }
        });
      }, SLIDE_SAVE_DEBOUNCE_MS);
    },
    [handleSaveV7],
  );

  // Pre-built dialog callbacks so the button stays presentational.
  const handleOpenDialogApply = useCallback(
    ({
      deck: generated,
      deckV7: generatedV7,
      truncated,
      options,
    }: {
      deck?: Deck;
      deckV7?: DeckV7;
      truncated: boolean;
      options: DeckGenerationOptions;
    }) => {
      if (!pendingJson) return;
      if (generatedV7) {
        void showAiPreviewV7(generatedV7, truncated, options, pendingJson);
      } else if (generated) {
        void showAiPreview(generated, truncated, options, pendingJson);
      }
    },
    [pendingJson, showAiPreview, showAiPreviewV7],
  );

  const handleOpenDialogDerive = useCallback(() => {
    if (!pendingJson) return;
    // If the stored deck is v7, derive opens v7 editor.
    if (
      looksLikeDeckV7(lastSavedRef.current) ||
      looksLikeDeckV7(initialDeckJson)
    ) {
      void openDerivedV7(pendingJson);
    } else {
      void openDerived(pendingJson);
    }
  }, [pendingJson, openDerived, openDerivedV7, initialDeckJson]);

  const handleOpenDialogClose = useCallback(() => {
    setPendingJson(null);
    setPendingThemePackageId(DEFAULT_THEME_PACKAGE_ID);
    setEmptyDocument(false);
  }, []);

  const handleAiPreviewApply = useCallback(
    (applied: Deck) => {
      if (aiPreview) {
        openWithAiDeck(applied, aiPreview.contentJson);
      }
    },
    [aiPreview, openWithAiDeck],
  );

  const handleAiPreviewDerive = useCallback(() => {
    if (aiPreview) {
      void openDerived(aiPreview.contentJson);
    }
  }, [aiPreview, openDerived]);

  const handleAiPreviewCancel = useCallback(() => {
    setAiPreview(null);
  }, []);

  // v7 AI preview callbacks.
  const handleAiPreviewV7Apply = useCallback(
    (applied: DeckV7) => {
      if (aiPreviewV7) {
        openWithAiDeckV7(applied, aiPreviewV7.contentJson);
      }
    },
    [aiPreviewV7, openWithAiDeckV7],
  );

  const handleAiPreviewV7Derive = useCallback(() => {
    if (aiPreviewV7) {
      void openDerivedV7(aiPreviewV7.contentJson);
    }
  }, [aiPreviewV7, openDerivedV7]);

  const handleAiPreviewV7Cancel = useCallback(() => {
    setAiPreviewV7(null);
  }, []);

  const handleConflictDismiss = useCallback(() => {
    setConflictState(null);
  }, []);

  // v7 conflict recovery: "Keep mine" — force-save the local DeckV7 snapshot
  // using the server's current revision token so the CAS check passes.
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
        // Another concurrent write raced us again; update the token and retry.
        setConflictStateV7({
          localDeck,
          serverRevisionToken: res.serverRevisionToken,
        });
        throw new Error("Still conflicted — try again.");
      } else {
        throw new Error(res.error);
      }
    },
    [deckPort, documentId],
  );

  // v7 conflict recovery: "Use theirs" — reload the server deck and discard
  // local changes. Routes to v7 or v6 editor by schema version.
  const handleConflictUseTheirsV7 = useCallback(() => {
    setConflictStateV7(null);
    void (async () => {
      try {
        const fetched = await deckPort.fetchDeckJson(documentId);
        revisionTokenRef.current = fetched.revisionToken;
        if (fetched.deckJson) {
          lastSavedRef.current = fetched.deckJson;
          if (looksLikeDeckV7(fetched.deckJson)) {
            const openResult = openDeckFromJson(fetched.deckJson);
            if (openResult.ok) {
              setDeckV7(openResult.deck);
              setDeck(null);
            }
          } else {
            const { safeParseDeck } =
              await import("@/lib/presentation/deck-schema");
            const parsed = safeParseDeck(fetched.deckJson);
            if (parsed.success) {
              setDeck(parsed.data);
              setDeckV7(null);
            }
          }
        }
      } catch {
        // Best-effort — user will see the existing (local) deck if fetch fails.
      }
    })();
  }, [deckPort, documentId]);

  const handleConflictDismissV7 = useCallback(() => {
    setConflictStateV7(null);
  }, []);

  return {
    // Main editor panel
    open,
    deck,
    setDeck,
    // v7 editor state and handlers
    deckV7,
    setDeckV7,
    handleDeckV7Change,
    handleSaveV7,
    visuals,
    documentBlocks,
    documentTextBlocks,
    freshDeck,
    stale,
    brandSwatches,
    handleOpen,
    handleClose,
    handleSave,
    // AI chooser dialog
    aiEnabled,
    pendingJson,
    pendingThemePackageId,
    emptyDocument,
    handleOpenDialogApply,
    handleOpenDialogDerive,
    handleOpenDialogClose,
    // AI preview (v6)
    aiPreview,
    handleAiPreviewApply,
    handleAiPreviewDerive,
    handleAiPreviewCancel,
    // AI preview (v7)
    aiPreviewV7,
    handleAiPreviewV7Apply,
    handleAiPreviewV7Derive,
    handleAiPreviewV7Cancel,
    // Conflict recovery (v6)
    conflictState,
    handleConflictKeepMine,
    handleConflictUseTheirs,
    handleConflictDismiss,
    // Conflict recovery (v7)
    conflictStateV7,
    handleConflictKeepMineV7,
    handleConflictUseTheirsV7,
    handleConflictDismissV7,
  };
}
