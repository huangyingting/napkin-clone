"use client";

import { Sparkles, Trash2, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ThinkingIndicator } from "@/components/motion/thinking-indicator";
import { ExportMenu } from "@/components/visual/export-menu";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import {
  Button,
  ColorPicker,
  Divider,
  FloatingSurface,
  IconButton,
  SegmentedControl,
  Tooltip,
  cx,
  FOCUS_RING,
  type SegmentedOption,
} from "@/components/ui";
import { VISUAL_KIND_META } from "@/lib/lexical/tool-registry";
import {
  applyTheme,
  isThemeActive,
  resetNodeStyle,
  resetNodeExtStyle,
  setNodeIcon,
  setNodeStyle,
  setNodeFillStyle,
  setNodeBorderStyle,
  setNodeBorderWidth,
  setNodeTextAlign,
  setVisualKind,
  setVisualStyle,
  clearNodeIcon,
  applyDisplayStyle,
  isDisplayStyleActive,
  setAllEdgesStyle,
} from "@/lib/visual/transforms";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { VISUAL_DISPLAY_STYLES } from "@/lib/visual/display-styles";
import {
  VISUAL_KINDS,
  safeParseVisual,
  type Visual,
  type VisualKind,
  type ArrowStyle,
  type LineStyle,
  type FillStyle,
  type TextAlign,
} from "@/lib/visual/schema";

import { IconPicker } from "./icon-picker";

// Gap (px) between the visual card and the popover.
const POPOVER_GAP = 8;
const EDGE_INSET = 8;
const POPOVER_WIDTH = 320;

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;

const FONT_WEIGHTS: SegmentedOption<string>[] = [
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Black" },
];

const ARROW_STYLE_OPTIONS: SegmentedOption<ArrowStyle>[] = [
  { value: "filled", label: "Filled" },
  { value: "open", label: "Open" },
  { value: "circle", label: "Circle" },
  { value: "diamond", label: "Diamond" },
];

const LINE_STYLE_OPTIONS: SegmentedOption<LineStyle>[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const FILL_STYLE_OPTIONS: SegmentedOption<FillStyle>[] = [
  { value: "solid", label: "Flat" },
  { value: "gradient", label: "Gradient" },
];

const TEXT_ALIGN_OPTIONS: SegmentedOption<TextAlign>[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const BORDER_STYLE_OPTIONS: SegmentedOption<LineStyle>[] = LINE_STYLE_OPTIONS;

const LINE_WIDTH_MIN = 0.5;
const LINE_WIDTH_MAX = 6;

const KIND_OPTIONS: SegmentedOption<VisualKind>[] = VISUAL_KINDS.map((kind) => {
  const meta = VISUAL_KIND_META[kind];
  const Icon = meta.icon;
  return {
    value: kind,
    label: meta.label,
    iconOnly: true,
    icon: <Icon aria-hidden="true" className="h-4 w-4" />,
  };
});

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
 * Derives a regeneration prompt from a visual: its title plus node labels. Used
 * by the AI "variations" path so the contextual controls can regenerate without
 * a separate source-text field.
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
      {children}
    </p>
  );
}

