/**
 * Visual-kind registry — the single source of truth for per-kind capability
 * contracts (Epic #442, issues #443–#447).
 *
 * Each of the 13 {@link VisualKind}s has exactly one {@link VisualKindEntry}
 * that describes:
 *  - Display metadata (label, description, keywords, icon name)
 *  - Layout family (positioned vs derived)
 *  - Graph-editing capability flags (node/edge add, reconnect, etc.)
 *  - Allowed node shapes and default shape
 *  - Export support per format
 *  - AI prompt guidance (drives {@link buildMessagesOptions} in prompt.ts)
 *  - Validation and migration hooks (via adapters, see adapters.ts)
 *
 * The registry intentionally holds no React imports — it is pure TypeScript,
 * unit-testable, and safe to import server-side.
 *
 * Usage pattern:
 *   import { getKindEntry, VISUAL_KIND_REGISTRY } from "@/lib/visual/registry";
 *   const entry = getKindEntry("flowchart");
 */

import {
  VISUAL_KINDS,
  NODE_SHAPES,
  type VisualKind,
  type NodeShape,
} from "@/lib/visual/schema";

// ---------------------------------------------------------------------------
// Layout family
// ---------------------------------------------------------------------------

/**
 * `"positioned"` — nodes carry explicit `x`/`y` coordinates managed by the
 * editor or elastic-layout engine.
 *
 * `"derived"` — the renderer computes node positions from order/value at
 * render time; `x`/`y` on nodes are ignored or absent.
 */
export type LayoutFamily = "positioned" | "derived";

// ---------------------------------------------------------------------------
// Export support record
// ---------------------------------------------------------------------------

/** Describes how well a visual kind renders to each export format. */
export interface KindExportSupport {
  /** SVG vector export is supported. */
  svg: boolean;
  /** PNG raster export is supported. */
  png: boolean;
  /** PDF export is supported. */
  pdf: boolean;
  /**
   * PPTX export produces native Office shapes (not just an embedded image).
   * When `false`, PPTX export falls back to embedding a rasterised image.
   */
  pptxNative: boolean;
  /**
   * PPTX raster fallback: the visual is embedded as a PNG inside the PPTX
   * slide even if `pptxNative` is false — the slide will open but won't be
   * editable in Office.
   */
  pptxRasterFallback: boolean;
  /**
   * Known visual features that degrade or are lost in PPTX export.
   * E.g. `["sketch-effect", "custom-connectors"]`.
   */
  pptxDegradations: readonly string[];
}

// ---------------------------------------------------------------------------
// Editing capability flags
// ---------------------------------------------------------------------------

/** Per-kind flags that control which graph-editing operations are available. */
export interface KindEditingCapabilities {
  /** Nodes can be added interactively. */
  nodeAddable: boolean;
  /** Nodes can be deleted interactively. */
  nodeDeletable: boolean;
  /** Edges can be added between existing nodes. */
  edgeAddable: boolean;
  /** Edges can be deleted interactively. */
  edgeDeletable: boolean;
  /** Edge source/target can be reconnected. */
  edgeReconnectable: boolean;
  /** Nodes can be duplicated (clone with new id). */
  nodeDuplicatable: boolean;
  /** After structural edits, elastic auto-layout can be invoked. */
  autoLayoutSupported: boolean;
}

// ---------------------------------------------------------------------------
// AI prompt constraints
// ---------------------------------------------------------------------------

/** Registry-derived AI generation hints for a kind. */
export interface KindPromptConstraints {
  /**
   * Short guidance string injected into the generation system prompt.
   * Mirrors the `KIND_GUIDANCE` map in `@/lib/ai/prompt.ts`; kept here to
   * make the registry the single source of truth (prompt.ts reads from
   * `getKindPromptGuidance()`).
   */
  guidance: string;
  /** Whether nodes must carry a numeric `value` field for this kind. */
  requiresNodeValue: boolean;
  /** Whether `x`/`y` positioning is expected in generated output. */
  requiresNodePosition: boolean;
  /** Whether edges are meaningful for this kind. */
  edgesRelevant: boolean;
}

// ---------------------------------------------------------------------------
// Full kind entry
// ---------------------------------------------------------------------------

/**
 * The complete capability contract for a single {@link VisualKind}.
 * Every field is required — kinds with unsupported features must set the
 * relevant flags to `false` / empty.
 */
