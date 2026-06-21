/**
 * Named color themes for the style panel (US-014). Each theme is a partial
 * {@link VisualStyle} covering the palette + base colors; applying a theme
 * merges these over the visual's current style while preserving typography
 * (`fontFamily`/`fontSize`/`fontWeight`).
 */

import type { VisualStyle } from "@/lib/visual/schema";

/** The style fields a theme controls (colors only — typography is preserved). */
type ThemeColors = Pick<
  VisualStyle,
  | "palette"
  | "background"
  | "nodeFill"
  | "nodeStroke"
  | "nodeText"
  | "edgeColor"
>;

export interface StyleTheme {
  id: string;
  name: string;
  colors: ThemeColors;
}

/**
 * The curated theme set. Each theme is internally harmonious: the palette,
 * fill, stroke, text and edge colors are drawn from one hue family so a visual
 * reads as a single designed object. Label text (`nodeText`) on `nodeFill`
 * clears WCAG AA (≥4.5:1) in every theme — the lowest is ~8:1 — so labels stay
 * legible at small sizes. `nodeStroke` is a mid-tone of the family that defines
 * the node edge against `background`; `edgeColor` is a soft tint for connectors
 * so the flow reads as secondary to the nodes themselves.
 *
 * These are visual-CONTENT colors (baked into the Visual data), intentionally
 * independent of the app's `--ds-*` chrome tokens.
 */
export const STYLE_THEMES: StyleTheme[] = [
  {
    id: "indigo",
    name: "Indigo",
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
    id: "ocean",
    name: "Ocean",
    colors: {
      palette: [
        "#0ea5e9",
        "#06b6d4",
        "#3b82f6",
        "#2563eb",
        "#14b8a6",
        "#0284c7",
      ],
      background: "#f6fbff",
      nodeFill: "#e0f2fe",
      nodeStroke: "#0284c7",
      nodeText: "#0c4a6e",
      edgeColor: "#7dd3fc",
    },
  },
  {
    id: "forest",
    name: "Forest",
    colors: {
      palette: [
        "#16a34a",
        "#22c55e",
        "#84cc16",
        "#10b981",
        "#059669",
        "#4d7c0f",
      ],
      background: "#f6fdf8",
      nodeFill: "#dcfce7",
      nodeStroke: "#15803d",
      nodeText: "#14532d",
      edgeColor: "#86efac",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    colors: {
      palette: [
        "#f97316",
        "#ef4444",
        "#f59e0b",
        "#ec4899",
        "#e11d48",
        "#d97706",
      ],
      background: "#fffaf5",
      nodeFill: "#ffedd5",
      nodeStroke: "#ea580c",
      nodeText: "#7c2d12",
      edgeColor: "#fdba74",
    },
  },
  {
    id: "grape",
    name: "Grape",
    colors: {
      palette: [
        "#8b5cf6",
        "#a855f7",
        "#d946ef",
        "#ec4899",
        "#7c3aed",
        "#c026d3",
      ],
      background: "#fdf7ff",
      nodeFill: "#f3e8ff",
      nodeStroke: "#7c3aed",
      nodeText: "#4c1d95",
      edgeColor: "#d8b4fe",
    },
  },
  {
    id: "rose",
    name: "Rose",
    colors: {
      palette: [
        "#e11d48",
        "#f43f5e",
        "#fb7185",
        "#ec4899",
        "#be123c",
        "#9f1239",
      ],
      background: "#fff5f7",
      nodeFill: "#ffe4e6",
      nodeStroke: "#e11d48",
      nodeText: "#881337",
      edgeColor: "#fda4af",
    },
  },
  {
    id: "amber",
    name: "Amber",
    colors: {
      palette: [
        "#d97706",
        "#f59e0b",
        "#eab308",
        "#ea580c",
        "#ca8a04",
        "#b45309",
      ],
      background: "#fffdf5",
      nodeFill: "#fef3c7",
      nodeStroke: "#d97706",
      nodeText: "#78350f",
      edgeColor: "#facc15",
    },
  },
  {
    id: "slate",
    name: "Slate",
    colors: {
      palette: [
        "#334155",
        "#475569",
        "#64748b",
        "#94a3b8",
        "#1e293b",
        "#0f172a",
      ],
      background: "#f8fafc",
      nodeFill: "#f1f5f9",
      nodeStroke: "#475569",
      nodeText: "#0f172a",
      edgeColor: "#cbd5e1",
    },
  },
];