/** A theme preview chip: node-fill tile, stroke border, 3-dot palette strip. */
function ThemeChip({
  themeName,
  colors,
  active,
  onSelect,
}: {
  themeName: string;
  colors: (typeof STYLE_THEMES)[number]["colors"];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`Theme ${themeName}`}
      title={themeName}
      className={cx(
        "flex flex-col items-stretch gap-1 rounded-[var(--ds-radius-md,10px)] border p-1.5 transition",
        active
          ? "border-transparent ring-2 ring-[var(--ds-accent,#6366f1)]"
          : "border-[var(--ds-border,rgba(0,0,0,0.1))] hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
        FOCUS_RING,
      )}
    >
      <span
        className="flex h-8 items-end justify-center gap-1 rounded-[var(--ds-radius-sm,8px)] border p-1.5"
        style={{
          backgroundColor: colors.nodeFill,
          borderColor: colors.nodeStroke,
        }}
      >
        {colors.palette.slice(0, 3).map((color, index) => (
          <span
            key={`${color}-${index}`}
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <span className="truncate text-center text-[10px] font-medium text-[var(--ds-text-muted,#6f7d83)]">
        {themeName}
      </span>
    </button>
  );
}

/**
 * Style gallery: renders the current visual content as thumbnails in each
 * named display style so the user can pick a clearly-distinct presentation
 * with a single click (non-destructive — content is preserved).
 */
function StyleGallery({
  visual,
  onSelect,
}: {
  visual: Visual;
  onSelect: (styleId: string) => void;
}) {
  const activeId = useMemo(() => {
    const match = VISUAL_DISPLAY_STYLES.find((s) =>
      isDisplayStyleActive(visual, s.id),
    );
    return match?.id ?? null;
  }, [visual]);

  const variants = useMemo(
    () =>
      VISUAL_DISPLAY_STYLES.map((preset) => ({
        preset,
        styled: applyDisplayStyle(visual, preset.id),
      })),
    [visual],
  );

  return (
    <ul
      role="group"
      aria-label="Style gallery"
      className="mt-1.5 grid grid-cols-2 gap-2"
    >
      {variants.map(({ preset, styled }) => {
        const active = activeId === preset.id;
        return (
          <li key={preset.id}>
            <button
              type="button"
              aria-label={`Apply ${preset.name} style`}
              aria-pressed={active}
              title={preset.description}
              onClick={() => onSelect(preset.id)}
              className={cx(
                "group flex w-full flex-col overflow-hidden rounded-[var(--ds-radius-md,10px)] border p-1.5 text-left transition",
                active
                  ? "border-transparent ring-2 ring-[var(--ds-accent,#6366f1)]"
                  : "border-[var(--ds-border,rgba(0,0,0,0.08))] hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
                FOCUS_RING,
              )}
            >
              <VisualRenderer visual={styled} className="h-auto w-full" />
              <span className="mt-1 block truncate text-center text-[10px] font-medium text-[var(--ds-text-muted,#6f7d83)]">
                {preset.name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export type VisualContextPopoverProps = {
  visual: Visual;
  selectedNodeId: string | null;
  /** Applies a transformed visual back to the document (via `node.setVisual`). */
  onChange: (next: Visual) => void;
  onRemove: () => void;
  onClose: () => void;
  /** The selected SVG canvas, for exports. */
  getSvgElement: () => SVGSVGElement | null;
  /** The visual card element the popover anchors to (positioning + click-away). */
  anchorRef: React.RefObject<HTMLElement | null>;
};

/**
 * The context-aware visual editing surface (Phase 3). Rendered in a
 * {@link FloatingSurface} anchored below the selected visual card and surfaced
 * by {@link VisualCard} whenever `useEditorContext().kind === 'visual'` targets
 * that card. Theme-first per Mouse's spec: one click on a theme chip is the
 * primary restyle path; per-color pickers and per-node overrides are
 * progressive disclosure.
 *
 * Every mutation flows through `onChange(transform(visual, …))`, which the card
 * applies via `node.setVisual()` inside `editor.update()` — never Yjs directly,
 * never persisted NodeKeys, never a direct DB write. The AI "variations" path
 * keeps using `/api/generate`; export and per-node canvas editing are preserved.
 */
export function VisualContextPopover({
  visual,
  selectedNodeId,
  onChange,
  onRemove,
  onClose,
  getSvgElement,
  anchorRef,
}: VisualContextPopoverProps) {
  const measureRef = useRef<HTMLDivElement | null>(null);

  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: -1000,
    left: -1000,
  });
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // AI "variations" state (the /api/generate path).
  const [genStatus, setGenStatus] = useState<"idle" | "loading">("idle");
  const [genError, setGenError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Visual[]>([]);

  // The most recently chosen theme this session, so "Reset to theme" after a
  // manual color override reverts to the user's intended palette.
  const [lastThemeId, setLastThemeId] = useState<string | null>(null);

  // Keep the latest visual available to the async generate callback.
  const visualRef = useRef<Visual>(visual);
  useEffect(() => {
    visualRef.current = visual;
  });

  const { style } = visual;

  const activeThemeId = useMemo(() => {
    const match = STYLE_THEMES.find((theme) => isThemeActive(visual, theme.id));
    return match?.id ?? null;
  }, [visual]);

  const resetThemeId = activeThemeId ?? lastThemeId;

  const selectedNode = useMemo(
    () =>
      selectedNodeId
        ? (visual.nodes.find((node) => node.id === selectedNodeId) ?? null)
        : null,
    [visual.nodes, selectedNodeId],
  );

  // Position below the card, flipping above when it would clip the viewport.
  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const el = measureRef.current;
    if (!anchor || !el) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const height = el.offsetHeight + 2;
    let top = rect.bottom + POPOVER_GAP;
    if (top + height > window.innerHeight - EDGE_INSET) {
      const above = rect.top - height - POPOVER_GAP;
      if (above >= EDGE_INSET) {
        top = above;
      }
    }
    let left = rect.left;
    left = Math.max(
      EDGE_INSET,
      Math.min(left, window.innerWidth - POPOVER_WIDTH - EDGE_INSET),
    );
    setCoords((prev) =>
      prev.top === top && prev.left === left ? prev : { top, left },
    );
  }, [anchorRef]);

  useLayoutEffect(() => {
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [reposition, customizeOpen, candidates.length, genError, selectedNode]);

  // Click-away: dismiss when a pointer-down lands outside any visual chrome
  // (the card, this popover, or a nested DS floating layer like a color picker).
  // Replaces the per-card outside-click state machine; selection still clears
  // through the editor when the user clicks into text.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (
        target?.closest("[data-visual-chrome]") ||
        target?.closest("[data-ds-floating]")
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  const runGenerate = useCallback(async () => {
    const promptText = visualPromptText(visualRef.current);
    if (promptText.trim().length === 0) {
      setGenError("Add some labels before generating variations.");
      return;
    }
    setGenStatus("loading");
    setGenError(null);
    setCandidates([]);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: promptText }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setGenError(
          messageFrom(payload, "We couldn't generate. Please try again."),
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
      setCandidates(valid);
    } catch {
      setGenError(
        "Couldn't reach the generator. Check your connection and try again.",
      );
    } finally {
      setGenStatus("idle");
    }
  }, []);

  const chooseCandidate = useCallback(
    (candidate: Visual) => {
      onChange(candidate);
      setCandidates([]);
    },
    [onChange],
  );

  const applyThemeById = useCallback(
    (themeId: string) => {
      setLastThemeId(themeId);
      onChange(applyTheme(visual, themeId));
    },
    [onChange, visual],
  );

  const applyDisplayStyleById = useCallback(
    (styleId: string) => {
      onChange(applyDisplayStyle(visual, styleId));
    },
    [onChange, visual],
  );

  return (
    <FloatingSurface
      open
      position={coords}
      role="region"
      aria-label="Visual controls"
      elevation="popover"
      radius="lg"
      closeOnEscape
      closeOnClickAway={false}
      onClose={onClose}
      style={{ width: POPOVER_WIDTH }}
    >
      <div
        ref={measureRef}
        data-visual-chrome
        className="max-h-[30rem] overflow-y-auto p-3"
      >
        {/* Header */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-[var(--ds-text-muted,#6f7d83)]">
            {VISUAL_KIND_META[visual.type].label}
          </span>
          <div className="flex items-center gap-1">
            <Tooltip label="More variations">
              <IconButton
                aria-label="More variations"
                size="sm"
                onClick={() => void runGenerate()}
                disabled={genStatus === "loading"}
              >
                <Sparkles aria-hidden="true" className="h-4 w-4" />
              </IconButton>
            </Tooltip>
            <ExportMenu
              getSvgElement={getSvgElement}
              getVisual={() => visual}
              filename={visual.title?.trim() || "visual"}
            />
            <Tooltip label="Remove visual">
              <IconButton
                aria-label="Remove visual"
                size="sm"
                variant="danger"
                onClick={onRemove}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </IconButton>
            </Tooltip>
            <Tooltip label="Close">
              <IconButton
                aria-label="Close visual controls"
                size="sm"
                onClick={onClose}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          </div>
        </div>

        {genStatus === "loading" ? (
          <ThinkingIndicator
            label="Thinking…"
            className="mb-2 text-xs text-[var(--ds-text-muted,#6f7d83)]"
          />
        ) : null}

        {genError !== null ? (
          <div
            role="alert"
            className="mb-2 flex flex-col gap-2 rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-danger,#dc2626)]/40 bg-[var(--ds-danger,#dc2626)]/10 px-3 py-2 text-xs text-[var(--ds-danger,#b91c1c)]"
          >
            <span>{genError}</span>
            <Button
              size="sm"
              variant="subtle"
              className="self-start"
              onClick={() => void runGenerate()}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {candidates.length > 0 ? (
          <div className="mb-3">
            <SectionLabel>Variations ({candidates.length})</SectionLabel>
            <ul className="mt-1.5 grid grid-cols-2 gap-2">
              {candidates.map((candidate, index) => (
                <li key={index}>
                  <button
                    type="button"
                    aria-label={`Select variation ${index + 1} of ${candidates.length}`}
                    title={
                      candidate.title ?? VISUAL_KIND_META[candidate.type].label
                    }
                    onClick={() => chooseCandidate(candidate)}
                    className={cx(
                      "group flex w-full flex-col overflow-hidden rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-border,rgba(0,0,0,0.08))] bg-[var(--ds-surface,#ffffff)] p-1.5 text-left transition hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
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
            </ul>
          </div>
        ) : null}

        {/* Type */}
        <div className="mb-3 space-y-1.5">
          <SectionLabel>Type</SectionLabel>
          <div className="overflow-x-auto">
            <SegmentedControl<VisualKind>
              aria-label="Visual type"
              size="sm"
              options={KIND_OPTIONS}
              value={visual.type}
              onChange={(kind) => onChange(setVisualKind(visual, kind))}
            />
          </div>
        </div>

        <Divider orientation="horizontal" />

        {/* Style Gallery */}
        <div className="my-3 space-y-1.5">
          <SectionLabel>Style</SectionLabel>
          <StyleGallery visual={visual} onSelect={applyDisplayStyleById} />
        </div>

        <Divider orientation="horizontal" />

        {/* Style › Theme (primary path) */}
        <div className="my-3 space-y-1.5">
          <SectionLabel>Theme</SectionLabel>
          <div
            role="group"
            aria-label="Color theme"
            className="grid grid-cols-4 gap-1.5"
          >
            {STYLE_THEMES.map((theme) => (
              <ThemeChip
                key={theme.id}
                themeName={theme.name}
                colors={theme.colors}
                active={activeThemeId === theme.id}
                onSelect={() => applyThemeById(theme.id)}
              />
            ))}
          </div>
        </div>

        {/* Style › Refine (progressive disclosure) */}
        <div className="my-3">
          <button
            type="button"
            aria-expanded={customizeOpen}
            onClick={() => setCustomizeOpen((open) => !open)}
            className={cx(
              "flex w-full items-center justify-between rounded-[var(--ds-radius-md,10px)] px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)] transition hover:text-[var(--ds-text,#18181b)]",
              FOCUS_RING,
            )}
          >
            <span>Customize colors</span>
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className={cx(
                "h-3.5 w-3.5 transition-transform",
                customizeOpen ? "rotate-180" : "",
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>

          {customizeOpen ? (
            <div className="mt-2 space-y-2">
              <ColorField
                label="Background"
                color={style.background}
                onChange={(value) =>
                  onChange(setVisualStyle(visual, { background: value }))
                }
              />
              <ColorField
                label="Node fill"
                color={style.nodeFill}
                onChange={(value) =>
                  onChange(setVisualStyle(visual, { nodeFill: value }))
                }
              />
              <ColorField
                label="Node stroke"
                color={style.nodeStroke}
                onChange={(value) =>
                  onChange(setVisualStyle(visual, { nodeStroke: value }))
                }
              />
              <ColorField
                label="Text"
                color={style.nodeText}
                onChange={(value) =>
                  onChange(setVisualStyle(visual, { nodeText: value }))
                }
              />
              <ColorField
                label="Edge"
                color={style.edgeColor}
                onChange={(value) =>
                  onChange(setVisualStyle(visual, { edgeColor: value }))
                }
              />
              {resetThemeId && activeThemeId === null ? (
                <button
                  type="button"
                  onClick={() => applyThemeById(resetThemeId)}
                  className={cx(
                    "rounded-md px-1 py-0.5 text-[11px] font-medium text-[var(--ds-text-muted,#6f7d83)] transition hover:text-[var(--ds-text,#18181b)]",
                    FOCUS_RING,
                  )}
                >
                  Reset to theme
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <Divider orientation="horizontal" />

        {/* Typography */}
        <div className="my-3 space-y-2">
          <SectionLabel>Type size &amp; weight</SectionLabel>
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--ds-text,#18181b)]">
            <span className="text-[var(--ds-text-muted,#6f7d83)]">
              Font size
            </span>
            <div className="flex items-center gap-1">
              <IconButton
                aria-label="Decrease font size"
                size="sm"
                variant="subtle"
                disabled={style.fontSize <= FONT_SIZE_MIN}
                onClick={() =>
                  onChange(
                    setVisualStyle(visual, {
                      fontSize: Math.max(FONT_SIZE_MIN, style.fontSize - 1),
                    }),
                  )
                }
              >
                <span aria-hidden="true">−</span>
              </IconButton>
              <span className="w-10 text-center tabular-nums text-[var(--ds-text-muted,#6f7d83)]">
                {style.fontSize}px
              </span>
              <IconButton
                aria-label="Increase font size"
                size="sm"
                variant="subtle"
                disabled={style.fontSize >= FONT_SIZE_MAX}
                onClick={() =>
                  onChange(
                    setVisualStyle(visual, {
                      fontSize: Math.min(FONT_SIZE_MAX, style.fontSize + 1),
                    }),
                  )
                }
              >
                <span aria-hidden="true">+</span>
              </IconButton>
            </div>
          </div>
          <div className="overflow-x-auto">
            <SegmentedControl<string>
              aria-label="Font weight"
              size="sm"
              options={FONT_WEIGHTS}
              value={String(style.fontWeight)}
              onChange={(value) =>
                onChange(setVisualStyle(visual, { fontWeight: Number(value) }))
              }
            />
          </div>
        </div>

        {/* Selected element (only when a node is selected on the canvas) */}
        {selectedNode ? (
          <>
            <Divider orientation="horizontal" />
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>
                  {selectedNode.label?.trim() || "Selected element"}
                </SectionLabel>
                <button
                  type="button"
                  aria-label="Reset element style"
                  onClick={() => {
                    const r1 = resetNodeStyle(visual, selectedNode.id);
                    onChange(resetNodeExtStyle(r1, selectedNode.id));
                  }}
                  className={cx(
                    "rounded-md px-1 py-0.5 text-[11px] font-medium text-[var(--ds-text-muted,#6f7d83)] transition hover:text-[var(--ds-text,#18181b)]",
                    FOCUS_RING,
                  )}
                >
                  Reset element
                </button>
              </div>
              <ColorField
                label="Element fill"
                color={selectedNode.color ?? style.nodeFill}
                onChange={(value) =>
                  onChange(
                    setNodeStyle(visual, selectedNode.id, "color", value),
                  )
                }
              />
              <ColorField
                label="Element stroke"
                color={selectedNode.stroke ?? style.nodeStroke}
                onChange={(value) =>
                  onChange(
                    setNodeStyle(visual, selectedNode.id, "stroke", value),
                  )
                }
              />
              <ColorField
                label="Element text"
                color={selectedNode.textColor ?? style.nodeText}
                onChange={(value) =>
                  onChange(
                    setNodeStyle(visual, selectedNode.id, "textColor", value),
                  )
                }
              />
              <IconPicker
                key={selectedNode.id}
                nodeLabel={selectedNode.label}
                value={selectedNode.icon}
                onSelect={(name) =>
                  onChange(setNodeIcon(visual, selectedNode.id, name))
                }
                onRemove={() =>
                  onChange(clearNodeIcon(visual, selectedNode.id))
                }
              />

              {/* Fill style */}
              <div className="space-y-1">
                <span className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
                  Fill style
                </span>
                <SegmentedControl<FillStyle>
                  aria-label="Fill style"
                  size="sm"
                  options={FILL_STYLE_OPTIONS}
                  value={selectedNode.fillStyle ?? "solid"}
                  onChange={(v) =>
                    onChange(setNodeFillStyle(visual, selectedNode.id, v))
                  }
                />
              </div>

              {/* Border style & width */}
              <div className="space-y-1">
                <span className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
                  Border style
                </span>
                <SegmentedControl<LineStyle>
                  aria-label="Border style"
                  size="sm"
                  options={BORDER_STYLE_OPTIONS}
                  value={selectedNode.borderStyle ?? "solid"}
                  onChange={(v) =>
                    onChange(setNodeBorderStyle(visual, selectedNode.id, v))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--ds-text,#18181b)]">
                <span className="text-[var(--ds-text-muted,#6f7d83)]">
                  Border width
                </span>
                <div className="flex items-center gap-1">
                  <IconButton
                    aria-label="Decrease border width"
                    size="sm"
                    variant="subtle"
                    disabled={(selectedNode.borderWidth ?? 1.5) <= 0.5}
                    onClick={() =>
                      onChange(
                        setNodeBorderWidth(
                          visual,
                          selectedNode.id,
                          Math.max(
                            0.5,
                            Math.round(
                              ((selectedNode.borderWidth ?? 1.5) - 0.5) * 2,
                            ) / 2,
                          ),
                        ),
                      )
                    }
                  >
                    <span aria-hidden="true">−</span>
                  </IconButton>
                  <span className="w-10 text-center tabular-nums text-[var(--ds-text-muted,#6f7d83)]">
                    {(selectedNode.borderWidth ?? 1.5).toFixed(1)}px
                  </span>
                  <IconButton
                    aria-label="Increase border width"
                    size="sm"
                    variant="subtle"
                    disabled={(selectedNode.borderWidth ?? 1.5) >= 8}
                    onClick={() =>
                      onChange(
                        setNodeBorderWidth(
                          visual,
                          selectedNode.id,
                          Math.min(
                            8,
                            Math.round(
                              ((selectedNode.borderWidth ?? 1.5) + 0.5) * 2,
                            ) / 2,
                          ),
                        ),
                      )
                    }
                  >
                    <span aria-hidden="true">+</span>
                  </IconButton>
                </div>
              </div>

              {/* Text alignment */}
              <div className="space-y-1">
                <span className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
                  Text align
                </span>
                <SegmentedControl<TextAlign>
                  aria-label="Text alignment"
                  size="sm"
                  options={TEXT_ALIGN_OPTIONS}
                  value={selectedNode.textAlign ?? "center"}
                  onChange={(v) =>
                    onChange(setNodeTextAlign(visual, selectedNode.id, v))
                  }
                />
              </div>
            </div>
          </>
        ) : null}

        {/* Connectors — edge line & arrow style (global, applies to all edges) */}
        {visual.edges.length > 0 ? (
          <>
            <Divider orientation="horizontal" />
            <div className="mt-3 space-y-2">
              <SectionLabel>Connectors</SectionLabel>

              <div className="space-y-1">
                <span className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
                  Arrow style
                </span>
                <div className="overflow-x-auto">
                  <SegmentedControl<ArrowStyle>
                    aria-label="Arrow style"
                    size="sm"
                    options={ARROW_STYLE_OPTIONS}
                    value={visual.edges[0]?.arrowStyle ?? "filled"}
                    onChange={(v) =>
                      onChange(setAllEdgesStyle(visual, { arrowStyle: v }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
                  Line style
                </span>
                <SegmentedControl<LineStyle>
                  aria-label="Line style"
                  size="sm"
                  options={LINE_STYLE_OPTIONS}
                  value={visual.edges[0]?.lineStyle ?? "solid"}
                  onChange={(v) =>
                    onChange(setAllEdgesStyle(visual, { lineStyle: v }))
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-[var(--ds-text,#18181b)]">
                <span className="text-[var(--ds-text-muted,#6f7d83)]">
                  Line width
                </span>
                <div className="flex items-center gap-1">
                  <IconButton
                    aria-label="Decrease line width"
                    size="sm"
                    variant="subtle"
                    disabled={
                      (visual.edges[0]?.lineWidth ?? 1.6) <= LINE_WIDTH_MIN
                    }
                    onClick={() =>
                      onChange(
                        setAllEdgesStyle(visual, {
                          lineWidth: Math.max(
                            LINE_WIDTH_MIN,
                            Math.round(
                              ((visual.edges[0]?.lineWidth ?? 1.6) - 0.5) * 2,
                            ) / 2,
                          ),
                        }),
                      )
                    }
                  >
                    <span aria-hidden="true">−</span>
                  </IconButton>
                  <span className="w-10 text-center tabular-nums text-[var(--ds-text-muted,#6f7d83)]">
                    {(visual.edges[0]?.lineWidth ?? 1.6).toFixed(1)}px
                  </span>
                  <IconButton
                    aria-label="Increase line width"
                    size="sm"
                    variant="subtle"
                    disabled={
                      (visual.edges[0]?.lineWidth ?? 1.6) >= LINE_WIDTH_MAX
                    }
                    onClick={() =>
                      onChange(
                        setAllEdgesStyle(visual, {
                          lineWidth: Math.min(
                            LINE_WIDTH_MAX,
                            Math.round(
                              ((visual.edges[0]?.lineWidth ?? 1.6) + 0.5) * 2,
                            ) / 2,
                          ),
                        }),
                      )
                    }
                  >
                    <span aria-hidden="true">+</span>
                  </IconButton>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </FloatingSurface>
  );
}

/** A labelled row pairing a field name with a {@link ColorPicker}. */
function ColorField({
  label,
  color,
  onChange,
}: {
  label: string;
  color: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-[var(--ds-text,#18181b)]">
      <span className="text-[var(--ds-text-muted,#6f7d83)]">{label}</span>
      <ColorPicker color={color} aria-label={label} onChange={onChange} />
    </div>
  );
}
