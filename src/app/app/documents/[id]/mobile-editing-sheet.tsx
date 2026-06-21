"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PanelRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { $getNodeByKey, $isElementNode, $nodesOfType } from "lexical";

import {
  Button,
  ColorPicker,
  Divider,
  IconButton,
  Surface,
  Tooltip,
  cx,
} from "@/components/ui";
import {
  GeneratingIndicator,
  VisualSkeleton,
} from "@/components/motion/generation-status";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { FOCUS_RING } from "@/components/motion/control-styles";
import { useEditorContext } from "@/lib/lexical/editor-context";
import {
  generateTargetForContext,
  isCreditError,
  requestVisualCandidates,
  stampSourceText,
} from "@/lib/visual/generate";
import {
  formatShortcut,
  isToolActive,
  toolsFor,
  type EditorTool,
} from "@/lib/lexical/tool-registry";
import { applyElasticLayout } from "@/lib/visual/transforms";
import type { Visual } from "@/lib/visual/schema";
import type { BrandStyle } from "@/lib/brand/schema";
import { BRAND_WEB_FONTS } from "@/lib/brand/schema";
import { applyBrand } from "@/lib/brand/transforms";
import { useVisualSvgRegistry } from "@/components/editor/visual-svg-registry";

import { $createVisualNode, $isVisualNode, VisualNode } from "./visual-node";
import { VisualContextPopover } from "./visual-context-popover";
import { useVisualPanel } from "./visual-panel-context";
import { useEditingSurface } from "./use-editing-surface";

// Block types from which a visual can derive source text (mirrors VisualCard).
const SOURCE_TEXT_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "quote",
  "list",
]);

function useIsMac(): boolean {
  return useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ??
      navigator.platform ??
      navigator.userAgent;
    return /mac|iphone|ipad|ipod/i.test(platform);
  }, []);
}

// ---------------------------------------------------------------------------
// Text-format toolbar content (inline, no floating/position logic).
// ---------------------------------------------------------------------------

function SheetToolButton({
  tool,
  active,
  shortcut,
  showDivider,
  onRun,
}: {
  tool: EditorTool;
  active: boolean;
  shortcut?: string;
  showDivider: boolean;
  onRun: () => void;
}) {
  const Icon = tool.icon;
  return (
    <>
      {showDivider ? <Divider /> : null}
      <Tooltip
        label={
          shortcut ? (
            <span className="inline-flex items-center gap-1.5">
              {tool.label}
              <kbd className="font-sans text-[var(--ds-text-muted,#a1a1aa)]">
                {shortcut}
              </kbd>
            </span>
          ) : (
            tool.label
          )
        }
      >
        <IconButton
          aria-label={shortcut ? `${tool.label} (${shortcut})` : tool.label}
          active={active}
          size="sm"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRun}
        >
          {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : tool.label}
        </IconButton>
      </Tooltip>
    </>
  );
}

function SheetColorToolButton({
  tool,
  active,
  value,
  showDivider,
  onPick,
  onReset,
}: {
  tool: EditorTool;
  active: boolean;
  value: string;
  showDivider: boolean;
  onPick: (next: string) => void;
  onReset: () => void;
}) {
  const Icon = tool.icon;
  return (
    <>
      {showDivider ? <Divider /> : null}
      <Tooltip label={tool.label}>
        <span
          className="inline-flex"
          onMouseDown={(event) => event.preventDefault()}
        >
          <ColorPicker
            color={value}
            active={active}
            aria-label={tool.label}
            size="sm"
            icon={
              Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : undefined
            }
            preserveSelection
            onChange={onPick}
            onReset={onReset}
            resetLabel="Default (none)"
          />
        </span>
      </Tooltip>
    </>
  );
}

