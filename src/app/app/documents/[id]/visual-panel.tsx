"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as Y from "yjs";

import { isPositionedKind } from "@/components/visual/layout";
import { ExportMenu } from "@/components/visual/export-menu";
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

/** Debounce (ms) before persisting an in-canvas edit (drag/label/delete). */
const EDIT_SAVE_DELAY = 600;

/** Max generated candidates kept in the session-scoped variation history. */
const MAX_HISTORY = 10;

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
};

const generateButtonClass =
  "flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200";

const moreVariationsButtonClass =
  "flex items-center gap-1.5 rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-black/20 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.12] dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-zinc-100";

function thumbButtonClass(active: boolean): string {
  return [
    "group flex flex-col gap-1 overflow-hidden rounded-lg border bg-white p-1.5 text-left transition dark:bg-zinc-950",
    active
      ? "border-zinc-900 ring-2 ring-zinc-900/20 dark:border-white dark:ring-white/30"
      : "border-black/[.08] hover:border-black/20 dark:border-white/[.10] dark:hover:border-white/25",
  ].join(" ");
}

function typePillClass(active: boolean): string {
  return [
    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
      : "border-black/[.08] text-zinc-600 hover:border-black/20 hover:text-zinc-900 dark:border-white/[.12] dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-zinc-100",
  ].join(" ");
}

/**
 * Right-hand panel of the document editor: turns the current text into AI
 * visuals. It POSTs to `/api/generate`, shows a loading state, lists the
 * returned candidates as a browsable variations gallery ("Variation N of M")
 * with a "More variations" re-roll, renders the selected one in the main canvas,
 * and persists it to the document via the `attachVisual` action. Re-rolling
 * requests a fresh batch without losing the current selection until the user
 * picks a new one. A session-scoped "Recent" strip keeps the last 10 generated
 * candidates so the user can step back to an earlier variation after re-rolling
 * (client-only state; cleared on a full reload). Generation/save errors are
 * non-blocking and retryable.
 */
