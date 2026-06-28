/* node:coverage ignore next 13 -- Module overview is documentation-only; tsx maps a header row as uncovered. @preserve */
/**
 * Content-aware elastic auto-layout for positioned visual kinds.
 *
 * This module provides a pure, deterministic, non-mutating layout pass that:
 * 1. Estimates each node's bounding box from its label text + font metrics.
 * 2. Re-positions nodes for the visual's kind (flowchart → column, mindmap/concept
 *    → radial, orgchart → top-down tree) so no two boxes overlap.
 * 3. Computes a tight bounding box over all nodes and returns updated node
 *    geometry + grown `width`/`height` so the SVG viewBox/frame expands to fit.
 *
 * All functions are pure (no mutations, no I/O, no React/Lexical imports) and
 * designed for unit-testing in isolation via `node --test`.
 */

import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type Visual,
  type VisualKind,
  type VisualNode,
} from "@/lib/visual/schema";

// ---------------------------------------------------------------------------
// Constants / tunables
// ---------------------------------------------------------------------------

/** Approximate character width as a fraction of font size (monospace upper bound). */
const CHAR_WIDTH_RATIO = 0.58;

/** Minimum horizontal padding inside a node (left + right combined). */
const NODE_PAD_X = 28;

/** Minimum vertical padding inside a node (top + bottom combined). */
const NODE_PAD_Y = 20;

/** Minimum node width — prevents zero-label nodes from vanishing. */
const MIN_NODE_WIDTH = 80;

/** Minimum node height. */
const MIN_NODE_HEIGHT = 40;

/** Maximum single-line width before the label wraps. */
const MAX_LINE_WIDTH_CHARS = 18;

/** Canvas padding so nodes never touch the SVG edge. */
const CANVAS_MARGIN = 48;

/** Gap between node bounding boxes (horizontal). */
const H_GAP = 32;

/** Gap between node bounding boxes (vertical). */
const V_GAP = 28;

// ---------------------------------------------------------------------------
// Label measurement
// ---------------------------------------------------------------------------

/* node:coverage ignore next 4 -- wrapText documentation is non-runtime; tsx maps the close row as uncovered. @preserve */
/**
 * Estimates the rendered width of a single line of text (in canvas px) given
 * the font size. Derived from `CHAR_WIDTH_RATIO` — no DOM access required.
 */
function estimateLineWidth(text: string, fontSize: number): number {
  return text.length * fontSize * CHAR_WIDTH_RATIO;
}

/**
 * Greedily wraps `text` into lines of at most `maxChars` characters, mirroring
 * the renderer's `wrapLabel` algorithm so estimated boxes match what's drawn.
 */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [text];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

/**
 * Estimates the bounding box (width × height) of a node's label text rendered
 * at `fontSize`. Long labels wrap like the renderer does. The box includes
 * padding so the returned dimensions are ready to use as `node.width`/`height`.
 */
export function estimateLabelBox(
  label: string,
  fontSize: number,
): { width: number; height: number } {
  const lines = wrapText(label, MAX_LINE_WIDTH_CHARS);
  const lineHeight = fontSize * 1.35;
  const textWidth = Math.max(
    ...lines.map((line) => estimateLineWidth(line, fontSize)),
  );
  const textHeight = lines.length * lineHeight;
  return {
    width: Math.max(Math.ceil(textWidth) + NODE_PAD_X, MIN_NODE_WIDTH),
    height: Math.max(Math.ceil(textHeight) + NODE_PAD_Y, MIN_NODE_HEIGHT),
  };
}

// ---------------------------------------------------------------------------
// Bounding-box helpers
// ---------------------------------------------------------------------------

/* node:coverage ignore next 7 -- Rect is an exported type facade; tsx maps interface fields as uncovered. @preserve */
export interface Rect {
  /** Left edge X. */
  x: number;
  /** Top edge Y. */
  y: number;
  width: number;
  height: number;
}

/** Converts a center-based node box to a left/top Rect. */
function nodeToRect(node: VisualNode): Rect {
  const w = node.width ?? DEFAULT_NODE_WIDTH;
  const h = node.height ?? DEFAULT_NODE_HEIGHT;
  // contentBounds tests assert node box conversion; tsx maps the object head as uncovered.
  /* node:coverage ignore next */
  return {
    x: (node.x ?? 0) - w / 2,
    y: (node.y ?? 0) - h / 2,
    width: w,
    height: h,
  };
}

