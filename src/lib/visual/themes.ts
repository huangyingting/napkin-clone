/**
 * Named color themes for the style panel (US-014). Each theme is a partial
 * {@link VisualStyle} covering the palette + base colors; applying a theme
 * merges these over the visual's current style while preserving typography
 * (`fontFamily`/`fontSize`/`fontWeight`).
 */

import type { VisualStyle } from "@/lib/visual/schema";

/** The style fields a theme controls (colors only — typography is preserved). */
export type ThemeColors = Pick<
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
      nodeStroke: "#6366f1",
      nodeText: "#1e1b4b",
      edgeColor: "#94a3b8",
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
        "#6366f1",
        "#14b8a6",
        "#0284c7",
      ],
      background: "#f0f9ff",
      nodeFill: "#e0f2fe",
      nodeStroke: "#0ea5e9",
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
        "#14b8a6",
        "#059669",
        "#65a30d",
      ],
      background: "#f0fdf4",
      nodeFill: "#dcfce7",
      nodeStroke: "#16a34a",
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
      background: "#fff7ed",
      nodeFill: "#ffedd5",
      nodeStroke: "#f97316",
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
      background: "#faf5ff",
      nodeFill: "#f3e8ff",
      nodeStroke: "#8b5cf6",
      nodeText: "#4c1d95",
      edgeColor: "#d8b4fe",
    },
  },
  {
    id: "slate",
    name: "Slate",
    colors: {
      palette: [
        "#475569",
        "#64748b",
        "#94a3b8",
        "#334155",
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
