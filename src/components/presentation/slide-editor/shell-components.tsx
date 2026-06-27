"use client";

import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  BringToFront,
  Captions,
  Check,
  ChevronLeft,
  Copy,
  Crop,
  FileText,
  Grid3x3,
  Group,
  Heading,
  Heading1,
  Heading2,
  Image as ImageIcon,
  LayoutPanelLeft,
  List,
  Maximize2,
  Minus,
  MoreHorizontal,
  Palette,
  PanelBottom,
  Paintbrush,
  Plus,
  Replace,
  SendToBack,
  Sparkles,
  Columns3,
  Square,
  Tag,
  Text as TextIcon,
  Type,
  Trash2,
  Ungroup,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  X,
} from "lucide-react";

import { FOCUS_RING } from "@/components/ui/tokens";
import { ColorPicker } from "@/components/ui/color-picker";
import { Popover } from "@/components/ui/popover";
import { ToolbarButton, Tooltip } from "@/components/ui";
import { VisualPicker } from "@/components/presentation/visual-picker";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { ElementToolbarContent } from "@/components/presentation/slide-stage/element-overlays";
import { useFocusTrap } from "@/lib/presentation/use-focus-trap";
import type { Visual } from "@/lib/visual/schema";
import {
  PRESENTATION_ROLES,
  type PresentationRole,
} from "@/lib/presentation/presentation-theme";
import type { ShapeKind, Slide, SlideElement } from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import type { SlideThemeColors } from "@/lib/presentation/style-cascade";
import type { SlideFormat } from "@/lib/presentation/slide-format";
import type {
  AlignMode,
  DistributeMode,
  MatchSizeMode,
} from "@/lib/presentation/element-align";
import type { ArrangeMode } from "@/lib/presentation/element-arrange";
import {
  SLIDE_FORMATS,
  slideFormatConfig,
} from "@/lib/presentation/slide-format";
import {
  ZOOM_PERCENT_PRESETS,
  zoomToPercent,
} from "@/lib/presentation/stage-fit";
import {
  getBuiltInSlideTemplate,
  SLIDE_TEMPLATES,
  type SlideTemplateOption,
  type SlideTemplateKind,
} from "@/lib/presentation/slide-templates";
import type { MergeSummary } from "@/lib/presentation/deck-merge";
import type { Insertable } from "@/lib/presentation/document-insertable";
import type { StaleSourceLink } from "@/lib/presentation/source-link-staleness";
import type { AddElementKind } from "@/components/presentation/slide-inspector/types";
import {
  availablePanels,
  isSelectionToolbarVisible,
  PANEL_LABELS,
  shouldShowRichToolbarControls,
  toToolbarSelectionKind,
  type RightPanelTab,
} from "@/lib/presentation/slide-panel-ui";
import { shapeContent } from "@/components/presentation/slide-canvas/v6-model";
import {
  slideBackgroundGradientValue,
  slideBackgroundImageValue,
  slideSolidBackgroundValue,
} from "@/components/presentation/v6-deck-ui";

/**
 * Icons for the toolbar `...` panel menu, keyed by panel (plus a `line`
 * variant for connector appearance).
 */
const PANEL_MENU_ICONS: Record<RightPanelTab | "line", ReactNode> = {
  slide: <LayoutPanelLeft size={14} aria-hidden="true" />,
  arrange: <Grid3x3 size={14} aria-hidden="true" />,
  text: <Type size={14} aria-hidden="true" />,
  appearance: <ImageIcon size={14} aria-hidden="true" />,
  effects: <Sparkles size={14} aria-hidden="true" />,
  source: <FileText size={14} aria-hidden="true" />,
  notes: <Captions size={14} aria-hidden="true" />,
  layers: <LayoutPanelLeft size={14} aria-hidden="true" />,
  line: <Minus size={14} aria-hidden="true" />,
};

const STAGE_FLOATING_TOOLBAR_GAP = 12;
const STAGE_FLOATING_TOOLBAR_EDGE_INSET = 8;
const OFFSCREEN_STAGE_TOOLBAR_POSITION = {
  top: -1000,
  left: -1000,
  maxWidth: 0,
};

function StageFloatingToolbar({
  ariaLabel,
  keepSelection = false,
  children,
}: {
  ariaLabel: string;
  keepSelection?: boolean;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(OFFSCREEN_STAGE_TOOLBAR_POSITION);

  const updatePosition = useCallback(() => {
    const anchorNode = anchorRef.current;
    const toolbarNode = toolbarRef.current;
    if (!anchorNode || !toolbarNode) return;
    const slideNode = anchorNode.closest(
      '[data-slide-toolbar-anchor="true"]',
    ) as HTMLElement | null;
    const dialogNode = anchorNode.closest(
      '[role="dialog"][aria-label="Slide editor"]',
    ) as HTMLElement | null;
    const chromeNode = dialogNode?.querySelector(
      '[data-slide-editor-chrome="true"]',
    ) as HTMLElement | null;
    const slideRect = (slideNode ?? anchorNode).getBoundingClientRect();
    const toolbarHeight = toolbarNode.offsetHeight;
    const chromeRect = chromeNode?.getBoundingClientRect();
    const minTop = chromeRect
      ? chromeRect.bottom + STAGE_FLOATING_TOOLBAR_GAP + toolbarHeight
      : STAGE_FLOATING_TOOLBAR_EDGE_INSET + toolbarHeight;
    const maxWidth = Math.max(
      1,
      Math.min(
        slideRect.width,
        window.innerWidth - STAGE_FLOATING_TOOLBAR_EDGE_INSET * 2,
      ),
    );
    const next = {
      top: Math.max(minTop, slideRect.top - STAGE_FLOATING_TOOLBAR_GAP),
      left: slideRect.left + slideRect.width / 2,
      maxWidth,
    };
    setPosition((current) =>
      current.top === next.top &&
      current.left === next.left &&
      current.maxWidth === next.maxWidth
        ? current
        : next,
    );
  }, []);

  useLayoutEffect(() => {
    updatePosition();
  });

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const resizeObserver = new ResizeObserver(updatePosition);
    const slideNode = anchorRef.current?.closest(
      '[data-slide-toolbar-anchor="true"]',
    );
    let frameId: number | null = null;
    let runningTransitions = 0;
    let trackingTransition = false;
    const trackTransition = () => {
      updatePosition();
      if (trackingTransition) {
        frameId = window.requestAnimationFrame(trackTransition);
      }
    };
    const startTrackingTransition = () => {
      if (trackingTransition) return;
      trackingTransition = true;
      frameId = window.requestAnimationFrame(trackTransition);
    };
    const stopTrackingTransition = () => {
      trackingTransition = false;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      updatePosition();
    };
    // The slide animates its left/top/width/height when the inspector opens or
    // the layout reflows; follow every frame of that transition (a counter
    // keeps tracking alive while several properties animate together).
    const TRACKED_PROPERTIES = new Set(["left", "top", "width", "height"]);
    const handleTransitionStart = (event: Event) => {
      const transition = event as TransitionEvent;
      if (
        transition.target !== slideNode ||
        !TRACKED_PROPERTIES.has(transition.propertyName)
      ) {
        return;
      }
      runningTransitions += 1;
      startTrackingTransition();
    };
    const handleTransitionEnd = (event: Event) => {
      const transition = event as TransitionEvent;
      if (
        transition.target !== slideNode ||
        !TRACKED_PROPERTIES.has(transition.propertyName)
      ) {
        return;
      }
      runningTransitions = Math.max(0, runningTransitions - 1);
      if (runningTransitions === 0) {
        stopTrackingTransition();
      }
    };
    if (slideNode) {
      resizeObserver.observe(slideNode);
      slideNode.addEventListener("transitionrun", handleTransitionStart);
      slideNode.addEventListener("transitionend", handleTransitionEnd);
      slideNode.addEventListener("transitioncancel", handleTransitionEnd);
    }
    if (toolbarRef.current) {
      resizeObserver.observe(toolbarRef.current);
    }
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      if (slideNode) {
        slideNode.removeEventListener("transitionrun", handleTransitionStart);
        slideNode.removeEventListener("transitionend", handleTransitionEnd);
        slideNode.removeEventListener("transitioncancel", handleTransitionEnd);
      }
      stopTrackingTransition();
      resizeObserver.disconnect();
    };
  }, [updatePosition]);

  const toolbar =
    typeof document === "undefined"
      ? null
      : createPortal(
          <div
            ref={toolbarRef}
            data-stage-floating-toolbar="true"
            data-floating-panel="true"
            role="toolbar"
            aria-label={ariaLabel}
            onMouseDownCapture={
              keepSelection ? (event) => event.preventDefault() : undefined
            }
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onMouseMove={(event) => event.stopPropagation()}
            style={{
              top: position.top,
              left: position.left,
              maxWidth: position.maxWidth || undefined,
              transform: "translate(-50%, -100%)",
            }}
            className="pointer-events-auto fixed z-tooltip flex h-10 min-h-10 flex-nowrap items-center justify-center gap-1 overflow-visible rounded-ds-lg border border-ds-border-subtle bg-ds-surface-raised p-1 shadow-ds-popover"
          >
            {children}
          </div>,
          document.body,
        );

  return (
    <>
      <span
        ref={anchorRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-0 w-0"
      />
      {toolbar}
    </>
  );
}