export function VisualPanel({
  documentId,
  text,
  initialVisual,
  canEdit = true,
  ready = true,
  visualMap,
  localOrigin,
  onAnchorNodeChange,
}: {
  documentId: string;
  text: string;
  initialVisual: Visual | null;
  canEdit?: boolean;
  ready?: boolean;
  visualMap: Y.Map<unknown>;
  localOrigin: symbol;
  onAnchorNodeChange?: (node: { id: string; label: string } | null) => void;
}) {
  const [status, setStatus] = useState<GenStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Visual[]>([]);
  // Session-scoped history of the last MAX_HISTORY generated candidates (newest
  // first). Client-only — never persisted, so it clears on a full reload.
  const [history, setHistory] = useState<Visual[]>([]);
  const [selected, setSelected] = useState<Visual | null>(initialVisual);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingType, setPendingType] = useState<VisualKind | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(
    initialVisual ? "saved" : "idle",
  );

  // Editing requires permission AND a ready collaboration session.
  const editable = canEdit && ready;

  // Ref to the main canvas VisualRenderer's SVG element (for exports)
  const rendererRef = useRef<SVGSVGElement>(null);

  // Remembers the last requested type so the inline "Try again" repeats it
  // (undefined = a plain, type-varied generation).
  const lastAttemptType = useRef<VisualKind | undefined>(undefined);

  // Debounced persistence for in-canvas edits (drag/label/delete). `latest`
  // tracks the most recent edit so we only report "saved" once it lands.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestVisual = useRef<Visual | null>(initialVisual);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  // Publishes the active visual to the shared collaboration state so other
  // editors see it. Tagged with `localOrigin` so our own observer ignores it.
  const pushVisual = useCallback(
    (visual: Visual | null) => {
      const json = visual ? JSON.stringify(visual) : null;
      const doc = visualMap.doc;
      const apply = () => {
        if (json === null) {
          if (visualMap.has("visual")) {
            visualMap.delete("visual");
          }
        } else if (visualMap.get("visual") !== json) {
          visualMap.set("visual", json);
        }
      };
      if (doc) {
        doc.transact(apply, localOrigin);
      } else {
        apply();
      }
    },
    [visualMap, localOrigin],
  );

  // Mirrors remote visual changes (from other collaborators) into the canvas.
  // Our own writes carry `localOrigin` and are ignored to avoid feedback loops.
  useEffect(() => {
    const observer = (event: Y.YMapEvent<unknown>, tr: Y.Transaction) => {
      if (!event.keysChanged.has("visual") || tr.origin === localOrigin) {
        return;
      }
      const raw = visualMap.get("visual");
      if (typeof raw !== "string") {
        setSelected(null);
        return;
      }
      try {
        const result = safeParseVisual(JSON.parse(raw));
        if (result.success) {
          setSelected(result.data);
        }
      } catch {
        // Ignore malformed remote payloads.
      }
    };
    visualMap.observe(observer);
    return () => visualMap.unobserve(observer);
  }, [visualMap, localOrigin]);

  // Surface the currently selected node (id + label) to the parent so the
  // comments panel can anchor a comment to a specific visual element.
  useEffect(() => {
    if (!onAnchorNodeChange) {
      return;
    }
    const node =
      selected && selectedNodeId
        ? selected.nodes.find((candidate) => candidate.id === selectedNodeId)
        : undefined;
    onAnchorNodeChange(node ? { id: node.id, label: node.label } : null);
  }, [selected, selectedNodeId, onAnchorNodeChange]);

  const hasText = text.trim().length > 0;
  const canGenerate = hasText && status !== "loading";

  // The "Recent" strip surfaces previously generated candidates that aren't in
  // the current batch, so the user can step back to an earlier option after a
  // re-roll without losing it.
  const recent = history.filter((item) => !candidates.includes(item));

  // Renders a candidate in the main canvas and persists it as the document's
  // single active visual (re-validated server-side by `attachVisual`).
  const select = useCallback(
    async (visual: Visual) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      latestVisual.current = visual;
      setSelected(visual);
      setSelectedNodeId(null);
      pushVisual(visual);
      setSaveState("saving");
      try {
        await attachVisual(documentId, visual);
        if (latestVisual.current === visual) {
          setSaveState("saved");
        }
      } catch {
        setSaveState("error");
      }
    },
    [documentId, pushVisual],
  );

  // Persists the latest in-canvas edit; stays "saving" if newer edits queued.
  const persistEdit = useCallback(
    async (visual: Visual) => {
      setSaveState("saving");
      try {
        await attachVisual(documentId, visual);
        if (latestVisual.current === visual) {
          setSaveState("saved");
        }
      } catch {
        setSaveState("error");
      }
    },
    [documentId],
  );

  // Live-updates the canvas and debounce-saves an edit from the visual editor.
  const handleEditChange = useCallback(
    (next: Visual) => {
      latestVisual.current = next;
      setSelected(next);
      pushVisual(next);
      setSaveState("saving");
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void persistEdit(next);
      }, EDIT_SAVE_DELAY);
    },
    [persistEdit, pushVisual],
  );

  /**
   * Generates visuals from the current text. With no `type`, returns varied
   * candidates for the user to choose from (US-011). With a `type`, regenerates
   * the current selection in that style and auto-selects the result so the
   * canvas updates immediately (US-012). The source text is never modified.
   */
  const runGenerate = useCallback(
    async (type?: VisualKind) => {
      if (text.trim().length === 0) {
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
          const message =
            payload &&
            typeof payload === "object" &&
            "error" in payload &&
            typeof (payload as { error: unknown }).error === "string"
              ? (payload as { error: string }).error
              : "We couldn't generate visuals. Please try again.";
          setError(message);
          return;
        }

        const rawCandidates =
          payload &&
          typeof payload === "object" &&
          "candidates" in payload &&
          Array.isArray((payload as { candidates: unknown }).candidates)
            ? (payload as { candidates: unknown[] }).candidates
            : [];

        const valid: Visual[] = [];
        for (const item of rawCandidates) {
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
        setHistory((prev) => [...valid, ...prev].slice(0, MAX_HISTORY));

        // Type switch: drop the regenerated visual straight onto the canvas.
        if (type) {
          const match =
            valid.find((visual) => visual.type === type) ?? valid[0];
          await select(match);
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
    [text, select],
  );

  const saveLabel: Record<SaveState, string | null> = {
    idle: null,
    saving: "Saving visual…",
    saved: "Visual saved",
    error: "Couldn't save visual",
  };

  return (
    <section className="flex min-h-[60vh] flex-col bg-white dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[.06] px-4 py-2 dark:border-white/[.08]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Visual
          </span>
          {saveLabel[saveState] ? (
            <span
              role="status"
              aria-live="polite"
              className={
                saveState === "error"
                  ? "text-xs text-red-600 dark:text-red-400"
                  : "text-xs text-zinc-400 dark:text-zinc-500"
              }
            >
              {saveLabel[saveState]}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {selected ? (
            <ExportMenu
              getSvgElement={() => rendererRef.current}
              filename={`visual-${documentId.slice(0, 8)}`}
            />
          ) : null}
          <button
            type="button"
            onClick={() => runGenerate()}
            disabled={!canGenerate || !editable}
            aria-label="Generate visual"
            className={generateButtonClass}
          >
            {status === "loading" ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {hasText ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-black/[.06] px-4 py-2 dark:border-white/[.08]">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Type
          </span>
          <div
            role="group"
            aria-label="Visual type"
            className="flex flex-wrap gap-1.5"
          >
            {VISUAL_KINDS.map((kind) => {
              const active = selected?.type === kind;
              const pending = pendingType === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => runGenerate(kind)}
                  disabled={!editable || status === "loading"}
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
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-red-500/20 bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          <span className="min-w-0">{error}</span>
          <button
            type="button"
            onClick={() => runGenerate(lastAttemptType.current)}
            disabled={status === "loading"}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-700 underline-offset-2 transition hover:underline disabled:opacity-50 dark:text-red-300"
          >
            Try again
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 items-center justify-center p-6">
        {status === "loading" && !selected && candidates.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center gap-3 text-center"
          >
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Generating visuals…
            </p>
          </div>
        ) : selected ? (
          <div className="flex w-full flex-col items-center gap-3">
            <VisualEditor
              visual={selected}
              onChange={handleEditChange}
              onSelectNode={setSelectedNodeId}
              rendererRef={rendererRef}
              canEdit={editable}
            />
            <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
              {isPositionedKind(selected.type)
                ? "Click a node to edit its text, drag to move it, or ✕ to delete."
                : "Click a node to edit its text, or ✕ to delete it."}
            </p>
          </div>
        ) : (
          <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-dashed border-black/10 px-6 py-12 text-center dark:border-white/15">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Your visual will appear here
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {hasText
                ? "Click Generate to turn your text into a flowchart, mind map, or chart."
                : "Write some text on the left, then click Generate."}
            </p>
          </div>
        )}
      </div>

      {selected && status !== "loading" && editable ? (
        <StylePanel
          visual={selected}
          selectedNodeId={selectedNodeId}
          onChange={handleEditChange}
        />
      ) : null}

      {candidates.length > 0 || (status === "loading" && selected) ? (
        <div className="border-t border-black/[.06] px-4 py-3 dark:border-white/[.08]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {candidates.length > 0
                ? `Variations (${candidates.length})`
                : "Variations"}
            </p>
            <button
              type="button"
              onClick={() => runGenerate()}
              disabled={!editable || !hasText || status === "loading"}
              aria-label="More variations"
              title="Generate a fresh batch of variations"
              className={moreVariationsButtonClass}
            >
              {status === "loading" ? (
                <span
                  aria-hidden="true"
                  className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : null}
              More variations
            </button>
          </div>

          {status === "loading" ? (
            <p
              role="status"
              aria-live="polite"
              className="mb-2 text-xs text-zinc-400 dark:text-zinc-500"
            >
              Generating fresh variations…
            </p>
          ) : null}

          {candidates.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {candidates.map((candidate, index) => {
                const active = candidate === selected;
                return (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => select(candidate)}
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
          ) : null}
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div className="border-t border-black/[.06] px-4 py-3 dark:border-white/[.08]">
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Recent
          </p>
          <ul
            role="group"
            aria-label="Recent variations"
            className="flex gap-3 overflow-x-auto pb-1"
          >
            {recent.map((item, index) => {
              const active = item === selected;
              return (
                <li key={index} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => select(item)}
                    aria-pressed={active}
                    aria-label={`Re-select recent variation ${index + 1} of ${recent.length}`}
                    title={item.title ?? KIND_LABEL[item.type]}
                    className={thumbButtonClass(active)}
                  >
                    <span className="block aspect-[4/3] w-24 overflow-hidden rounded-md bg-white dark:bg-zinc-950">
                      <VisualRenderer visual={item} className="h-full w-full" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
