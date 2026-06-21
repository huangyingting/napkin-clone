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
  ChevronRight,
  Maximize2,
  Search,
  SlidersHorizontal,
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
import { VISUAL_KIND_META } from "@/lib/lexical/tool-registry";
import {
  VISUAL_KINDS,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";
import {
  isCreditError,
  requestVisualCandidates,
  stampSourceText,
} from "@/lib/visual/generate";
import { type Orientation, type DetailLevel } from "@/lib/ai/prompt";
import Link from "next/link";
import { useIsPointerFine } from "@/lib/pointer";

import { leftGutterButtonLeft } from "./document-gutter";
import { $createVisualNode } from "./visual-node";

// Top-level block types that carry text worth turning into a visual.
const TEXT_BLOCK_TYPES = new Set(["paragraph", "heading", "quote", "list"]);

const PANEL_GAP = 8;

type BlockInfo = {
  key: string;
  anchorTop: number;
  anchorHeight: number;
  gutterLeft: number;
  text: string;
};

function closestListItem(
  target: HTMLElement,
  listRoot: HTMLElement,
): HTMLElement | null {
  const listItem = target.closest("li");
  return listItem instanceof HTMLElement && listRoot.contains(listItem)
    ? listItem
    : null;
}

function resolveAnchorRect(
  blockElement: HTMLElement,
  targetElement: HTMLElement,
  blockType: string,
): { top: number; height: number } {
  const blockRect = blockElement.getBoundingClientRect();
  if (blockType === "list") {
    const rowRect = (
      closestListItem(targetElement, blockElement) ?? blockElement
    ).getBoundingClientRect();
    return {
      top: rowRect.top,
      height: rowRect.height,
    };
  }

  return {
    top: blockRect.top,
    height: blockRect.height,
  };
}

type GenStatus = "idle" | "loading";
type VisualResultSectionId = "ai" | VisualKindCategoryId;

const MAX_GENERATED_VISUALS_PER_SECTION = 8;

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
    value: "vertical",
    label: "Portrait",
    icon: <AlignVerticalSpaceAround aria-hidden="true" className="h-3 w-3" />,
  },
  {
    value: "auto",
    label: "Auto",
    icon: <Maximize2 aria-hidden="true" className="h-3 w-3" />,
  },
  {
    value: "horizontal",
    label: "Landscape",
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
  { value: "summary", label: "Summary" },
  { value: "auto", label: "Auto" },
  { value: "detailed", label: "Detailed" },
];

const AUTO_TYPE_SEARCH = "auto automatic recommended generated";

const VISUAL_KIND_CATEGORY_ORDER = [
  { id: "mindmap", label: "Mindmap" },
  { id: "process", label: "Process" },
  { id: "data", label: "Data" },
  { id: "timelines", label: "Timelines" },
  { id: "comparison", label: "Comparison" },
  { id: "business", label: "Business Frameworks" },
  { id: "more", label: "More visuals" },
] as const;

type VisualKindCategoryId = (typeof VISUAL_KIND_CATEGORY_ORDER)[number]["id"];

const VISUAL_KIND_CATEGORY: Partial<Record<VisualKind, VisualKindCategoryId>> =
  {
    mindmap: "mindmap",
    concept: "mindmap",
    orgchart: "mindmap",
    flowchart: "process",
    list: "process",
    cycle: "process",
    funnel: "process",
    chart: "data",
    matrix: "data",
    timeline: "timelines",
    comparison: "comparison",
    venn: "comparison",
    pyramid: "business",
  };

const DEFAULT_EXPANDED_VISUAL_CATEGORIES: Record<string, boolean> = {
  ai: true,
  mindmap: true,
  process: true,
};

function visualKindMatchesQuery(kind: VisualKind, query: string): boolean {
  if (query === "") {
    return true;
  }
  const meta = VISUAL_KIND_META[kind];
  return [meta.label, meta.description, ...meta.keywords].some((value) =>
    value.toLowerCase().includes(query),
  );
}

function groupVisualKinds(kinds: readonly VisualKind[]) {
  const buckets = new Map<VisualKindCategoryId, VisualKind[]>();
  for (const kind of kinds) {
    const category = VISUAL_KIND_CATEGORY[kind] ?? "more";
    const current = buckets.get(category) ?? [];
    current.push(kind);
    buckets.set(category, current);
  }

  return VISUAL_KIND_CATEGORY_ORDER.flatMap((category) => {
    const categoryKinds = buckets.get(category.id) ?? [];
    return categoryKinds.length > 0
      ? [{ ...category, kinds: categoryKinds }]
      : [];
  });
}

