/** Visual schema constants, types, and enum guards. */

export const VISUAL_SCHEMA_VERSION = 1 as const;

export const VISUAL_KINDS = [
  "flowchart",
  "mindmap",
  "list",
  "chart",
  "concept",
  "timeline",
  "cycle",
  "comparison",
  "funnel",
  "venn",
  "pyramid",
  "matrix",
  "orgchart",
] as const;

export type VisualKind = (typeof VISUAL_KINDS)[number];

/**
 * Persisted visual-type values stored in `Visual.type` (a `String` column).
 *
 * This is the uppercase form of `VisualKind` and replaces the generated Prisma
 * `VisualType` enum so the schema stays portable across Postgres and SQLite.
 */
export type VisualType = Uppercase<VisualKind>;

export const NODE_SHAPES = [
  "rectangle",
  "rounded",
  "pill",
  "ellipse",
  "diamond",
  "hexagon",
] as const;

export type NodeShape = (typeof NODE_SHAPES)[number];

/** Connector line styles. `straight` is the default. */
export const EDGE_STYLES = [
  "straight",
  "curved",
] as const; /* node:coverage disable */

export type EdgeStyle = (typeof EDGE_STYLES)[number];

/** Arrowhead rendering variants. `filled` is the default closed triangle. */
export const ARROW_STYLES = ["filled", "open", "circle", "diamond"] as const;

export type ArrowStyle = (typeof ARROW_STYLES)[number];

/** Stroke pattern for edges or node borders. */
export const LINE_STYLES = ["solid", "dashed", "dotted"] as const;

export type LineStyle = (typeof LINE_STYLES)[number]; /* node:coverage enable */

/** Node fill rendering mode. `solid` is a flat fill; `gradient` adds a subtle
 * top-to-bottom highlight derived from the node fill color. */
export const FILL_STYLES = ["solid", "gradient"] as const;

export type FillStyle = (typeof FILL_STYLES)[number];

/** Horizontal text alignment within a node label. */
export const TEXT_ALIGNS = ["left", "center", "right"] as const;

export type TextAlign = (typeof TEXT_ALIGNS)[number];

/**
 * Persisted visual export preference for per-visual export letterboxing.
 * `"auto"` keeps natural dimensions.
 */
export const ASPECT_RATIO_PRESETS = [
  "16:9",
  "1:1",
  "4:5",
  "9:16",
  "auto",
] as const;

export type AspectRatioPreset = (typeof ASPECT_RATIO_PRESETS)[number];

/** Canvas background style. `"blank"` is a solid fill; `"ruled"` adds horizontal
 * guide lines; `"dot-grid"` adds a dot-matrix grid. */
export const CANVAS_STYLES = ["blank", "ruled", "dot-grid"] as const;

export type CanvasStyle = (typeof CANVAS_STYLES)[number];

// ---------------------------------------------------------------------------
// Visual Effects
// ---------------------------------------------------------------------------

/** The supported visual effect kinds. Designed to be extended (texture, glow, etc.). */
export const EFFECT_KINDS = ["shadow", "sketch"] as const;

export type EffectKind = (typeof EFFECT_KINDS)[number];

/** A drop-shadow effect rendered via SVG `<feDropShadow>`. */
export interface ShadowEffect {
  kind: "shadow";
  /** Horizontal shadow offset in canvas units. Default 4. */
  dx?: number;
  /** Vertical shadow offset in canvas units. Default 4. */
  dy?: number;
  /** Blur standard deviation. Default 4. */
  blur?: number;
  /** CSS color for the shadow. Default `"rgba(0,0,0,0.3)"`. */
  color?: string;
}

/**
 * A hand-drawn / sketch look rendered via SVG `<feTurbulence>` +
 * `<feDisplacementMap>`. Applies a subtle jitter to all strokes and fills.
 */
export interface SketchEffect {
  kind: "sketch";
  /** `feTurbulence` baseFrequency. Controls the coarseness of the jitter. Default 0.04. */
  frequency?: number;
  /** `feDisplacementMap` scale. Controls the amplitude of the jitter. Default 3. */
  scale?: number;
}

