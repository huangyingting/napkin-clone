"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $isElementNode,
} from "lexical";
import {
  AlignCenter,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  ChevronDown,
  Maximize2,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

import { FOCUS_RING, GUTTER_BUTTON } from "@/components/motion/control-styles";
import {
  GeneratingIndicator,
  VisualSkeleton,
} from "@/components/motion/generation-status";
import { usePopMotion } from "@/components/motion/reveal";
import { Button, FloatingSurface, IconButton } from "@/components/ui";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cx } from "@/components/ui/tokens";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { INSERT_VISUAL_COMMAND } from "@/lib/lexical/commands";
import { VISUAL_KIND_META } from "@/lib/lexical/tool-registry";
import {
  hashSourceText,
  safeParseVisual,
  VISUAL_KINDS,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";
import { type Orientation, type DetailLevel } from "@/lib/ai/prompt";
import { useIsPointerFine } from "@/lib/pointer";

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

/** Generation options surfaced in the spark panel. */
interface GenOptions {
  type: VisualKind | "auto";
  orientation: Orientation;
  detailLevel: DetailLevel | "auto";
  stayCloserToText: boolean;
}

const DEFAULT_GEN_OPTIONS: GenOptions = {
  type: "auto",
  orientation: "auto",
  detailLevel: "auto",
  stayCloserToText: false,
};

const ORIENTATION_OPTIONS: ReadonlyArray<{
  value: Orientation;
  label: string;
  icon?: React.ReactNode;
}> = [
  {
    value: "auto",
    label: "Auto",
    icon: <Maximize2 aria-hidden="true" className="h-3 w-3" />,
  },
  {
    value: "vertical",
    label: "Vertical",
    icon: <AlignVerticalSpaceAround aria-hidden="true" className="h-3 w-3" />,
  },
  {
    value: "horizontal",
    label: "Horizontal",
    icon: <AlignHorizontalSpaceAround aria-hidden="true" className="h-3 w-3" />,
  },
  {
    value: "square",
    label: "Square",
    icon: <AlignCenter aria-hidden="true" className="h-3 w-3" />,
  },
];

const DETAIL_LEVEL_OPTIONS: ReadonlyArray<{
  value: DetailLevel | "auto";
  label: string;
}> = [
  { value: "auto", label: "Default" },
  { value: "summary", label: "Summary" },
  { value: "detailed", label: "Detailed" },
];

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
  const isPointerFine = useIsPointerFine();

  const [editable, setEditable] = useState(() => editor.isEditable());
  const [block, setBlock] = useState<BlockInfo | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [status, setStatus] = useState<GenStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Visual[]>([]);
  const [genOptions, setGenOptions] = useState<GenOptions>(DEFAULT_GEN_OPTIONS);
  const [showOptions, setShowOptions] = useState(false);
  const [tab, setTab] = useState<"generate" | "blank">("generate");
  const popMotion = usePopMotion();

  // Keeps the gutter button alive while the pointer travels from the block to
  // the button (which lives outside the editable root) or while the panel is
  // open. Without this the button vanishes before it can be clicked.
  const keepRef = useRef(false);
  const openRef = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Captures the block text at the moment generation is triggered, so the
  // inserted visual can be stamped with the correct sourceText even if the
  // block state updates before the user picks a candidate.
  const sourceTextRef = useRef<string>("");
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
    setGenOptions(DEFAULT_GEN_OPTIONS);
  }, []);

  const generate = useCallback(async (target: BlockInfo, opts: GenOptions) => {
    setOpenKey(target.key);
    // Capture source text at generation time so insertVisual can stamp it.
    sourceTextRef.current = target.text.trim();
    setStatus("loading");
    setError(null);
    setCandidates([]);
    try {
      const body: Record<string, unknown> = { text: target.text };
      if (opts.type !== "auto") body.type = opts.type;
      if (opts.orientation !== "auto") body.orientation = opts.orientation;
      if (opts.detailLevel !== "auto") body.detailLevel = opts.detailLevel;
      if (opts.stayCloserToText) body.stayCloserToText = true;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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
      // Stamp sourceText so the visual remembers the text it was generated from.
      const sourceText = sourceTextRef.current;
      const toInsert: Visual = sourceText
        ? {
            ...visual,
            sourceText,
            sourceTextHash: hashSourceText(sourceText),
          }
        : visual;
      editor.update(() => {
        const top = $getNodeByKey(targetKey);
        if (top === null || !$isElementNode(top)) {
          return;
        }
        top.insertAfter($createVisualNode(toInsert));
      });
      closePanel();
      editor.focus();
    },
    [editor, openKey, closePanel],
  );

  // Deterministic (non-AI) insert: dispatch INSERT_VISUAL_COMMAND so Tank's
  // handler builds a blank visual and inserts it AFTER this block. The UI never
  // creates/persists a VisualNode for this path — it only dispatches.
  const insertBlank = useCallback(
    (kind: VisualKind) => {
      const targetKey = openKey;
      editor.dispatchCommand(INSERT_VISUAL_COMMAND, {
        kind,
        afterNodeKey: targetKey ?? undefined,
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
      {createPortal(
        <AnimatePresence>
          {/* Gutter spark button: hidden on touch/coarse-pointer viewports
              since it relies on hover and is a desktop-only affordance. */}
          {isPointerFine && block !== null ? (
            <motion.button
              key="block-spark"
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
                openKey === block.key
                  ? closePanel()
                  : void generate(block, genOptions)
              }
              initial={popMotion.initial}
              animate={popMotion.animate}
              exit={popMotion.exit}
              transition={popMotion.transition}
              style={{
                top: block.top + block.height / 2 - 14,
                left: block.left - GUTTER_OFFSET,
              }}
              className={cx("fixed z-raised", GUTTER_BUTTON)}
            >
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </motion.button>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}

      <FloatingSurface
        open={openKey !== null && panelTarget !== null}
        onClose={closePanel}
        position={
          panelTarget !== null
            ? { top: panelTarget.bottom + PANEL_GAP, left: panelTarget.left }
            : { top: -1000, left: -1000 }
        }
        role="dialog"
        aria-label="Insert a visual for this block"
        radius="lg"
        elevation="overlay"
        closeOnClickAway={false}
      >
        <div
          onMouseEnter={keepAlive}
          className="flex max-h-[36rem] w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col"
        >
          {/* Header + tabs (pinned) */}
          <div className="border-b border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] px-3 pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--ds-text-muted,#52525b)]">
                Insert a visual
              </span>
              <IconButton aria-label="Close" size="sm" onClick={closePanel}>
                <X aria-hidden="true" className="h-4 w-4" />
              </IconButton>
            </div>
            <div role="tablist" aria-label="Insert mode" className="flex gap-4">
              {(["generate", "blank"] as const).map((t) => {
                const active = tab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t)}
                    className={cx(
                      "-mb-px border-b-2 px-0.5 pb-2 text-xs font-medium transition-colors",
                      active
                        ? "border-[var(--ds-accent,#6366f1)] text-[var(--ds-text-primary,#15171a)]"
                        : "border-transparent text-[var(--ds-text-muted,#a1a1aa)] hover:text-[var(--ds-text-secondary,#52525b)]",
                      FOCUS_RING,
                    )}
                  >
                    {t === "generate" ? "Generate" : "Blank"}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === "generate" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Controls + Generate (pinned) */}
              <div className="space-y-2.5 px-3 pb-2 pt-3">
                {/* Generation controls */}
                <div className="space-y-2.5 rounded-[var(--ds-radius-md,10px)] bg-[var(--ds-surface-raised,#f4f4f5)] p-2.5">
                  {/* Visual type picker */}
                  <div>
                    <div className="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#a1a1aa)]">
                      Type
                    </div>
                    <button
                      type="button"
                      aria-pressed={genOptions.type === "auto"}
                      onClick={() =>
                        setGenOptions((o) => ({ ...o, type: "auto" }))
                      }
                      className={cx(
                        "flex w-full items-center justify-center gap-1.5 rounded-[var(--ds-radius-sm,8px)] px-2 py-1.5 text-xs font-medium transition-colors",
                        genOptions.type === "auto"
                          ? "bg-[var(--ds-accent,#6366f1)] text-[var(--ds-text-on-accent,#ffffff)]"
                          : "bg-[var(--ds-surface-base,#ffffff)] text-[var(--ds-text-secondary,#52525b)] hover:bg-[var(--ds-state-hover,rgba(0,0,0,0.05))]",
                        FOCUS_RING,
                      )}
                    >
                      <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                      Auto
                    </button>
                    <div className="mt-1.5 grid grid-cols-3 gap-1">
                      {VISUAL_KINDS.map((kind) => {
                        const meta = VISUAL_KIND_META[kind];
                        const Icon = meta.icon;
                        const active = genOptions.type === kind;
                        return (
                          <button
                            key={kind}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setGenOptions((o) => ({ ...o, type: kind }))
                            }
                            className={cx(
                              "flex items-center gap-1.5 rounded-[var(--ds-radius-sm,8px)] px-2 py-1.5 text-xs font-medium transition-colors",
                              active
                                ? "bg-[var(--ds-accent,#6366f1)] text-[var(--ds-text-on-accent,#ffffff)]"
                                : "bg-[var(--ds-surface-base,#ffffff)] text-[var(--ds-text-secondary,#52525b)] hover:bg-[var(--ds-state-hover,rgba(0,0,0,0.05))]",
                              FOCUS_RING,
                            )}
                          >
                            <Icon
                              aria-hidden="true"
                              className="h-3.5 w-3.5 shrink-0"
                            />
                            <span className="truncate">{meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Advanced options — collapsed by default to keep the panel short */}
                  <div className="border-t border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] pt-2">
                    <button
                      type="button"
                      aria-expanded={showOptions}
                      onClick={() => setShowOptions((v) => !v)}
                      className={cx(
                        "flex w-full items-center justify-between rounded-[var(--ds-radius-sm,8px)] px-1 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#a1a1aa)] transition-colors hover:text-[var(--ds-text-secondary,#52525b)]",
                        FOCUS_RING,
                      )}
                    >
                      <span>Options</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={cx(
                          "h-3.5 w-3.5 transition-transform",
                          showOptions ? "rotate-180" : "",
                        )}
                      />
                    </button>

                    {showOptions ? (
                      <div className="mt-2 space-y-2">
                        {/* Orientation picker */}
                        <div>
                          <div className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#a1a1aa)]">
                            Orientation
                          </div>
                          <SegmentedControl
                            aria-label="Visual orientation"
                            size="sm"
                            options={ORIENTATION_OPTIONS}
                            value={genOptions.orientation}
                            onChange={(v) =>
                              setGenOptions((o) => ({ ...o, orientation: v }))
                            }
                            className="w-full"
                          />
                        </div>

                        {/* Detail level picker */}
                        <div>
                          <div className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#a1a1aa)]">
                            Detail level
                          </div>
                          <SegmentedControl
                            aria-label="Detail level"
                            size="sm"
                            options={DETAIL_LEVEL_OPTIONS}
                            value={genOptions.detailLevel}
                            onChange={(v) =>
                              setGenOptions((o) => ({ ...o, detailLevel: v }))
                            }
                            className="w-full"
                          />
                        </div>

                        {/* Stay closer to text toggle */}
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={genOptions.stayCloserToText}
                            onChange={(e) =>
                              setGenOptions((o) => ({
                                ...o,
                                stayCloserToText: e.target.checked,
                              }))
                            }
                            className={cx(
                              "h-3.5 w-3.5 cursor-pointer rounded accent-[var(--ds-accent,#6366f1)]",
                              FOCUS_RING,
                            )}
                          />
                          <span className="select-none text-[0.6875rem] text-[var(--ds-text-secondary,#52525b)]">
                            Stay closer to my text
                          </span>
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="solid"
                  leadingIcon={
                    <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                  }
                  onClick={() =>
                    panelTarget !== null
                      ? void generate(panelTarget, genOptions)
                      : undefined
                  }
                  disabled={status === "loading"}
                  className="w-full"
                >
                  {status === "loading"
                    ? "Generating…"
                    : candidates.length > 0
                      ? "Regenerate"
                      : "Generate"}
                </Button>
              </div>

              {/* Results — the only scrolling region */}
              <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
                <AnimatePresence mode="wait">
                  {status === "loading" ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-2"
                    >
                      <ul className="grid grid-cols-2 gap-2">
                        {[0, 1].map((i) => (
                          <li key={i}>
                            <VisualSkeleton />
                          </li>
                        ))}
                      </ul>
                      <GeneratingIndicator
                        isLoading
                        className="px-1 py-1 text-sm text-[var(--ds-text-muted,#71717a)]"
                      />
                    </motion.div>
                  ) : error !== null ? (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      role="alert"
                      className="flex flex-col items-start gap-2 px-1 py-2 text-sm text-[var(--ds-danger,#dc2626)]"
                    >
                      <span>{error}</span>
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() =>
                          panelTarget !== null
                            ? void generate(panelTarget, genOptions)
                            : undefined
                        }
                      >
                        Try again
                      </Button>
                    </motion.div>
                  ) : candidates.length > 0 ? (
                    <motion.ul
                      key="candidates"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-2 gap-2"
                    >
                      {candidates.map((candidate, index) => (
                        <li key={index}>
                          <button
                            type="button"
                            aria-label={`Insert variation ${index + 1} of ${candidates.length}`}
                            onClick={() => insertVisual(candidate)}
                            className={cx(
                              "group flex w-full flex-col overflow-hidden rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] bg-[var(--ds-surface-base,#ffffff)] p-1.5 text-left transition-colors hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
                              FOCUS_RING,
                            )}
                          >
                            <VisualRenderer
                              visual={candidate}
                              className="h-auto w-full"
                            />
                          </button>
                        </li>
                      ))}
                    </motion.ul>
                  ) : (
                    <motion.p
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="px-1 py-6 text-center text-xs text-[var(--ds-text-muted,#a1a1aa)]"
                    >
                      Pick a type, then Generate to see options.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="grid grid-cols-3 gap-1.5">
                {VISUAL_KINDS.map((kind) => {
                  const meta = VISUAL_KIND_META[kind];
                  const Icon = meta.icon;
                  return (
                    <Button
                      key={kind}
                      size="sm"
                      variant="subtle"
                      leadingIcon={
                        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                      }
                      onClick={() => insertBlank(kind)}
                      className="w-full justify-start"
                    >
                      {meta.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </FloatingSurface>
    </>
  );
}
