/**
 * Pure, framework-free data transforms for {@link Visual} documents — the
 * single home for the "edit / restyle" operations the visual UI performs.
 *
 * Every function here is a **pure** transform: it takes a `Visual` and returns a
 * brand-new `Visual` without ever mutating its input, and its output is always
 * structurally valid against `@/lib/visual/schema` (so the result can be handed
 * straight to `node.setVisual(...)` inside an `editor.update()` and round-trips
 * through `safeParseVisual`). There are intentionally no React/Lexical imports:
 * the UI (Switch's Phase 3 chrome) calls these helpers from inside its own
 * `editor.update()` blocks, keeping the mutation logic testable in isolation.
 *
 * `contentJson` remains the single source of truth — these transforms only ever
 * compute the *next* `Visual` value; persistence/versioning is handled by the
 * unchanged save → `mirrorVisualNodes` path (`actions.ts`).
 */

import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type Visual,
  type VisualEdge,
  type VisualKind,
  type VisualNode,
  type VisualStyle,
} from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";

/** Per-node color override fields the selected-element controls can set. */
export type NodeStyleField = "color" | "stroke" | "textColor";

function cloneStyle(style: VisualStyle): VisualStyle {
  return { ...style, palette: [...style.palette] };
}

function cloneNode(node: VisualNode): VisualNode {
  return { ...node };
}

function cloneEdge(edge: VisualEdge): VisualEdge {
  return { ...edge };
}

/**
 * Deep-enough clone of a {@link Visual}: a fresh top-level object with cloned
 * `style` (palette array copied), `nodes`, and `edges` so callers can never
 * observe a mutation of their input. The shared base for every transform below.
 */
function cloneVisual(visual: Visual): Visual {
  return {
    ...visual,
    style: cloneStyle(visual.style),
    nodes: visual.nodes.map(cloneNode),
    edges: visual.edges.map(cloneEdge),
  };
}

/**
 * Applies a named palette theme (looked up by `themeId` from the
 * {@link STYLE_THEMES} registry) to the whole visual — the "theme-first,
 * one-click restyle" path. Theme colors (`palette` + base colors) are merged
 * over the current style while **typography is preserved**
 * (`fontFamily`/`fontSize`/`fontWeight` are untouched).
 *
 * The theme is resolved dynamically from the registry, so any theme Mouse adds
 * to `themes.ts` works automatically with no change here. An unknown `themeId`
 * is a safe no-op: a fresh, unchanged clone is returned (never the input).
 */
export function applyTheme(visual: Visual, themeId: string): Visual {
  const next = cloneVisual(visual);
  const theme = STYLE_THEMES.find((entry) => entry.id === themeId);
  if (!theme) {
    return next;
  }
  next.style = {
    ...next.style,
    ...theme.colors,
    palette: [...theme.colors.palette],
  };
  return next;
}

/**
 * Whether `visual`'s current style matches the theme identified by `themeId`
 * (so the UI can render the active theme chip). Compares the theme-controlled
 * colors only (typography is ignored, mirroring {@link applyTheme}). An unknown
 * `themeId` returns `false`.
 */
export function isThemeActive(visual: Visual, themeId: string): boolean {
  const theme = STYLE_THEMES.find((entry) => entry.id === themeId);
  if (!theme) {
    return false;
  }
  const { style } = visual;
  const colors = theme.colors;
  return (
    style.background === colors.background &&
    style.nodeFill === colors.nodeFill &&
    style.nodeStroke === colors.nodeStroke &&
    style.nodeText === colors.nodeText &&
    style.edgeColor === colors.edgeColor &&
    style.palette.length === colors.palette.length &&
    style.palette.every((color, index) => color === colors.palette[index])
  );
}

/**
 * Merges a partial {@link VisualStyle} patch over the visual's style — the
 * single helper behind every whole-visual style control (background / node fill
 * / border / text / edge colors, font size, font weight). When the patch
 * includes a `palette`, the array is copied so the caller's array is never
 * aliased.
 */
export function setVisualStyle(
  visual: Visual,
  patch: Partial<VisualStyle>,
): Visual {
  const next = cloneVisual(visual);
  next.style = { ...next.style, ...patch };
  if (patch.palette) {
    next.style.palette = [...patch.palette];
  }
  return next;
}

/** Sets a single per-node color override (fill / border / text) on one node. */
export function setNodeStyle(
  visual: Visual,
  id: string,
  field: NodeStyleField,
  value: string,
): Visual {
  const next = cloneVisual(visual);
  next.nodes = next.nodes.map((node) =>
    node.id === id ? { ...node, [field]: value } : node,
  );
  return next;
}

/** Clears every per-node color override, falling back to the theme defaults. */
export function resetNodeStyle(visual: Visual, id: string): Visual {
  const next = cloneVisual(visual);
  next.nodes = next.nodes.map((node) => {
    if (node.id !== id) {
      return node;
    }
    const reset = { ...node };
    delete reset.color;
    delete reset.stroke;
    delete reset.textColor;
    return reset;
  });
  return next;
}

