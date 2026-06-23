"use client";

/**
 * Toolbar button that opens the SlideEditor panel for the current document.
 *
 * Reads the current Lexical editor state to derive a base deck via
 * buildDeckFromBlocks, then seeds the editor from the freshest available deck:
 * 1. Re-fetches deckJson from the server on every open (catches remote edits).
 * 2. Falls back to the last locally-saved deck (updated after each save).
 * 3. Falls back to the base deck derived from the Lexical editor state.
 * Saves go through the owner-scoped `saveDeckJson` server action.
 *
 * When AI deck generation is enabled (client flag), opening the editor first
 * presents a chooser (issue #268): "Generate with AI" (with length/tone/audience
 * options + staged progress) vs "Derive from document" (the deterministic
 * default). A successful generation flows through the SAME open pipeline as a
 * derived deck; ANY generation failure transparently falls back to derive.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LayoutPanelLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  fetchDeckJson,
  saveDeckJson,
  type SaveDeckResult,
} from "@/app/app/documents/[id]/actions";
import { listBrands } from "@/app/app/brands/actions";
import { SlideEditor } from "@/components/presentation/slide-editor";
import { SlideEditorOpenDialog } from "@/components/editor/slide-editor-open-dialog";
import { DeckGenerationPreview } from "@/components/presentation/deck-generation-preview";
import type { ActionResult } from "@/lib/action-result";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import { isAiDeckGenClientEnabled } from "@/lib/ai/ai-deck-gen-flag";
import { isEffectivelyEmptyEditorState } from "@/lib/ai/empty-content";
import type { DeckGenerationOptions } from "@/lib/ai/use-deck-generation";
import { deckEditDistance } from "@/lib/ai/deck-metrics";
import { logInfo } from "@/lib/log";
import { buildDeckFromBlocks, type Deck } from "@/lib/presentation/deck";
import { materializeDeck } from "@/lib/presentation/deck-mutations";
import {
  computeDeckContentHash,
  isDeckStale,
  stampDeckContentHash,
} from "@/lib/presentation/deck-hash";
import { pickFreshestDeck } from "@/lib/presentation/fresh-deck";
import { inferDeckTheme } from "@/lib/presentation/infer-theme";
import { mergeSwatches } from "@/lib/presentation/text-style";
import { stripOrphanedVisuals } from "@/lib/presentation/strip-orphans";
import { collectDocumentBlocks } from "@/lib/visual/document-export";
import type { DocumentTextBlock } from "@/lib/visual/document-export";
import type { Visual } from "@/lib/visual/schema";
import { useRightSurface } from "@/app/app/documents/[id]/right-surface-context";

interface SlideEditorButtonProps {
  documentId: string;
  initialDeckJson: unknown;
  /**
   * The DB-persisted serialised Lexical state the editor seeds from. Used as a
   * non-empty fallback for AI generation when the LIVE editor state hasn't
   * finished seeding yet (collab degraded/connecting — issue #280).
   */
  initialContentJson?: string | null;
  iconOnly?: boolean;
}

/** The freshly-derived open context captured from the live Lexical state. */
interface OpenContext {
  baseDeck: Deck;
  currentContentHash: string;
  visualMap: Map<string, Visual>;
  knownVisualIds: Set<string>;
  /** The document's text blocks, for the "From document" quick-insert panel. */
  documentTextBlocks: DocumentTextBlock[];
}

/** State backing the AI deck preview/diff surface (issue #269). */
interface AiPreviewState {
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

export function SlideEditorButton({
  documentId,
  initialDeckJson,
  initialContentJson = null,
  iconOnly = false,
}: SlideEditorButtonProps) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  // When the AI entry point is enabled, opening shows a chooser first; this
  // holds the document content captured at chooser-open time so the choice
  // (generate vs derive) operates on a consistent snapshot.
  const [pendingJson, setPendingJson] = useState<string | null>(null);
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
  const [deck, setDeck] = useState<Deck | null>(null);
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
  // The current user's brand-kit colors, surfaced first in the editor's color
  // pickers. Best-effort: brands are per-user (not document-scoped), loaded
  // once on mount; failures leave the pickers on their default swatches.
  const [brandSwatches, setBrandSwatches] = useState<readonly string[]>([]);
  const { openSlideEditor, closeSlideEditor } = useRightSurface();

  const aiEnabled = isAiDeckGenClientEnabled();

