/**
 * Named display style presets for the style gallery (Issue #6).
 *
 * A display style is a holistic visual presentation preset that goes beyond
 * palette/color — it captures node shape language, connector style, and
 * typography weight together with a coordinated color scheme. Each preset is
 * intentionally visually-distinct so the gallery thumbnails read as clearly
 * different styles rather than subtle variations.
 *
 * Applying a display style is non-destructive: all node/edge/label content
 * (ids, labels, values, positions, per-node color overrides, icons) is
 * preserved; only presentation fields are swapped. These styles are
 * visual-content presets (baked into the Visual data), independent of the
 * app's `--ds-*` chrome tokens.
 *
 * Contrast guarantees: `nodeText` on `nodeFill` clears WCAG AA (≥4.5:1) in
 * every preset so labels stay legible at thumbnail sizes.
 */

import type { EdgeStyle, NodeShape, VisualStyle } from "@/lib/visual/schema";

/** The color profile controlled by a display style. */
export type DisplayStyleColors = Pick<
  VisualStyle,
  | "palette"
  | "background"
  | "nodeFill"
  | "nodeStroke"
  | "nodeText"
  | "edgeColor"
>;

/**
 * A single named display style preset. Combines a color profile with
 * structural/typographic presentation choices that together produce a clearly
 * distinct visual appearance.
 */
export interface VisualDisplayStyle {
  id: string;
  name: string;
  /** Short descriptor shown in the gallery tooltip. */
  description: string;
  /** Shape applied to every node when this style is activated. */
  nodeShape: NodeShape;
  /** Connector style applied to every edge. */
  edgeStyle: EdgeStyle;
  /** Base font weight (100–900). */
  fontWeight: number;
  /** Full color profile merged over the visual's VisualStyle. */
  colors: DisplayStyleColors;
}

/**
 * The curated set of visually-distinct display style presets shown in the
 * style gallery. Ordered from most neutral to most dramatic so the gallery
 * reads as a spectrum.
 */
export const VISUAL_DISPLAY_STYLES: VisualDisplayStyle[] = [
  {
    id: "clean",
    name: "Clean",
    description: "Rounded nodes, straight connectors, bright indigo palette.",
    nodeShape: "rounded",
    edgeStyle: "straight",
    fontWeight: 600,
    colors: {
      palette: [
        "#6366f1",
        "#0ea5e9",
        "#10b981",
        "#f59e0b",
        "#ef4444",
        "#8b5cf6",
      ],
      background: "#ffffff",
      nodeFill: "#eef2ff",
      nodeStroke: "#4f46e5",
      nodeText: "#312e81",
      edgeColor: "#a5b4fc",
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Pill nodes, curved connectors, restrained slate palette.",
    nodeShape: "pill",
    edgeStyle: "curved",
    fontWeight: 400,
    colors: {
      palette: [
        "#64748b",
        "#94a3b8",
        "#475569",
        "#334155",
        "#1e293b",
        "#0f172a",
      ],
      background: "#f8fafc",
      nodeFill: "#f1f5f9",
      nodeStroke: "#cbd5e1",
      nodeText: "#0f172a",
      edgeColor: "#e2e8f0",
    },
  },
  {
    id: "bold",
    name: "Bold",
    description: "Sharp rectangles, straight connectors, high-contrast fills.",
    nodeShape: "rectangle",
    edgeStyle: "straight",
    fontWeight: 800,
    colors: {
      palette: [
        "#16a34a",
        "#15803d",
        "#166534",
        "#14532d",
        "#4d7c0f",
        "#365314",
      ],
      background: "#f6fdf8",
      nodeFill: "#166534",
      nodeStroke: "#14532d",
      nodeText: "#f0fdf4",
      edgeColor: "#86efac",
    },
  },
  {
    id: "bubble",
    name: "Bubble",
    description: "Ellipse nodes, curved connectors, warm ocean blue palette.",
    nodeShape: "ellipse",
    edgeStyle: "curved",
    fontWeight: 500,
    colors: {
      palette: [
        "#0ea5e9",
        "#38bdf8",
        "#7dd3fc",
        "#0284c7",
        "#0369a1",
        "#06b6d4",
      ],
      background: "#f0f9ff",
      nodeFill: "#bae6fd",
      nodeStroke: "#0284c7",
      nodeText: "#0c4a6e",
      edgeColor: "#7dd3fc",
    },
  },
  {
    id: "dark",
    name: "Dark",
    description: "Dark canvas, rounded nodes, violet accents, curved edges.",
    nodeShape: "rounded",
    edgeStyle: "curved",
    fontWeight: 600,
    colors: {
      palette: [
        "#a78bfa",
        "#818cf8",
        "#c4b5fd",
        "#7c3aed",
        "#6d28d9",
        "#4c1d95",
      ],
      background: "#1e1b4b",
      nodeFill: "#312e81",
      nodeStroke: "#7c3aed",
      nodeText: "#ede9fe",
      edgeColor: "#4c1d95",
    },
  },
];
