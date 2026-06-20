"use client";

import {
  ArrowLeft,
  ChevronRight,
  Download,
  Info,
  LayoutGrid,
  Maximize2,
  Palette,
  RefreshCw,
  Sparkles,
  Trash2,
  Type,
  Wand2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  GeneratingIndicator,
  VisualSkeleton,
} from "@/components/motion/generation-status";
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
  isSourceStale,
  mergeVisualContent,
  resetNodeStyle,
  resetNodeExtStyle,
  setNodeIcon,
  setNodeStyle,
  setNodeFillStyle,
  setNodeBorderStyle,
  setNodeBorderWidth,
  setNodeTextAlign,
  setNodeFontFamily,
  setVisualKind,
  setVisualStyle,
  clearNodeIcon,
  applyDisplayStyle,
  isDisplayStyleActive,
  setAllEdgesStyle,
  setAspectRatio,
  setCanvasStyle,
  setAutoLayout,
  setEffect,
  clearEffect,
} from "@/lib/visual/transforms";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { VISUAL_DISPLAY_STYLES } from "@/lib/visual/display-styles";
import { isPositionedKind } from "@/components/visual/layout";
import {
  hashSourceText,
  VISUAL_KINDS,
  safeParseVisual,
  type Visual,
  type VisualKind,
  type ArrowStyle,
  type LineStyle,
  type FillStyle,
  type TextAlign,
  type AspectRatioPreset,
  type CanvasStyle,
  ASPECT_RATIO_PRESETS,
  type EffectKind,
} from "@/lib/visual/schema";
import { applyBrand, brandPreviewStyle } from "@/lib/brand/transforms";
import type { BrandStyle } from "@/lib/brand/schema";
import { BRAND_WEB_FONTS } from "@/lib/brand/schema";
import { computeVisualInfo } from "@/lib/visual/info";

import { IconPicker } from "./icon-picker";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const POPOVER_GAP = 8;
const EDGE_INSET = 8;
const POPOVER_WIDTH = 320;

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;
const LINE_WIDTH_MIN = 0.5;
const LINE_WIDTH_MAX = 6;

// ---------------------------------------------------------------------------
// Option arrays
// ---------------------------------------------------------------------------

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

const NODE_FONT_FAMILY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default" },
  ...BRAND_WEB_FONTS.map((f) => ({ value: f.cssFamily, label: f.name })),
];

const ASPECT_RATIO_OPTIONS: SegmentedOption<AspectRatioPreset>[] =
  ASPECT_RATIO_PRESETS.map((preset) => ({
    value: preset,
    label: preset === "auto" ? "Auto" : preset,
  }));

const CANVAS_STYLE_OPTIONS: SegmentedOption<CanvasStyle>[] = [
  { value: "blank", label: "Blank" },
  { value: "ruled", label: "Ruled" },
  { value: "dot-grid", label: "Dots" },
];

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

// ---------------------------------------------------------------------------
// Section navigation
// ---------------------------------------------------------------------------

type MenuSection =
  | "export"
  | "effects"
  | "colors"
  | "fonts"
  | "size"
  | "layout"
  | "branding"
  | "sync"
  | "info"
  | "variations";

interface MenuItemConfig {
  id: MenuSection;
  label: string;
  icon: React.ElementType;
  description?: string;
}

const MENU_ITEMS: MenuItemConfig[] = [
  {
    id: "export",
    label: "Export Visual",
    icon: Download,
    description: "PNG, SVG, PPTX",
  },
  {
    id: "effects",
    label: "Effects",
    icon: Wand2,
    description: "Shadow, sketch",
  },
  {
    id: "colors",
    label: "Colors",
    icon: Palette,
    description: "Theme & color overrides",
  },
  {
    id: "fonts",
    label: "Fonts",
    icon: Type,
    description: "Weight, size, family",
  },
  {
    id: "size",
    label: "Size",
    icon: Maximize2,
    description: "Aspect ratio & canvas",
  },
  {
    id: "layout",
    label: "Swap Layout",
    icon: LayoutGrid,
    description: "Kind & style gallery",
  },
  {
    id: "branding",
    label: "Swap Branding",
    icon: Palette,
    description: "Saved brand styles",
  },
  {
    id: "sync",
    label: "Sync with Text",
    icon: RefreshCw,
    description: "Regenerate from source",
  },
  { id: "info", label: "Info", icon: Info, description: "Visual metadata" },
];

