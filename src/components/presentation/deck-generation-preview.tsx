"use client";

/**
 * AI deck preview / diff surface (issue #269).
 *
 * Sits between a successful AI generation (#268) and opening the SlideEditor.
 * Instead of auto-opening the editor with the generated deck, the user first
 * reviews:
 *
 *   • the proposed deck as small thumbnails (the shared {@link SlideCanvas} in
 *     `preview` mode — the SAME mini renderer the editor's thumbnail rail uses);
 *   • a high-level DIFF vs the baseline (the freshest deck the editor would
 *     otherwise open — from `pickFreshestDeck` / `buildDeckFromBlocks`):
 *     "N slides — X new, Y changed, Z removed", plus a per-slide marker on each
 *     thumbnail. The diff is computed by the pure {@link diffDecks} helper.
 *   • a "content truncated" notice when the source outline was trimmed to fit
 *     the input budget.
 *
 * Actions:
 *   • Apply — hand the proposed deck to the parent, which opens the SlideEditor
 *     through the normal deck pipeline (materialize baseline → undo/redo history
 *     → debounced autosave). Apply is NON-DESTRUCTIVE: opening the editor with
 *     the AI deck makes it the history baseline; nothing is persisted until the
 *     user's FIRST edit/save, so they can still close without saving.
 *   • Regenerate — re-invoke {@link useDeckGeneration} with the SAME options,
 *     replacing the proposal once the new deck arrives. The PRIOR proposal stays
 *     visible (with a regenerating overlay) until then — no flash of empty state.
 *   • Use derive instead — discard the proposal and fall back to the
 *     deterministic `buildDeckFromBlocks` derive.
 *   • Cancel — dismiss without opening anything.
 *
 * The proposed deck arrives with `elementsDerived=false` per #264; this surface
 * never mutates it, so "Sync from document" later behaves correctly.
 */

import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui";
import { Dialog } from "@/components/ui";
import { GeneratingIndicator } from "@/components/motion/generation-status";
import { SlideCanvas } from "@/components/presentation/slide-canvas";
import {
  useDeckGeneration,
  type DeckGenerationOptions,
} from "@/lib/ai/use-deck-generation";
import {
  diffDecks,
  type DeckDiffEntry,
  type DeckDiffStatus,
} from "@/lib/presentation/deck-diff";
import type { Deck } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";

export interface DeckGenerationPreviewProps {
  /** The AI-generated deck to review (initial proposal). */
  proposedDeck: Deck;
  /** The freshest deck the editor would otherwise open (diff baseline). */
  baselineDeck: Deck;
  /** Embedded visuals so thumbnails render real content. */
  visuals: ReadonlyMap<string, Visual>;
  /** Whether the source outline was trimmed to fit the input budget. */
  truncated: boolean;
  /** Serialised document content — re-sent verbatim on Regenerate. */
  contentJson: string;
  /** Generation options — re-sent verbatim on Regenerate. */
  options: DeckGenerationOptions;
  /** Apply the (current) proposal: parent opens the editor with it. */
  onApply: (deck: Deck) => void;
  /** Discard the proposal and fall back to the deterministic derive. */
  onDerive: () => void;
  /** Dismiss without opening anything. */
  onCancel: () => void;
}

const MARKER_LABEL: Record<DeckDiffStatus, string> = {
  added: "New",
  changed: "Changed",
  unchanged: "Same",
  removed: "Removed",
};

const MARKER_CLASS: Record<DeckDiffStatus, string> = {
  added: "bg-ds-success-surface text-ds-success-text",
  changed: "bg-ds-warning-surface text-ds-warning-text",
  unchanged: "bg-ds-surface-raised text-ds-text-muted",
  removed: "bg-ds-danger-surface text-ds-danger-text",
};