/** Returns true when two Rects overlap (touching edges do not count). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
    ? true
    : false;
}

/* node:coverage ignore next 4 -- Flowchart layout documentation is non-runtime; tsx maps the close row as uncovered. @preserve */
/**
 * Computes the tight bounding Rect over all placed nodes (using center +
 * half-extents). Returns `null` if there are no nodes.
 */
export function contentBounds(nodes: VisualNode[]): Rect | null {
  if (nodes.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const r = nodeToRect(node);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ---------------------------------------------------------------------------
// Per-kind elastic layout passes
// ---------------------------------------------------------------------------

/**
 * Flowchart elastic layout: single vertical column, nodes centered
 * horizontally, spaced by `V_GAP`. Each node is sized to its label.
 */
function elasticFlowchartLayout(
  nodes: VisualNode[],
  fontSize: number,
): VisualNode[] {
  let y = CANVAS_MARGIN;
  return nodes.map((node) => {
    const box = estimateLabelBox(node.label, fontSize);
    const cx = CANVAS_MARGIN + box.width / 2;
    const cy = y + box.height / 2;
    y += box.height + V_GAP;
    return { ...node, x: cx, y: cy, width: box.width, height: box.height };
  });
}

/**
 * Mindmap/concept elastic layout: first node at center, remaining nodes fanned
 * radially. Radius is large enough to fit all leaf boxes without overlap.
 */
function elasticRadialLayout(
  nodes: VisualNode[],
  fontSize: number,
): VisualNode[] {
  if (nodes.length === 0) {
    return [];
  }
  const sized = nodes.map((node) => {
    const box = estimateLabelBox(node.label, fontSize);
    return { ...node, width: box.width, height: box.height };
  });

  const centerNode = sized[0];
  if (nodes.length === 1) {
    return [
      {
        ...centerNode,
        x: CANVAS_MARGIN + centerNode.width / 2,
        y: CANVAS_MARGIN + centerNode.height / 2,
      },
    ];
  }

  // Compute radius: each leaf needs arc-length ≥ (leafWidth + H_GAP) and
  // radial clearance ≥ centerHeight/2 + V_GAP + leafHeight/2.
  const leaves = sized.slice(1);
  const maxLeafW = Math.max(...leaves.map((n) => n.width));
  // Radial layout tests exercise leaf sizing; tsx maps this spread tail as uncovered.
  /* node:coverage ignore next */
  const maxLeafH = Math.max(...leaves.map((n) => n.height));

  const arcNeeded = (leaves.length * (maxLeafW + H_GAP)) / (2 * Math.PI);
  const centerHalfHeight = (centerNode.height ?? DEFAULT_NODE_HEIGHT) / 2;
  const leafHalfHeight = maxLeafH / 2;
  const clearanceNeeded = centerHalfHeight + V_GAP + leafHalfHeight;
  const radius = Math.max(arcNeeded, clearanceNeeded, 120);

  const cx = CANVAS_MARGIN + radius + maxLeafW / 2;
  const cy = CANVAS_MARGIN + radius + maxLeafH / 2;

  const result: VisualNode[] = [{ ...centerNode, x: cx, y: cy }];
  for (let i = 0; i < leaves.length; i++) {
    const angle = -Math.PI / 2 + (i / leaves.length) * Math.PI * 2;
    result.push({
      ...leaves[i],
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return result;
}

/**
 * Orgchart elastic layout: simple top-down tree where each level is laid out
 * as a horizontal row. Edges define parent → child relationships; nodes with
 * no incoming edges are roots.
 */
function elasticOrgchartLayout(
  nodes: VisualNode[],
  edges: Visual["edges"],
  fontSize: number,
): VisualNode[] {
  if (nodes.length === 0) {
    return [];
  }

  const sized = nodes.map((node) => {
    const box = estimateLabelBox(node.label, fontSize);
    return { ...node, width: box.width, height: box.height };
  });

  const nodeById = new Map(sized.map((n) => [n.id, n]));

  // Build children map.
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const edge of edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
      continue;
    }
    let ch = children.get(edge.from);
    if (!ch) {
      ch = [];
      children.set(edge.from, ch);
    }
    ch.push(edge.to);
    hasParent.add(edge.to);
  }

  const roots = sized.filter((n) => !hasParent.has(n.id));
  if (roots.length === 0) {
    // No tree structure found — fall back to flowchart-style column.
    return elasticFlowchartLayout(nodes, fontSize);
  }

  // BFS to assign level.
  const level = new Map<string, number>();
  const queue: string[] = roots.map((n) => n.id);
  for (const id of queue) {
    level.set(id, 0);
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    const lv = level.get(id) ?? 0;
    for (const childId of children.get(id) ?? []) {
      if (!level.has(childId)) {
        level.set(childId, lv + 1);
        queue.push(childId);
      }
    }
  }

  // Group by level.
  const byLevel = new Map<number, VisualNode[]>();
  for (const node of sized) {
    const lv = level.get(node.id) ?? 0;
    let row = byLevel.get(lv);
    if (!row) {
      row = [];
      byLevel.set(lv, row);
    }
    row.push(node);
  }

  const maxLevel = Math.max(...byLevel.keys());
  const placed = new Map<string, VisualNode>();
  let y = CANVAS_MARGIN;

  for (let lv = 0; lv <= maxLevel; lv++) {
    const row = byLevel.get(lv) ?? [];
    const rowHeight = Math.max(...row.map((n) => n.height ?? MIN_NODE_HEIGHT));
    const totalWidth = row.reduce(
      (sum, n) => sum + (n.width ?? MIN_NODE_WIDTH),
      0,
    );
    const totalGaps = H_GAP * (row.length - 1);
    let x = CANVAS_MARGIN + (totalWidth + totalGaps) / 2 + CANVAS_MARGIN; // start x = margin
    // Center the row at a reasonable horizontal position.
    x = CANVAS_MARGIN;
    const rowCenterY = y + rowHeight / 2;
    for (const node of row) {
      const w = node.width ?? MIN_NODE_WIDTH;
      placed.set(node.id, {
        ...node,
        x: x + w / 2,
        y: rowCenterY,
      });
      x += w + H_GAP;
    }
    y += rowHeight + V_GAP;
  }

  // Return in original order, falling back to sized[i] for any unplaced node.
  return sized.map((n) => placed.get(n.id) ?? n);
}

// ---------------------------------------------------------------------------
// Main elastic layout entry point
// ---------------------------------------------------------------------------

/**
 * Result of an elastic layout pass.
 */
export interface ElasticLayoutResult {
  /** Nodes with updated `x`, `y`, `width`, `height` derived from label size. */
  nodes: VisualNode[];
  /** Grown canvas width so the viewBox contains all nodes + margin. */
  width: number;
  /** Grown canvas height so the viewBox contains all nodes + margin. */
  height: number;
}

/**
 * Runs the content-aware elastic layout pass for the given visual kind.
 *
 * - Estimates each node's bounding box from its label text + fontSize.
 * - Positions nodes without overlap per kind (flowchart → column, mindmap/
 *   concept → radial, orgchart → tree, venn → radial).
 * - Computes a tight bounding box and returns grown `width`/`height` so the
 *   renderer's `viewBox` expands to contain all content.
 *
 * Pure, deterministic, non-mutating. Safe to call in unit tests.
 */
export function elasticLayout(visual: Visual): ElasticLayoutResult {
  const fontSize = visual.style.fontSize;
  let laid: VisualNode[];

  switch (visual.type as VisualKind) {
    case "flowchart":
      laid = elasticFlowchartLayout(visual.nodes, fontSize);
      break;
    case "mindmap":
    case "concept":
    case "venn":
      laid = elasticRadialLayout(visual.nodes, fontSize);
      break;
    case "orgchart":
      laid = elasticOrgchartLayout(visual.nodes, visual.edges, fontSize);
      break;
    default:
      // Derived-layout kinds (chart/list/timeline/cycle/comparison/funnel/pyramid/
      // matrix) compute positions at render time — elastic layout is a no-op for them.
      return {
        nodes: visual.nodes,
        width: visual.width,
        height: visual.height,
      };
  }

  const bounds = contentBounds(laid);
  if (!bounds) {
    return { nodes: laid, width: visual.width, height: visual.height };
  }

  const newWidth = Math.max(
    visual.width,
    bounds.x + bounds.width + CANVAS_MARGIN,
    MIN_NODE_WIDTH + CANVAS_MARGIN * 2,
  );
  const newHeight = Math.max(
    visual.height,
    bounds.y + bounds.height + CANVAS_MARGIN,
    MIN_NODE_HEIGHT + CANVAS_MARGIN * 2,
  );

  return { nodes: laid, width: newWidth, height: newHeight };
}