const SECTION_LABELS: Record<MenuSection, string> = {
  export: "Export Visual",
  effects: "Effects",
  colors: "Colors",
  fonts: "Fonts",
  size: "Size",
  layout: "Swap Layout",
  branding: "Swap Branding",
  sync: "Sync with Text",
  info: "Info",
  variations: "AI Variations",
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string") return error;
  }
  return fallback;
}

function candidatesFrom(payload: unknown): unknown[] {
  if (payload && typeof payload === "object" && "candidates" in payload) {
    const candidates = (payload as { candidates: unknown }).candidates;
    if (Array.isArray(candidates)) return candidates;
  }
  return [];
}

function visualPromptText(visual: Visual): string {
  const parts: string[] = [];
  if (visual.title && visual.title.trim().length > 0)
    parts.push(visual.title.trim());
  for (const node of visual.nodes) {
    if (node.label && node.label.trim().length > 0)
      parts.push(node.label.trim());
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Shared small UI atoms
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
      {children}
    </p>
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

/** A row in the categorized main menu. */
function MenuRow({
  item,
  badge,
  onSelect,
}: {
  item: MenuItemConfig;
  badge?: ReactNode;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Open ${item.label}`}
      className={cx(
        "group flex w-full items-center gap-3 rounded-[var(--ds-radius-md,10px)] px-2 py-2 text-left transition hover:bg-[var(--ds-state-hover,rgba(0,0,0,0.06))]",
        FOCUS_RING,
      )}
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--ds-radius-sm,8px)] bg-[var(--ds-surface-raised,#f5f5f5)]">
        <Icon
          aria-hidden="true"
          className="h-3.5 w-3.5 text-[var(--ds-text-secondary,#52525b)]"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--ds-text-primary,#15171a)]">
            {item.label}
          </span>
          {badge}
        </span>
        {item.description ? (
          <span className="block text-[10px] text-[var(--ds-text-muted,#6f7d83)]">
            {item.description}
          </span>
        ) : null}
      </span>
      <ChevronRight
        aria-hidden="true"
        className="h-3.5 w-3.5 flex-shrink-0 text-[var(--ds-text-muted,#6f7d83)] transition group-hover:translate-x-0.5"
      />
    </button>
  );
}

/** Back button + title header for submenu views. */
function SubMenuHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <IconButton aria-label="Back to menu" size="sm" onClick={onBack}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      </IconButton>
      <span className="text-xs font-semibold text-[var(--ds-text-primary,#15171a)]">
        {title}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-section control components
// ---------------------------------------------------------------------------

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

/** Preset metadata for the effects picker. */
const EFFECT_PRESETS: {
  kind: EffectKind;
  label: string;
  description: string;
}[] = [
  {
    kind: "shadow",
    label: "Shadow",
    description: "Soft drop shadow beneath the visual content",
  },
  {
    kind: "sketch",
    label: "Sketch",
    description: "Hand-drawn / rough-stroke appearance",
  },
];

function EffectsPicker({
  visual,
  onChange,
}: {
  visual: Visual;
  onChange: (next: Visual) => void;
}) {
  const activeKinds = new Set((visual.effects ?? []).map((e) => e.kind));
  return (
    <div
      role="group"
      aria-label="Visual effects"
      className="grid grid-cols-2 gap-2"
    >
      {EFFECT_PRESETS.map(({ kind, label, description }) => {
        const active = activeKinds.has(kind);
        return (
          <button
            key={kind}
            type="button"
            aria-label={`${active ? "Remove" : "Apply"} ${label} effect`}
            aria-pressed={active}
            title={description}
            onClick={() => {
              if (active) {
                onChange(clearEffect(visual, kind));
              } else {
                onChange(setEffect(visual, { kind }));
              }
            }}
            className={cx(
              "flex items-center justify-center gap-1.5 rounded-[var(--ds-radius-md,10px)] border px-3 py-2 text-[11px] font-medium transition",
              active
                ? "border-transparent bg-[var(--ds-accent,#6366f1)]/10 text-[var(--ds-accent,#6366f1)] ring-2 ring-[var(--ds-accent,#6366f1)]"
                : "border-[var(--ds-border,rgba(0,0,0,0.1))] text-[var(--ds-text-muted,#6f7d83)] hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))] hover:text-[var(--ds-text,#18181b)]",
              FOCUS_RING,
            )}
          >
            <Wand2 aria-hidden="true" className="h-3 w-3 flex-shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand hooks + chip
// ---------------------------------------------------------------------------

function useBrands() {
  const [brands, setBrands] = useState<BrandStyle[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  const load = useCallback(async () => {
    if (status !== "idle") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/brand");
      if (!res.ok) return;
      const json = (await res.json()) as { brands?: unknown };
      if (Array.isArray(json.brands)) {
        setBrands(json.brands as BrandStyle[]);
      }
    } catch {
      // Best-effort; ignore errors
    } finally {
      setStatus("done");
    }
  }, [status]);

  return { brands, status, load };
}

function useBrandFont(fontFamily: string | null | undefined) {
  useEffect(() => {
    if (!fontFamily) return;
    const match = BRAND_WEB_FONTS.find((f) => f.cssFamily === fontFamily);
    if (!match) return;
    const id = `gfont-brand-${match.id}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = match.url;
    document.head.appendChild(link);
  }, [fontFamily]);
}

function useVisualNodeFonts(visual: Visual) {
  useEffect(() => {
    const seen = new Set<string>();
    for (const node of visual.nodes) {
      if (!node.fontFamily) continue;
      const match = BRAND_WEB_FONTS.find(
        (f) => f.cssFamily === node.fontFamily,
      );
      if (!match || seen.has(match.id)) continue;
      seen.add(match.id);
      const id = `gfont-brand-${match.id}`;
      if (document.getElementById(id)) continue;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = match.url;
      document.head.appendChild(link);
    }
  }, [visual.nodes]);
}

function BrandChip({
  brand,
  active,
  onApply,
  onApplyAll,
}: {
  brand: BrandStyle;
  active: boolean;
  onApply: () => void;
  onApplyAll: () => void;
}) {
  useBrandFont(brand.fontFamily);
  const preview = brandPreviewStyle(brand);
  return (
    <div
      className={cx(
        "group flex flex-col gap-1 rounded-[var(--ds-radius-md,10px)] border p-1.5 transition",
        active
          ? "border-transparent ring-2 ring-[var(--ds-accent,#6366f1)]"
          : "border-[var(--ds-border,rgba(0,0,0,0.1))] hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
        FOCUS_RING,
      )}
    >
      <button
        type="button"
        aria-label={`Apply brand ${brand.name}`}
        aria-pressed={active}
        title={brand.name}
        onClick={onApply}
        className="flex flex-col gap-1"
      >
        <span
          className="flex h-8 items-end justify-center gap-1 rounded-[var(--ds-radius-sm,8px)] border p-1.5"
          style={{
            backgroundColor: preview.nodeFill,
            borderColor: preview.nodeStroke,
          }}
        >
          {preview.palette.slice(0, 3).map((color, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
          ))}
        </span>
        <span className="truncate text-center text-[10px] font-medium text-[var(--ds-text-muted,#6f7d83)]">
          {brand.name}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Apply brand ${brand.name} to all visuals`}
        title="Apply to all visuals"
        onClick={onApplyAll}
        className={cx(
          "hidden w-full rounded-[var(--ds-radius-sm,8px)] px-1 py-0.5 text-[9px] font-medium text-[var(--ds-text-muted)] hover:text-[var(--ds-accent)] group-hover:flex",
          FOCUS_RING,
        )}
      >
        Apply to all
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PopoverShell — float vs panel wrapper
// ---------------------------------------------------------------------------

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
  /**
   * The current text of the preceding document block (the visual's anchor).
   * When present and different from `visual.sourceText`, the out-of-date
   * indicator is shown and "Sync to text" uses this text for re-generation.
   */
  currentSourceText?: string;
  /**
   * Applies a brand to ALL visuals in the document via `editor.update()`.
   * Provided by `VisualCard` which owns the Lexical editor context.
   */
  onApplyBrandToAll?: (brand: BrandStyle) => void;
  /**
   * Rendering mode:
   * - `"float"` (default) — wrapped in a {@link FloatingSurface} anchored to
   *   `anchorRef`; positioning and click-away are active.
   * - `"panel"` — renders the content directly as a plain `<div>` without any
   *   overlay/portal, suitable for hosting inside the docked {@link EditingRail}.
   */
  mode?: "float" | "panel";
};

function PopoverShell({
  mode,
  coords,
  onClose,
  children,
}: {
  mode: "float" | "panel";
  coords: { top: number; left: number };
  onClose: () => void;
  children: ReactNode;
}) {
  if (mode === "panel") return <>{children}</>;
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
      {children}
    </FloatingSurface>
  );
}

// ---------------------------------------------------------------------------
// Bottom quick-toolbar
// ---------------------------------------------------------------------------

function BottomQuickToolbar({
  onSelectSection,
  onTriggerGenerate,
  getSvgElement,
  visual,
  genLoading,
}: {
  onSelectSection: (s: MenuSection) => void;
  onTriggerGenerate: () => void;
  getSvgElement: () => SVGSVGElement | null;
  visual: Visual;
  genLoading: boolean;
}) {
  return (
    <div className="flex items-center justify-around gap-1 px-2 py-2">
      <Tooltip label="AI Variations">
        <IconButton
          aria-label="Generate AI variations"
          size="sm"
          onClick={onTriggerGenerate}
          disabled={genLoading}
        >
          <Sparkles
            aria-hidden="true"
            className={cx("h-4 w-4", genLoading ? "animate-pulse" : "")}
          />
        </IconButton>
      </Tooltip>
      <Tooltip label="Colors">
        <IconButton
          aria-label="Open Colors"
          size="sm"
          onClick={() => onSelectSection("colors")}
        >
          <Palette aria-hidden="true" className="h-4 w-4" />
        </IconButton>
      </Tooltip>
      <Tooltip label="Swap Layout">
        <IconButton
          aria-label="Open Swap Layout"
          size="sm"
          onClick={() => onSelectSection("layout")}
        >
          <LayoutGrid aria-hidden="true" className="h-4 w-4" />
        </IconButton>
      </Tooltip>
      <Tooltip label="Export">
        <span>
          <ExportMenu
            getSvgElement={getSvgElement}
            getVisual={() => visual}
            filename={visual.title?.trim() || "visual"}
          />
        </span>
      </Tooltip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * The context-aware visual editing surface (Phase 4 / Issue #45).
 *
 * Replaces the old flat scrollable popover with a CATEGORIZED MENU where each
 * row opens a focused submenu (drill-down navigation). A compact bottom
 * quick-toolbar exposes the four highest-frequency actions. Works in both
 * "float" (anchored overlay) and "panel" (docked rail) modes.
 *
 * Every mutation flows through `onChange(transform(visual, …))` → `node.setVisual()`
 * → `editor.update()` — never Yjs directly.
 */
export function VisualContextPopover({
  visual,
  selectedNodeId,
  onChange,
  onRemove,
  onClose,
  getSvgElement,
  anchorRef,
  currentSourceText,
  onApplyBrandToAll,
  mode = "float",
}: VisualContextPopoverProps) {
  const measureRef = useRef<HTMLDivElement | null>(null);

  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: -1000,
    left: -1000,
  });

  // Drill-down navigation: null = main menu, string = active submenu section
  const [activeSection, setActiveSection] = useState<MenuSection | null>(null);

  // Colors submenu: progressive disclosure for per-color overrides
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Brands (lazy-loaded when the branding section opens)
  const { brands, status: brandsStatus, load: loadBrands } = useBrands();

  // Trigger brand load when the branding section becomes active.
  useEffect(() => {
    if (activeSection === "branding" && brandsStatus === "idle") {
      void loadBrands();
    }
  }, [activeSection, brandsStatus, loadBrands]);

  // Load any Google Fonts used as per-node font family overrides.
  useVisualNodeFonts(visual);

  // AI "variations" state (the /api/generate path).
  const [genStatus, setGenStatus] = useState<"idle" | "loading">("idle");
  const [genError, setGenError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Visual[]>([]);

  // "Sync to text" state
  const [syncStatus, setSyncStatus] = useState<"idle" | "loading">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  // The most recently chosen theme this session, for "Reset to theme".
  const [lastThemeId, setLastThemeId] = useState<string | null>(null);

  // Keep the latest visual available to async generate callbacks.
  const visualRef = useRef<Visual>(visual);
  useEffect(() => {
    visualRef.current = visual;
  });

  const stale = isSourceStale(visual, currentSourceText ?? "");
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
    if (mode !== "float") return;
    const anchor = anchorRef.current;
    const el = measureRef.current;
    if (!anchor || !el) return;
    const rect = anchor.getBoundingClientRect();
    const height = el.offsetHeight + 2;
    let top = rect.bottom + POPOVER_GAP;
    if (top + height > window.innerHeight - EDGE_INSET) {
      const above = rect.top - height - POPOVER_GAP;
      if (above >= EDGE_INSET) top = above;
    }
    let left = rect.left;
    left = Math.max(
      EDGE_INSET,
      Math.min(left, window.innerWidth - POPOVER_WIDTH - EDGE_INSET),
    );
    setCoords((prev) =>
      prev.top === top && prev.left === left ? prev : { top, left },
    );
  }, [anchorRef, mode]);

  useLayoutEffect(() => {
    if (mode !== "float") return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [
    mode,
    reposition,
    activeSection,
    customizeOpen,
    candidates.length,
    genError,
    syncError,
    selectedNode,
  ]);

  // Click-away: dismiss when a pointer-down lands outside any visual chrome.
  // Only active in float mode.
  useEffect(() => {
    if (mode !== "float") return;
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
  }, [mode, onClose]);

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const runGenerate = useCallback(async () => {
    const promptText = visualPromptText(visualRef.current);
    if (promptText.trim().length === 0) {
      setGenError("Add some labels before generating variations.");
      setActiveSection("variations");
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
        setActiveSection("variations");
        return;
      }
      const valid: Visual[] = [];
      for (const item of candidatesFrom(payload)) {
        const result = safeParseVisual(item);
        if (result.success) valid.push(result.data);
      }
      if (valid.length === 0) {
        setGenError("No usable visuals came back. Please try again.");
        setActiveSection("variations");
        return;
      }
      setCandidates(valid);
      setActiveSection("variations");
    } catch {
      setGenError(
        "Couldn't reach the generator. Check your connection and try again.",
      );
      setActiveSection("variations");
    } finally {
      setGenStatus("idle");
    }
  }, []);

  const runSync = useCallback(async () => {
    const syncText = (
      currentSourceText ??
      visualRef.current.sourceText ??
      ""
    ).trim();
    if (!syncText) {
      setSyncError("No source text to sync from.");
      return;
    }
    setSyncStatus("loading");
    setSyncError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: syncText }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setSyncError(messageFrom(payload, "Sync failed. Please try again."));
        return;
      }
      const valid: Visual[] = [];
      for (const item of candidatesFrom(payload)) {
        const result = safeParseVisual(item);
        if (result.success) valid.push(result.data);
      }
      if (valid.length === 0) {
        setSyncError("No usable visuals came back. Please try again.");
        return;
      }
      const merged = mergeVisualContent(visualRef.current, valid[0]);
      onChange({
        ...merged,
        sourceText: syncText,
        sourceTextHash: hashSourceText(syncText),
      });
      setActiveSection(null);
    } catch {
      setSyncError(
        "Couldn't reach the generator. Check your connection and try again.",
      );
    } finally {
      setSyncStatus("idle");
    }
  }, [currentSourceText, onChange]);

  const chooseCandidate = useCallback(
    (candidate: Visual) => {
      onChange({ ...candidate, autoLayout: visual.autoLayout });
      setCandidates([]);
      setActiveSection(null);
    },
    [onChange, visual],
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

  const applyBrandToThis = useCallback(
    (brand: BrandStyle) => {
      onChange(applyBrand(visual, brand));
    },
    [onChange, visual],
  );

  // ---------------------------------------------------------------------------
  // Submenu content renderers
  // ---------------------------------------------------------------------------

  function renderExportSection() {
    return (
      <div className="space-y-3 py-1">
        <p className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
          Export this visual as PNG, SVG, or PowerPoint.
        </p>
        <ExportMenu
          getSvgElement={getSvgElement}
          getVisual={() => visual}
          filename={visual.title?.trim() || "visual"}
        />
      </div>
    );
  }

  function renderEffectsSection() {
    return (
      <div className="py-1">
        <EffectsPicker visual={visual} onChange={onChange} />
      </div>
    );
  }

  function renderColorsSection() {
    return (
      <div className="space-y-3 py-1">
        {/* Theme grid — primary path */}
        <div className="space-y-1.5">
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

        {/* Customize colors — progressive disclosure */}
        <div>
          <button
            type="button"
            aria-expanded={customizeOpen}
            onClick={() => setCustomizeOpen((o) => !o)}
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
                onChange={(v) =>
                  onChange(setVisualStyle(visual, { background: v }))
                }
              />
              <ColorField
                label="Node fill"
                color={style.nodeFill}
                onChange={(v) =>
                  onChange(setVisualStyle(visual, { nodeFill: v }))
                }
              />
              <ColorField
                label="Node stroke"
                color={style.nodeStroke}
                onChange={(v) =>
                  onChange(setVisualStyle(visual, { nodeStroke: v }))
                }
              />
              <ColorField
                label="Text"
                color={style.nodeText}
                onChange={(v) =>
                  onChange(setVisualStyle(visual, { nodeText: v }))
                }
              />
              <ColorField
                label="Edge"
                color={style.edgeColor}
                onChange={(v) =>
                  onChange(setVisualStyle(visual, { edgeColor: v }))
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

        {/* Per-element colors — only when a node is selected */}
        {selectedNode ? (
          <>
            <Divider orientation="horizontal" />
            <div className="space-y-2">
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
                onChange={(v) =>
                  onChange(setNodeStyle(visual, selectedNode.id, "color", v))
                }
              />
              <ColorField
                label="Element stroke"
                color={selectedNode.stroke ?? style.nodeStroke}
                onChange={(v) =>
                  onChange(setNodeStyle(visual, selectedNode.id, "stroke", v))
                }
              />
              <ColorField
                label="Element text"
                color={selectedNode.textColor ?? style.nodeText}
                onChange={(v) =>
                  onChange(
                    setNodeStyle(visual, selectedNode.id, "textColor", v),
                  )
                }
              />
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
              <div className="flex items-center justify-between gap-2 text-xs">
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
            </div>
          </>
        ) : null}
      </div>
    );
  }

  function renderFontsSection() {
    return (
      <div className="space-y-3 py-1">
        <div className="space-y-2">
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
              onChange={(v) =>
                onChange(setVisualStyle(visual, { fontWeight: Number(v) }))
              }
            />
          </div>
        </div>

        {/* Per-element font family — only when a node is selected */}
        {selectedNode ? (
          <>
            <Divider orientation="horizontal" />
            <div className="space-y-1">
              <SectionLabel>
                {(selectedNode.label?.trim() || "Selected element") +
                  " — font family"}
              </SectionLabel>
              <select
                aria-label="Element font family"
                value={selectedNode.fontFamily ?? ""}
                onChange={(e) =>
                  onChange(
                    setNodeFontFamily(visual, selectedNode.id, e.target.value),
                  )
                }
                className="w-full rounded-[var(--ds-radius-sm,8px)] border border-[var(--ds-border,rgba(0,0,0,0.1))] bg-[var(--ds-surface-base,#ffffff)] px-2 py-1.5 text-xs text-[var(--ds-text,#18181b)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring,#6366f1)] focus-visible:ring-offset-1"
              >
                {NODE_FONT_FAMILY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  function renderSizeSection() {
    return (
      <div className="space-y-3 py-1">
        <div className="space-y-1">
          <SectionLabel>Export ratio</SectionLabel>
          <div className="overflow-x-auto">
            <SegmentedControl<AspectRatioPreset>
              aria-label="Export aspect ratio"
              size="sm"
              options={ASPECT_RATIO_OPTIONS}
              value={visual.aspectRatio ?? "auto"}
              onChange={(preset) => onChange(setAspectRatio(visual, preset))}
            />
          </div>
        </div>
        <div className="space-y-1">
          <SectionLabel>Canvas style</SectionLabel>
          <div className="overflow-x-auto">
            <SegmentedControl<CanvasStyle>
              aria-label="Canvas style"
              size="sm"
              options={CANVAS_STYLE_OPTIONS}
              value={visual.canvasStyle ?? "blank"}
              onChange={(cs) => onChange(setCanvasStyle(visual, cs))}
            />
          </div>
        </div>
        {isPositionedKind(visual.type) ? (
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
              Auto layout
            </span>
            <Tooltip
              label={
                visual.autoLayout
                  ? "Auto layout on — canvas grows to fit labels"
                  : "Enable to auto-size nodes and grow canvas"
              }
            >
              <button
                type="button"
                role="switch"
                aria-checked={visual.autoLayout ?? false}
                aria-label="Toggle auto layout"
                onClick={() =>
                  onChange(setAutoLayout(visual, !(visual.autoLayout ?? false)))
                }
                className={cx(
                  "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent,#6366f1)] focus-visible:ring-offset-1",
                  visual.autoLayout
                    ? "bg-[var(--ds-accent,#6366f1)]"
                    : "bg-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    visual.autoLayout ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
            </Tooltip>
          </div>
        ) : null}
      </div>
    );
  }

  function renderLayoutSection() {
    return (
      <div className="space-y-3 py-1">
        {/* Kind selector */}
        <div className="space-y-1.5">
          <SectionLabel>Visual type</SectionLabel>
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

        {/* Style gallery */}
        <div className="space-y-1.5">
          <SectionLabel>Style</SectionLabel>
          <StyleGallery visual={visual} onSelect={applyDisplayStyleById} />
        </div>

        {/* Connectors — only when edges exist */}
        {visual.edges.length > 0 ? (
          <>
            <Divider orientation="horizontal" />
            <div className="space-y-2">
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
              <div className="flex items-center justify-between gap-2 text-xs">
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
    );
  }

  function renderBrandingSection() {
    return (
      <div className="py-1">
        {brandsStatus === "loading" ? (
          <p className="text-[11px] text-[var(--ds-text-muted)]">Loading…</p>
        ) : brands.length === 0 ? (
          <p className="text-[11px] text-[var(--ds-text-muted)]">
            No brands yet.{" "}
            <a
              href="/app/brands"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--ds-accent)]"
            >
              Create one in Brand Studio
            </a>
            .
          </p>
        ) : (
          <div
            role="group"
            aria-label="Brand styles"
            className="grid grid-cols-3 gap-1.5"
          >
            {brands.map((brand) => (
              <BrandChip
                key={brand.id}
                brand={brand}
                active={false}
                onApply={() => applyBrandToThis(brand)}
                onApplyAll={() => onApplyBrandToAll?.(brand)}
              />
            ))}
          </div>
        )}
        <a
          href="/app/brands"
          target="_blank"
          rel="noopener noreferrer"
          className={cx(
            "mt-3 block rounded-[var(--ds-radius-sm)] px-1 py-0.5 text-[10px] font-medium text-[var(--ds-text-muted)] underline-offset-2 hover:text-[var(--ds-accent)] hover:underline",
            FOCUS_RING,
          )}
        >
          Manage brands →
        </a>
      </div>
    );
  }

  function renderSyncSection() {
    const hasSource = !!(visual.sourceText ?? currentSourceText);
    return (
      <div className="space-y-3 py-1">
        {stale ? (
          <div className="flex items-center gap-2 rounded-[var(--ds-radius-md,10px)] bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            <span
              className="inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-amber-400"
              aria-hidden="true"
            />
            Source text has changed since this visual was generated.
          </div>
        ) : null}
        {!hasSource ? (
          <p className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
            No source text is associated with this visual. Attach it to a
            paragraph to enable sync.
          </p>
        ) : null}
        {syncStatus === "loading" ? (
          <GeneratingIndicator
            isLoading
            className="text-xs text-[var(--ds-text-muted,#6f7d83)]"
          />
        ) : null}
        {syncError !== null ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-danger,#dc2626)]/40 bg-[var(--ds-danger,#dc2626)]/10 px-3 py-2 text-xs text-[var(--ds-danger,#b91c1c)]"
          >
            <span>{syncError}</span>
            <Button
              size="sm"
              variant="subtle"
              className="self-start"
              onClick={() => void runSync()}
            >
              Try again
            </Button>
          </div>
        ) : null}
        <Button
          size="sm"
          variant="subtle"
          onClick={() => void runSync()}
          disabled={syncStatus === "loading" || !hasSource}
        >
          <RefreshCw
            aria-hidden="true"
            className={cx(
              "mr-1.5 h-3.5 w-3.5",
              syncStatus === "loading" ? "animate-spin" : "",
            )}
          />
          Sync to text
        </Button>
      </div>
    );
  }

  function renderInfoSection() {
    const info = computeVisualInfo(visual);
    const kindMeta = VISUAL_KIND_META[info.kind];
    return (
      <dl className="space-y-2.5 py-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--ds-text-muted,#6f7d83)]">Type</dt>
          <dd className="font-medium text-[var(--ds-text-primary,#15171a)]">
            {kindMeta.label}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--ds-text-muted,#6f7d83)]">Nodes</dt>
          <dd className="font-medium text-[var(--ds-text-primary,#15171a)] tabular-nums">
            {info.nodeCount}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--ds-text-muted,#6f7d83)]">Edges</dt>
          <dd className="font-medium text-[var(--ds-text-primary,#15171a)] tabular-nums">
            {info.edgeCount}
          </dd>
        </div>
        {info.effectCount > 0 ? (
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--ds-text-muted,#6f7d83)]">Effects</dt>
            <dd className="font-medium text-[var(--ds-text-primary,#15171a)] tabular-nums">
              {info.effectCount}
            </dd>
          </div>
        ) : null}
        {info.title ? (
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--ds-text-muted,#6f7d83)]">Title</dt>
            <dd className="max-w-[160px] truncate font-medium text-[var(--ds-text-primary,#15171a)]">
              {info.title}
            </dd>
          </div>
        ) : null}
        {info.sourceText ? (
          <div className="flex flex-col gap-1">
            <dt className="text-[var(--ds-text-muted,#6f7d83)]">Source text</dt>
            <dd className="line-clamp-3 rounded-[var(--ds-radius-sm,8px)] bg-[var(--ds-surface-sunken,#f5f5f5)] px-2 py-1.5 text-[11px] text-[var(--ds-text-primary,#15171a)]">
              {info.sourceText}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--ds-text-muted,#6f7d83)]">Font family</dt>
          <dd className="max-w-[160px] truncate font-medium text-[var(--ds-text-primary,#15171a)]">
            {info.fontFamily.split(",")[0].replace(/['"]/g, "").trim() ||
              "System default"}
          </dd>
        </div>
        {stale ? (
          <div className="flex items-center gap-1.5 text-amber-600">
            <span
              className="inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-amber-400"
              aria-hidden="true"
            />
            <span className="text-[10px]">Source text has changed</span>
          </div>
        ) : null}
      </dl>
    );
  }

  function renderVariationsSection() {
    return (
      <div className="space-y-3 py-1">
        {genStatus === "loading" ? (
          <>
            {/* Skeleton cards stabilise the panel layout while generation runs */}
            <ul className="grid grid-cols-2 gap-2">
              {[0, 1].map((i) => (
                <li key={i}>
                  <VisualSkeleton />
                </li>
              ))}
            </ul>
            <GeneratingIndicator
              isLoading
              className="text-xs text-[var(--ds-text-muted,#6f7d83)]"
            />
          </>
        ) : null}
        {genError !== null ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-danger,#dc2626)]/40 bg-[var(--ds-danger,#dc2626)]/10 px-3 py-2 text-xs text-[var(--ds-danger,#b91c1c)]"
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
          <div>
            <p className="mb-2 text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
              {candidates.length} variation{candidates.length !== 1 ? "s" : ""}{" "}
              — click to apply
            </p>
            <ul className="grid grid-cols-2 gap-2">
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
        {genStatus === "idle" &&
        candidates.length === 0 &&
        genError === null ? (
          <p className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
            Use the AI button in the toolbar to generate variations.
          </p>
        ) : null}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PopoverShell mode={mode} coords={coords} onClose={onClose}>
      <div
        ref={measureRef}
        data-visual-chrome
        className={
          mode === "panel"
            ? "overflow-y-auto p-3"
            : "max-h-[32rem] overflow-y-auto p-3"
        }
      >
        {/* ── Persistent header ── */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--ds-text-muted,#6f7d83)]">
              {VISUAL_KIND_META[visual.type].label}
            </span>
            {stale ? (
              <Tooltip label="Source text has changed — click Sync to update">
                <span
                  aria-label="Visual may be out of date"
                  className="inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-amber-400"
                />
              </Tooltip>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
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

        <Divider orientation="horizontal" />

        {/* ── Content: menu list OR active submenu ── */}
        <div className="mt-2">
          {activeSection === null ? (
            /* ── Main categorized menu ── */
            <nav aria-label="Visual editing menu">
              <ul role="list" className="space-y-0.5">
                {MENU_ITEMS.map((item) => {
                  // Stale indicator badge for "sync" row
                  const badge =
                    item.id === "sync" && stale ? (
                      <span
                        aria-label="Source changed"
                        className="inline-flex h-2 w-2 rounded-full bg-amber-400"
                      />
                    ) : undefined;
                  return (
                    <li key={item.id}>
                      <MenuRow
                        item={item}
                        badge={badge}
                        onSelect={() => setActiveSection(item.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : (
            /* ── Active submenu ── */
            <div>
              <SubMenuHeader
                title={SECTION_LABELS[activeSection]}
                onBack={() => setActiveSection(null)}
              />
              <div className="mt-3">
                {activeSection === "export" && renderExportSection()}
                {activeSection === "effects" && renderEffectsSection()}
                {activeSection === "colors" && renderColorsSection()}
                {activeSection === "fonts" && renderFontsSection()}
                {activeSection === "size" && renderSizeSection()}
                {activeSection === "layout" && renderLayoutSection()}
                {activeSection === "branding" && renderBrandingSection()}
                {activeSection === "sync" && renderSyncSection()}
                {activeSection === "info" && renderInfoSection()}
                {activeSection === "variations" && renderVariationsSection()}
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom quick-toolbar (main menu only) ── */}
        {activeSection === null ? (
          <>
            <Divider orientation="horizontal" className="mt-2" />
            <BottomQuickToolbar
              onSelectSection={setActiveSection}
              onTriggerGenerate={() => void runGenerate()}
              getSvgElement={getSvgElement}
              visual={visual}
              genLoading={genStatus === "loading"}
            />
          </>
        ) : null}
      </div>
    </PopoverShell>
  );
}
