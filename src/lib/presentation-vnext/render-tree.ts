/**
 * Resolved render tree for the v7 presentation system.
 *
 * All consumers (canvas, present mode, public render, image export, PPTX
 * export) share this one resolved tree. Token refs are resolved to concrete
 * values before reaching any adapter.
 */

import type { NodeId, CanvasSpec } from "./types";
import type { StyleObject, FillStyle } from "./style-schema";
import type {
  SemanticRole,
  SlideChildNode,
  TextContent,
  ImageContent,
  ShapeContent,
  ConnectorContent,
  TableContent,
  VisualContent,
  LayoutBox,
} from "./schema";
import type { ResolvedTheme } from "./style-resolver";
import type { PresentationDiagnostic } from "./diagnostics";

// ---------------------------------------------------------------------------
// Resolved layout
// ---------------------------------------------------------------------------

export type ResolvedLayoutBox = LayoutBox & {
  framePx?: { x: number; y: number; w: number; h: number };
};

// ---------------------------------------------------------------------------
// Resolved content (mirrors node content shapes but fully resolved)
// ---------------------------------------------------------------------------

export type ResolvedNodeContent =
  | { type: "text"; content: TextContent }
  | { type: "image"; content: ImageContent }
  | { type: "shape"; content: ShapeContent }
  | { type: "connector"; content: ConnectorContent }
  | { type: "table"; content: TableContent }
  | { type: "visual"; content: VisualContent }
  | { type: "group" };

// ---------------------------------------------------------------------------
// Resolved render node
// ---------------------------------------------------------------------------

export type ResolvedRenderNode = {
  id: NodeId;
  type: SlideChildNode["type"] | "group";
  role?: SemanticRole;
  layout: ResolvedLayoutBox;
  style: StyleObject;
  content: ResolvedNodeContent;
  children?: ResolvedRenderNode[];
  source: "user" | "themeDecoration";
};

// ---------------------------------------------------------------------------
// Slide background
// ---------------------------------------------------------------------------

export type ResolvedSlideBackground = {
  fill: FillStyle | undefined;
  decorationLevel: "none" | "subtle" | "default" | "expressive";
};

// ---------------------------------------------------------------------------
// Resolved slide render tree
// ---------------------------------------------------------------------------

export type ResolvedSlideRenderTree = {
  id: NodeId;
  background: ResolvedSlideBackground;
  decorations: ResolvedRenderNode[];
  nodes: ResolvedRenderNode[];
  notes?: string;
};

// ---------------------------------------------------------------------------
// Full deck render tree
// ---------------------------------------------------------------------------

export type ResolvedDeckRenderTree = {
  canvas: CanvasSpec;
  theme: ResolvedTheme;
  slides: ResolvedSlideRenderTree[];
  diagnostics: PresentationDiagnostic[];
};