  // Load the user's brand-kit palettes once the editor is first opened so the
  // color pickers can offer brand colors first. Deferred until `open` to avoid
  // a brand query for users who never touch the slide editor.
  useEffect(() => {
    if (!open || brandSwatches.length > 0) return;
    let cancelled = false;
    void listBrands()
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
  }, [open, brandSwatches.length]);

  // Tracks the most recently saved deck so subsequent opens use fresh data
  // even without a server round-trip succeeding (e.g. offline).
  const lastSavedRef = useRef<unknown>(initialDeckJson);

  // The revision token from the most recent fetch or successful save. Passed to
  // saveDeckJson as the clientToken for optimistic locking. null until the first
  // successful fetch or save; legacy documents (null DB token) are treated as
  // "no lock" on the first save, then start carrying a token from then on.
  const revisionTokenRef = useRef<string | null>(null);

  // The deck the editor opened with when it originated from an AI "Apply"
  // (issue #270). Set on apply, consumed once on the FIRST successful save to
  // log a content-free post-apply edit-distance signal, then cleared. `null`
  // whenever the open did not originate from AI.
  const aiAppliedDeckRef = useRef<Deck | null>(null);

  // Build the base deck + visual inventory from a serialised document snapshot.
  // Stamp the freshly-derived deck with the *current* document content hash so a
  // deck saved from it is never falsely flagged as stale on reopen. A fresh
  // derivation inherits the document's dominant visual theme (or `indigo` when
  // none).
  const buildOpenContext = useCallback((json: string): OpenContext => {
    const blocks = collectDocumentBlocks(json);
    const derived = buildDeckFromBlocks(blocks, inferDeckTheme(blocks));
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
      documentTextBlocks: blocks.filter(
        (block): block is DocumentTextBlock => block.kind === "text",
      ),
    };
  }, []);

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

  // Commit the prepared deck into editor state and reveal the SlideEditor panel.
  const finishOpen = useCallback(
    (startDeck: Deck, ctx: OpenContext) => {
      setVisuals(ctx.visualMap);
      setDocumentTextBlocks(ctx.documentTextBlocks);
      setDeck(startDeck);
      // freshDeck (current document) drives the merge; strip orphans so synced
      // visualIds always resolve to a renderable visual.
      setFreshDeck(stripOrphanedVisuals(ctx.baseDeck, ctx.knownVisualIds));
      setStale(isDeckStale(startDeck, ctx.currentContentHash));
      setPendingJson(null);
      setAiPreview(null);
      setOpen(true);
      openSlideEditor();
    },
    [openSlideEditor],
  );

  // Deterministic open path (the default and the universal fallback). Seeds from
  // the freshest of server deckJson / last saved / freshly-derived base deck.
  // Prepare the deterministic baseline the editor would otherwise open: the
  // freshest of server deckJson / last saved / freshly-derived base deck,
  // materialized so it is element-first. Shared by the derive open path and the
  // AI preview (which diffs the proposal against this baseline).
  const prepareOpen = useCallback(
    async (json: string): Promise<{ startDeck: Deck; ctx: OpenContext }> => {
      const ctx = buildOpenContext(json);

      // Fetch the freshest deckJson from the server; fall back gracefully.
      let fetchedRaw: unknown = null;
      try {
        const fetched = await fetchDeckJson(documentId);
        fetchedRaw = fetched.deckJson;
        revisionTokenRef.current = fetched.revisionToken;
      } catch {
        // Network/auth error — proceed with lastSavedRef as fallback.
      }

      // Materialize legacy slides up-front so the editor opens fully
      // element-first and the materialized deck becomes the history BASELINE
      // (empty `past`), keeping `canUndo` false until the user actually edits.
      const startDeck = materializeDeck(
        stripOrphanedVisuals(
          pickFreshestDeck(fetchedRaw, lastSavedRef.current, ctx.baseDeck),
          ctx.knownVisualIds,
        ),
      );
      return { startDeck, ctx };
    },
    [buildOpenContext, documentId],
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

  // AI open path: a freshly generated deck (already normalized +
  // safeParseDeck-valid + elementsDerived=false) is stamped with the current
  // document hash so it isn't falsely flagged stale, then flowed through the
  // SAME materialize + strip-orphans pipeline as a derived deck. This is the
  // APPLY point of issue #269: it runs only after the user reviews the preview
  // and presses "Apply", and remains non-destructive (the AI deck becomes the
  // editor's history baseline; nothing is persisted until the first edit/save).
  const openWithAiDeck = useCallback(
    (aiDeck: Deck, json: string) => {
      const ctx = buildOpenContext(json);
      const stamped = stampDeckContentHash(aiDeck, ctx.currentContentHash);
      const startDeck = materializeDeck(
        stripOrphanedVisuals(stamped, ctx.knownVisualIds),
      );
      // Record the applied AI deck as the baseline for the post-apply
      // edit-distance signal (issue #270), captured AFTER the same
      // materialize/strip pipeline the editor opens with so the first save is
      // compared like-for-like.
      aiAppliedDeckRef.current = startDeck;
      setAiPreview(null);
      finishOpen(startDeck, ctx);
    },
    [buildOpenContext, finishOpen],
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

  const handleOpen = useCallback(async () => {
    const liveJson = JSON.stringify(editor.getEditorState().toJSON());
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
      // Defer the heavy open work until the user picks generate vs derive.
      setPendingJson(effectiveJson);
      return;
    }
    await openDerived(liveJson);
  }, [editor, aiEnabled, openDerived, initialContentJson]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setDeck(null);
    setFreshDeck(null);
    setStale(false);
    setPendingJson(null);
    setEmptyDocument(false);
    setAiPreview(null);
    aiAppliedDeckRef.current = null;
    closeSlideEditor();
  }, [closeSlideEditor]);

  const handleSave = useCallback(
    async (updatedDeck: Deck): Promise<ActionResult> => {
      const res: SaveDeckResult = await saveDeckJson(
        documentId,
        updatedDeck,
        revisionTokenRef.current,
      );
      if (res.ok === true) {
        // Keep lastSavedRef and revisionTokenRef current so subsequent saves
        // use the latest token without requiring a full re-fetch.
        lastSavedRef.current = updatedDeck;
        revisionTokenRef.current = res.revisionToken;

        // Post-apply edit-distance signal (issue #270): on the FIRST successful
        // save of a deck that originated from AI apply, log how much the user
        // changed it. Content-free (only counts) and best-effort — never blocks
        // or fails the save. Cleared after one emit so we capture the initial
        // tweak, not every later autosave.
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
          } catch {
            // Signal logging is best-effort and must never affect the save.
          }
        }
        return { ok: true, data: undefined };
      }
      if (res.ok === "conflict") {
        // Surface conflict as a save error so the existing error badge and
        // Retry action are shown. Keep conflict UI minimal per #376.
        return {
          ok: false,
          error:
            "Deck was modified by another session. Reload to get the latest version.",
        };
      }
      // Validation / server error — propagate as-is.
      return res;
    },
    [documentId],
  );

  return (
    <>
      <EditorToolbarButton
        label="Slides"
        tooltip="Edit slides"
        icon={<LayoutPanelLeft size={15} aria-hidden="true" />}
        iconOnly={iconOnly}
        onClick={handleOpen}
        aria-label="Open slide editor"
      />

      {aiEnabled && pendingJson && !open ? (
        <SlideEditorOpenDialog
          contentJson={pendingJson}
          isEmptyDocument={emptyDocument}
          onApply={({ deck: generated, truncated, options }) => {
            void showAiPreview(generated, truncated, options, pendingJson);
          }}
          onDerive={() => {
            void openDerived(pendingJson);
          }}
          onClose={() => {
            setPendingJson(null);
            setEmptyDocument(false);
          }}
        />
      ) : null}

      {aiPreview && !open ? (
        <DeckGenerationPreview
          proposedDeck={aiPreview.proposedDeck}
          baselineDeck={aiPreview.baselineDeck}
          visuals={aiPreview.visuals}
          truncated={aiPreview.truncated}
          contentJson={aiPreview.contentJson}
          options={aiPreview.options}
          onApply={(applied) => openWithAiDeck(applied, aiPreview.contentJson)}
          onDerive={() => {
            void openDerived(aiPreview.contentJson);
          }}
          onCancel={() => setAiPreview(null)}
        />
      ) : null}

      {open && deck ? (
        <SlideEditor
          deck={deck}
          visuals={visuals}
          documentTextBlocks={documentTextBlocks}
          onDeckChange={setDeck}
          onClose={handleClose}
          onSave={handleSave}
          freshDeck={freshDeck}
          isDeckStale={stale}
          brandSwatches={brandSwatches}
        />
      ) : null}
    </>
  );
}
