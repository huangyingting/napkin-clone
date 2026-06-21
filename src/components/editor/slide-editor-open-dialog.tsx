"use client";

/**
 * Open-time chooser for the slide editor (issue #268).
 *
 * When AI deck generation is enabled (client flag), opening the slide editor
 * presents a choice:
 *
 *   • "Generate with AI" — POST the live document content + length/tone/audience
 *     options to `/api/generate-deck`, showing staged progress (aria-live) + an
 *     ETA while in flight, with a Cancel. On success the generated deck is handed
 *     to {@link onApply}; on ANY failure (error/timeout/credit/flag-off/404) we
 *     transparently fall back to the deterministic derive via {@link onDerive}.
 *
 *   • "Derive from document" — the existing deterministic build, always the
 *     default/fallback so the user is never blocked.
 *
 * The component owns only the option state + the generation lifecycle (via
 * {@link useDeckGeneration}); the parent owns how each resulting deck opens. This
 * keeps a clean seam for issue #269 to insert a preview/diff between a successful
 * generation and {@link onApply}.
 */

import { Sparkles } from "lucide-react";
import { useId, useState } from "react";

import { GeneratingIndicator } from "@/components/motion/generation-status";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/ui";
import { SegmentedControl } from "@/components/ui";
import {
  useDeckGeneration,
  type DeckGenerationOptions,
} from "@/lib/ai/use-deck-generation";
import type { Deck } from "@/lib/presentation/deck";

type DeckLength = NonNullable<DeckGenerationOptions["length"]>;

const LENGTH_OPTIONS: ReadonlyArray<{ value: DeckLength; label: string }> = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

const FIELD_CLASS =
  "h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised px-2.5 text-sm text-ds-text-primary placeholder:text-ds-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-focus";

export interface SlideEditorOpenDialogProps {
  /** Serialised Lexical document state captured when the chooser opened. */
  contentJson: string;
  /** Hand a successfully generated deck to the parent (it owns how it opens). */
  onApply: (deck: Deck) => void;
  /** Run the deterministic derive (default and fallback for every failure). */
  onDerive: () => void;
  /** Dismiss the chooser without opening anything. */
  onClose: () => void;
}

export function SlideEditorOpenDialog({
  contentJson,
  onApply,
  onDerive,
  onClose,
}: SlideEditorOpenDialogProps) {
  const titleId = useId();
  const [length, setLength] = useState<DeckLength>("medium");
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState("");
  const { generate, status, stage, showEta, etaHint, reset } =
    useDeckGeneration();

  const isLoading = status === "loading";

  const handleDerive = () => {
    reset();
    onDerive();
  };

  const handleGenerate = async () => {
    const result = await generate(contentJson, { length, tone, audience });
    // Transparent fallback: any failure (error/timeout/credit/flag-off/404)
    // drops straight to the deterministic derive so the user is never blocked.
    if (result.ok) {
      onApply(result.deck);
    } else {
      onDerive();
    }
  };

  const handleCancel = () => {
    // Cancel the in-flight request and return to the chooser (do NOT auto-open
    // — cancelling is a deliberate "not now", not a fallback).
    reset();
  };

  return (
    <Dialog
      open
      onClose={isLoading ? handleCancel : onClose}
      aria-labelledby={titleId}
      className="flex w-[26rem] max-w-[calc(100vw-2rem)] flex-col gap-4 border-ds-border-subtle bg-ds-surface-overlay p-5 shadow-ds-popover"
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
            Create slides
          </h2>
          <p className="text-sm text-ds-text-secondary">
            Generate a presentation with AI, or derive one directly from your
            document.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-3 rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised p-4 text-sm text-ds-text-secondary"
        >
          <GeneratingIndicator isLoading />
          {showEta ? (
            <span className="text-xs text-ds-text-muted">ETA {etaHint}</span>
          ) : (
            <span className="text-xs text-ds-text-muted">{stage}</span>
          )}
          <div className="flex justify-end">
            <Button variant="subtle" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Generation options</legend>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ds-text-secondary">
                Length
              </span>
              <SegmentedControl
                options={LENGTH_OPTIONS}
                value={length}
                onChange={setLength}
                aria-label="Deck length"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ds-text-secondary">
                Tone <span className="text-ds-text-muted">(optional)</span>
              </span>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. confident, playful"
                className={FIELD_CLASS}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ds-text-secondary">
                Audience <span className="text-ds-text-muted">(optional)</span>
              </span>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. executives, students"
                className={FIELD_CLASS}
              />
            </label>
          </fieldset>

          <div className="mt-1 flex flex-col gap-2">
            <Button
              variant="solid"
              size="md"
              onClick={handleGenerate}
              className="w-full"
            >
              <Sparkles size={15} aria-hidden="true" />
              Generate with AI
            </Button>
            <Button
              variant="subtle"
              size="md"
              onClick={handleDerive}
              className="w-full"
            >
              Derive from document
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
