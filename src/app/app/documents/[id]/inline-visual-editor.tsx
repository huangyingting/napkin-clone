"use client";

import { Check, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ExportMenu } from "@/components/visual/export-menu";
import { isPositionedKind } from "@/components/visual/layout";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import {
  VISUAL_KINDS,
  safeParseVisual,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

import { attachVisual } from "./actions";
import { StylePanel } from "./style-panel";
import { VisualEditor } from "./visual-editor";

/** Debounce (ms) before persisting an in-canvas edit (drag/label/style). */
const EDIT_SAVE_DELAY = 600;

type GenStatus = "idle" | "loading";
type SaveState = "idle" | "saving" | "saved" | "error";

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

const SAVE_LABEL: Record<SaveState, string | null> = {
  idle: null,
  saving: "Saving visual…",
  saved: "Visual saved",
  error: "Couldn't save visual",
};

const doneButtonClass =
  "flex h-8 items-center gap-1.5 rounded-full bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200";

const moreVariationsButtonClass =
  "flex items-center gap-1.5 rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-black/20 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.12] dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-zinc-100";

function typePillClass(active: boolean): string {
  return [
    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50",
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
      : "border-black/[.08] text-zinc-600 hover:border-black/20 hover:text-zinc-900 dark:border-white/[.12] dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-zinc-100",
  ].join(" ");
}

function thumbButtonClass(active: boolean): string {
  return [
    "flex flex-col gap-1 overflow-hidden rounded-lg border bg-white p-1.5 text-left transition dark:bg-zinc-950",
    active
      ? "border-zinc-900 ring-2 ring-zinc-900/20 dark:border-white dark:ring-white/30"
      : "border-black/[.08] hover:border-black/20 dark:border-white/[.10] dark:hover:border-white/25",
  ].join(" ");
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
 * Contextual editing tools for a single inline visual (US-007).
 *
 * Rendered in place of the read-only `VisualRenderer` when its visual is
 * selected, so the editing controls are anchored to the visual itself rather
 * than a permanent right panel. It bundles the existing building blocks —
 * `VisualEditor` (node/edge editing), `StylePanel` (theme/color), the type-switch
 * pills, the variation gallery, and `ExportMenu` — and persists every change
 * through the existing debounced `attachVisual(documentId, visual, anchorBlockId)`
 * path (so edits survive a reload). `anchorBlockId` is `null` for the
 * document-level visual and the block id for a block-anchored one.
 *
 * Dismissal is handled here via ref containment (a `mousedown` listener that
 * closes when the click lands outside the editor), never `stopPropagation`.
 */
export function InlineVisualEditor({
  documentId,
  anchorBlockId,
  text,
  visual,
  onChange,
  onSelectNode,
  onClose,
}: {
  documentId: string;
  anchorBlockId: string | null;
  text: string;
  visual: Visual;
  onChange: (visual: Visual) => void;
  onSelectNode?: (node: { id: string; label: string } | null) => void;
  onClose: () => void;
}) {
  // Working copy of the visual, seeded once from the prop. While the editor is
  // mounted this is the source of truth; the parent's copy is kept in sync via
  // `onChange` so the read-only render is current after the editor closes.
  const [working, setWorking] = useState<Visual>(() => visual);
  const [status, setStatus] = useState<GenStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Visual[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingType, setPendingType] = useState<VisualKind | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<SVGSVGElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Visual>(visual);
  const lastAttemptType = useRef<VisualKind | undefined>(undefined);

  // Dismiss when clicking outside the editor (ref containment, never
  // stopPropagation). `mousedown` fires before a sibling visual's click, so
  // selecting another visual naturally closes this one first.
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        containerRef.current &&
        target &&
        !containerRef.current.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  // Surface the selected node (id + label) to the parent so a comment can be
  // anchored to a specific visual element (US-014). Reports `null` when nothing
  // is selected; the label stays fresh as the node is relabeled.
  useEffect(() => {
    if (!onSelectNode) {
      return;
    }
    const node = selectedNodeId
      ? working.nodes.find((candidate) => candidate.id === selectedNodeId)
      : undefined;
    onSelectNode(node ? { id: node.id, label: node.label } : null);
  }, [working, selectedNodeId, onSelectNode]);

  // Persists the latest visual; stays "saving" if a newer edit is queued.
  const persist = useCallback(
    async (next: Visual) => {
      setSaveState("saving");
      try {
        await attachVisual(documentId, next, anchorBlockId);
        if (latest.current === next) {
          setSaveState("saved");
        }
      } catch {
        setSaveState("error");
      }
    },
    [documentId, anchorBlockId],
  );

  // Immediate save for a discrete choice (candidate select / type switch).
  const commit = useCallback(
    async (next: Visual) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      latest.current = next;
      setWorking(next);
      setSelectedNodeId(null);
      onChange(next);
      await persist(next);
    },
    [onChange, persist],
  );

  // Live-updates the canvas and debounce-saves an edit from the visual editor /
  // style panel (drag, relabel, recolor, delete).
  const handleEditChange = useCallback(
    (next: Visual) => {
      latest.current = next;
      setWorking(next);
      onChange(next);
      setSaveState("saving");
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void persist(next);
      }, EDIT_SAVE_DELAY);
    },
    [onChange, persist],
  );

  const hasText = text.trim().length > 0;

  /**
   * Regenerates the visual from its source text. With a `type`, regenerates in
   * that style and auto-selects the result (type switch); without one, returns
   * a fresh batch of varied candidates the user can browse and pick.
   */
  const runGenerate = useCallback(
    async (type?: VisualKind) => {
      if (!hasText) {
        return;
      }
      lastAttemptType.current = type;
      setStatus("loading");
      setPendingType(type ?? null);
      setError(null);
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(type ? { text, type } : { text }),
        });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          setError(
            messageFrom(payload, "We couldn't generate visuals. Try again."),
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
          setError("No usable visuals came back. Try again.");
          return;
        }

        setCandidates(valid);

        if (type) {
          const match = valid.find((item) => item.type === type) ?? valid[0];
          await commit(match);
        }
      } catch {
        setError(
          "Couldn't reach the generator. Check your connection and try again.",
        );
      } finally {
        setStatus("idle");
        setPendingType(null);
      }
    },
    [hasText, text, commit],
  );

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Visual editing tools"
      className="napkin-pop-in flex flex-col gap-3"
    >
      {/* Floating contextual toolbar above the visual. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/[.08] bg-white/90 p-1.5 backdrop-blur dark:border-white/[.10] dark:bg-zinc-900/80">
        <div
          role="group"
          aria-label="Visual type"
          className="flex flex-wrap items-center gap-1"
        >
          {VISUAL_KINDS.map((kind) => {
            const active = working.type === kind;
            const pending = pendingType === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => void runGenerate(kind)}
                disabled={status === "loading"}
                aria-pressed={active}
                aria-label={`Switch to ${KIND_LABEL[kind]}`}
                title={`Regenerate as ${KIND_LABEL[kind]}`}
                className={typePillClass(active)}
              >
                {pending ? (
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                  />
                ) : null}
                {KIND_LABEL[kind]}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          {SAVE_LABEL[saveState] ? (
            <span
              role="status"
              aria-live="polite"
              className={
                saveState === "error"
                  ? "px-1 text-xs text-red-600 dark:text-red-400"
                  : "px-1 text-xs text-zinc-400 dark:text-zinc-500"
              }
            >
              {SAVE_LABEL[saveState]}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void runGenerate()}
            disabled={!hasText || status === "loading"}
            aria-label="More variations"
            title="Generate a fresh batch of variations"
            className={moreVariationsButtonClass}
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-3 w-3 ${status === "loading" ? "animate-spin" : ""}`}
            />
            Variations
          </button>
          <ExportMenu
            getSvgElement={() => rendererRef.current}
            filename={`visual-${documentId.slice(0, 8)}`}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Done editing visual"
            className={doneButtonClass}
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            Done
          </button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          <span className="min-w-0">{error}</span>
          <button
            type="button"
            onClick={() => void runGenerate(lastAttemptType.current)}
            disabled={status === "loading"}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold underline-offset-2 transition hover:underline disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      ) : null}

      {/* Interactive canvas: node/edge editing on the visual itself. */}
      <div className="flex flex-col items-center rounded-lg border border-black/[.06] bg-white p-3 dark:border-white/[.08] dark:bg-zinc-950">
        <VisualEditor
          visual={working}
          onChange={handleEditChange}
          onSelectNode={setSelectedNodeId}
          rendererRef={rendererRef}
          canEdit
        />
        <p className="mt-2 text-center text-xs text-zinc-400 dark:text-zinc-500">
          {isPositionedKind(working.type)
            ? "Click a node to edit or drag it, ✕ to delete, or a connector to relabel / flip it."
            : "Click a node to edit its text, or ✕ to delete it."}
        </p>
      </div>

      {/* Theme / color controls for the selected element or whole visual. */}
      <StylePanel
        visual={working}
        selectedNodeId={selectedNodeId}
        onChange={handleEditChange}
      />

      {/* Variation gallery: browse and pick a freshly generated alternative. */}
      {candidates.length > 0 ? (
        <div className="rounded-lg border border-black/[.06] p-3 dark:border-white/[.08]">
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Variations ({candidates.length})
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {candidates.map((candidate, index) => {
              const active = candidate === working;
              return (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => void commit(candidate)}
                    aria-pressed={active}
                    aria-label={`Select variation ${index + 1} of ${candidates.length}`}
                    title={candidate.title ?? KIND_LABEL[candidate.type]}
                    className={thumbButtonClass(active)}
                  >
                    <span className="aspect-[4/3] w-full overflow-hidden rounded-md bg-white dark:bg-zinc-950">
                      <VisualRenderer
                        visual={candidate}
                        className="h-full w-full"
                      />
                    </span>
                    <span className="px-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Variation {index + 1} of {candidates.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
