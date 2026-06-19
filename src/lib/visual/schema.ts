/**
 * Versioned visual schema for the Napkin Clone app.
 *
 * A "visual" is a JSON document made of **nodes + edges + style**. It is the
 * canonical, renderer-agnostic format produced by AI generation (US-010/011) and
 * consumed by the SVG renderer (`src/components/visual/visual-renderer.tsx`).
 *
 * The schema is versioned (`version`) so future shape changes can be migrated.
 * Validation (`validateVisual` / `safeParseVisual`) is intentionally strict about
 * structure (so garbled LLM output can be rejected later) but forgiving about
 * styling (missing/partial `style` is merged with `DEFAULT_STYLE`).
 */

import { isKnownIcon } from "@/lib/icons/catalog";

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
export const VISUAL_TYPES = [
  "FLOWCHART",
  "MINDMAP",
  "LIST",
  "CHART",
  "CONCEPT",
  "TIMELINE",
  "CYCLE",
  "COMPARISON",
  "FUNNEL",
  "VENN",
  "PYRAMID",
  "MATRIX",
  "ORGCHART",
] as const;

export type VisualType = (typeof VISUAL_TYPES)[number];

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
export const EDGE_STYLES = ["straight", "curved"] as const;

export type EdgeStyle = (typeof EDGE_STYLES)[number];

/** Arrowhead rendering variants. `filled` is the default closed triangle. */
export const ARROW_STYLES = ["filled", "open", "circle", "diamond"] as const;

export type ArrowStyle = (typeof ARROW_STYLES)[number];

/** Stroke pattern for edges or node borders. */
export const LINE_STYLES = ["solid", "dashed", "dotted"] as const;

export type LineStyle = (typeof LINE_STYLES)[number];

/** Node fill rendering mode. `solid` is a flat fill; `gradient` adds a subtle
 * top-to-bottom highlight derived from the node fill color. */
export const FILL_STYLES = ["solid", "gradient"] as const;

export type FillStyle = (typeof FILL_STYLES)[number];

/** Horizontal text alignment within a node label. */
export const TEXT_ALIGNS = ["left", "center", "right"] as const;

export type TextAlign = (typeof TEXT_ALIGNS)[number];

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
  textColor?: string;
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
  textAlign?: TextAlign;
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
}

export const DEFAULT_NODE_WIDTH = 150;
export const DEFAULT_NODE_HEIGHT = 56;
export const DEFAULT_CANVAS_WIDTH = 760;
export const DEFAULT_CANVAS_HEIGHT = 480;

export const DEFAULT_PALETTE = [
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

export class VisualValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisualValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numberField(
  source: Record<string, unknown>,
  key: string,
  context: string,
  { positive = false }: { positive?: boolean } = {},
): number | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (!isFiniteNumber(value)) {
    throw new VisualValidationError(
      `${context}.${key} must be a finite number`,
    );
  }
  if (positive && value <= 0) {
    throw new VisualValidationError(`${context}.${key} must be greater than 0`);
  }
  return value;
}

function validateNode(input: unknown, index: number): VisualNode {
  const context = `nodes[${index}]`;
  if (!isPlainObject(input)) {
    throw new VisualValidationError(`${context} must be an object`);
  }

  const { id, label } = input;
  if (typeof id !== "string" || id.length === 0) {
    throw new VisualValidationError(`${context}.id must be a non-empty string`);
  }
  if (typeof label !== "string") {
    throw new VisualValidationError(`${context}.label must be a string`);
  }

  const node: VisualNode = { id, label };

  const x = numberField(input, "x", context);
  if (x !== undefined) node.x = x;
  const y = numberField(input, "y", context);
  if (y !== undefined) node.y = y;
  const width = numberField(input, "width", context, { positive: true });
  if (width !== undefined) node.width = width;
  const height = numberField(input, "height", context, { positive: true });
  if (height !== undefined) node.height = height;
  const value = numberField(input, "value", context);
  if (value !== undefined) node.value = value;

  if (input.shape !== undefined) {
    if (!isNodeShape(input.shape)) {
      throw new VisualValidationError(
        `${context}.shape must be one of: ${NODE_SHAPES.join(", ")}`,
      );
    }
    node.shape = input.shape;
  }

  if (input.color !== undefined) {
    if (typeof input.color !== "string") {
      throw new VisualValidationError(`${context}.color must be a string`);
    }
    node.color = input.color;
  }

  if (input.stroke !== undefined) {
    if (typeof input.stroke !== "string") {
      throw new VisualValidationError(`${context}.stroke must be a string`);
    }
    node.stroke = input.stroke;
  }

  if (input.textColor !== undefined) {
    if (typeof input.textColor !== "string") {
      throw new VisualValidationError(`${context}.textColor must be a string`);
    }
    node.textColor = input.textColor;
  }

  // Icons are forgiving: a non-string or unknown catalog name is silently
  // dropped (treated as no icon) rather than failing validation, so garbled
  // AI output can't break an otherwise-valid visual.
  if (typeof input.icon === "string" && isKnownIcon(input.icon)) {
    node.icon = input.icon;
  }

  // New optional styling fields — forgiving (unknown values silently dropped).
  if (isFillStyle(input.fillStyle)) {
    node.fillStyle = input.fillStyle;
  }
  if (isLineStyle(input.borderStyle)) {
    node.borderStyle = input.borderStyle;
  }
  const borderWidth = numberField(input, "borderWidth", context, {
    positive: true,
  });
  if (borderWidth !== undefined) node.borderWidth = borderWidth;
  if (isTextAlign(input.textAlign)) {
    node.textAlign = input.textAlign;
  }

  return node;
}

