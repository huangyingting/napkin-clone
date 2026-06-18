"use client";

import { Sparkles, X } from "lucide-react";
import { useCallback, useState } from "react";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import { blockText, parseMarkdown, type MarkdownBlock } from "@/lib/markdown";
import {
  safeParseVisual,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

import { attachVisual } from "./actions";
import { BlockContent } from "./markdown-preview";

const KIND_LABEL: Record<VisualKind, string> = {
  flowchart: "Flowchart",
  mindmap: "Mind map",
  list: "List",
  chart: "Chart",
  concept: "Concept",
};

type GenStatus = "idle" | "loading";
type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_LABEL: Record<SaveState, string | null> = {
  idle: null,
  saving: "Saving visual…",
  saved: "Visual saved",
  error: "Couldn't save visual",
};

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string") {
      return error;
    }
  }
  return fallback;
}

function candidatesFrom(payload: unknown): unknown[] {
  if (payload && typeof payload === "object" && "candidates" in payload) {
    const candidates = (payload as { candidates: unknown }).candidates;
    if (Array.isArray(candidates)) {
      return candidates;
    }
  }
  return [];
}

const sparkButtonClass =
  "absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-md border border-black/[.08] bg-white text-zinc-500 opacity-0 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900 focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:opacity-100 dark:border-white/[.12] dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-white/30 dark:hover:text-zinc-100";

function thumbButtonClass(active: boolean): string {
  return [
    "group/thumb flex flex-col gap-1 overflow-hidden rounded-lg border bg-white p-1.5 text-left transition dark:bg-zinc-950",
    active
      ? "border-zinc-900 ring-2 ring-zinc-900/20 dark:border-white dark:ring-white/30"
      : "border-black/[.08] hover:border-black/20 dark:border-white/[.10] dark:hover:border-white/25",
  ].join(" ");
}

/**
 * Interactive preview for the document editor: each Markdown block gets a
 * "spark" affordance in the gutter (revealed on hover) that generates a visual
 * for just that block (US-009). Clicking the spark POSTs only that block's text
 * to `/api/generate`, shows a candidate picker scoped to the block, and persists
 * the chosen visual via `attachVisual` keyed by the block's id — creating a new
 * Visual row without overwriting other blocks' visuals.
 *
 * When `editable` is false (read-only viewers, or before collaboration is
 * ready) it renders the plain blocks with no spark, identical to MarkdownPreview.
 */
export function BlockVisualGenerator({
  documentId,
  source,
  editable = true,
}: {
  documentId: string;
  source: string;
  editable?: boolean;
}) {
  const blocks = parseMarkdown(source);

  // The block whose picker is open (only one at a time).
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<GenStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Visual[]>([]);
  // The chosen visual per block id, shown inline for this session. US-010 will
  // load and display every persisted inline visual on mount and in the reader.
  const [saved, setSaved] = useState<Record<string, Visual>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const generateFor = useCallback(async (block: MarkdownBlock) => {
    const text = blockText(block).trim();
    if (text.length === 0) {
      return;
    }
    setOpenId(block.id);
    setStatus("loading");
    setError(null);
    setCandidates([]);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          messageFrom(
            payload,
            "We couldn't generate a visual. Please try again.",
          ),
        );
        return;
      }

      const valid: Visual[] = [];
      for (const item of candidatesFrom(payload)) {
        const result = safeParseVisual(item);
        if (result.success) {
          valid.push(result.data);
        }
      }

      if (valid.length === 0) {
        setError("No usable visuals came back. Please try again.");
        return;
      }

      setCandidates(valid);
    } catch {
      setError(
        "Couldn't reach the generator. Check your connection and try again.",
      );
    } finally {
      setStatus("idle");
    }
  }, []);

  const choose = useCallback(
    async (blockId: string, visual: Visual) => {
      setSaved((prev) => ({ ...prev, [blockId]: visual }));
      setSaveState("saving");
      try {
        await attachVisual(documentId, visual, blockId);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [documentId],
  );

  const close = useCallback(() => {
    setOpenId(null);
    setCandidates([]);
    setError(null);
    setSaveState("idle");
  }, []);

  if (blocks.length === 0) {
    return (
      <p className="text-sm text-zinc-400 dark:text-zinc-500">
        Nothing to preview yet. Switch to “Write” to add some text.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block) => {
        const open = openId === block.id;
        const chosen = saved[block.id];

        return (
          <div key={block.id} className="group relative pl-8">
            {editable ? (
              <button
                type="button"
                data-block-id={block.id}
                aria-label="Generate visual for this block"
                aria-expanded={open}
                title="Generate visual for this block"
                disabled={status === "loading" && !open}
                onClick={() => (open ? close() : void generateFor(block))}
                className={sparkButtonClass}
              >
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            ) : null}

            <BlockContent block={block} />

            {open ? (
              <div className="mt-3 rounded-xl border border-black/[.08] bg-zinc-50/80 p-3 dark:border-white/[.10] dark:bg-zinc-900/40">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      Visual for this block
                    </span>
                    {SAVE_LABEL[saveState] ? (
                      <span
                        role="status"
                        aria-live="polite"
                        className={
                          saveState === "error"
                            ? "text-xs text-red-600 dark:text-red-400"
                            : "text-xs text-zinc-400 dark:text-zinc-500"
                        }
                      >
                        {SAVE_LABEL[saveState]}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close visual picker"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>

                {chosen ? (
                  <div className="mb-3 overflow-hidden rounded-lg border border-black/[.06] bg-white dark:border-white/[.08] dark:bg-zinc-950">
                    <VisualRenderer visual={chosen} className="h-full w-full" />
                  </div>
                ) : null}

                {status === "loading" ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 py-4 text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                    Generating a visual…
                  </div>
                ) : error ? (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  >
                    <span className="min-w-0">{error}</span>
                    <button
                      type="button"
                      onClick={() => void generateFor(block)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold underline-offset-2 transition hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : candidates.length > 0 ? (
                  <>
                    <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Choose a visual
                    </p>
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {candidates.map((candidate, index) => {
                        const active = chosen === candidate;
                        return (
                          <li key={index}>
                            <button
                              type="button"
                              onClick={() => void choose(block.id, candidate)}
                              aria-pressed={active}
                              aria-label={`Select ${KIND_LABEL[candidate.type]} option ${index + 1}`}
                              className={thumbButtonClass(active)}
                            >
                              <span className="aspect-[4/3] w-full overflow-hidden rounded-md bg-white dark:bg-zinc-950">
                                <VisualRenderer
                                  visual={candidate}
                                  className="h-full w-full"
                                />
                              </span>
                              <span className="px-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                {candidate.title ?? KIND_LABEL[candidate.type]}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : chosen ? (
              <button
                type="button"
                onClick={() => void generateFor(block)}
                aria-label="Edit this block's visual"
                className="mt-2 flex w-full max-w-xs items-center gap-2 overflow-hidden rounded-lg border border-black/[.08] bg-white p-1.5 text-left transition hover:border-black/20 dark:border-white/[.10] dark:bg-zinc-950 dark:hover:border-white/25"
              >
                <span className="aspect-[4/3] w-20 shrink-0 overflow-hidden rounded bg-white dark:bg-zinc-950">
                  <VisualRenderer visual={chosen} className="h-full w-full" />
                </span>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {KIND_LABEL[chosen.type]} added
                </span>
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