function TextFormatSection() {
  const [editor] = useLexicalComposerContext();
  const ctx = useEditorContext();
  const isMac = useIsMac();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rovingIndex, setRovingIndex] = useState(0);

  const tools = useMemo(() => toolsFor("text-format", ctx), [ctx]);

  const getItems = useCallback(
    () =>
      Array.from(
        containerRef.current?.querySelectorAll<HTMLButtonElement>("button") ??
          [],
      ),
    [],
  );

  useEffect(() => {
    const items = getItems();
    if (items.length === 0) return;
    const active = Math.min(rovingIndex, items.length - 1);
    items.forEach((el, index) => {
      el.tabIndex = index === active ? 0 : -1;
    });
  });

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        editor.focus();
        return;
      }
      const items = getItems();
      if (items.length === 0) return;
      const current = items.findIndex((el) => el === document.activeElement);
      let next: number;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          next = current < 0 ? 0 : (current + 1) % items.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          next = current < 0 ? 0 : (current - 1 + items.length) % items.length;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = items.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      setRovingIndex(next);
      items[next]?.focus();
    },
    [editor, getItems],
  );

  const onFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const items = getItems();
      const index = items.findIndex((el) => el === target);
      if (index >= 0) setRovingIndex(index);
    },
    [getItems],
  );

  return (
    <div className="p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
        Text format
      </p>
      <div
        ref={containerRef}
        role="toolbar"
        aria-label="Text formatting"
        className="flex flex-wrap items-center gap-0.5"
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        {tools.map((tool, index) => {
          const previous = tools[index - 1];
          const showDivider =
            previous !== undefined && previous.section !== tool.section;
          if (tool.control === "color") {
            return (
              <SheetColorToolButton
                key={tool.id}
                tool={tool}
                active={isToolActive(tool, ctx)}
                value={tool.value ? tool.value(ctx) : ""}
                showDivider={showDivider}
                onPick={(next) => tool.apply?.(editor, next)}
                onReset={() => tool.apply?.(editor, null)}
              />
            );
          }
          return (
            <SheetToolButton
              key={tool.id}
              tool={tool}
              active={isToolActive(tool, ctx)}
              shortcut={formatShortcut(tool.shortcut, isMac)}
              showDivider={showDivider}
              onRun={() => tool.run?.(editor, ctx)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visual context section — reads node data directly from editor state.
// ---------------------------------------------------------------------------

function VisualContextSection() {
  const [editor] = useLexicalComposerContext();
  const ctx = useEditorContext();
  const { activeVisual, onClose, selectedNodeId } = useVisualPanel();
  const svgRegistry = useVisualSvgRegistry();

  // Merge visual data + source text into a single state object so we never
  // call multiple synchronous setStates in the same effect body.
  const [panelState, setPanelState] = useState<{
    visual: Visual;
    nodeKey: string;
    visualId: string;
    currentSourceText: string | undefined;
  } | null>(null);

  const nodeKey = activeVisual?.nodeKey ?? ctx.selectedVisualNodeKey;
  const visualId = activeVisual?.visualId ?? ctx.selectedVisualId;

  // Read the VisualNode payload whenever the selection or the editor state
  // changes. All setState calls happen inside editor.read() callbacks, which
  // satisfies the react-hooks/set-state-in-effect rule (callbacks are allowed).
  useEffect(() => {
    if (!nodeKey || !visualId) return;

    const readData = () => {
      editor.read(() => {
        const node = $getNodeByKey(nodeKey);
        if (!$isVisualNode(node)) {
          setPanelState(null);
          return;
        }
        const prev = node.getPreviousSibling();
        let srcText: string | undefined;
        if (prev !== null && SOURCE_TEXT_BLOCK_TYPES.has(prev.getType())) {
          const text = prev.getTextContent().trim();
          srcText = text || undefined;
        }
        setPanelState({
          visual: node.getVisual(),
          nodeKey,
          visualId: node.getVisualId(),
          currentSourceText: srcText,
        });
      });
    };

    readData();
    return editor.registerUpdateListener(readData);
  }, [nodeKey, visualId, editor]);

  // If the nodeKey no longer matches what we last read, treat as not-selected.
  const visualData = panelState?.nodeKey === nodeKey ? panelState : null;

  const updateVisual = useCallback(
    (next: Visual) => {
      if (!visualData) return;
      const key = visualData.nodeKey;
      editor.update(() => {
        const node = $getNodeByKey(key);
        if ($isVisualNode(node)) {
          node.setVisual(applyElasticLayout(next));
        }
      });
    },
    [editor, visualData],
  );

  const removeVisual = useCallback(() => {
    if (!visualData) return;
    const key = visualData.nodeKey;
    editor.update(() => {
      const node = $getNodeByKey(key);
      if ($isVisualNode(node)) {
        node.remove();
      }
    });
  }, [editor, visualData]);

  const applyBrandToAll = useCallback(
    (brand: BrandStyle) => {
      if (brand.fontFamily) {
        const match = BRAND_WEB_FONTS.find(
          (f) => f.cssFamily === brand.fontFamily,
        );
        if (match) {
          const id = `gfont-brand-${match.id}`;
          if (!document.getElementById(id)) {
            const link = document.createElement("link");
            link.id = id;
            link.rel = "stylesheet";
            link.href = match.url;
            document.head.appendChild(link);
          }
        }
      }
      editor.update(() => {
        const nodes = $nodesOfType(VisualNode);
        for (const node of nodes) {
          node.setVisual(
            applyElasticLayout(applyBrand(node.getVisual(), brand)),
          );
        }
      });
    },
    [editor],
  );

  // Use the full visualData object as a dep (not a sub-property) to satisfy
  // the react-hooks/preserve-manual-memoization rule.
  const getSvgElement = useCallback(() => {
    if (!visualData?.visualId) return null;
    return svgRegistry?.get(visualData.visualId)?.() ?? null;
  }, [svgRegistry, visualData]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Stable anchor ref — panel mode doesn't use position, but the prop is required.
  const dummyAnchorRef = useRef<HTMLElement | null>(null);

  if (!visualData) return null;

  return (
    <VisualContextPopover
      mode="panel"
      visualId={visualData.visualId}
      visual={visualData.visual}
      selectedNodeId={selectedNodeId}
      onChange={updateVisual}
      onRemove={removeVisual}
      onClose={handleClose}
      getSvgElement={getSvgElement}
      anchorRef={dummyAnchorRef}
      currentSourceText={visualData.currentSourceText}
      onApplyBrandToAll={applyBrandToAll}
    />
  );
}

// ---------------------------------------------------------------------------
// Context toolbox host — popover on fine pointers, sheet on coarse pointers.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GenerateVisualSection — touch-reachable "turn text into a visual" affordance.
// ---------------------------------------------------------------------------

/**
 * The AI text→visual generation affordance for coarse-pointer surfaces. The
 * per-block "spark" (block-spark.tsx) is hover-driven and hidden on touch, so
 * mobile/tablet users had no way to reach the product's headline feature. This
 * section, hosted in the bottom sheet's `text-format` group, exposes a
 * "Generate visual" button wired to the SAME generation path the spark uses
 * (via the shared {@link requestVisualCandidates}/{@link stampSourceText}
 * helpers — no fetch/credit logic is duplicated).
 *
 * Invariants (#84/#87): the selection target is derived only from
 * {@link useEditorContext} (through the pure {@link generateTargetForContext}),
 * and the generated visual is inserted exclusively via `editor.update()`,
 * anchored AFTER the selection end block or active block so it serialises into
 * `contentJson`.
 */
function GenerateVisualSection() {
  const [editor] = useLexicalComposerContext();
  const ctx = useEditorContext();
  const target = useMemo(() => generateTargetForContext(ctx), [ctx]);

  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [creditError, setCreditError] = useState(false);
  const [candidates, setCandidates] = useState<Visual[]>([]);
  // Source text captured at generation time so the inserted visual is stamped
  // with the text it was derived from even if the selection moves afterwards.
  const sourceTextRef = useRef<string>("");

  const generate = useCallback(async () => {
    if (!target) return;
    sourceTextRef.current = target.text;
    setStatus("loading");
    setError(null);
    setCreditError(false);
    setCandidates([]);

    const result = await requestVisualCandidates(target.text);

    setStatus("idle");
    if (result.ok) {
      setCandidates(result.candidates);
    } else {
      setError(result.error);
      setCreditError(isCreditError(result));
    }
  }, [target]);

  const insertVisual = useCallback(
    (visual: Visual) => {
      if (!target) return;
      const toInsert = stampSourceText(visual, sourceTextRef.current);
      editor.update(() => {
        const top = $getNodeByKey(target.blockKey);
        if (top === null || !$isElementNode(top)) {
          return;
        }
        top.insertAfter($createVisualNode(toInsert));
      });
      setCandidates([]);
      editor.focus();
    },
    [editor, target],
  );

  if (!target) return null;

  return (
    <div className="border-b border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
        Turn text into a visual
      </p>

      <Button
        size="sm"
        variant="solid"
        leadingIcon={<Sparkles aria-hidden="true" className="h-3.5 w-3.5" />}
        onClick={() => void generate()}
        disabled={status === "loading"}
        className="w-full"
      >
        {status === "loading"
          ? "Generating…"
          : candidates.length > 0
            ? "Regenerate"
            : "Generate visual"}
      </Button>

      <div className="mt-2">
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
              {creditError ? (
                <Link
                  href="/app/settings/billing"
                  className="inline-flex items-center rounded-[var(--ds-radius-sm,6px)] bg-[var(--ds-accent,#6366f1)] px-3 py-1.5 text-sm font-medium text-[var(--ds-text-on-accent,#fff)] transition hover:opacity-90"
                >
                  Upgrade
                </Link>
              ) : (
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => void generate()}
                >
                  Try again
                </Button>
              )}
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
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileEditingSheet — FAB + slide-up bottom sheet for coarse pointers.
// ---------------------------------------------------------------------------

/**
 * Renders a floating action button for coarse-pointer viewports that opens a
 * bottom sheet containing contextual text/visual editing sections.
 *
 * TextFormatSection and VisualContextSection are reused directly — no control
 * logic is duplicated. The component must live inside the same Lexical/
 * EditorContext/VisualPanel provider tree as the popover surfaces.
 */
function MobileEditingSheet() {
  const surface = useEditingSurface();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while sheet is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // The content group hosted by the sheet comes from the unified resolver
  // (selection-derived): "text-format" ⟺ range, "visual-edit" ⟺ visual.
  const { group } = surface;

  if (surface.mode !== "sheet") return null;

  // Choose a context-appropriate label for the FAB.
  const fabLabel =
    group === "text-format" ? "Open text formatting" : "Open visual editing";

  // Animation: instant when reduced-motion is requested.
  const sheetMotion = reduceMotion
    ? {
        initial: { opacity: 1, y: 0 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 0 },
      }
    : { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } };
  const backdropMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };

  return (
    <>
      {/* FAB — coarse-pointer fallback for the contextual toolbox */}
      <button
        type="button"
        aria-label={fabLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cx(
          "fixed bottom-6 right-6 z-dropdown",
          "flex h-12 w-12 items-center justify-center rounded-full",
          "bg-[var(--ds-accent,#6366f1)] text-[var(--ds-text-on-accent,#ffffff)]",
          "shadow-[var(--ds-shadow-overlay,0_8px_24px_rgba(0,0,0,0.18))]",
          "transition hover:bg-[var(--ds-accent-hover,#4f46e5)] active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring,#6366f1)] focus-visible:ring-offset-2",
        )}
      >
        <PanelRight aria-hidden="true" className="h-5 w-5" />
      </button>

      {/* Bottom-sheet portal — guarded against SSR (no `document` on server) */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                {/* Backdrop */}
                <motion.div
                  key="mobile-sheet-backdrop"
                  aria-hidden="true"
                  initial={backdropMotion.initial}
                  animate={backdropMotion.animate}
                  exit={backdropMotion.exit}
                  transition={{ duration: 0.18 }}
                  onClick={() => setOpen(false)}
                  className="fixed inset-0 z-overlay bg-ds-backdrop"
                />

                {/* Sheet */}
                <motion.div
                  key="mobile-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Editing panel"
                  initial={sheetMotion.initial}
                  animate={sheetMotion.animate}
                  exit={sheetMotion.exit}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="fixed bottom-0 left-0 right-0 z-panel flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border-t border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] bg-[var(--ds-surface-base,#ffffff)] shadow-[var(--ds-shadow-popover,0_12px_32px_rgba(0,0,0,0.18))]"
                >
                  {/* Sheet header with drag handle + close button */}
                  <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
                    {/* Visual drag handle */}
                    <div
                      aria-hidden="true"
                      className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--ds-border-subtle,rgba(0,0,0,0.12))]"
                    />
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
                      {group === "text-format" ? "Text format" : "Visual"}
                    </p>
                    <button
                      type="button"
                      aria-label="Close editing panel"
                      onClick={() => setOpen(false)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ds-text-muted,#52525b)] transition hover:bg-[var(--ds-state-hover,rgba(0,0,0,0.05))]"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Scrollable panel content — reuses the same sections as the popover */}
                  <div className="flex-1 overflow-y-auto">
                    {group === "text-format" && (
                      <Surface elevation="flat" radius="sm" bordered={false}>
                        <GenerateVisualSection />
                        <TextFormatSection />
                      </Surface>
                    )}
                    {group === "visual-edit" && (
                      <Surface elevation="flat" radius="sm" bordered={false}>
                        <VisualContextSection />
                      </Surface>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

// ---------------------------------------------------------------------------
export function MobileEditingSheetHost({
  editable = true,
}: {
  editable?: boolean;
}) {
  if (!editable) {
    return null;
  }

  return <MobileEditingSheet />;
}