export function DeckGenerationPreview({
  proposedDeck,
  baselineDeck,
  visuals,
  truncated,
  contentJson,
  options,
  onApply,
  onDerive,
  onCancel,
}: DeckGenerationPreviewProps) {
  const titleId = useId();
  const summaryId = useId();

  // The current proposal on screen. Regenerate replaces this ONLY once a new
  // deck arrives, so the prior proposal never flashes to an empty state.
  const [proposal, setProposal] = useState<Deck>(proposedDeck);
  const [isTruncated, setIsTruncated] = useState(truncated);
  const [regenError, setRegenError] = useState(false);

  const { generate, status, reset } = useDeckGeneration();
  const isRegenerating = status === "loading";

  // Abort any in-flight regeneration if the surface unmounts.
  useEffect(() => reset, [reset]);

  const diff = useMemo(
    () => diffDecks(baselineDeck, proposal),
    [baselineDeck, proposal],
  );

  // Per-proposed-slide diff entry keyed by proposed index (removed slides
  // excluded — they have no thumbnail). Drives each thumbnail's marker + title.
  const entryByProposedIndex = useMemo(() => {
    const map = new Map<number, DeckDiffEntry>();
    for (const entry of diff.entries) {
      if (entry.proposedIndex >= 0) {
        map.set(entry.proposedIndex, entry);
      }
    }
    return map;
  }, [diff]);

  const handleRegenerate = async () => {
    setRegenError(false);
    const result = await generate(contentJson, options);
    if (result.ok) {
      // Swap the proposal in only now that the replacement is ready.
      setProposal(result.deck);
      setIsTruncated(result.truncated);
    } else {
      // Keep the prior proposal visible; surface a non-blocking error note.
      setRegenError(true);
    }
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      aria-labelledby={titleId}
      aria-busy={isRegenerating}
      className="flex max-h-[calc(100vh-2rem)] w-[44rem] max-w-[calc(100vw-2rem)] flex-col gap-4 border-ds-border-subtle bg-ds-surface-overlay p-5 shadow-ds-popover"
    >
      <div className="flex items-start gap-2">
        <Sparkles
          size={18}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-ds-accent-text"
        />
        <div className="flex flex-col gap-1">
          <h2
            id={titleId}
            className="text-base font-semibold text-ds-text-primary"
          >
            Review AI slides
          </h2>
          <p
            id={summaryId}
            className="text-sm text-ds-text-secondary"
            aria-live="polite"
          >
            {diff.summary}
          </p>
        </div>
      </div>

      {isTruncated ? (
        <p
          role="note"
          className="rounded-ds-md border border-ds-warning-border bg-ds-warning-surface px-3 py-2 text-xs text-ds-warning-text"
        >
          Your document was long, so some content was trimmed to fit. The deck
          covers the most important sections — derive from the document if you
          need every detail.
        </p>
      ) : null}

      {regenError ? (
        <p
          role="alert"
          className="rounded-ds-md border border-ds-danger-border bg-ds-danger-surface px-3 py-2 text-xs text-ds-danger-text"
        >
          Couldn&apos;t regenerate just now — showing the previous draft. Try
          again, or use the derived deck instead.
        </p>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-y-auto rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised p-3">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {proposal.slides.map((slide, index) => {
            const entry = entryByProposedIndex.get(index);
            const marker = entry?.status ?? "unchanged";
            const title = entry?.title ?? `Slide ${index + 1}`;
            return (
              <li key={index} className="flex flex-col gap-1">
                <span className="relative block aspect-video overflow-hidden rounded-ds-sm border border-ds-border-subtle">
                  <SlideCanvas slide={slide} visuals={visuals} preview />
                  <span
                    className={`absolute right-1 top-1 rounded-ds-sm px-1.5 py-0.5 text-[0.625rem] font-medium ${MARKER_CLASS[marker]}`}
                    aria-label={`${MARKER_LABEL[marker]}: ${title}`}
                  >
                    {MARKER_LABEL[marker]}
                  </span>
                </span>
                <span className="flex items-baseline gap-1.5 px-0.5">
                  <span className="text-xs tabular-nums text-ds-text-muted">
                    {index + 1}
                  </span>
                  <span
                    className="truncate text-xs text-ds-text-secondary"
                    title={title}
                  >
                    {title}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        {diff.removed > 0 ? (
          <p className="mt-3 text-xs text-ds-text-muted">
            {diff.removed} {diff.removed === 1 ? "slide" : "slides"} from your
            current deck {diff.removed === 1 ? "has" : "have"} no match in this
            draft and would be dropped.
          </p>
        ) : null}

        {isRegenerating ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ds-surface-overlay/70"
          >
            <GeneratingIndicator isLoading className="text-center" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="plain"
          size="md"
          onClick={onCancel}
          disabled={isRegenerating}
        >
          Cancel
        </Button>
        <Button
          variant="subtle"
          size="md"
          onClick={onDerive}
          disabled={isRegenerating}
        >
          Use derived deck instead
        </Button>
        <Button
          variant="subtle"
          size="md"
          onClick={handleRegenerate}
          disabled={isRegenerating}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {isRegenerating ? "Regenerating…" : "Regenerate"}
        </Button>
        <Button
          variant="solid"
          size="md"
          onClick={() => onApply(proposal)}
          disabled={isRegenerating}
        >
          <Sparkles size={15} aria-hidden="true" />
          Apply
        </Button>
      </div>
    </Dialog>
  );
}