export interface VisualKindEntry {
  /** Stable kind identifier — must match a value in {@link VISUAL_KINDS}. */
  readonly id: VisualKind;
  /** Human-readable label shown in insert menus and popovers. */
  readonly label: string;
  /** One-line description shown as a subtitle in insert surfaces. */
  readonly description: string;
  /**
   * Search keywords for the insert-tool search box.
   * Must contain the kind id itself and its common synonyms.
   */
  readonly keywords: readonly string[];
  /**
   * Lucide icon name (string key from the icon catalog).
   * The registry stores the name rather than the component to stay
   * framework-free; `tool-registry.ts` resolves the component from this name.
   */
  readonly iconName: string;
  /** Whether nodes use explicit x/y coordinates or derived positions. */
  readonly layoutFamily: LayoutFamily;
  /**
   * The set of {@link NodeShape} values valid for this kind.
   * Derived-layout kinds that constrain shape selection list only the shapes
   * they actually render; `NODE_SHAPES` (all shapes) means no restriction.
   */
  readonly allowedShapes: readonly NodeShape[];
  /** The shape applied to new nodes added to this kind. */
  readonly defaultShape: NodeShape;
  /** Interactive graph-editing capabilities. */
  readonly editing: KindEditingCapabilities;
  /** Per-format export support record. */
  readonly export: KindExportSupport;
  /** AI prompt constraints for this kind. */
  readonly prompt: KindPromptConstraints;
}

// ---------------------------------------------------------------------------
// Registry type
// ---------------------------------------------------------------------------

/** The complete registry: one entry per {@link VisualKind}. */
export type VisualRegistry = Record<VisualKind, VisualKindEntry>;

// ---------------------------------------------------------------------------
// Standard editing capability bundles
// ---------------------------------------------------------------------------

/** Full graph-editing: all operations available. */
const FULL_GRAPH_EDITING: KindEditingCapabilities = {
  nodeAddable: true,
  nodeDeletable: true,
  edgeAddable: true,
  edgeDeletable: true,
  edgeReconnectable: true,
  nodeDuplicatable: true,
  autoLayoutSupported: true,
};

/** Node-only editing: nodes can be added/removed but edges are managed by the renderer. */
const NODE_ONLY_EDITING: KindEditingCapabilities = {
  nodeAddable: true,
  nodeDeletable: true,
  edgeAddable: false,
  edgeDeletable: false,
  edgeReconnectable: false,
  nodeDuplicatable: true,
  autoLayoutSupported: false,
};

/** Read-only: structural editing — all operations disabled. Kept for future use by read-only kinds. */
export const READ_ONLY_EDITING: KindEditingCapabilities = {
  nodeAddable: false,
  nodeDeletable: false,
  edgeAddable: false,
  edgeDeletable: false,
  edgeReconnectable: false,
  nodeDuplicatable: false,
  autoLayoutSupported: false,
};

// ---------------------------------------------------------------------------
// Standard export support bundles
// ---------------------------------------------------------------------------

/**
 * Full SVG/PNG/PDF export + PPTX as embedded raster (no native Office shapes).
 * Applicable to the majority of derived-layout diagram kinds.
 */
const RASTER_EXPORT: KindExportSupport = {
  svg: true,
  png: true,
  pdf: true,
  pptxNative: false,
  pptxRasterFallback: true,
  pptxDegradations: ["pptx-shapes-not-editable-in-office"],
};

/**
 * Full SVG/PNG/PDF/PPTX native export.
 * Currently only positioned graph kinds (flowchart, mindmap, concept, orgchart)
 * render to native Office shapes via `pptx-shapes.ts`.
 */
const FULL_EXPORT: KindExportSupport = {
  svg: true,
  png: true,
  pdf: true,
  pptxNative: true,
  pptxRasterFallback: true,
  pptxDegradations: [],
};

// ---------------------------------------------------------------------------
// Registry population
// ---------------------------------------------------------------------------

/**
 * The authoritative registry for all 13 {@link VisualKind}s.
 *
 * To add a new kind:
 *  1. Add its value to `VISUAL_KINDS` in schema.ts.
 *  2. Add a corresponding entry here — TypeScript will enforce completeness.
 *  3. Add a blank fixture in fixtures.ts.
 *  4. Add a renderer case in visual-renderer.tsx.
 */