export function SlideEditorTopToolbar({
  slideCount,
  children,
}: {
  slideCount: number;
  children: ReactNode;
}) {
  return (
    <header
      data-slide-editor-chrome="true"
      className="flex items-center gap-2 border-b border-ds-border-subtle bg-ds-surface-chrome px-3 py-2 backdrop-blur"
    >
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-sm font-semibold text-ds-text-primary">
          Slide editor
        </h2>
        <span className="shrink-0 text-xs text-ds-text-muted">
          {slideCount} {slideCount === 1 ? "slide" : "slides"}
        </span>
      </div>
      {children}
    </header>
  );
}

export function SlideRail({
  open,
  contentMounted,
  onClosedTransitionEnd,
  children,
}: {
  open: boolean;
  contentMounted: boolean;
  onClosedTransitionEnd: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      aria-hidden={!open}
      onTransitionEnd={(event) => {
        if (event.currentTarget === event.target && !open) {
          onClosedTransitionEnd();
        }
      }}
      className={`shrink-0 overflow-hidden bg-ds-surface-sunken transition-[max-height,opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
        open
          ? "max-h-32 translate-y-0 opacity-100"
          : "max-h-0 translate-y-1 opacity-0"
      }`}
    >
      {contentMounted ? (
        <div
          className={`overflow-x-auto px-2 py-1 transition-opacity duration-150 ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {children}
        </div>
      ) : null}
    </aside>
  );
}

type ColorGradient = { from: string; to: string; angle?: number };

const SOLID_COLOR_OPTIONS: {
  id: string;
  label: string;
  color: string;
}[] = [
  { id: "black", label: "Black", color: "#050505" },
  { id: "graphite", label: "Graphite", color: "#525252" },
  { id: "ash", label: "Ash", color: "#737373" },
  { id: "stone", label: "Stone", color: "#a3a3a3" },
  { id: "silver", label: "Silver", color: "#b8b8b8" },
  { id: "mist", label: "Mist", color: "#d4d4d4" },
  { id: "white", label: "White", color: "#fbfbfb" },
  { id: "vermillion", label: "Vermillion", color: "#df4038" },
  { id: "coral", label: "Coral", color: "#df625d" },
  { id: "orchid", label: "Orchid", color: "#d662b8" },
  { id: "lilac", label: "Lilac", color: "#caa2e7" },
  { id: "violet", label: "Violet", color: "#ad6ddd" },
  { id: "iris", label: "Iris", color: "#7b5cf0" },
  { id: "royal", label: "Royal", color: "#512ddc" },
  { id: "fjord", label: "Fjord", color: "#5799af" },
  { id: "sky", label: "Sky", color: "#6dbbd5" },
  { id: "aqua", label: "Aqua", color: "#8bd6d8" },
  { id: "azure", label: "Azure", color: "#6aaef0" },
  { id: "periwinkle", label: "Periwinkle", color: "#6374ee" },
  { id: "cobalt", label: "Cobalt", color: "#3455ad" },
  { id: "indigo", label: "Indigo", color: "#24139b" },
  { id: "leaf", label: "Leaf", color: "#66ba69" },
  { id: "lime", label: "Lime", color: "#9bd363" },
  { id: "sprout", label: "Sprout", color: "#cbfb6f" },
  { id: "sun", label: "Sun", color: "#f6dc62" },
  { id: "sand", label: "Sand", color: "#efbf61" },
  { id: "apricot", label: "Apricot", color: "#e99350" },
  { id: "orange", label: "Orange", color: "#e5782e" },
];

const GRADIENT_COLOR_OPTIONS: {
  id: string;
  label: string;
  gradient: ColorGradient;
}[] = [
  {
    id: "black-gloss",
    label: "Black gloss",
    gradient: { from: "#050505", to: "#525252", angle: 90 },
  },
  {
    id: "mono-shine",
    label: "Mono shine",
    gradient: { from: "#0b0b0b", to: "#f5f5f5", angle: 90 },
  },
  {
    id: "pearl",
    label: "Pearl",
    gradient: { from: "#a8a8a8", to: "#f7f7f7", angle: 135 },
  },
  {
    id: "lime-pop",
    label: "Lime pop",
    gradient: { from: "#8bd548", to: "#daf56d", angle: 135 },
  },
  {
    id: "gold-night",
    label: "Gold night",
    gradient: { from: "#0f0d05", to: "#99741a", angle: 90 },
  },
  {
    id: "sunset-glow",
    label: "Sunset glow",
    gradient: { from: "#7c3f96", to: "#f5d64d", angle: 90 },
  },
  {
    id: "deep-violet",
    label: "Deep violet",
    gradient: { from: "#060a36", to: "#2514a0", angle: 135 },
  },
  {
    id: "frost",
    label: "Frost",
    gradient: { from: "#d4f8de", to: "#b9c8ff", angle: 135 },
  },
  {
    id: "ember",
    label: "Ember",
    gradient: { from: "#dd3f3a", to: "#ec9a4e", angle: 135 },
  },
  {
    id: "berry",
    label: "Berry",
    gradient: { from: "#d94d59", to: "#7b5cf0", angle: 135 },
  },
  {
    id: "candy",
    label: "Candy",
    gradient: { from: "#5b73f0", to: "#d45fc4", angle: 135 },
  },
  {
    id: "cosmic",
    label: "Cosmic",
    gradient: { from: "#2f58b8", to: "#8b4fda", angle: 135 },
  },
  {
    id: "aqua-pop",
    label: "Aqua pop",
    gradient: { from: "#7a5cf2", to: "#78d5dd", angle: 135 },
  },
  {
    id: "ocean",
    label: "Ocean",
    gradient: { from: "#70ced8", to: "#3455ad", angle: 135 },
  },
  {
    id: "rainforest",
    label: "Rainforest",
    gradient: { from: "#745cf0", to: "#58b96a", angle: 135 },
  },
  {
    id: "meadow",
    label: "Meadow",
    gradient: { from: "#5e9eaf", to: "#98d45f", angle: 135 },
  },
  {
    id: "sea-lime",
    label: "Sea lime",
    gradient: { from: "#63b7d6", to: "#e8df66", angle: 135 },
  },
  {
    id: "honey",
    label: "Honey",
    gradient: { from: "#f8d35a", to: "#ee9f51", angle: 135 },
  },
  {
    id: "peach",
    label: "Peach",
    gradient: { from: "#d95faa", to: "#f2d65d", angle: 135 },
  },
  {
    id: "blush",
    label: "Blush",
    gradient: { from: "#fff2a8", to: "#e5a7f0", angle: 135 },
  },
  {
    id: "sherbet",
    label: "Sherbet",
    gradient: { from: "#7b5cf0", to: "#e99350", angle: 135 },
  },
];

function gradientCss(gradient: ColorGradient): string {
  return `linear-gradient(${gradient.angle ?? 135}deg, ${gradient.from}, ${gradient.to})`;
}

function isCompleteHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function swatchColor(value: string, fallback: string): string {
  return isCompleteHexColor(value) ? value : fallback;
}

function SlideTemplatePreview({
  templateKind,
  selected,
  className = "h-16 w-28 shrink-0",
}: {
  templateKind: SlideTemplateKind;
  selected?: boolean;
  className?: string;
}) {
  const template = getBuiltInSlideTemplate(templateKind);
  return (
    <span
      aria-hidden="true"
      className={`relative block overflow-hidden rounded-ds-sm border border-ds-border-subtle bg-ds-surface-base ${className}`}
    >
      {template.elements.length ? (
        template.elements.map((element) => {
          const box = element.box as
            | { x: number; y: number; w: number; h: number }
            | undefined;
          if (!box) return null;
          const isTitle = element.role === "title";
          const isFooter = element.role === "footer";
          const isMedia = element.kind === "image" || element.kind === "visual";
          return (
            <span
              key={element.id}
              className={`absolute rounded-[2px] ${
                isTitle
                  ? "bg-ds-text-muted/60"
                  : isFooter
                    ? "bg-ds-border-subtle"
                    : isMedia
                      ? "bg-ds-accent-surface ring-1 ring-ds-accent-border"
                      : "bg-ds-surface-raised ring-1 ring-ds-border-subtle"
              }`}
              style={{
                left: `${box.x}%`,
                top: `${box.y}%`,
                width: `${box.w}%`,
                height: `${box.h}%`,
              }}
            />
          );
        })
      ) : (
        <span className="absolute inset-2 rounded-[2px] border border-dashed border-ds-border-subtle" />
      )}
      {selected ? (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ds-accent text-ds-text-on-accent shadow-sm">
          <Check size={11} aria-hidden="true" />
        </span>
      ) : null}
    </span>
  );
}

function templateDisplayName(kind: SlideTemplateKind | undefined): string {
  return (
    SLIDE_TEMPLATES.find((template) => template.kind === kind)?.label ??
    "Template"
  );
}

const TEXT_ROLE_LABELS: Record<PresentationRole, string> = {
  title: "Title",
  sectionTitle: "Section title",
  subtitle: "Subtitle",
  body: "Body",
  bullet: "Bullet",
  quote: "Quote",
  caption: "Caption",
  footer: "Footer",
  label: "Label",
  media: "Media",
  visual: "Visual",
  image: "Image",
  logo: "Logo",
  pageNumber: "Page number",
  background: "Background",
};

const SHAPE_INSERT_OPTIONS: ReadonlyArray<{ kind: ShapeKind; label: string }> =
  [
    { kind: "rect", label: "Rectangle" },
    { kind: "ellipse", label: "Ellipse" },
    { kind: "line", label: "Line" },
    { kind: "triangle", label: "Triangle" },
  ];

function textRoleIcon(role: PresentationRole): ReactNode {
  switch (role) {
    case "title":
      return <Heading1 size={16} aria-hidden="true" />;
    case "sectionTitle":
      return <Heading2 size={16} aria-hidden="true" />;
    case "subtitle":
      return <Heading size={16} aria-hidden="true" />;
    case "body":
      return <TextIcon size={16} aria-hidden="true" />;
    case "bullet":
      return <List size={16} aria-hidden="true" />;
    case "caption":
      return <Captions size={16} aria-hidden="true" />;
    case "footer":
      return <PanelBottom size={16} aria-hidden="true" />;
    case "label":
      return <Tag size={16} aria-hidden="true" />;
    case "quote":
      return <TextIcon size={16} aria-hidden="true" />;
    case "media":
    case "visual":
    case "image":
    case "logo":
    case "pageNumber":
    case "background":
      return <Tag size={16} aria-hidden="true" />;
  }
}

function shapeIcon(shape: ShapeKind): ReactNode {
  switch (shape) {
    case "rect":
      return <Square size={16} aria-hidden="true" />;
    case "ellipse":
      return (
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-full border-2 border-current"
        />
      );
    case "line":
      return <Minus size={16} aria-hidden="true" />;
    case "triangle":
      return (
        <span
          aria-hidden="true"
          className="h-0 w-0 border-x-[8px] border-b-[15px] border-x-transparent border-b-current"
        />
      );
  }
}

export function ColorThemePanel({
  activeSolidId,
  activeGradientId,
  onPickSolid,
  onPickGradient,
}: {
  activeSolidId?: string;
  activeGradientId?: string;
  onPickSolid: (color: string) => void;
  onPickGradient: (gradient: ColorGradient) => void;
}) {
  const [view, setView] = useState<"presets" | "customize">("presets");
  const [customMode, setCustomMode] = useState<"solid" | "gradient">("solid");
  const [customSolid, setCustomSolid] = useState("#2563eb");
  const [customGradientFrom, setCustomGradientFrom] = useState("#6366f1");
  const [customGradientTo, setCustomGradientTo] = useState("#ec4899");
  const [customGradientAngle, setCustomGradientAngle] = useState(135);
  const [activeGradientStop, setActiveGradientStop] = useState<"from" | "to">(
    "from",
  );

  const openCustomize = (mode: "solid" | "gradient") => {
    setCustomMode(mode);
    setView("customize");
  };

  if (view === "customize") {
    const solidPreview = swatchColor(customSolid, "#2563eb");
    const gradientFromPreview = swatchColor(customGradientFrom, "#6366f1");
    const gradientToPreview = swatchColor(customGradientTo, "#ec4899");
    const customGradient = {
      from: gradientFromPreview,
      to: gradientToPreview,
      angle: customGradientAngle,
    };

    return (
      <div className="flex w-[272px] flex-col gap-4 p-1">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setView("presets")}
            className={`flex h-7 items-center gap-1 rounded-ds-sm px-1.5 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-xs font-bold uppercase tracking-wide text-ds-text-muted">
            Customize
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Custom background type"
          className="grid grid-cols-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={customMode === "solid"}
            onClick={() => setCustomMode("solid")}
            className={`rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
              customMode === "solid"
                ? "bg-ds-accent-surface text-ds-accent-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            } ${FOCUS_RING}`}
          >
            Solid
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={customMode === "gradient"}
            onClick={() => setCustomMode("gradient")}
            className={`rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
              customMode === "gradient"
                ? "bg-ds-accent-surface text-ds-accent-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            } ${FOCUS_RING}`}
          >
            Gradient
          </button>
        </div>

        {customMode === "solid" ? (
          <div className="flex flex-col gap-3">
            <ColorPicker
              color={customSolid}
              onChange={setCustomSolid}
              aria-label="Custom solid color"
              fallback="#2563eb"
            />
            <button
              type="button"
              onClick={() => onPickSolid(solidPreview)}
              disabled={!isCompleteHexColor(customSolid)}
              className={`h-8 rounded-ds-md bg-ds-accent px-3 text-xs font-semibold text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              Apply solid color
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <span
              aria-hidden="true"
              className="block h-14 rounded-ds-md border border-ds-border-subtle shadow-sm"
              style={{ background: gradientCss(customGradient) }}
            />
            <div className="grid grid-cols-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-0.5">
              <button
                type="button"
                aria-pressed={activeGradientStop === "from"}
                onClick={() => setActiveGradientStop("from")}
                className={`flex items-center justify-center gap-1.5 rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
                  activeGradientStop === "from"
                    ? "bg-ds-accent-surface text-ds-accent-text"
                    : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
                } ${FOCUS_RING}`}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full border border-ds-border-subtle"
                  style={{ backgroundColor: gradientFromPreview }}
                />
                From
              </button>
              <button
                type="button"
                aria-pressed={activeGradientStop === "to"}
                onClick={() => setActiveGradientStop("to")}
                className={`flex items-center justify-center gap-1.5 rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
                  activeGradientStop === "to"
                    ? "bg-ds-accent-surface text-ds-accent-text"
                    : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
                } ${FOCUS_RING}`}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full border border-ds-border-subtle"
                  style={{ backgroundColor: gradientToPreview }}
                />
                To
              </button>
            </div>
            <ColorPicker
              color={
                activeGradientStop === "from"
                  ? customGradientFrom
                  : customGradientTo
              }
              onChange={
                activeGradientStop === "from"
                  ? setCustomGradientFrom
                  : setCustomGradientTo
              }
              aria-label={
                activeGradientStop === "from"
                  ? "Gradient start color"
                  : "Gradient end color"
              }
              fallback={activeGradientStop === "from" ? "#6366f1" : "#ec4899"}
            />
            <label className="flex items-center gap-3 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5">
              <span className="w-10 text-xs font-medium text-ds-text-secondary">
                Angle
              </span>
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={customGradientAngle}
                onChange={(event) =>
                  setCustomGradientAngle(Number(event.target.value))
                }
                className="min-w-0 flex-1 accent-ds-accent"
                aria-label="Gradient angle"
              />
              <span className="w-9 text-right text-xs tabular-nums text-ds-text-muted">
                {customGradientAngle}°
              </span>
            </label>
            <button
              type="button"
              onClick={() => onPickGradient(customGradient)}
              disabled={
                !isCompleteHexColor(customGradientFrom) ||
                !isCompleteHexColor(customGradientTo)
              }
              className={`h-8 rounded-ds-md bg-ds-accent px-3 text-xs font-semibold text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              Apply gradient
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-[272px] flex-col gap-5 p-1">
      <section aria-label="Solid color backgrounds">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Palette
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-ds-text-primary"
            />
            <h4 className="text-sm font-bold leading-none text-ds-text-primary">
              Default solid colors
            </h4>
          </div>
          <button
            type="button"
            onClick={() => openCustomize("solid")}
            className={`rounded-ds-sm px-1.5 py-1 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Customize
          </button>
        </div>
        <div className="grid grid-cols-7 gap-x-2 gap-y-3">
          {SOLID_COLOR_OPTIONS.map((option) => {
            const active = activeSolidId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-label={`Apply ${option.label} solid background to deck`}
                aria-pressed={active}
                onClick={() => onPickSolid(option.color)}
                title={option.label}
                className={`h-8 w-8 rounded-full border shadow-sm transition-transform hover:scale-105 ${
                  active
                    ? "border-ds-accent ring-2 ring-ds-accent ring-offset-2 ring-offset-ds-surface-overlay"
                    : "border-ds-border-subtle"
                } ${FOCUS_RING}`}
                style={{ backgroundColor: option.color }}
              />
            );
          })}
        </div>
      </section>

      <section aria-label="Gradient backgrounds">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-5 w-5 shrink-0 rounded-ds-sm border border-ds-text-primary p-0.5"
            >
              <span
                className="block h-full w-full rounded-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, #111827 0 33%, #737373 33% 66%, #f8fafc 66% 100%)",
                }}
              ></span>
            </span>
            <h4 className="text-sm font-bold leading-none text-ds-text-primary">
              Default gradient colors
            </h4>
          </div>
          <button
            type="button"
            onClick={() => openCustomize("gradient")}
            className={`rounded-ds-sm px-1.5 py-1 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Customize
          </button>
        </div>
        <div className="grid grid-cols-7 gap-x-2 gap-y-3">
          {GRADIENT_COLOR_OPTIONS.map((option) => {
            const active = activeGradientId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-label={`Apply ${option.label} gradient background to deck`}
                aria-pressed={active}
                onClick={() => onPickGradient(option.gradient)}
                title={option.label}
                className={`h-8 w-8 rounded-full border shadow-sm transition-transform hover:scale-105 ${
                  active
                    ? "border-ds-accent ring-2 ring-ds-accent ring-offset-2 ring-offset-ds-surface-overlay"
                    : "border-ds-border-subtle"
                } ${FOCUS_RING}`}
                style={{ background: gradientCss(option.gradient) }}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function SlideTemplatePicker({
  onPick,
}: {
  onPick: (kind: SlideTemplateKind) => void;
}) {
  return (
    <div
      role="menu"
      aria-label="Slide templates"
      className="rounded-ds-md bg-ds-surface-raised"
    >
      <div className="mb-3 flex items-center gap-2">
        <Plus
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-ds-text-primary"
        />
        <h4 className="text-sm font-bold leading-none text-ds-text-primary">
          Add slide
        </h4>
      </div>
      <div className="flex flex-col gap-1.5">
        {SLIDE_TEMPLATES.map((template) => (
          <button
            key={template.kind}
            type="button"
            role="menuitem"
            onClick={() => onPick(template.kind)}
            title={template.description}
            className={`group flex items-center gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-1.5 text-left transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover ${FOCUS_RING}`}
          >
            <TemplatePreview kind={template.kind} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-semibold leading-tight text-ds-text-primary">
                {template.label}
              </span>
              <span className="truncate text-[10px] leading-tight text-ds-text-muted">
                {template.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Bar used inside {@link TemplatePreview} to mock a line of slide content. */
function PreviewBar({ className = "" }: { className?: string }) {
  return (
    <span className={`block rounded-[1px] bg-ds-text-muted/40 ${className}`} />
  );
}

/**
 * A tiny 16:9 mock of each slide template, shown in the gallery so the
 * user recognises the structure at a glance instead of reading labels alone.
 */
function TemplatePreview({ kind }: { kind: SlideTemplateKind }) {
  return (
    <span
      aria-hidden
      className="block aspect-video w-14 shrink-0 overflow-hidden rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised"
    >
      {kind === "title" ? (
        <span className="flex h-full flex-col items-center justify-center gap-1 px-3">
          <PreviewBar className="h-1.5 w-3/4" />
          <PreviewBar className="h-1 w-1/2 bg-ds-text-muted/25" />
        </span>
      ) : null}
      {kind === "content" ? (
        <span className="flex h-full flex-col gap-1 p-2">
          <PreviewBar className="h-1.5 w-1/2" />
          <PreviewBar className="mt-0.5 h-1 w-full bg-ds-text-muted/25" />
          <PreviewBar className="h-1 w-5/6 bg-ds-text-muted/25" />
          <PreviewBar className="h-1 w-3/4 bg-ds-text-muted/25" />
        </span>
      ) : null}
      {kind === "visual" ? (
        <span className="flex h-full flex-col gap-1 p-1.5">
          <span className="block flex-1 rounded-[2px] bg-ds-text-muted/30" />
          <PreviewBar className="h-1 w-1/2 self-center bg-ds-text-muted/25" />
        </span>
      ) : null}
      {kind === "two-column" ? (
        <span className="flex h-full flex-col gap-1 p-2">
          <PreviewBar className="h-1.5 w-1/2" />
          <span className="flex flex-1 gap-1.5">
            <span className="flex flex-1 flex-col gap-1">
              <PreviewBar className="h-1 w-full bg-ds-text-muted/25" />
              <PreviewBar className="h-1 w-5/6 bg-ds-text-muted/25" />
            </span>
            <span className="flex flex-1 flex-col gap-1">
              <PreviewBar className="h-1 w-full bg-ds-text-muted/25" />
              <PreviewBar className="h-1 w-5/6 bg-ds-text-muted/25" />
            </span>
          </span>
        </span>
      ) : null}
      {kind === "blank" ? (
        <span className="flex h-full items-center justify-center">
          <span className="block h-3/4 w-5/6 rounded-[2px] border border-dashed border-ds-border-strong" />
        </span>
      ) : null}
    </span>
  );
}

export function InsertMenuButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-left text-xs font-semibold text-ds-text-secondary transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-ds-sm bg-ds-accent-surface text-ds-accent-text">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** Short accessible label for a document visual card. */
function fromDocVisualLabel(id: string, visual: Visual): string {
  const title = visual.title?.trim();
  if (title) return title;
  const kind = visual.type
    ? visual.type.charAt(0).toUpperCase() + visual.type.slice(1)
    : "Visual";
  return `${kind} · ${id.slice(0, 6)}`;
}

/**
 * The "From document" quick-insert panel (issue #293). Lists the document's
 * visuals and text as click-to-insert cards plus an "Add all visuals" action.
 * Each insert is routed through the editor's undoable `addElement` path; the
 * panel stays open after an insert so several items can be placed in a row.
 *
 * Issue #408/#410: When `staleLinks` is non-empty, a "Source links" section
 * is shown above the insert cards, listing each stale element with its reason
 * (changed vs orphaned/missing) and per-element actions (update, unlink/keep,
 * relink, remove). The panel never auto-deletes elements (#410).
 */
export function FromDocumentPanel({
  visuals,
  textItems,
  staleLinks = [],
  onAddAllVisuals,
  onInsertVisual,
  onInsertText,
  onUpdateFromSource,
  onUnlinkSource,
  onRelinkSource,
  onRemoveOrphaned,
  documentTextInsertables = [],
  documentVisualInsertables = [],
}: {
  visuals: readonly (readonly [string, Visual])[];
  textItems: readonly Extract<Insertable, { kind: "text" }>[];
  staleLinks?: StaleSourceLink[];
  onAddAllVisuals: () => void;
  onInsertVisual: (item: Extract<Insertable, { kind: "visual" }>) => void;
  onInsertText: (item: Extract<Insertable, { kind: "text" }>) => void;
  onUpdateFromSource?: (link: StaleSourceLink) => void;
  onUnlinkSource?: (link: StaleSourceLink) => void;
  onRelinkSource?: (
    link: StaleSourceLink,
    newBlockId: string,
    newContentHash: string,
  ) => void;
  onRemoveOrphaned?: (link: StaleSourceLink) => void;
  documentTextInsertables?: readonly Extract<Insertable, { kind: "text" }>[];
  documentVisualInsertables?: readonly Extract<
    Insertable,
    { kind: "visual" }
  >[];
}) {
  const hasVisuals = visuals.length > 0;
  const hasText = textItems.length > 0;
  const hasStale = staleLinks.length > 0;
  const changedLinks = staleLinks.filter((l) => l.reason === "content_changed");
  const missingLinks = staleLinks.filter((l) => l.reason === "block_missing");

  return (
    <div className="flex max-h-[70vh] flex-col rounded-ds-md bg-ds-surface-raised">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-ds-text-primary"
          />
          <h4 className="truncate text-sm font-bold leading-none text-ds-text-primary">
            From document
          </h4>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Stale source links section (#408 / #410) */}
        {hasStale ? (
          <section
            aria-label="Stale source links"
            className="border-b border-ds-border-subtle p-3"
          >
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ds-warning-text">
              Source links
            </h3>
            {changedLinks.length > 0 && (
              <div className="mb-2">
                <p className="mb-1.5 text-[11px] text-ds-text-muted">
                  Content changed
                </p>
                <ul className="flex flex-col gap-1">
                  {changedLinks.map((link) => (
                    <li
                      key={link.elementId}
                      className="flex items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ds-text-secondary">
                        {link.blockKind === "visual" ? "Visual" : "Text"} ·{" "}
                        {link.blockId.slice(0, 8)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateFromSource?.(link)}
                        aria-label="Update element from source"
                        title="Update from source"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        onClick={() => onUnlinkSource?.(link)}
                        aria-label="Unlink element from source"
                        title="Keep as manual (unlink)"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                      >
                        Unlink
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {missingLinks.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] text-ds-text-muted">
                  Orphaned (source deleted)
                </p>
                <ul className="flex flex-col gap-1">
                  {missingLinks.map((link) => (
                    <li
                      key={link.elementId}
                      className="flex items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ds-text-secondary">
                        {link.blockKind === "visual" ? "Visual" : "Text"} ·{" "}
                        {link.blockId.slice(0, 8)}
                      </span>
                      {/* Relink to a new block (visual or text) */}
                      {link.blockKind === "visual" &&
                        documentVisualInsertables.length > 0 && (
                          <select
                            aria-label="Relink to visual"
                            defaultValue=""
                            onChange={(e) => {
                              const item = documentVisualInsertables.find(
                                (i) => i.visualId === e.target.value,
                              );
                              if (item)
                                onRelinkSource?.(
                                  link,
                                  item.visualId,
                                  item.contentHash,
                                );
                            }}
                            className={`shrink-0 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1 py-0.5 text-[11px] text-ds-text-secondary ${FOCUS_RING}`}
                          >
                            <option value="" disabled>
                              Relink…
                            </option>
                            {documentVisualInsertables.map((i) => (
                              <option key={i.visualId} value={i.visualId}>
                                {i.visualId.slice(0, 8)}
                              </option>
                            ))}
                          </select>
                        )}
                      {link.blockKind === "text" &&
                        documentTextInsertables.length > 0 && (
                          <select
                            aria-label="Relink to text block"
                            defaultValue=""
                            onChange={(e) => {
                              const item = documentTextInsertables.find(
                                (i) => i.blockId === e.target.value,
                              );
                              if (item)
                                onRelinkSource?.(
                                  link,
                                  item.blockId!,
                                  item.contentHash,
                                );
                            }}
                            className={`shrink-0 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1 py-0.5 text-[11px] text-ds-text-secondary ${FOCUS_RING}`}
                          >
                            <option value="" disabled>
                              Relink…
                            </option>
                            {documentTextInsertables
                              .filter((i) => i.blockId !== undefined)
                              .map((i) => (
                                <option key={i.blockId} value={i.blockId}>
                                  {i.label}
                                </option>
                              ))}
                          </select>
                        )}
                      <button
                        type="button"
                        onClick={() => onUnlinkSource?.(link)}
                        aria-label="Keep element as manual (unlink from source)"
                        title="Keep as manual"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveOrphaned?.(link)}
                        aria-label="Remove orphaned element"
                        title="Remove element"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-error-text transition-colors hover:bg-ds-error-surface ${FOCUS_RING}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : null}

        {!hasVisuals && !hasText && !hasStale ? (
          <p className="px-3 py-8 text-center text-xs text-ds-text-muted">
            This document has no text or visuals yet. Add content in the
            document to reuse it on a slide.
          </p>
        ) : (
          <div className="p-3">
            {hasVisuals ? (
              <section aria-label="Document visuals">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ds-text-muted">
                    Visuals
                  </h3>
                  <button
                    type="button"
                    onClick={onAddAllVisuals}
                    className={`flex h-6 items-center gap-1 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2 text-[11px] font-semibold text-ds-text-secondary transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                  >
                    <Plus size={12} aria-hidden="true" />
                    Add all visuals
                  </button>
                </div>
                <ul className="grid grid-cols-2 gap-1.5">
                  {visuals.map(([id, visual]) => {
                    const insertable = documentVisualInsertables.find(
                      (i) => i.visualId === id,
                    ) ?? {
                      kind: "visual" as const,
                      visualId: id,
                      contentHash: "",
                    };
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => onInsertVisual(insertable)}
                          aria-label={`Insert ${fromDocVisualLabel(id, visual)}`}
                          title={fromDocVisualLabel(id, visual)}
                          className={`group flex w-full flex-col gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-1.5 text-left transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover ${FOCUS_RING}`}
                        >
                          <span className="flex aspect-video items-center justify-center overflow-hidden rounded-ds-sm bg-ds-surface-base">
                            <VisualRenderer
                              visual={visual}
                              className="h-full w-full object-contain"
                              transparentBackground
                            />
                          </span>
                          <span className="truncate text-[11px] text-ds-text-muted">
                            {fromDocVisualLabel(id, visual)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {hasText ? (
              <section
                aria-label="Document text"
                className={hasVisuals ? "mt-4" : ""}
              >
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ds-text-muted">
                  Text
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {textItems.map((item, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => onInsertText(item)}
                        aria-label={`Insert ${item.heading ? "heading" : "text"}: ${item.label}`}
                        title={item.text}
                        className={`flex w-full items-center gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-left transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover ${FOCUS_RING}`}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-ds-sm bg-ds-accent-surface text-ds-accent-text">
                          <Type size={13} aria-hidden="true" />
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate text-xs ${
                            item.heading
                              ? "font-semibold text-ds-text-primary"
                              : "text-ds-text-secondary"
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function SlideSelectionToolbar({
  selectedElement,
  selectedIds,
  selectedCount,
  theme,
  brandSwatches,
  onUpdateElement,
  onOpenPanel,
  onDuplicateElement,
  onRemoveElement,
  onBringToFront,
  onSendToBack,
  onAlignSelected,
  onDistributeSelected,
  onMatchSizeSelected,
  onArrangeSelected,
  onGroupSelected,
  onUngroupSelected,
  onDuplicateSelected,
  onRemoveSelected,
  onReplaceImage,
  onReplaceVisual,
  onRestyleVisual,
  selectedGroupId,
  isEditingText = false,
  compact,
}: {
  selectedElement: SlideElement | null;
  selectedIds: readonly string[];
  selectedCount: number;
  theme: SlideThemeColors;
  brandSwatches: readonly string[];
  onUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
  onOpenPanel: (tab: RightPanelTab) => void;
  onDuplicateElement: (id: string) => void;
  onRemoveElement: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onAlignSelected: (mode: AlignMode) => void;
  onDistributeSelected: (mode: DistributeMode) => void;
  onMatchSizeSelected: (mode: MatchSizeMode) => void;
  onArrangeSelected: (mode: ArrangeMode) => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onDuplicateSelected: () => void;
  onRemoveSelected: () => void;
  onReplaceImage: (id: string) => void;
  onReplaceVisual: (id: string) => void;
  onRestyleVisual: (id: string) => void;
  selectedGroupId?: string | null;
  isEditingText?: boolean;
  compact: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const visible = isSelectionToolbarVisible({
    hasSelectedElement: selectedElement !== null,
    selectedCount,
  });
  if (!visible) {
    return null;
  }
  const showRich =
    selectedElement !== null &&
    shouldShowRichToolbarControls({
      hasSelectedElement: selectedElement !== null,
      selectedCount,
    });
  const selectionKind =
    selectedElement !== null
      ? toToolbarSelectionKind(
          selectedElement.kind,
          selectedElement.kind === "shape"
            ? shapeContent(selectedElement).shape
            : undefined,
        )
      : null;
  // Same availability calculation as the right-panel switcher so a toolbar
  // hand-off always opens a panel that can render (slide-editor-panel-taxonomy.md).
  const panels = availablePanels({
    kind: selectedCount >= 2 ? null : selectionKind,
    selectedCount,
    hasSourceRef:
      (selectedElement as { source?: unknown } | null)?.source !== undefined,
  });
  const hasMultiSelection = selectedIds.length >= 2;
  const withToolbarPanelsClosed = (onClick: () => void) => () => {
    setMoreOpen(false);
    onClick();
  };
  const iconButton = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    disabled = false,
  ) => (
    <ToolbarButton
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={withToolbarPanelsClosed(onClick)}
    >
      {icon}
    </ToolbarButton>
  );
  const menuItem = (label: string, icon: ReactNode, onClick: () => void) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        onClick();
        setMoreOpen(false);
      }}
      className={`flex items-center gap-2 rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <StageFloatingToolbar
      ariaLabel="Selected slide element tools"
      keepSelection={isEditingText}
    >
      {hasMultiSelection ? (
        <>
          <span className="shrink-0 px-2 text-xs font-semibold text-ds-text-primary">
            {selectedIds.length} selected
          </span>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />
          {iconButton(
            "Align left",
            <AlignLeft size={14} aria-hidden="true" />,
            () => onAlignSelected("left"),
          )}
          {iconButton(
            "Align center",
            <AlignCenter size={14} aria-hidden="true" />,
            () => onAlignSelected("hcenter"),
          )}
          {iconButton(
            "Align right",
            <AlignRight size={14} aria-hidden="true" />,
            () => onAlignSelected("right"),
          )}
          {iconButton(
            "Align top",
            <AlignStartVertical size={14} aria-hidden="true" />,
            () => onAlignSelected("top"),
          )}
          {iconButton(
            "Align middle",
            <AlignCenterVertical size={14} aria-hidden="true" />,
            () => onAlignSelected("vmiddle"),
          )}
          {iconButton(
            "Align bottom",
            <AlignEndVertical size={14} aria-hidden="true" />,
            () => onAlignSelected("bottom"),
          )}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />
          {iconButton(
            "Distribute horizontally",
            <AlignHorizontalDistributeCenter size={14} aria-hidden="true" />,
            () => onDistributeSelected("horizontal"),
            selectedIds.length < 3,
          )}
          {iconButton(
            "Distribute vertically",
            <AlignVerticalDistributeCenter size={14} aria-hidden="true" />,
            () => onDistributeSelected("vertical"),
            selectedIds.length < 3,
          )}
          {iconButton(
            "Match width",
            <Maximize2 size={14} aria-hidden="true" />,
            () => onMatchSizeSelected("width"),
          )}
          {iconButton(
            "Match height",
            <Maximize2 size={14} aria-hidden="true" className="rotate-90" />,
            () => onMatchSizeSelected("height"),
          )}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />
          {iconButton(
            "Bring selection to front",
            <BringToFront size={14} aria-hidden="true" />,
            () => onArrangeSelected("front"),
          )}
          {iconButton(
            "Send selection to back",
            <SendToBack size={14} aria-hidden="true" />,
            () => onArrangeSelected("back"),
          )}
          {iconButton(
            selectedGroupId ? "Ungroup selection" : "Group selection",
            selectedGroupId ? (
              <Ungroup size={14} aria-hidden="true" />
            ) : (
              <Group size={14} aria-hidden="true" />
            ),
            selectedGroupId ? onUngroupSelected : onGroupSelected,
          )}
          {iconButton(
            "Duplicate selection",
            <Copy size={14} aria-hidden="true" />,
            onDuplicateSelected,
          )}
          {iconButton(
            "Delete selection",
            <Trash2 size={14} aria-hidden="true" />,
            onRemoveSelected,
          )}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />
        </>
      ) : null}
      {showRich && selectedElement ? (
        <ElementToolbarContent
          element={selectedElement}
          tc={theme}
          brandSwatches={brandSwatches}
          onUpdateElement={onUpdateElement}
          onDuplicate={withToolbarPanelsClosed(() =>
            onDuplicateElement(selectedElement.id),
          )}
          onBringToFront={withToolbarPanelsClosed(() =>
            onBringToFront(selectedElement.id),
          )}
          onSendToBack={withToolbarPanelsClosed(() =>
            onSendToBack(selectedElement.id),
          )}
          onRemove={withToolbarPanelsClosed(() =>
            onRemoveElement(selectedElement.id),
          )}
          hideObjectActions={isEditingText}
          compact={compact}
        />
      ) : null}
      {showRich && selectedElement?.kind === "image" ? (
        <>
          {iconButton(
            "Replace image",
            <Replace size={14} aria-hidden="true" />,
            () => onReplaceImage(selectedElement.id),
          )}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />
        </>
      ) : null}
      {showRich && selectedElement?.kind === "visual" ? (
        <>
          {iconButton(
            "Replace visual",
            <Replace size={14} aria-hidden="true" />,
            () => onReplaceVisual(selectedElement.id),
          )}
          {iconButton(
            "Restyle visual",
            <Paintbrush size={14} aria-hidden="true" />,
            () => onRestyleVisual(selectedElement.id),
          )}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />
        </>
      ) : null}
      {showRich ? (
        <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />
      ) : null}
      <Popover
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        aria-label="More element actions"
        placement="bottom"
        portal
        layer="tooltip"
        className="w-48 p-1"
        trigger={
          <ToolbarButton
            aria-label="More actions"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </ToolbarButton>
        }
      >
        <div className="flex flex-col">
          {compact && showRich && selectedElement && !isEditingText ? (
            <>
              {menuItem(
                "Bring to front",
                <BringToFront size={14} aria-hidden="true" />,
                () => onBringToFront(selectedElement.id),
              )}
              {menuItem(
                "Send to back",
                <SendToBack size={14} aria-hidden="true" />,
                () => onSendToBack(selectedElement.id),
              )}
              <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
            </>
          ) : null}
          {showRich && selectedElement?.kind === "image"
            ? menuItem(
                "Crop image",
                <Crop size={14} aria-hidden="true" />,
                () => onOpenPanel("appearance"),
              )
            : null}
          {panels.map((panel) => {
            const connectorAppearance =
              panel === "appearance" && selectedElement?.kind === "connector";
            const label = connectorAppearance
              ? "Line settings"
              : panel === "layers"
                ? "Layers"
                : `${PANEL_LABELS[panel]} settings`;
            const icon = connectorAppearance
              ? PANEL_MENU_ICONS.line
              : PANEL_MENU_ICONS[panel];
            return (
              <Fragment key={panel}>
                {menuItem(label, icon, () => onOpenPanel(panel))}
              </Fragment>
            );
          })}
        </div>
      </Popover>
    </StageFloatingToolbar>
  );
}

export function SlideToolbar({
  slide,
  templates,
  selectedTemplateId,
  canDelete,
  onSelectTemplate,
  onBackgroundChange,
  onBackgroundGradientChange,
  onAddElement,
  visuals,
  imageError,
  onPickVisual,
  onDuplicateSlide,
  onRemoveSlide,
  onOpenPanel,
}: {
  slide: Slide;
  templates: readonly SlideTemplateOption[];
  selectedTemplateId: SlideTemplateKind;
  canDelete: boolean;
  onSelectTemplate: (templateId: SlideTemplateKind) => void;
  onBackgroundChange: (color: string | undefined) => void;
  onBackgroundGradientChange: (gradient: ColorGradient | undefined) => void;
  onAddElement: (kind: AddElementKind, shapeKind?: ShapeKind) => void;
  visuals: ReadonlyMap<string, Visual>;
  imageError?: string | null;
  onPickVisual: (visualId: string) => void;
  onDuplicateSlide: () => void;
  onRemoveSlide: () => void;
  onOpenPanel: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addVisualOpen, setAddVisualOpen] = useState(false);
  const [addTab, setAddTab] = useState<"text" | "media" | "shape">("text");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const selectedTemplate =
    templates.find((template) => template.kind === selectedTemplateId) ??
    templates[0];
  const backgroundImage = slideBackgroundImageValue(slide);
  const backgroundGradient = slideBackgroundGradientValue(slide);
  const backgroundColor = slideSolidBackgroundValue(slide);
  const activeSolidId =
    backgroundImage === undefined && backgroundGradient === undefined
      ? SOLID_COLOR_OPTIONS.find((option) => option.color === backgroundColor)
          ?.id
      : undefined;
  const activeGradientId =
    backgroundImage === undefined && backgroundColor === undefined
      ? GRADIENT_COLOR_OPTIONS.find(
          (option) =>
            option.gradient.from === backgroundGradient?.from &&
            option.gradient.to === backgroundGradient?.to,
        )?.id
      : undefined;
  const closeToolbarPanels = (
    keep?: "add" | "template" | "background" | "more",
  ) => {
    if (keep !== "add") {
      setAddOpen(false);
      setAddVisualOpen(false);
    }
    if (keep !== "template") setTemplateOpen(false);
    if (keep !== "background") setBackgroundOpen(false);
    if (keep !== "more") setMoreOpen(false);
  };
  const closeAddMenu = () => closeToolbarPanels();
  const moreMenuItem = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
  ) => (
    <button
      type="button"
      onClick={() => {
        onClick();
        setMoreOpen(false);
      }}
      className={`flex items-center gap-2 rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
    >
      {icon}
      {label}
    </button>
  );
  const addTile = (item: {
    key: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    keepOpen?: boolean;
  }) => (
    <Tooltip key={item.key} label={item.label} side="top">
      <button
        type="button"
        aria-label={item.label}
        onClick={() => {
          item.onClick();
          if (!item.keepOpen) closeAddMenu();
        }}
        className={`flex aspect-square w-full items-center justify-center rounded-ds-sm border border-ds-border-subtle bg-ds-surface text-ds-text-secondary transition-colors hover:border-ds-accent-border hover:bg-ds-accent-surface hover:text-ds-accent ${FOCUS_RING}`}
      >
        <span className="flex h-5 w-5 items-center justify-center">
          {item.icon}
        </span>
      </button>
    </Tooltip>
  );
  const textItems = PRESENTATION_ROLES.map((role) => ({
    key: role,
    label: TEXT_ROLE_LABELS[role],
    icon: textRoleIcon(role),
    onClick: () => onAddElement(role),
  }));
  const mediaItems = [
    {
      key: "image",
      label: "Image",
      icon: <ImageIcon size={16} aria-hidden="true" />,
      onClick: () => onAddElement("image"),
    },
    {
      key: "visual",
      label: "Visual",
      icon: <Sparkles size={16} aria-hidden="true" />,
      onClick: () => setAddVisualOpen(true),
      keepOpen: true,
    },
  ];
  const shapeItems = SHAPE_INSERT_OPTIONS.map((option) => ({
    key: option.kind,
    label: option.label,
    icon: shapeIcon(option.kind),
    onClick: () => onAddElement("shape", option.kind),
  }));
  const addTabs = [
    { id: "text" as const, label: "Text", items: textItems },
    { id: "media" as const, label: "Media", items: mediaItems },
    { id: "shape" as const, label: "Shapes", items: shapeItems },
  ];
  const activeAddItems =
    addTabs.find((tab) => tab.id === addTab)?.items ?? textItems;
  const addTriggerButton = (
    <ToolbarButton
      aria-label="Add element"
      aria-haspopup="dialog"
      aria-expanded={addOpen || addVisualOpen}
      onClick={() => {
        const nextOpen = !(addOpen || addVisualOpen);
        closeToolbarPanels();
        setAddOpen(nextOpen);
      }}
    >
      <Plus size={14} aria-hidden="true" />
    </ToolbarButton>
  );
  const backgroundTriggerButton = (
    <ToolbarButton
      aria-label="Slide background"
      aria-haspopup="dialog"
      aria-expanded={backgroundOpen}
      onClick={() => {
        const nextOpen = !backgroundOpen;
        closeToolbarPanels();
        setBackgroundOpen(nextOpen);
      }}
    >
      <Palette size={14} aria-hidden="true" />
    </ToolbarButton>
  );
  const templateTriggerButton = (
    <ToolbarButton
      aria-label="Slide template"
      aria-haspopup="dialog"
      aria-expanded={templateOpen}
      onClick={() => {
        const nextOpen = !templateOpen;
        closeToolbarPanels();
        setTemplateOpen(nextOpen);
      }}
    >
      <Columns3 size={14} aria-hidden="true" />
    </ToolbarButton>
  );

  return (
    <StageFloatingToolbar ariaLabel="Slide tools">
      <Popover
        open={addOpen || addVisualOpen}
        onClose={closeAddMenu}
        aria-label="Add element"
        placement="bottom"
        align="center"
        anchor="toolbar"
        portal
        layer="tooltip"
        className="w-[320px] p-0 text-xs"
        trigger={
          addOpen || addVisualOpen ? (
            addTriggerButton
          ) : (
            <Tooltip label="Add element" side="bottom">
              {addTriggerButton}
            </Tooltip>
          )
        }
      >
        {addVisualOpen ? (
          <VisualPicker
            className="w-full p-3"
            visuals={visuals}
            onPick={(visualId) => {
              onPickVisual(visualId);
              closeAddMenu();
            }}
            onClose={() => setAddVisualOpen(false)}
          />
        ) : (
          <div className="flex flex-col">
            <div
              role="tablist"
              aria-label="Element category"
              className="flex gap-1 border-b border-ds-border-subtle px-2 py-1.5"
            >
              {addTabs.map((tab) => {
                const selected = tab.id === addTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setAddTab(tab.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-ds-sm px-2 py-1.5 text-xs font-semibold transition-colors ${
                      selected
                        ? "bg-ds-accent-surface text-ds-accent"
                        : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
                    } ${FOCUS_RING}`}
                  >
                    {tab.label}
                    <span className="rounded-full bg-ds-surface-raised px-1.5 text-[10px] text-ds-text-muted">
                      {tab.items.length}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              role="tabpanel"
              className="grid max-h-[min(28rem,calc(100vh-9rem))] grid-cols-5 gap-1.5 overflow-y-auto p-2"
            >
              {activeAddItems.map(addTile)}
            </div>
            {imageError ? (
              <p role="alert" className="px-3 pb-3 text-xs text-ds-danger-text">
                {imageError}
              </p>
            ) : null}
          </div>
        )}
      </Popover>

      <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />

      <Popover
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        aria-label="Slide template"
        placement="bottom"
        align="center"
        anchor="toolbar"
        portal
        layer="tooltip"
        className="w-[336px] p-2.5 text-xs"
        trigger={
          templateOpen ? (
            templateTriggerButton
          ) : (
            <Tooltip
              label={`Template: ${templateDisplayName(selectedTemplate?.kind)}`}
              side="bottom"
            >
              {templateTriggerButton}
            </Tooltip>
          )
        }
      >
        <div className="grid max-h-[min(24rem,calc(100vh-9rem))] grid-cols-2 gap-1.5 overflow-y-auto">
          {templates.map((template) => {
            const selected = template.kind === selectedTemplate?.kind;
            return (
              <button
                key={template.kind}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onSelectTemplate(template.kind);
                  setTemplateOpen(false);
                }}
                className={`relative rounded-ds-md border bg-ds-surface p-1.5 text-left transition-colors ${
                  selected
                    ? "border-ds-accent-border bg-ds-accent-surface text-ds-text-primary shadow-sm ring-1 ring-ds-accent-border"
                    : "border-ds-border-subtle text-ds-text-secondary hover:border-ds-border-strong hover:bg-ds-state-hover hover:text-ds-text-primary"
                } ${FOCUS_RING}`}
              >
                <SlideTemplatePreview
                  templateKind={template.kind}
                  selected={selected}
                  className="h-20 w-full"
                />
                <span className="mt-1.5 block text-xs font-semibold leading-tight text-ds-text-primary">
                  {template.label}
                </span>
              </button>
            );
          })}
        </div>
      </Popover>

      <Popover
        open={backgroundOpen}
        onClose={() => setBackgroundOpen(false)}
        aria-label="Slide background"
        placement="bottom"
        align="center"
        anchor="toolbar"
        portal
        layer="tooltip"
        className="w-[300px] p-3 text-xs"
        trigger={
          backgroundOpen ? (
            backgroundTriggerButton
          ) : (
            <Tooltip label="Background" side="bottom">
              {backgroundTriggerButton}
            </Tooltip>
          )
        }
      >
        <ColorThemePanel
          activeSolidId={activeSolidId}
          activeGradientId={activeGradientId}
          onPickSolid={(color) => {
            onBackgroundGradientChange(undefined);
            onBackgroundChange(color);
          }}
          onPickGradient={(gradient) => {
            onBackgroundChange(undefined);
            onBackgroundGradientChange(gradient);
          }}
        />
      </Popover>

      <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />

      <Tooltip label="Duplicate slide" side="bottom">
        <ToolbarButton
          aria-label="Duplicate slide"
          onClick={() => {
            closeToolbarPanels();
            onDuplicateSlide();
          }}
        >
          <Copy size={14} aria-hidden="true" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="Delete slide" side="bottom">
        <ToolbarButton
          aria-label="Delete slide"
          disabled={!canDelete}
          onClick={() => {
            closeToolbarPanels();
            onRemoveSlide();
          }}
        >
          <Trash2 size={14} aria-hidden="true" />
        </ToolbarButton>
      </Tooltip>

      <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border-subtle" />
      <Popover
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        aria-label="More slide actions"
        placement="bottom"
        portal
        layer="tooltip"
        className="w-44 p-1"
        trigger={
          <ToolbarButton
            aria-label="More actions"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => {
              const nextOpen = !moreOpen;
              closeToolbarPanels();
              setMoreOpen(nextOpen);
            }}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </ToolbarButton>
        }
      >
        <div className="flex flex-col">
          {moreMenuItem(
            "Open properties panel",
            <LayoutPanelLeft size={14} aria-hidden="true" />,
            onOpenPanel,
          )}
        </div>
      </Popover>
    </StageFloatingToolbar>
  );
}

export function SlideBottomDock({
  railOpen,
  notesOpen,
  zoom,
  zoomMenuOpen,
  slideLabel,
  onToggleRail,
  onOpenNotes,
  onZoomChange,
  onZoomMenuOpenChange,
}: {
  railOpen: boolean;
  notesOpen: boolean;
  zoom: number;
  zoomMenuOpen: boolean;
  slideLabel: string;
  onToggleRail: () => void;
  onOpenNotes: () => void;
  onZoomChange: (zoom: number) => void;
  onZoomMenuOpenChange: (open: boolean) => void;
}) {
  const zoomPercent = zoomToPercent(zoom);
  const setZoomPercent = (percent: number) => {
    onZoomChange(percent / 100);
    onZoomMenuOpenChange(false);
  };
  // Descending order (largest first) to match the zoom menu in the mockup.
  const presets = [...ZOOM_PERCENT_PRESETS].sort((a, b) => b - a);

  return (
    <div className="shrink-0 bg-ds-surface-sunken">
      <div className="flex min-h-10 items-center justify-center gap-1.5 px-2 py-1">
        <Tooltip
          label={railOpen ? "Hide slide thumbnails" : "Show slide thumbnails"}
          side="top"
        >
          <button
            type="button"
            aria-label={
              railOpen ? "Hide slide thumbnails" : "Show slide thumbnails"
            }
            aria-pressed={railOpen}
            onClick={onToggleRail}
            className={`flex h-8 items-center gap-1.5 rounded-ds-md px-2 text-xs font-semibold transition-colors ${
              railOpen
                ? "bg-ds-accent-surface text-ds-accent-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            } ${FOCUS_RING}`}
          >
            <LayoutPanelLeft size={14} aria-hidden="true" />
            Slides
          </button>
        </Tooltip>
        <button
          type="button"
          aria-pressed={notesOpen}
          onClick={onOpenNotes}
          className={`flex h-8 items-center rounded-ds-md px-2 text-xs font-semibold transition-colors ${
            notesOpen
              ? "bg-ds-accent-surface text-ds-accent-text"
              : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
          } ${FOCUS_RING}`}
        >
          Notes
        </button>
        <span className="hidden truncate text-xs font-medium text-ds-text-muted sm:inline">
          {slideLabel}
        </span>
        <div className="mx-1 h-5 w-px bg-ds-border-subtle" aria-hidden="true" />
        <input
          type="range"
          min={25}
          max={200}
          step={5}
          value={zoomPercent}
          onChange={(event) => onZoomChange(Number(event.target.value) / 100)}
          aria-label="Slide zoom"
          className="w-32 accent-ds-accent"
        />
        <Popover
          open={zoomMenuOpen}
          onClose={() => onZoomMenuOpenChange(false)}
          aria-label="Zoom presets"
          placement="top"
          className="w-16 p-1"
          trigger={
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={zoomMenuOpen}
              onClick={() => onZoomMenuOpenChange(!zoomMenuOpen)}
              className={`h-8 min-w-14 rounded-ds-md px-2 text-xs font-semibold tabular-nums text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              {zoomPercent}%
            </button>
          }
        >
          <div className="flex flex-col">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setZoomPercent(preset)}
                className={`rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${
                  preset === zoomPercent
                    ? "bg-ds-state-hover text-ds-text-primary"
                    : "text-ds-text-secondary"
                } ${FOCUS_RING}`}
              >
                {preset}%
              </button>
            ))}
            <div className="my-1 border-t border-ds-border-subtle" />
            <button
              type="button"
              onClick={() => setZoomPercent(100)}
              className={`rounded-ds-sm px-2 py-1.5 text-left text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              Fit
            </button>
          </div>
        </Popover>
      </div>
    </div>
  );
}

export function SlideSizeControl({
  value,
  onChange,
}: {
  value: SlideFormat;
  onChange: (format: SlideFormat) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-1">
      <span className="px-1 text-xs font-medium text-ds-text-muted">Size</span>
      <div role="radiogroup" aria-label="Slide size" className="flex gap-0.5">
        {SLIDE_FORMATS.map((format) => {
          const active = value === format;
          const config = slideFormatConfig(format);
          return (
            <button
              key={format}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={config.label}
              onClick={() => onChange(format)}
              className={`rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              } ${FOCUS_RING}`}
            >
              {format}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A single icon button in a thumbnail's hover/focus action cluster
 * (move ↑/↓, duplicate, delete). Reuses the `VisualCard` hover-action pattern —
 * a round glass button revealed on group hover — but each is a real `<button>`
 * with an `aria-label` and a focus-visible ring so the rail's slide-management
 * actions are fully keyboard-accessible (issue #212).
 */
export function ThumbnailAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`tiq-touch-target flex h-6 w-6 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-glass text-ds-text-muted shadow-sm backdrop-blur-sm transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:pointer-events-none disabled:opacity-40 ${FOCUS_RING}`}
    >
      {icon}
    </button>
  );
}

/**
 * Modal summary shown before a "Sync from document" merge is applied. Lists the
 * per-slide before/after effect (updated / appended / preserved) so the user
 * sees exactly what will change — and that no manual element work is discarded —
 * before confirming. Pure presentation: all merge logic lives in `deck-merge`.
 */
export function MergeSummaryDialog({
  summary,
  onApply,
  onCancel,
}: {
  summary: MergeSummary;
  onApply: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const KIND_LABEL: Record<string, string> = {
    updated: "Updated",
    appended: "New",
    preserved: "Kept",
  };
  const hasChanges = summary.updatedCount > 0 || summary.appendedCount > 0;

  return createPortal(
    <div
      ref={dialogRef}
      data-floating-panel="true"
      role="dialog"
      aria-modal="true"
      aria-label="Sync from document"
      className="fixed inset-0 z-modal flex items-center justify-center bg-ds-backdrop p-4"
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-ds-lg border border-ds-border-subtle bg-ds-surface-base shadow-lg">
        <div className="flex items-center justify-between border-b border-ds-border-subtle px-5 py-4">
          <h3 className="text-sm font-semibold text-ds-text-primary">
            Sync from document
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel sync"
            className={`flex h-7 w-7 items-center justify-center rounded-ds-md text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-ds-border-subtle px-5 py-3 text-xs text-ds-text-secondary">
          <p>
            {summary.updatedCount} updated · {summary.appendedCount} new ·{" "}
            {summary.preservedCount} kept · {summary.preservedElementCount}{" "}
            element{summary.preservedElementCount === 1 ? "" : "s"} preserved
          </p>
          {!hasChanges ? (
            <p className="mt-1 text-ds-text-muted">
              This deck already matches the document.
            </p>
          ) : null}
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-ds-border-subtle overflow-y-auto px-5 py-2 text-xs">
          {summary.changes.map((change) => (
            <li
              key={`${change.kind}-${change.index}`}
              className="flex items-center gap-3 py-2"
            >
              <span
                className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  change.kind === "updated"
                    ? "bg-ds-warning-surface text-ds-warning-text"
                    : change.kind === "appended"
                      ? "bg-ds-success-surface text-ds-success-text"
                      : "bg-ds-state-hover text-ds-text-muted"
                }`}
              >
                {KIND_LABEL[change.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-ds-text-primary">
                {change.after.title || "(untitled slide)"}
              </span>
              <span className="shrink-0 text-ds-text-muted">
                {change.after.bulletCount} bullet
                {change.after.bulletCount === 1 ? "" : "s"}
                {change.elementsPreserved > 0
                  ? ` · ${change.elementsPreserved} kept`
                  : ""}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2 border-t border-ds-border-subtle px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className={`flex h-8 items-center rounded-ds-md border border-ds-border-subtle px-3 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!hasChanges}
            className={`flex h-8 items-center rounded-ds-md bg-ds-accent px-3 text-sm font-medium text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:opacity-60 ${FOCUS_RING}`}
          >
            Apply changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