/** A discriminated union of all supported visual effects. */
export type VisualEffect = ShadowEffect | SketchEffect;

export function isEffectKind(value: unknown): value is EffectKind {
  return (
    typeof value === "string" &&
    (EFFECT_KINDS as readonly string[]).includes(value)
  );
}

/** A single node. `x`/`y` are the node **center** in canvas coordinates. */
export interface VisualNode {
  id: string;
  label: string;
  /** Center X (used by positioned types: flowchart, mindmap, concept). */
  x?: number;
  /** Center Y (used by positioned types: flowchart, mindmap, concept). */
  y?: number;
  width?: number;
  height?: number;
  shape?: NodeShape;
  /**
   * Numeric value. Drives chart bar heights and funnel band widths, and is
   * used as the column index (rounded) for comparison visuals.
   */
  value?: number;
  /** Optional per-node fill/accent color override (any CSS color string). */
  color?: string;
  /** Optional per-node border/stroke color override. */
  stroke?: string;
  /** Optional per-node label text color override. */
  textColor?: string; /* node:coverage disable */
  /**
   * Optional icon catalog name (see `src/lib/icons/catalog.ts`). An unknown
   * name is dropped during validation (treated as no icon), never a failure.
   */
  icon?: string;
  /** Fill rendering mode. Defaults to `"solid"`. */
  fillStyle?: FillStyle;
  /** Border stroke pattern. Defaults to `"solid"`. */
  borderStyle?: LineStyle;
  /** Border stroke width in px. Positive. Defaults to `1.5`. */
  borderWidth?: number;
  /** Horizontal text alignment for the label. Defaults to `"center"`. */
  textAlign?: TextAlign; /* node:coverage enable */
  /**
   * Per-node font family override (any CSS font-family string). When set,
   * overrides `style.fontFamily` for this node's label in the renderer.
   * `undefined` / absent means "inherit the visual's global font family".
   */
  fontFamily?: string;
}

/** A directed-by-default connection between two nodes (by id). */
export interface VisualEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** Defaults to `true`; set `false` to omit the arrowhead. */
  directed?: boolean;
  /** Connector line style. Defaults to `"straight"`. */
  style?: EdgeStyle;
  /** Arrowhead variant. Defaults to `"filled"`. */
  arrowStyle?: ArrowStyle;
  /** Stroke pattern. Defaults to `"solid"`. */
  lineStyle?: LineStyle;
  /** Stroke width in px. Positive. Defaults to `1.6`. */
  lineWidth?: number;
}

export interface VisualStyle {
  /** Ordered theme colors used to tint nodes/bars/branches. */
  palette: string[];
  background: string;
  nodeFill: string;
  nodeStroke: string;
  nodeText: string;
  edgeColor: string;
  fontFamily: string;
  fontSize: number;
  /** Base font weight for node labels (100–900). */
  fontWeight: number;
}

export interface Visual {
  version: typeof VISUAL_SCHEMA_VERSION;
  type: VisualKind;
  title?: string;
  width: number;
  height: number;
  nodes: VisualNode[];
  edges: VisualEdge[];
  style: VisualStyle;
  /**
   * Persisted visual export preference. Controls export canvas letterboxing and
   * defaults to `"auto"`.
   */
  aspectRatio?: AspectRatioPreset;
  /** Canvas background style. Defaults to `"blank"`. */
  canvasStyle?: CanvasStyle;
  /**
   * The trimmed source text this visual was generated from, if any. Used by
   * "Sync to text" to re-generate from the anchor block and detect staleness.
   * Optional because only generated/synced visuals have source text.
   */
  sourceText?: string;
  /**
   * FNV-1a 32-bit hex hash of `sourceText` for quick staleness comparisons.
   * Derived from `sourceText` at insert time; optional for the same reason.
   */
  sourceTextHash?: string;
  /**
   * When `true`, the elastic auto-layout engine re-flows the canvas whenever
   * nodes are added, removed, or their labels change — sizing each node to its
   * text and expanding the viewBox so nothing clips. Defaults to `false`
   * for manual positioning.
   * Only meaningful for positioned kinds (flowchart/mindmap/concept/orgchart);
   * other kinds are always derived-layout and ignore this flag.
   */
  autoLayout?: boolean;
  /**
   * Optional presentation effects (drop shadow, sketch/hand-drawn, etc.).
   * Effects are additive; an absent or empty array means no effects are
   * applied. Defaults to `undefined` (no effects).
   */
  effects?: VisualEffect[];
}

