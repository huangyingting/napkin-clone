"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $isElementNode,
} from "lexical";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

import { $createVisualNode } from "./visual-node";

// Top-level block types that carry text worth turning into a visual.
const TEXT_BLOCK_TYPES = new Set(["paragraph", "heading", "quote", "list"]);

// Gap (px) between the anchored block and the spark button / candidate panel.
const GUTTER_OFFSET = 34;
const PANEL_GAP = 8;

type BlockInfo = {
  key: string;
  top: number;
  left: number;
  bottom: number;
  height: number;
  text: string;
};

type GenStatus = "idle" | "loading";

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
 * Per-block "spark" affordance for the Lexical editor (US-010). Hovering or
 * focusing a text block reveals a gutter button that generates a visual for
 * just that block: clicking it POSTs the block's text to `/api/generate` and
 * shows candidate variations in a panel anchored beneath the block. Choosing a
 * candidate inserts a {@link VisualNode} (US-009) directly AFTER the source
 * block, so it serializes into `contentJson` and re-renders on reload.
 *
 * The control is gated on the editor being editable (which mirrors
 * canEdit && collab-ready via the editor's `EditableGate`), shows one block at a
 * time, and adds no layout shift (the button is an absolutely/fixed-positioned
 * portal in the gutter). Generation errors are non-blocking and retryable.
 */
export function BlockSparkPlugin() {
  const [editor] = useLexicalComposerContext();

  const [editable, setEditable] = useState(() => editor.isEditable());
  const [block, setBlock] = useState<BlockInfo | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [status, setStatus] = useState<GenStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Visual[]>([]);

  // Keeps the gutter button alive while the pointer travels from the block to
  // the button (which lives outside the editable root) or while the panel is
  // open. Without this the button vanishes before it can be clicked.
  const keepRef = useRef(false);
  const openRef = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    openRef.current = openKey !== null;
  });

  const cancelClear = useCallback(() => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  }, []);

  const keepAlive = useCallback(() => {
    keepRef.current = true;
    cancelClear();
  }, [cancelClear]);

  useEffect(() => {
    return editor.registerEditableListener((value) => setEditable(value));
  }, [editor]);

  useEffect(() => {
    return () => {
      if (clearTimer.current) {
        clearTimeout(clearTimer.current);
      }
    };
  }, []);

  // Resolve the top-level text block under a DOM target and capture its rect.
  const resolveBlock = useCallback(
    (target: Node | null): BlockInfo | null => {
      const root = editor.getRootElement();
      if (!root || !(target instanceof Node)) {
        return null;
      }
      // Walk up to the direct child of the editable root.
      let el: HTMLElement | null =
        target instanceof HTMLElement ? target : target.parentElement;
      while (el && el.parentElement !== root) {
        el = el.parentElement;
      }
      if (!el || el.parentElement !== root) {
        return null;
      }
      const domEl = el;
      const info = editor.read(() => {
        const node = $getNearestNodeFromDOMNode(domEl);
        if (node === null) {
          return null;
        }
        const top = node.getTopLevelElement();
        if (top === null || !TEXT_BLOCK_TYPES.has(top.getType())) {
          return null;
        }
        const text = top.getTextContent().trim();
        if (text === "") {
          return null;
        }
        return { key: top.getKey(), text };
      });
      if (info === null) {
        return null;
      }
      const rect = domEl.getBoundingClientRect();
      return {
        key: info.key,
        text: info.text,
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        height: rect.height,
      };
    },
    [editor],
  );

  // Track the hovered/focused block. The panel stays anchored to its block
  // while open, so we stop retargeting once a generation panel is shown. We use
  // `registerRootListener` so the handlers attach to the contenteditable root as
  // soon as it mounts (it may be null on first render).
  useEffect(() => {
    const onPointer = (event: Event) => {
      if (!editor.isEditable() || openRef.current) {
        return;
      }
      const next = resolveBlock(event.target as Node | null);
      if (next !== null) {
        cancelClear();
        setBlock(next);
      }
    };

    // Debounce clearing so the pointer can travel from the block to the gutter
    // button (which lives outside the editable root); entering the button or
    // panel cancels the pending clear via `keepAlive`.
    const onLeave = () => {
      if (openRef.current) {
        return;
      }
      cancelClear();
      clearTimer.current = setTimeout(() => {
        if (!keepRef.current && !openRef.current) {
          setBlock(null);
        }
      }, 200);
    };

    return editor.registerRootListener((root, prevRoot) => {
      if (prevRoot !== null) {
        prevRoot.removeEventListener("mousemove", onPointer);
        prevRoot.removeEventListener("focusin", onPointer);
        prevRoot.removeEventListener("mouseleave", onLeave);
      }
      if (root !== null) {
        root.addEventListener("mousemove", onPointer);
        root.addEventListener("focusin", onPointer);
        root.addEventListener("mouseleave", onLeave);
      }
    });
  }, [editor, resolveBlock, cancelClear]);

  const closePanel = useCallback(() => {
    setOpenKey(null);
    setCandidates([]);
    setError(null);
    setStatus("idle");
    keepRef.current = false;
  }, []);

  const generate = useCallback(async (target: BlockInfo) => {
    setOpenKey(target.key);
    setStatus("loading");
    setError(null);
    setCandidates([]);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: target.text }),
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

  const insertVisual = useCallback(
    (visual: Visual) => {
      const targetKey = openKey;
      if (targetKey === null) {
        return;
      }
      editor.update(() => {
        const top = $getNodeByKey(targetKey);
        if (top === null || !$isElementNode(top)) {
          return;
        }
        top.insertAfter($createVisualNode(visual));
      });
      closePanel();
      editor.focus();
    },
    [editor, openKey, closePanel],
  );

  if (typeof document === "undefined" || !editable) {
    return null;
  }

  const panelTarget = openKey !== null ? block : null;

  return (
    <>
      {block !== null
        ? createPortal(
            <button
              type="button"
              aria-label="Generate visual for this block"
              aria-expanded={openKey === block.key}
              title="Generate visual for this block"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={keepAlive}
              onMouseLeave={() => {
                keepRef.current = false;
              }}
              onClick={() =>
                openKey === block.key ? closePanel() : void generate(block)
              }
              style={{
                top: block.top + block.height / 2 - 14,
                left: block.left - GUTTER_OFFSET,
              }}
              className="fixed z-40 flex h-7 w-7 items-center justify-center rounded-lg border border-black/[.08] bg-white text-zinc-500 shadow-sm transition-colors hover:bg-black/[.04] hover:text-zinc-900 aria-expanded:bg-black/[.04] aria-expanded:text-zinc-900 dark:border-white/[.12] dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[.08] dark:hover:text-zinc-100"
            >
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </button>,
            document.body,
          )
        : null}

      {openKey !== null && panelTarget !== null
        ? createPortal(
            <div
              role="dialog"
              aria-label="Generate visual for this block"
              onMouseEnter={keepAlive}
              style={{
                top: panelTarget.bottom + PANEL_GAP,
                left: panelTarget.left,
              }}
              className="fixed z-50 max-h-[24rem] w-80 overflow-auto rounded-xl border border-black/[.08] bg-white p-3 shadow-lg dark:border-white/[.12] dark:bg-zinc-900"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Visual for this block
                </span>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={closePanel}
                  className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-black/[.05] hover:text-zinc-700 dark:hover:bg-white/[.08] dark:hover:text-zinc-200"
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

              {status === "loading" ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 px-1 py-4 text-sm text-zinc-500 dark:text-zinc-400"
                >
                  <Sparkles
                    aria-hidden="true"
                    className="h-4 w-4 animate-pulse"
                  />
                  Generating…
                </div>
              ) : error !== null ? (
                <div
                  role="alert"
                  className="flex flex-col gap-2 px-1 py-2 text-sm text-red-600 dark:text-red-400"
                >
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => void generate(panelTarget)}
                    className="self-start rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    Try again
                  </button>
                </div>
              ) : candidates.length > 0 ? (
                <ul className="grid grid-cols-2 gap-2">
                  {candidates.map((candidate, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        aria-label={`Insert variation ${index + 1} of ${candidates.length}`}
                        onClick={() => insertVisual(candidate)}
                        className="group flex w-full flex-col overflow-hidden rounded-lg border border-black/[.08] bg-white p-1.5 text-left transition hover:border-black/20 dark:border-white/[.10] dark:bg-zinc-950 dark:hover:border-white/25"
                      >
                        <VisualRenderer
                          visual={candidate}
                          className="h-auto w-full"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