function visualResultSectionForType(
  type: GenOptions["type"],
): VisualResultSectionId {
  if (type === "auto") {
    return "ai";
  }
  return VISUAL_KIND_CATEGORY[type] ?? "more";
}

function elementFromNode(target: Node | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  return target?.parentElement ?? null;
}

function isVisualChromeTarget(target: Node | null): boolean {
  return (
    elementFromNode(target)?.closest(
      "[data-visual-chrome],[data-lexical-visual-id]",
    ) !== null
  );
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
  const [errorSection, setErrorSection] =
    useState<VisualResultSectionId | null>(null);
  const [creditError, setCreditError] = useState(false);
  const [activeGenerationSection, setActiveGenerationSection] =
    useState<VisualResultSectionId | null>(null);
  const [generatedVisualsBySection, setGeneratedVisualsBySection] = useState<
    Partial<Record<VisualResultSectionId, Visual[]>>
  >({});
  const [genOptions, setGenOptions] = useState<GenOptions>(DEFAULT_GEN_OPTIONS);
  const [showOptions, setShowOptions] = useState(false);
  const [hoveringVisual, setHoveringVisual] = useState(false);
  const [visualQuery, setVisualQuery] = useState("");
  const [rememberChoices, setRememberChoices] = useState(false);
  const [expandedVisualCategories, setExpandedVisualCategories] = useState<
    Record<string, boolean>
  >(DEFAULT_EXPANDED_VISUAL_CATEGORIES);
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
      const targetElement =
        target instanceof HTMLElement ? target : target.parentElement;
      let el: HTMLElement | null = targetElement;
      while (el && el.parentElement !== root) {
        el = el.parentElement;
      }
      if (!targetElement || !el || el.parentElement !== root) {
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
        return { key: top.getKey(), text, type: top.getType() };
      });
      if (info === null) {
        return null;
      }
      const gutterLeft = leftGutterButtonLeft(root.getBoundingClientRect());
      if (gutterLeft === null) {
        return null;
      }
      const anchor = resolveAnchorRect(domEl, targetElement, info.type);
      return {
        key: info.key,
        text: info.text,
        anchorTop: anchor.top,
        anchorHeight: anchor.height,
        gutterLeft,
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
      if (!editor.isEditable()) {
        return;
      }
      const target = event.target as Node | null;
      if (isVisualChromeTarget(target)) {
        cancelClear();
        setHoveringVisual(true);
        if (!openRef.current) {
          setBlock(null);
        }
        return;
      }
      setHoveringVisual(false);
      if (openRef.current) {
        return;
      }
      const next = resolveBlock(target);
      if (next !== null) {
        cancelClear();
        setBlock(next);
      } else {
        setBlock(null);
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
      setHoveringVisual(false);
      clearTimer.current = setTimeout(() => {
        if (!keepRef.current && !openRef.current) {
          setBlock(null);
        }
      }, 200);
    };

    return editor.registerRootListener((root, prevRoot) => {
      if (prevRoot !== null) {
        prevRoot.removeEventListener("mousemove", onPointer);
        prevRoot.removeEventListener("pointerover", onPointer);
        prevRoot.removeEventListener("focusin", onPointer);
        prevRoot.removeEventListener("mouseleave", onLeave);
      }
      if (root !== null) {
        root.addEventListener("mousemove", onPointer);
        root.addEventListener("pointerover", onPointer);
        root.addEventListener("focusin", onPointer);
        root.addEventListener("mouseleave", onLeave);
      }
    });
  }, [editor, resolveBlock, cancelClear]);

  const closePanel = useCallback(() => {
    setOpenKey(null);
    setGeneratedVisualsBySection({});
    setError(null);
    setErrorSection(null);
    setStatus("idle");
    setActiveGenerationSection(null);
    keepRef.current = false;
    setHoveringVisual(false);
    if (!rememberChoices) {
      setGenOptions(DEFAULT_GEN_OPTIONS);
    }
    setShowOptions(false);
    setVisualQuery("");
  }, [rememberChoices]);

  const toggleVisualCategory = useCallback((categoryId: string) => {
    setExpandedVisualCategories((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }));
  }, []);

  const generate = useCallback(async (target: BlockInfo, opts: GenOptions) => {
    const section = visualResultSectionForType(opts.type);
    setOpenKey(target.key);
    setExpandedVisualCategories((current) => ({
      ...current,
      [section === "ai" ? "ai" : section]: true,
    }));
    // Capture source text at generation time so insertVisual can stamp it.
    sourceTextRef.current = target.text.trim();
    setStatus("loading");
    setActiveGenerationSection(section);
    setError(null);
    setErrorSection(null);
    setCreditError(false);

    const result = await requestVisualCandidates(target.text, {
      type: opts.type,
      orientation: opts.orientation,
      detailLevel: opts.detailLevel,
      stayCloserToText: opts.stayCloserToText,
    });

    setStatus("idle");
    setActiveGenerationSection(null);
    if (result.ok) {
      setGeneratedVisualsBySection((current) => ({
        ...current,
        [section]: [...result.candidates, ...(current[section] ?? [])].slice(
          0,
          MAX_GENERATED_VISUALS_PER_SECTION,
        ),
      }));
    } else {
      setError(result.error);
      setErrorSection(section);
      setCreditError(isCreditError(result));
    }
  }, []);

  const insertVisual = useCallback(
    (visual: Visual) => {
      const targetKey = openKey;
      if (targetKey === null) {
        return;
      }
      // Stamp sourceText so the visual remembers the text it was generated from.
      const toInsert = stampSourceText(visual, sourceTextRef.current);
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

  if (typeof document === "undefined" || !editable) {
    return null;
  }

  const panelTarget = openKey !== null ? block : null;
  const normalizedVisualQuery = visualQuery.trim().toLowerCase();
  const showAutoType =
    normalizedVisualQuery === "" ||
    AUTO_TYPE_SEARCH.includes(normalizedVisualQuery);
  const filteredVisualKinds = VISUAL_KINDS.filter((kind) =>
    visualKindMatchesQuery(kind, normalizedVisualQuery),
  );
  const visualGroups = groupVisualKinds(filteredVisualKinds);
  const isSearchingVisuals = normalizedVisualQuery !== "";

  const renderGeneratedVisuals = (section: VisualResultSectionId) => {
    const sectionVisuals = generatedVisualsBySection[section] ?? [];
    const sectionLoading =
      status === "loading" && activeGenerationSection === section;
    const sectionError = errorSection === section ? error : null;

    if (
      !sectionLoading &&
      sectionError === null &&
      sectionVisuals.length === 0
    ) {
      return null;
    }

    return (
      <div className="mt-2">
        {sectionLoading ? (
          <div className="space-y-1.5">
            <ul className="grid grid-cols-2 gap-1.5">
              {[0, 1].map((i) => (
                <li key={i}>
                  <VisualSkeleton />
                </li>
              ))}
            </ul>
            <GeneratingIndicator
              isLoading
              className="px-0.5 py-0 text-xs text-[var(--ds-text-muted,#71717a)]"
            />
          </div>
        ) : null}

        {sectionError !== null ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-1.5 rounded-[var(--ds-radius-md,8px)] bg-[var(--ds-surface-raised,#f4f4f5)] px-2 py-2 text-xs text-[var(--ds-danger,#dc2626)]"
          >
            <span>{sectionError}</span>
            {creditError ? (
              <Link
                href="/app/settings/billing"
                className="inline-flex items-center rounded-[var(--ds-radius-sm,6px)] bg-[var(--ds-accent,#6366f1)] px-2 py-1 text-xs font-medium text-[var(--ds-text-on-accent,#fff)] transition hover:opacity-90"
              >
                Upgrade
              </Link>
            ) : (
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
            )}
          </div>
        ) : null}

        {sectionVisuals.length > 0 ? (
          <ul className="grid grid-cols-2 gap-1.5">
            {sectionVisuals.map((visual, index) => (
              <li key={`${visual.type}-${index}`}>
                <button
                  type="button"
                  aria-label={`Insert generated visual ${index + 1}`}
                  onClick={() => insertVisual(visual)}
                  className={cx(
                    "group flex w-full overflow-hidden rounded-[var(--ds-radius-sm,6px)] border border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] bg-[var(--ds-surface-base,#ffffff)] p-1 text-left transition-colors hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
                    FOCUS_RING,
                  )}
                >
                  <VisualRenderer visual={visual} className="h-auto w-full" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {/* Gutter spark button: hidden on touch/coarse-pointer viewports
              since it relies on hover and is a desktop-only affordance. */}
          {isPointerFine && block !== null && !hoveringVisual ? (
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
                top: block.anchorTop + block.anchorHeight / 2 - 14,
                left: block.gutterLeft,
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
        position={{ top: PANEL_GAP, left: PANEL_GAP }}
        role="dialog"
        aria-label="Insert a visual for this block"
        radius="lg"
        elevation="overlay"
        closeOnClickAway={false}
      >
        <div
          onMouseEnter={keepAlive}
          className="flex w-[21rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden"
          style={{ height: "calc(100vh - 1rem)" }}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-[var(--ds-text-muted,#6f7d83)]"
              />
              <span className="truncate text-base font-semibold text-[var(--ds-text-primary,#15171a)]">
                Visuals
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                aria-label="Generation options"
                size="sm"
                active={showOptions}
                onClick={() => setShowOptions((value) => !value)}
              >
                <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
              </IconButton>
              <IconButton aria-label="Close" size="sm" onClick={closePanel}>
                <X aria-hidden="true" className="h-4 w-4" />
              </IconButton>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {showOptions ? (
              <div className="shrink-0 space-y-2 border-b border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] px-3 py-2">
                <div>
                  <div className="mb-1.5 text-xs font-semibold text-[var(--ds-text-secondary,#52525b)]">
                    Orientation
                  </div>
                  <SegmentedControl
                    aria-label="Visual orientation"
                    size="sm"
                    options={ORIENTATION_OPTIONS}
                    value={genOptions.orientation}
                    onChange={(value) =>
                      setGenOptions((option) => ({
                        ...option,
                        orientation: value,
                      }))
                    }
                    className="w-full overflow-x-auto"
                  />
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-semibold text-[var(--ds-text-secondary,#52525b)]">
                    Detail
                  </div>
                  <SegmentedControl
                    aria-label="Detail level"
                    size="sm"
                    options={DETAIL_LEVEL_OPTIONS}
                    value={genOptions.detailLevel}
                    onChange={(value) =>
                      setGenOptions((option) => ({
                        ...option,
                        detailLevel: value,
                      }))
                    }
                    className="w-full"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ds-text-secondary,#52525b)]">
                    <input
                      type="checkbox"
                      checked={genOptions.stayCloserToText}
                      onChange={(event) =>
                        setGenOptions((option) => ({
                          ...option,
                          stayCloserToText: event.target.checked,
                        }))
                      }
                      className={cx(
                        "h-4 w-4 cursor-pointer rounded accent-[var(--ds-accent,#6366f1)]",
                        FOCUS_RING,
                      )}
                    />
                    <span>Stay closer to my text</span>
                  </label>

                  <div className="flex items-center justify-between gap-3">
                    <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm text-[var(--ds-text-secondary,#52525b)]">
                      <input
                        type="checkbox"
                        checked={rememberChoices}
                        onChange={(event) =>
                          setRememberChoices(event.target.checked)
                        }
                        className={cx(
                          "h-4 w-4 cursor-pointer rounded accent-[var(--ds-accent,#6366f1)]",
                          FOCUS_RING,
                        )}
                      />
                      <span className="truncate">Remember my choices</span>
                    </label>

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
                      className="shrink-0"
                    >
                      {status === "loading" ? "Applying…" : "Apply"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-auto px-2.5 pb-2.5 pt-2.5">
              <div className="relative mb-2">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted,#6f7d83)]"
                />
                <input
                  type="search"
                  value={visualQuery}
                  onChange={(event) => setVisualQuery(event.target.value)}
                  placeholder="Search [e.g. Mindmap...]"
                  aria-label="Search visual types"
                  className={cx(
                    "h-8 w-full rounded-[var(--ds-radius-md,8px)] border border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] bg-[var(--ds-surface-base,#ffffff)] pl-9 pr-3 text-sm text-[var(--ds-text-primary,#15171a)] outline-none placeholder:text-[var(--ds-text-muted,#a1a1aa)]",
                    FOCUS_RING,
                  )}
                />
              </div>

              <section>
                <h3 className="mb-1.5 text-sm font-semibold text-[var(--ds-text-primary,#15171a)]">
                  Categories
                </h3>

                {showAutoType || visualGroups.length > 0 ? (
                  <div className="divide-y divide-[var(--ds-border-subtle,rgba(0,0,0,0.08))]">
                    {showAutoType ? (
                      <div className="py-2 first:pt-0">
                        <button
                          type="button"
                          aria-expanded={
                            isSearchingVisuals ||
                            expandedVisualCategories.ai !== false
                          }
                          onClick={() => toggleVisualCategory("ai")}
                          className={cx(
                            "flex w-full items-center justify-between gap-2 rounded-[var(--ds-radius-sm,6px)] py-0.5 text-left text-sm font-semibold text-[var(--ds-text-primary,#15171a)]",
                            FOCUS_RING,
                          )}
                        >
                          <span>AI visuals</span>
                          {isSearchingVisuals ||
                          expandedVisualCategories.ai !== false ? (
                            <ChevronDown
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0"
                            />
                          ) : (
                            <ChevronRight
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0"
                            />
                          )}
                        </button>

                        {isSearchingVisuals ||
                        expandedVisualCategories.ai !== false ? (
                          <>
                            {renderGeneratedVisuals("ai")}
                            <div
                              role="radiogroup"
                              aria-label="AI generated visual types"
                              className="mt-1.5 flex flex-wrap gap-1.5"
                            >
                              <button
                                type="button"
                                role="radio"
                                aria-checked={genOptions.type === "auto"}
                                aria-label="Auto visual type"
                                title="Auto"
                                onClick={() => {
                                  const next: GenOptions = {
                                    ...genOptions,
                                    type: "auto",
                                  };
                                  setGenOptions(next);
                                  if (panelTarget !== null) {
                                    void generate(panelTarget, next);
                                  }
                                }}
                                className={cx(
                                  "flex h-9 w-9 items-center justify-center rounded-[var(--ds-radius-md,8px)] text-[var(--ds-text-muted,#6f7d83)] transition-colors",
                                  genOptions.type === "auto"
                                    ? "bg-[var(--ds-accent,#6366f1)] text-[var(--ds-text-on-accent,#ffffff)]"
                                    : "hover:bg-[var(--ds-state-hover,rgba(0,0,0,0.06))] hover:text-[var(--ds-text-primary,#15171a)]",
                                  FOCUS_RING,
                                )}
                              >
                                <Sparkles
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                />
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {visualGroups.map((group) => {
                      const open =
                        isSearchingVisuals ||
                        expandedVisualCategories[group.id] === true;
                      return (
                        <div key={group.id} className="py-2 first:pt-0">
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => toggleVisualCategory(group.id)}
                            className={cx(
                              "flex w-full items-center justify-between gap-2 rounded-[var(--ds-radius-sm,6px)] py-0.5 text-left text-sm font-semibold text-[var(--ds-text-primary,#15171a)]",
                              FOCUS_RING,
                            )}
                          >
                            <span>{group.label}</span>
                            {open ? (
                              <ChevronDown
                                aria-hidden="true"
                                className="h-4 w-4 shrink-0"
                              />
                            ) : (
                              <ChevronRight
                                aria-hidden="true"
                                className="h-4 w-4 shrink-0"
                              />
                            )}
                          </button>

                          {open ? (
                            <>
                              {renderGeneratedVisuals(group.id)}
                              <div
                                role="radiogroup"
                                aria-label={`${group.label} generated visual types`}
                                className="mt-1.5 flex flex-wrap gap-1.5"
                              >
                                {group.kinds.map((kind) => {
                                  const meta = VISUAL_KIND_META[kind];
                                  const Icon = meta.icon;
                                  const active = genOptions.type === kind;
                                  return (
                                    <button
                                      key={kind}
                                      type="button"
                                      role="radio"
                                      aria-checked={active}
                                      aria-label={meta.label}
                                      title={meta.label}
                                      onClick={() => {
                                        const next = {
                                          ...genOptions,
                                          type: kind,
                                        };
                                        setGenOptions(next);
                                        if (panelTarget !== null) {
                                          void generate(panelTarget, next);
                                        }
                                      }}
                                      className={cx(
                                        "flex h-9 w-9 items-center justify-center rounded-[var(--ds-radius-md,8px)] text-[var(--ds-text-muted,#6f7d83)] transition-colors",
                                        active
                                          ? "bg-[var(--ds-accent,#6366f1)] text-[var(--ds-text-on-accent,#ffffff)]"
                                          : "hover:bg-[var(--ds-state-hover,rgba(0,0,0,0.06))] hover:text-[var(--ds-text-primary,#15171a)]",
                                        FOCUS_RING,
                                      )}
                                    >
                                      <Icon
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                      />
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-[var(--ds-radius-md,8px)] bg-[var(--ds-surface-raised,#f4f4f5)] px-3 py-2 text-sm text-[var(--ds-text-muted,#6f7d83)]">
                    No visual types match this search.
                  </p>
                )}
              </section>
            </div>
          </div>
        </div>
      </FloatingSurface>
    </>
  );
}
