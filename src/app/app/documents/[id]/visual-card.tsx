"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey } from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useCardMotion, usePopMotion } from "@/components/motion/reveal";
import { FOCUS_RING } from "@/components/motion/control-styles";
import { ThinkingIndicator } from "@/components/motion/thinking-indicator";
import { ExportMenu } from "@/components/visual/export-menu";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import {
  VISUAL_KINDS,
  safeParseVisual,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

import { StylePanel } from "./style-panel";
import { useVisualAnchor } from "./visual-anchor-context";
import { VisualEditor } from "./visual-editor";
import { $isVisualNode } from "./visual-node";

const KIND_LABEL: Record<VisualKind, string> = {
  flowchart: "Flowchart",
  mindmap: "Mind map",
  list: "List",
  chart: "Chart",
  concept: "Concept",
  timeline: "Timeline",
  cycle: "Cycle",
  comparison: "Comparison",
  funnel: "Funnel",
};

const moreVariationsButtonClass = `flex items-center gap-1.5 rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-black/20 hover:text-zinc-900 active:bg-black/[.05] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.12] dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-zinc-100 dark:active:bg-white/[.06] ${FOCUS_RING}`;

function typePillClass(active: boolean): string {
  return [
    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    active
      ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      : "border-black/[.08] text-zinc-600 hover:border-black/20 hover:text-zinc-900 active:bg-black/[.05] dark:border-white/[.12] dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-zinc-100 dark:active:bg-white/[.06]",
    FOCUS_RING,
  ].join(" ");
}

type GenStatus = "idle" | "loading";

/**
 * Derives a text prompt from a visual so the contextual controls can regenerate
 * it (type-switch / variations) without a separate source-text panel: the
 * visual's title plus its node labels.
 */
function visualPromptText(visual: Visual): string {
  const parts: string[] = [];
  if (visual.title && visual.title.trim().length > 0) {
    parts.push(visual.title.trim());
  }
  for (const node of visual.nodes) {
    if (node.label && node.label.trim().length > 0) {
      parts.push(node.label.trim());
    }
  }
  return parts.join("\n");
}

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

/**
 * Interactive card for a {@link Visual} embedded in the Lexical editor (US-012).
 * Read-only by default; clicking it (when the editor is editable) selects it and
 * reveals contextual controls anchored to the card — NOT a permanent side panel:
 *
 * - {@link VisualEditor} for in-place element editing (label/move/delete + edges),
 * - a popover with the type-switch pills, variation browsing, {@link StylePanel},
 *   and the {@link ExportMenu}.
 *
 * Every edit writes back to the node's payload via `node.setVisual` inside an
 * `editor.update`, which is a local edit and therefore persists through the
 * debounced Lexical save path (US-003) and the mirrored `Visual` row (US-011).
 * Clicking away dismisses the controls via ref-containment (never
 * `stopPropagation`).
 */
export function VisualCard({
  nodeKey,
  visual,
}: {
  nodeKey: string;
  visual: Visual;
}) {
  const [editor] = useLexicalComposerContext();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<SVGSVGElement | null>(null);
  const visualRef = useRef<Visual>(visual);
  useEffect(() => {
    visualRef.current = visual;
  });

  const [editable, setEditable] = useState(() => editor.isEditable());
  const [selected, setSelected] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genError, setGenError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Visual[]>([]);
  const [pendingType, setPendingType] = useState<VisualKind | null>(null);

  const cardMotion = useCardMotion();
  const popMotion = usePopMotion();

  // Report the selected visual element up to the editor chrome so a comment can
  // be anchored to it (US-017). We store the node id + label, not a Lexical key.
  const visualAnchor = useVisualAnchor();
  const reportedAnchorRef = useRef(false);
  useEffect(() => {
    if (!visualAnchor) {
      return;
    }
    if (selected && selectedNodeId) {
      const node = visualRef.current.nodes.find(
        (item) => item.id === selectedNodeId,
      );
      visualAnchor.setVisualAnchor({
        id: selectedNodeId,
        label: node?.label?.trim() || "element",
      });
      reportedAnchorRef.current = true;
    } else if (reportedAnchorRef.current) {
      visualAnchor.setVisualAnchor(null);
      reportedAnchorRef.current = false;
    }
  }, [visualAnchor, selected, selectedNodeId]);

  useEffect(() => {
    return editor.registerEditableListener((value) => setEditable(value));
  }, [editor]);

  // Writes a new payload back to the node. This is a local edit, so the editor's
  // OnChangePlugin debounce-saves it into `contentJson` (US-003) and the save
  // action mirrors it to the `Visual` row (US-011).
  const updateVisual = useCallback(
    (next: Visual) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isVisualNode(node)) {
          node.setVisual(next);
        }
      });
    },
    [editor, nodeKey],
  );

  // Removes this visual block from the document (US-013). Removing the node from
  // `contentJson` is a local edit, so the debounced save persists it and
  // `mirrorVisualNodes` prunes the orphaned `Visual` row.
  const removeVisual = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isVisualNode(node)) {
        node.remove();
      }
    });
  }, [editor, nodeKey]);

  // Dismiss the controls when clicking anywhere outside the card (ref
  // containment — never stopPropagation). The popover lives inside `rootRef`, so
  // in-control clicks keep it open.
  useEffect(() => {
    if (!selected) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setSelected(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [selected]);

  const closeControls = useCallback(() => {
    setSelected(false);
    setCandidates([]);
    setGenError(null);
  }, []);

  const runGenerate = useCallback(
    async (type?: VisualKind) => {
      const promptText = visualPromptText(visualRef.current);
      if (promptText.trim().length === 0) {
        setGenError("Add some labels before regenerating this visual.");
        return;
      }
      setGenStatus("loading");
      setPendingType(type ?? null);
      setGenError(null);
      if (!type) {
        setCandidates([]);
      }
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            type ? { text: promptText, type } : { text: promptText },
          ),
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          setGenError(
            messageFrom(payload, "We couldn't regenerate. Please try again."),
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
          setGenError("No usable visuals came back. Please try again.");
          return;
        }

        if (type) {
          // Type switch: apply the regenerated visual to the canvas immediately.
          const match = valid.find((item) => item.type === type) ?? valid[0];
          updateVisual(match);
          setCandidates([]);
        } else {
          setCandidates(valid);
        }
      } catch {
        setGenError(
          "Couldn't reach the generator. Check your connection and try again.",
        );
      } finally {
        setGenStatus("idle");
        setPendingType(null);
      }
    },
    [updateVisual],
  );

  const chooseCandidate = useCallback(
    (candidate: Visual) => {
      updateVisual(candidate);
      setCandidates([]);
    },
    [updateVisual],
  );

  const parsed = safeParseVisual(visual);
  if (!parsed.success) {
    return (
      <div
        role="img"
        aria-label="Unavailable visual"
        className="my-4 rounded-2xl border border-dashed border-black/[.12] bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:border-white/[.12] dark:bg-zinc-900 dark:text-zinc-400"
      >
        This visual could not be displayed.
      </div>
    );
  }

  const data = parsed.data;
  const showControls = selected && editable;

  const cardClass = [
    "overflow-hidden rounded-2xl border bg-white p-2 transition dark:bg-zinc-950",
    showControls
      ? "border-zinc-900 ring-2 ring-zinc-900/15 dark:border-white dark:ring-white/20"
      : "border-black/[.06] dark:border-white/[.08]",
  ].join(" ");

  return (
    <motion.div
      ref={rootRef}
      className="relative my-4"
      initial={cardMotion.initial}
      animate={cardMotion.animate}
      transition={cardMotion.transition}
    >
      {showControls ? (
        <div className={cardClass}>
          <VisualEditor
            visual={data}
            onChange={updateVisual}
            onSelectNode={setSelectedNodeId}
            rendererRef={rendererRef}
            canEdit
          />
        </div>
      ) : editable ? (
        <button
          type="button"
          aria-label="Edit visual"
          onClick={() => setSelected(true)}
          className={`${cardClass} block w-full cursor-pointer text-left hover:border-black/20 dark:hover:border-white/25 ${FOCUS_RING}`}
        >
          <VisualRenderer
            ref={rendererRef}
            visual={data}
            className="pointer-events-none block h-auto w-full"
          />
        </button>
      ) : (
        <div className={cardClass}>
          <VisualRenderer visual={data} className="block h-auto w-full" />
        </div>
      )}

      <AnimatePresence>
        {showControls ? (
          <motion.div
            key="visual-controls"
            role="dialog"
            aria-label="Visual controls"
            initial={popMotion.initial}
            animate={popMotion.animate}
            exit={popMotion.exit}
            transition={popMotion.transition}
            className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[28rem] overflow-auto rounded-2xl border border-black/[.08] bg-white p-3 shadow-xl dark:border-white/[.12] dark:bg-zinc-900"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Edit visual
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Replace visual"
                  onClick={() => void runGenerate()}
                  disabled={genStatus === "loading"}
                  title="Generate a replacement for this visual"
                  className={`rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-black/20 hover:text-zinc-900 active:bg-black/[.05] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.12] dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-zinc-100 dark:active:bg-white/[.06] ${FOCUS_RING}`}
                >
                  Replace
                </button>
                <button
                  type="button"
                  aria-label="Remove visual"
                  onClick={removeVisual}
                  title="Delete this visual"
                  className={`rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50 active:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:border-red-500/50 dark:hover:bg-red-500/10 dark:active:bg-red-500/20 ${FOCUS_RING}`}
                >
                  Remove
                </button>
                <ExportMenu
                  getSvgElement={() => rendererRef.current}
                  filename={data.title?.trim() || "visual"}
                />
                <button
                  type="button"
                  aria-label="Close visual controls"
                  onClick={closeControls}
                  className={`rounded-md p-1 text-zinc-400 transition-colors hover:bg-black/[.05] hover:text-zinc-700 active:bg-black/[.1] dark:hover:bg-white/[.08] dark:hover:text-zinc-200 dark:active:bg-white/[.14] ${FOCUS_RING}`}
                >
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  >
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              role="group"
              aria-label="Visual type"
              className="mb-3 flex flex-wrap gap-1.5"
            >
              {VISUAL_KINDS.map((kind) => {
                const active = data.type === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => void runGenerate(kind)}
                    disabled={genStatus === "loading"}
                    aria-pressed={active}
                    aria-label={`Switch to ${KIND_LABEL[kind]}`}
                    title={`Regenerate as ${KIND_LABEL[kind]}`}
                    className={typePillClass(active)}
                  >
                    {pendingType === kind ? (
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 motion-safe:animate-spin rounded-full border-2 border-current border-t-transparent"
                      />
                    ) : null}
                    {KIND_LABEL[kind]}
                  </button>
                );
              })}
            </div>

            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void runGenerate()}
                disabled={genStatus === "loading"}
                aria-label="More variations"
                title="Generate a fresh batch of variations"
                className={moreVariationsButtonClass}
              >
                {genStatus === "loading" && pendingType === null ? (
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 motion-safe:animate-spin rounded-full border-2 border-current border-t-transparent"
                  />
                ) : null}
                More variations
              </button>
              {genStatus === "loading" ? (
                <ThinkingIndicator
                  label="Thinking…"
                  className="text-xs text-zinc-500 dark:text-zinc-400"
                />
              ) : null}
            </div>

            {genError !== null ? (
              <div
                role="alert"
                className="mb-3 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              >
                <span>{genError}</span>
                <button
                  type="button"
                  onClick={() => void runGenerate(pendingType ?? undefined)}
                  className={`self-start rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 active:bg-red-200 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/20 dark:active:bg-red-500/30 ${FOCUS_RING}`}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {candidates.length > 0 ? (
              <div className="mb-3">
                <span className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Variations ({candidates.length})
                </span>
                <ul className="grid grid-cols-2 gap-2">
                  {candidates.map((candidate, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        aria-label={`Select variation ${index + 1} of ${candidates.length}`}
                        title={candidate.title ?? KIND_LABEL[candidate.type]}
                        onClick={() => chooseCandidate(candidate)}
                        className={`group flex w-full flex-col overflow-hidden rounded-lg border border-black/[.08] bg-white p-1.5 text-left transition hover:border-black/20 active:border-black/30 dark:border-white/[.10] dark:bg-zinc-950 dark:hover:border-white/25 dark:active:border-white/40 ${FOCUS_RING}`}
                      >
                        <VisualRenderer
                          visual={candidate}
                          className="h-auto w-full"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <StylePanel
              visual={data}
              selectedNodeId={selectedNodeId}
              onChange={updateVisual}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