/** Assigns a catalog icon name to a node. */
export function setNodeIcon(visual: Visual, id: string, icon: string): Visual {
  const next = cloneVisual(visual);
  next.nodes = next.nodes.map((node) =>
    node.id === id ? { ...node, icon } : node,
  );
  return next;
}

/** Removes a node's icon, falling back to no icon. */
export function clearNodeIcon(visual: Visual, id: string): Visual {
  const next = cloneVisual(visual);
  next.nodes = next.nodes.map((node) => {
    if (node.id !== id) {
      return node;
    }
    const cleared = { ...node };
    delete cleared.icon;
    return cleared;
  });
  return next;
}

/** The shape used as the default for each positioned kind on a kind switch. */
const POSITIONED_SHAPE: Record<
  "flowchart" | "mindmap" | "concept",
  VisualNode["shape"]
> = {
  flowchart: "rounded",
  mindmap: "pill",
  concept: "ellipse",
};

function nodeWidth(node: VisualNode): number {
  return node.width ?? DEFAULT_NODE_WIDTH;
}

function nodeHeight(node: VisualNode): number {
  return node.height ?? DEFAULT_NODE_HEIGHT;
}

/**
 * Lays nodes out in a single vertical column centered horizontally — the
 * default layout for a `flowchart` kind switch. Positions are derived from node
 * order (existing `x`/`y` are replaced) so a freshly switched flowchart never
 * collapses onto a single point.
 */
function stackVerticalLayout(
  nodes: VisualNode[],
  width: number,
  height: number,
): VisualNode[] {
  const x = width / 2;
  const marginTop = 60;
  const marginBottom = 60;
  const span = Math.max(height - marginTop - marginBottom, 0);
  const step = nodes.length > 1 ? span / (nodes.length - 1) : 0;
  return nodes.map((node, index) => ({
    ...node,
    x,
    y: nodes.length > 1 ? marginTop + step * index : height / 2,
    width: nodeWidth(node),
    height: nodeHeight(node),
    shape: POSITIONED_SHAPE.flowchart,
  }));
}

/**
 * Lays nodes out with the first node at the canvas center and the rest evenly
 * spaced on a ring around it (starting at the top, going clockwise) — the
 * default layout for a `mindmap`/`concept` kind switch. Positions are derived
 * from node order/count (existing `x`/`y` are replaced).
 */
function radialLayout(
  nodes: VisualNode[],
  width: number,
  height: number,
  shape: VisualNode["shape"],
): VisualNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const margin = 24;
  const maxNodeWidth = Math.max(...nodes.map(nodeWidth), DEFAULT_NODE_WIDTH);
  const maxNodeHeight = Math.max(...nodes.map(nodeHeight), DEFAULT_NODE_HEIGHT);
  const radius = Math.max(
    Math.min(cx - maxNodeWidth / 2 - margin, cy - maxNodeHeight / 2 - margin),
    40,
  );
  const branchCount = Math.max(nodes.length - 1, 1);
  return nodes.map((node, index) => {
    const base = {
      ...node,
      width: nodeWidth(node),
      height: nodeHeight(node),
      shape,
    };
    if (index === 0) {
      return { ...base, x: cx, y: cy };
    }
    const angle = -Math.PI / 2 + ((index - 1) / branchCount) * Math.PI * 2;
    return {
      ...base,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

/**
 * Switches a visual to a different {@link VisualKind}, preserving as much
 * node/edge/label data as sensibly maps:
 *
 * - All node labels, values, icons, and per-node color overrides are kept, and
 *   every edge (which references node ids) is preserved.
 * - Switching to a **positioned** kind (`flowchart`/`mindmap`/`concept`) assigns
 *   fresh `x`/`y` positions (and the kind's default node shape) so the nodes
 *   don't overlap — a flowchart stacks vertically; mindmaps/concepts fan out
 *   radially around the first node.
 * - Switching to a **derived-layout** kind (`chart`/`list`/`timeline`/`cycle`/
 *   `comparison`/`funnel`) drops stale `x`/`y` since those kinds compute node
 *   positions from order at render time (see `layout.ts`).
 *
 * Switching to the same kind returns an unchanged clone. The result is always
 * schema-valid for the new kind.
 */
export function setVisualKind(visual: Visual, kind: VisualKind): Visual {
  const next = cloneVisual(visual);
  if (kind === visual.type) {
    return next;
  }
  next.type = kind;

  switch (kind) {
    case "flowchart":
      next.nodes = stackVerticalLayout(next.nodes, next.width, next.height);
      break;
    case "mindmap":
      next.nodes = radialLayout(
        next.nodes,
        next.width,
        next.height,
        POSITIONED_SHAPE.mindmap,
      );
      break;
    case "concept":
      next.nodes = radialLayout(
        next.nodes,
        next.width,
        next.height,
        POSITIONED_SHAPE.concept,
      );
      break;
    default:
      // Derived-layout kinds position nodes from order at render time, so any
      // stale x/y from the previous kind is dropped to keep the payload clean.
      next.nodes = next.nodes.map((node) => {
        const stripped = { ...node };
        delete stripped.x;
        delete stripped.y;
        return stripped;
      });
      break;
  }

  return next;
}