function validateEdge(
  input: unknown,
  index: number,
  nodeIds: ReadonlySet<string>,
): VisualEdge {
  const context = `edges[${index}]`;
  if (!isPlainObject(input)) {
    throw new VisualValidationError(`${context} must be an object`);
  }

  const { id, from, to } = input;
  if (typeof id !== "string" || id.length === 0) {
    throw new VisualValidationError(`${context}.id must be a non-empty string`);
  }
  if (typeof from !== "string" || !nodeIds.has(from)) {
    throw new VisualValidationError(
      `${context}.from must reference an existing node id`,
    );
  }
  if (typeof to !== "string" || !nodeIds.has(to)) {
    throw new VisualValidationError(
      `${context}.to must reference an existing node id`,
    );
  }

  const edge: VisualEdge = { id, from, to };

  if (input.label !== undefined) {
    if (typeof input.label !== "string") {
      throw new VisualValidationError(`${context}.label must be a string`);
    }
    edge.label = input.label;
  }

  if (input.directed !== undefined) {
    if (typeof input.directed !== "boolean") {
      throw new VisualValidationError(`${context}.directed must be a boolean`);
    }
    edge.directed = input.directed;
  }

  // Connector style is forgiving: an unknown/non-string value is silently
  // dropped (treated as the default "straight") so garbled AI output can't
  // break an otherwise-valid visual, matching how node icons/styling behave.
  if (isEdgeStyle(input.style)) {
    edge.style = input.style;
  }

  // New optional edge styling fields — forgiving (unknown values silently dropped).
  if (isArrowStyle(input.arrowStyle)) {
    edge.arrowStyle = input.arrowStyle;
  }
  if (isLineStyle(input.lineStyle)) {
    edge.lineStyle = input.lineStyle;
  }
  const lineWidth = numberField(input, "lineWidth", context, {
    positive: true,
  });
  if (lineWidth !== undefined) edge.lineWidth = lineWidth;

  return edge;
}

function normalizeStyle(input: unknown): VisualStyle {
  if (input === undefined) {
    return { ...DEFAULT_STYLE };
  }
  if (!isPlainObject(input)) {
    throw new VisualValidationError("style must be an object");
  }

  const style: VisualStyle = { ...DEFAULT_STYLE };

  if (input.palette !== undefined) {
    if (
      !Array.isArray(input.palette) ||
      input.palette.length === 0 ||
      !input.palette.every((color) => typeof color === "string")
    ) {
      throw new VisualValidationError(
        "style.palette must be a non-empty array of strings",
      );
    }
    style.palette = input.palette as string[];
  }

  const stringKeys = [
    "background",
    "nodeFill",
    "nodeStroke",
    "nodeText",
    "edgeColor",
    "fontFamily",
  ] as const;
  for (const key of stringKeys) {
    const value = input[key];
    if (value !== undefined) {
      if (typeof value !== "string") {
        throw new VisualValidationError(`style.${key} must be a string`);
      }
      style[key] = value;
    }
  }

  if (input.fontSize !== undefined) {
    if (!isFiniteNumber(input.fontSize) || input.fontSize <= 0) {
      throw new VisualValidationError(
        "style.fontSize must be a positive number",
      );
    }
    style.fontSize = input.fontSize;
  }

  if (input.fontWeight !== undefined) {
    if (!isFiniteNumber(input.fontWeight) || input.fontWeight <= 0) {
      throw new VisualValidationError(
        "style.fontWeight must be a positive number",
      );
    }
    style.fontWeight = input.fontWeight;
  }

  return style;
}

/**
 * Validates an unknown value against the visual schema, returning a fully
 * populated `Visual` (style/width/height defaulted) or throwing a
 * `VisualValidationError` describing the first problem found.
 */
export function validateVisual(input: unknown): Visual {
  if (!isPlainObject(input)) {
    throw new VisualValidationError("Visual must be an object");
  }

  if (input.version !== VISUAL_SCHEMA_VERSION) {
    throw new VisualValidationError(
      `Unsupported visual version: ${String(input.version)} (expected ${VISUAL_SCHEMA_VERSION})`,
    );
  }

  if (!isVisualKind(input.type)) {
    throw new VisualValidationError(
      `Visual.type must be one of: ${VISUAL_KINDS.join(", ")}`,
    );
  }

  if (!Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new VisualValidationError("Visual.nodes must be a non-empty array");
  }

  const nodes = input.nodes.map(validateNode);
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      throw new VisualValidationError(`Duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  const rawEdges = input.edges ?? [];
  if (!Array.isArray(rawEdges)) {
    throw new VisualValidationError("Visual.edges must be an array");
  }
  const edges = rawEdges.map((edge, index) =>
    validateEdge(edge, index, nodeIds),
  );

  let title: string | undefined;
  if (input.title !== undefined) {
    if (typeof input.title !== "string") {
      throw new VisualValidationError("Visual.title must be a string");
    }
    title = input.title;
  }

  const width =
    numberField(input, "width", "Visual", { positive: true }) ??
    DEFAULT_CANVAS_WIDTH;
  const height =
    numberField(input, "height", "Visual", { positive: true }) ??
    DEFAULT_CANVAS_HEIGHT;

  return {
    version: VISUAL_SCHEMA_VERSION,
    type: input.type,
    ...(title !== undefined ? { title } : {}),
    width,
    height,
    nodes,
    edges,
    style: normalizeStyle(input.style),
  };
}

export type VisualParseResult =
  | { success: true; data: Visual }
  | { success: false; error: string };

/** Non-throwing wrapper around {@link validateVisual}. */
export function safeParseVisual(input: unknown): VisualParseResult {
  try {
    return { success: true, data: validateVisual(input) };
  } catch (error) {
    const message =
      error instanceof VisualValidationError ? error.message : "Invalid visual";
    return { success: false, error: message };
  }
}