export const DEFAULT_NODE_WIDTH = 150;
export const DEFAULT_NODE_HEIGHT = 56;
export const DEFAULT_CANVAS_WIDTH = 760;
export const DEFAULT_CANVAS_HEIGHT = 480;

const DEFAULT_PALETTE = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
];

export const DEFAULT_STYLE: VisualStyle = {
  palette: DEFAULT_PALETTE,
  background: "#ffffff",
  nodeFill: "#eef2ff",
  nodeStroke: "#6366f1",
  nodeText: "#1e1b4b",
  edgeColor: "#94a3b8",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
  fontSize: 14,
  fontWeight: 600,
};

/** Maps a schema `VisualKind` to the persisted `VisualType` (DB `Visual.type`). */
export const VISUAL_KIND_TO_PRISMA = {
  flowchart: "FLOWCHART",
  mindmap: "MINDMAP",
  list: "LIST",
  chart: "CHART",
  concept: "CONCEPT",
  timeline: "TIMELINE",
  cycle: "CYCLE",
  comparison: "COMPARISON",
  funnel: "FUNNEL",
  venn: "VENN",
  pyramid: "PYRAMID",
  matrix: "MATRIX",
  orgchart: "ORGCHART",
} as const satisfies Record<VisualKind, VisualType>;

/** Maps a persisted `VisualType` (DB `Visual.type`) back to the schema `VisualKind`. */
export const PRISMA_TO_VISUAL_KIND = {
  FLOWCHART: "flowchart",
  MINDMAP: "mindmap",
  LIST: "list",
  CHART: "chart",
  CONCEPT: "concept",
  TIMELINE: "timeline",
  CYCLE: "cycle",
  COMPARISON: "comparison",
  FUNNEL: "funnel",
  VENN: "venn",
  PYRAMID: "pyramid",
  MATRIX: "matrix",
  ORGCHART: "orgchart",
} as const satisfies Record<VisualType, VisualKind>;

export function isVisualKind(value: unknown): value is VisualKind {
  return (
    typeof value === "string" &&
    (VISUAL_KINDS as readonly string[]).includes(value)
  );
}

export function isNodeShape(value: unknown): value is NodeShape {
  return (
    typeof value === "string" &&
    (NODE_SHAPES as readonly string[]).includes(value)
  );
}

export function isEdgeStyle(value: unknown): value is EdgeStyle {
  return (
    typeof value === "string" &&
    (EDGE_STYLES as readonly string[]).includes(value)
  );
}

export function isArrowStyle(value: unknown): value is ArrowStyle {
  return (
    typeof value === "string" &&
    (ARROW_STYLES as readonly string[]).includes(value)
  );
}

export function isLineStyle(value: unknown): value is LineStyle {
  return (
    typeof value === "string" &&
    (LINE_STYLES as readonly string[]).includes(value)
  );
}

export function isFillStyle(value: unknown): value is FillStyle {
  return (
    typeof value === "string" &&
    (FILL_STYLES as readonly string[]).includes(value)
  );
}

export function isTextAlign(value: unknown): value is TextAlign {
  return (
    typeof value === "string" &&
    (TEXT_ALIGNS as readonly string[]).includes(value)
  );
}

export function isAspectRatioPreset(
  value: unknown,
): value is AspectRatioPreset {
  return (
    typeof value === "string" &&
    (ASPECT_RATIO_PRESETS as readonly string[]).includes(value)
  );
}

export function isCanvasStyle(value: unknown): value is CanvasStyle {
  return (
    typeof value === "string" &&
    (CANVAS_STYLES as readonly string[]).includes(value)
  );
}
