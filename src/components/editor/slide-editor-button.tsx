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
import { useCallback, useRef, useState } from "react";

import { fetchDeckJson, saveDeckJson } from "@/app/app/documents/[id]/actions";
import { SlideEditor } from "@/components/presentation/slide-editor";
import { SlideEditorOpenDialog } from "@/components/editor/slide-editor-open-dialog";
import type { ActionResult } from "@/lib/action-result";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import { isAiDeckGenClientEnabled } from "@/lib/ai/ai-deck-gen-flag";
import { buildDeckFromBlocks, type Deck } from "@/lib/presentation/deck";
import { materializeDeck } from "@/lib/presentation/deck-mutations";
import {
  computeDeckContentHash,
  isDeckStale,
  stampDeckContentHash,
} from "@/lib/presentation/deck-hash";
import { pickFreshestDeck } from "@/lib/presentation/fresh-deck";
import { inferDeckTheme } from "@/lib/presentation/infer-theme";
import { stripOrphanedVisuals } from "@/lib/presentation/strip-orphans";
import { collectDocumentBlocks } from "@/lib/visual/document-export";
import type { Visual } from "@/lib/visual/schema";
import { useRightSurface } from "@/app/app/documents/[id]/right-surface-context";

interface SlideEditorButtonProps {
  documentId: string;
  initialDeckJson: unknown;
  iconOnly?: boolean;
}

/** The freshly-derived open context captured from the live Lexical state. */
interface OpenContext {
  baseDeck: Deck;
  currentContentHash: string;
  visualMap: Map<string, Visual>;
  knownVisualIds: Set<string>;
}

export function SlideEditorButton({
  documentId,
  initialDeckJson,
  iconOnly = false,
}: SlideEditorButtonProps) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  // When the AI entry point is enabled, opening shows a chooser first; this
  // holds the document content captured at chooser-open time so the choice
  // (generate vs derive) operates on a consistent snapshot.
  const [pendingJson, setPendingJson] = useState<string | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  // The freshly-derived deck and its content hash, captured at open from the
  // live Lexical state. Drives the "Sync from document" merge and the
  // staleness banner without ever reaching back into Lexical from the editor.
  const [freshDeck, setFreshDeck] = useState<Deck | null>(null);
  const [stale, setStale] = useState(false);
  const [visuals, setVisuals] = useState<ReadonlyMap<string, Visual>>(
    () => new Map(),
  );
  const { openSlideEditor, closeSlideEditor } = useRightSurface();

  const aiEnabled = isAiDeckGenClientEnabled();

  // Tracks the most recently saved deck so subsequent opens use fresh data
  // even without a server round-trip succeeding (e.g. offline).
  const lastSavedRef = useRef<unknown>(initialDeckJson);

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
    };
  }, []);

  // Commit the prepared deck into editor state and reveal the SlideEditor panel.
  const finishOpen = useCallback(
    (startDeck: Deck, ctx: OpenContext) => {
      setVisuals(ctx.visualMap);
      setDeck(startDeck);
      // freshDeck (current document) drives the merge; strip orphans so synced
      // visualIds always resolve to a renderable visual.
      setFreshDeck(stripOrphanedVisuals(ctx.baseDeck, ctx.knownVisualIds));
      setStale(isDeckStale(startDeck, ctx.currentContentHash));
      setPendingJson(null);
      setOpen(true);
      openSlideEditor();
    },
    [openSlideEditor],
  );

  // Deterministic open path (the default and the universal fallback). Seeds from
  // the freshest of server deckJson / last saved / freshly-derived base deck.
  const openDerived = useCallback(
    async (json: string) => {
      const ctx = buildOpenContext(json);

      // Fetch the freshest deckJson from the server; fall back gracefully.
      let fetchedRaw: unknown = null;
      try {
        fetchedRaw = await fetchDeckJson(documentId);
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
      finishOpen(startDeck, ctx);
    },
    [buildOpenContext, finishOpen, documentId],
  );

  // AI open path: a freshly generated deck (already normalized +
  // safeParseDeck-valid + elementsDerived=false) is stamped with the current
  // document hash so it isn't falsely flagged stale, then flowed through the
  // SAME materialize + strip-orphans pipeline as a derived deck. The seam for
  // issue #269 is here: a preview/diff can sit between generation and this call.
  const openWithAiDeck = useCallback(
    (aiDeck: Deck, json: string) => {
      const ctx = buildOpenContext(json);
      const stamped = stampDeckContentHash(aiDeck, ctx.currentContentHash);
      const startDeck = materializeDeck(
        stripOrphanedVisuals(stamped, ctx.knownVisualIds),
      );
      finishOpen(startDeck, ctx);
    },
    [buildOpenContext, finishOpen],
  );

  const handleOpen = useCallback(async () => {
    const json = JSON.stringify(editor.getEditorState().toJSON());
    if (aiEnabled) {
      // Defer the heavy open work until the user picks generate vs derive.
      setPendingJson(json);
      return;
    }
    await openDerived(json);
  }, [editor, aiEnabled, openDerived]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setDeck(null);
    setFreshDeck(null);
    setStale(false);
    setPendingJson(null);
    closeSlideEditor();
  }, [closeSlideEditor]);

  const handleSave = useCallback(
    async (updatedDeck: Deck): Promise<ActionResult> => {
      const res = await saveDeckJson(documentId, updatedDeck);
      if (res.ok) {
        // Keep lastSavedRef current so subsequent opens don't regress.
        lastSavedRef.current = updatedDeck;
      }
      // Surface the result so the editor can show the save-status badge and a
      // working Retry action instead of silently swallowing failures.
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
          onApply={(generated) => openWithAiDeck(generated, pendingJson)}
          onDerive={() => {
            void openDerived(pendingJson);
          }}
          onClose={() => setPendingJson(null)}
        />
      ) : null}

      {open && deck ? (
        <SlideEditor
          deck={deck}
          visuals={visuals}
          onDeckChange={setDeck}
          onClose={handleClose}
          onSave={handleSave}
          freshDeck={freshDeck}
          isDeckStale={stale}
        />
      ) : null}
    </>
  );
}