export const VISUAL_KIND_REGISTRY: VisualRegistry = {
  flowchart: {
    id: "flowchart",
    label: "Flowchart",
    description: "Steps & decisions",
    keywords: ["flow", "process", "steps", "diagram", "workflow"],
    iconName: "Workflow",
    layoutFamily: "positioned",
    allowedShapes: [...NODE_SHAPES],
    defaultShape: "rounded",
    editing: FULL_GRAPH_EDITING,
    export: FULL_EXPORT,
    prompt: {
      guidance:
        "flowchart: a directed process with edges; use shapes ellipse (start/end), diamond (decision), rounded (step); set node x/y to lay it out top-to-bottom.",
      requiresNodeValue: false,
      requiresNodePosition: true,
      edgesRelevant: true,
    },
  },

  mindmap: {
    id: "mindmap",
    label: "Mind map",
    description: "Branching ideas",
    keywords: ["mind", "map", "brainstorm", "branches", "ideas"],
    iconName: "Network",
    layoutFamily: "positioned",
    allowedShapes: [...NODE_SHAPES],
    defaultShape: "pill",
    editing: FULL_GRAPH_EDITING,
    export: FULL_EXPORT,
    prompt: {
      guidance:
        "mindmap: one central node with branches radiating out; use edges from the center; set x/y around the center.",
      requiresNodeValue: false,
      requiresNodePosition: true,
      edgesRelevant: true,
    },
  },

  list: {
    id: "list",
    label: "List",
    description: "Itemized points",
    keywords: ["list", "items", "points", "checklist"],
    iconName: "ListChecks",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded", "pill"],
    defaultShape: "rounded",
    editing: NODE_ONLY_EDITING,
    export: RASTER_EXPORT,
    prompt: {
      guidance:
        "list/scene: an ordered set of points; order nodes meaningfully; x/y may be omitted (layout is derived from order).",
      requiresNodeValue: false,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
  },

  chart: {
    id: "chart",
    label: "Chart",
    description: "Bars & values",
    keywords: ["chart", "bar", "graph", "data", "values"],
    iconName: "BarChart3",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded"],
    defaultShape: "rectangle",
    editing: NODE_ONLY_EDITING,
    export: RASTER_EXPORT,
    prompt: {
      guidance:
        "chart: a bar chart; every node needs a numeric `value`; x/y may be omitted (bars are laid out from value + index).",
      requiresNodeValue: true,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
  },

  concept: {
    id: "concept",
    label: "Concept",
    description: "Central idea map",
    keywords: ["concept", "idea", "relationship", "map"],
    iconName: "Lightbulb",
    layoutFamily: "positioned",
    allowedShapes: [...NODE_SHAPES],
    defaultShape: "ellipse",
    editing: FULL_GRAPH_EDITING,
    export: FULL_EXPORT,
    prompt: {
      guidance:
        "concept: a non-linear graph of related ideas connected by labeled edges; set x/y to spread nodes out.",
      requiresNodeValue: false,
      requiresNodePosition: true,
      edgesRelevant: true,
    },
  },

  timeline: {
    id: "timeline",
    label: "Timeline",
    description: "Events over time",
    keywords: ["timeline", "time", "events", "history", "schedule"],
    iconName: "Milestone",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded", "ellipse"],
    defaultShape: "rounded",
    editing: NODE_ONLY_EDITING,
    export: RASTER_EXPORT,
    prompt: {
      guidance:
        "timeline: an ordered sequence of steps along a horizontal axis; order nodes chronologically; x/y may be omitted (steps are laid out from order).",
      requiresNodeValue: false,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
  },

  cycle: {
    id: "cycle",
    label: "Cycle",
    description: "Repeating loop",
    keywords: ["cycle", "loop", "circular", "process"],
    iconName: "RefreshCw",
    layoutFamily: "derived",
    allowedShapes: ["rounded", "pill", "ellipse"],
    defaultShape: "rounded",
    editing: NODE_ONLY_EDITING,
    export: RASTER_EXPORT,
    prompt: {
      guidance:
        "cycle: a repeating loop of stages; order nodes in the direction of the cycle; x/y and edges may be omitted (nodes are arranged around a ring with directed arrows).",
      requiresNodeValue: false,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
  },

  comparison: {
    id: "comparison",
    label: "Comparison",
    description: "Side by side",
    keywords: ["comparison", "compare", "versus", "vs", "columns"],
    iconName: "Columns2",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded"],
    defaultShape: "rounded",
    editing: NODE_ONLY_EDITING,
    export: RASTER_EXPORT,
    prompt: {
      guidance:
        "comparison: side-by-side columns of grouped items; set each node's `value` to its column index (0, 1, 2, \u2026) to group nodes into columns; the FIRST node in each column is the column title and the rest are its items; x/y and edges may be omitted.",
      requiresNodeValue: true,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
  },

  funnel: {
    id: "funnel",
    label: "Funnel",
    description: "Narrowing stages",
    keywords: ["funnel", "stages", "conversion", "pipeline"],
    iconName: "Filter",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded"],
    defaultShape: "rectangle",
    editing: NODE_ONLY_EDITING,
    export: RASTER_EXPORT,
    prompt: {
      guidance:
        "funnel: stacked stages that narrow downward; order nodes from widest (top) to narrowest (bottom) and give each a decreasing numeric `value` that drives its band width; x/y and edges may be omitted.",
      requiresNodeValue: true,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
  },

  venn: {
    id: "venn",
    label: "Venn",
    description: "Overlapping sets",
    keywords: ["venn", "overlap", "sets", "intersection"],
    iconName: "Combine",
    layoutFamily: "positioned",
    allowedShapes: ["ellipse"],
    defaultShape: "ellipse",
    editing: {
      nodeAddable: true,
      nodeDeletable: true,
      edgeAddable: false,
      edgeDeletable: false,
      edgeReconnectable: false,
      nodeDuplicatable: false,
      autoLayoutSupported: false,
    },
    export: RASTER_EXPORT,
    prompt: {
      guidance:
        "venn: 2\u20133 overlapping sets; set x/y to the center of each circle and `width` to its diameter (circles should partially overlap); no edges needed; 2 circles for simple overlap, 3 for triple overlap.",
      requiresNodeValue: false,
      requiresNodePosition: true,
      edgesRelevant: false,
    },
  },

  pyramid: {
    id: "pyramid",
    label: "Pyramid",
    description: "Stacked hierarchy",
    keywords: ["pyramid", "hierarchy", "levels", "stack"],
    iconName: "Triangle",
    layoutFamily: "derived",
    allowedShapes: ["rectangle"],
    defaultShape: "rectangle",
    editing: NODE_ONLY_EDITING,
    export: RASTER_EXPORT,
    prompt: {
      guidance:
        "pyramid: stacked hierarchy levels \u2014 apex (top, narrowest) to base (bottom, widest); order nodes from apex to base (first node = top level, last = base level); no x/y or edges needed (widths are derived from position).",
      requiresNodeValue: false,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
  },

  matrix: {
    id: "matrix",
    label: "Matrix",
    description: "2\xd72 quadrant grid",
    keywords: ["matrix", "quadrant", "grid", "2x2"],
    iconName: "Grid2x2",
    layoutFamily: "derived",
    allowedShapes: ["rectangle", "rounded"],
    defaultShape: "rounded",
    editing: NODE_ONLY_EDITING,
    export: RASTER_EXPORT,
    prompt: {
      guidance:
        "matrix: 2\xd72 quadrant grid; set each node's `value` to its quadrant index (0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right); multiple nodes can share a quadrant; x/y and edges may be omitted.",
      requiresNodeValue: true,
      requiresNodePosition: false,
      edgesRelevant: false,
    },
  },

  orgchart: {
    id: "orgchart",
    label: "Org chart",
    description: "Team hierarchy",
    keywords: ["org", "orgchart", "hierarchy", "team", "tree"],
    iconName: "GitBranch",
    layoutFamily: "positioned",
    allowedShapes: ["rounded", "rectangle", "pill"],
    defaultShape: "rounded",
    editing: FULL_GRAPH_EDITING,
    export: FULL_EXPORT,
    prompt: {
      guidance:
        "orgchart: hierarchical tree of roles or entities; set node x/y to lay it out top-to-bottom (root at top, leaves at bottom); add edges from each parent to its direct reports; use shape `rounded` for all nodes.",
      requiresNodeValue: false,
      requiresNodePosition: true,
      edgesRelevant: true,
    },
  },
} as const satisfies VisualRegistry;

// ---------------------------------------------------------------------------
// Registry query helpers
// ---------------------------------------------------------------------------

/**
 * Returns the {@link VisualKindEntry} for a given kind.
 * TypeScript guarantees this is always defined for a valid {@link VisualKind}.
 */
export function getKindEntry(kind: VisualKind): VisualKindEntry {
  return VISUAL_KIND_REGISTRY[kind];
}

/** Returns `true` when the kind uses explicit node x/y coordinates. */
export function isPositionedKind(kind: VisualKind): boolean {
  return VISUAL_KIND_REGISTRY[kind].layoutFamily === "positioned";
}

/** Returns `true` when the kind derives node layout at render time. */
export function isDerivedLayoutKind(kind: VisualKind): boolean {
  return VISUAL_KIND_REGISTRY[kind].layoutFamily === "derived";
}

/** Returns `true` when the kind supports interactive node/edge graph editing. */
export function isGraphEditable(kind: VisualKind): boolean {
  const e = VISUAL_KIND_REGISTRY[kind].editing;
  return e.nodeAddable && e.edgeAddable;
}

/** Returns the allowed {@link NodeShape}s for a kind. */
export function getAllowedShapes(kind: VisualKind): readonly NodeShape[] {
  return VISUAL_KIND_REGISTRY[kind].allowedShapes;
}

/** Returns `true` when the given shape is valid for the kind. */
export function isShapeAllowed(kind: VisualKind, shape: NodeShape): boolean {
  return (VISUAL_KIND_REGISTRY[kind].allowedShapes as string[]).includes(shape);
}

/**
 * Returns every kind that satisfies the given layout family.
 * Useful for registry-level tests and tooling.
 */
export function getKindsByLayoutFamily(family: LayoutFamily): VisualKind[] {
  return VISUAL_KINDS.filter(
    (k) => VISUAL_KIND_REGISTRY[k].layoutFamily === family,
  );
}

/**
 * Returns the AI prompt guidance string for a kind.
 * Used by {@link buildMessages} in `@/lib/ai/prompt.ts` to stay in sync with
 * the registry rather than maintaining a separate `KIND_GUIDANCE` map.
 */
export function getKindPromptGuidance(kind: VisualKind): string {
  return VISUAL_KIND_REGISTRY[kind].prompt.guidance;
}

/**
 * Derives the export support matrix from the registry.
 * Each row describes one format × kind support level.
 * Used by #447 derived support matrices.
 */
export function buildExportSupportMatrix(): Array<{
  kind: VisualKind;
  svg: boolean;
  png: boolean;
  pdf: boolean;
  pptxNative: boolean;
  pptxRasterFallback: boolean;
  pptxDegradations: readonly string[];
}> {
  return VISUAL_KINDS.map((kind) => ({
    kind,
    ...VISUAL_KIND_REGISTRY[kind].export,
  }));
}

/**
 * Returns an array of { kind, guidance } pairs for all registered kinds.
 * Used by the AI prompt builder to stay in sync with the registry.
 */
export function getAllKindPromptGuidance(): Array<{
  kind: VisualKind;
  guidance: string;
}> {
  return VISUAL_KINDS.map((kind) => ({
    kind,
    guidance: VISUAL_KIND_REGISTRY[kind].prompt.guidance,
  }));
}

// ---------------------------------------------------------------------------
// Exhaustiveness guard
// ---------------------------------------------------------------------------

/**
 * Asserts at compile-time that every entry in {@link VISUAL_KINDS} has a
 * corresponding registry entry. Called in tests to catch drift.
 */
export function assertRegistryCompleteness(): void {
  for (const kind of VISUAL_KINDS) {
    const entry = VISUAL_KIND_REGISTRY[kind];
    if (!entry) {
      throw new Error(`[registry] Missing entry for kind: ${kind}`);
    }
    if (entry.id !== kind) {
      throw new Error(
        `[registry] Entry id mismatch: expected "${kind}", got "${entry.id}"`,
      );
    }
    if (!entry.label) {
      throw new Error(`[registry] Entry for "${kind}" is missing a label`);
    }
    if (!entry.iconName) {
      throw new Error(`[registry] Entry for "${kind}" is missing an iconName`);
    }
    if (entry.allowedShapes.length === 0) {
      throw new Error(
        `[registry] Entry for "${kind}" has no allowedShapes — at least one shape is required`,
      );
    }
  }
}
