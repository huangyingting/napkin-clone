/**
 * Export spec for the v7 presentation system.
 *
 * Converts a `ResolvedDeckRenderTree` into a DOM-free `ExportDeckSpec`.
 * Browser / PPTX adapters apply operations and perform file-generation side
 * effects; this module is pure.
 *
 * Operation order matches resolved render order exactly.
 * Unsupported effects emit diagnostics with deterministic fallbacks.
 */

import type { NodeId, CanvasSpec } from "./types";
import type {
  ImageCrop,
  TextContent,
  TableContent,
  ConnectorEndpoint,
} from "./schema";
import type { ImageFitMode, StyleObject, FillStyle } from "./style-schema";
import type {
  ResolvedDeckRenderTree,
  ResolvedSlideRenderTree,
  ResolvedRenderNode,
} from "./render-tree";
import { DiagnosticCollector } from "./diagnostics";
import type { PresentationDiagnostic } from "./diagnostics";
import {
  normalizeVisualChannelColors,
  type ResolvedVisualChannelColors,
} from "./visual-channel-colors";

// ---------------------------------------------------------------------------
// Export operation types
// ---------------------------------------------------------------------------

export type ExportBackgroundOperation = {
  type: "background";
  fill?: FillStyle;
};

export type ExportTextOperation = {
  type: "text";
  id: NodeId;
  frame: { x: number; y: number; w: number; h: number };
  content: TextContent;
  style: StyleObject;
  rotation?: number;
  zIndex: number;
};

export type ExportShapeOperation = {
  type: "shape";
  id: NodeId;
  shape: string;
  frame: { x: number; y: number; w: number; h: number };
  style: StyleObject;
  text?: TextContent;
  rotation?: number;
  zIndex: number;
};

export type ExportImageOperation = {
  type: "image";
  id: NodeId;
  assetId: string;
  frame: { x: number; y: number; w: number; h: number };
  style: StyleObject;
  fit?: ImageFitMode;
  crop?: ImageCrop;
  alt?: string;
  rotation?: number;
  zIndex: number;
};

export type ExportConnectorOperation = {
  type: "connector";
  id: NodeId;
  from: ConnectorEndpoint;
  to: ConnectorEndpoint;
  routing?: "straight" | "elbow" | "curved";
  frame: { x: number; y: number; w: number; h: number };
  style: StyleObject;
  zIndex: number;
};

export type ExportVisualOperation = {
  type: "visual";
  id: NodeId;
  assetId?: string;
  visualId?: string;
  frame: { x: number; y: number; w: number; h: number };
  style: StyleObject;
  channelColors?: ResolvedVisualChannelColors;
  transparentBackground?: boolean;
  alt?: string;
  rotation?: number;
  zIndex: number;
};

export type ExportTableShapeOperation = {
  type: "tableShape";
  id: NodeId;
  frame: { x: number; y: number; w: number; h: number };
  style: StyleObject;
  table: TableContent;
  zIndex: number;
};

export type ExportOperation =
  | ExportTextOperation
  | ExportShapeOperation
  | ExportImageOperation
  | ExportConnectorOperation
  | ExportVisualOperation
  | ExportTableShapeOperation;

// ---------------------------------------------------------------------------
// Slide export spec
// ---------------------------------------------------------------------------

export type ExportSlideSpec = {
  id: NodeId;
  background: ExportBackgroundOperation;
  operations: ExportOperation[];
  notes?: string;
};

// ---------------------------------------------------------------------------
// Deck export spec
// ---------------------------------------------------------------------------

export type ExportDeckSpec = {
  canvas: CanvasSpec;
  slides: ExportSlideSpec[];
  diagnostics: PresentationDiagnostic[];
};

// ---------------------------------------------------------------------------
// Frame helpers
// ---------------------------------------------------------------------------

function resolvedFrame(node: ResolvedRenderNode): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  // Prefer pixel frame if available, fall back to percent frame
  if (node.layout.framePx) return node.layout.framePx;
  return node.layout.frame;
}

// ---------------------------------------------------------------------------
// Node to operation conversion
// ---------------------------------------------------------------------------

function nodeToOperations(
  node: ResolvedRenderNode,
  dc: DiagnosticCollector,
): ExportOperation[] {
  const frame = resolvedFrame(node);
  const { style, layout } = node;
  const rotation = layout.rotation;
  const zIndex = layout.zIndex;

  // Check for unsupported effects
  if (style.effect && style.effect.kind !== "none") {
    if (style.effect.kind === "glass" || style.effect.kind === "blur") {
      const isThemeDecoration = node.source === "themeDecoration";
      dc.warning(
        isThemeDecoration
          ? "theme-decoration-export-fallback"
          : "unsupported-export-feature",
        `Node "${node.id}": effect "${style.effect.kind}" uses a deterministic export fallback`,
        {
          nodeId: node.id,
          ...(isThemeDecoration
            ? {
                details: {
                  decorationId: node.id.replace(/^decoration-/, ""),
                  exportFeature: "theme-decoration-effect",
                },
              }
            : { action: { type: "replace-style-ref" as const } }),
        },
      );
    }
  }

  if (node.type === "group") {
    const ops: ExportOperation[] = [];
    for (const child of node.children ?? []) {
      ops.push(...nodeToOperations(child, dc));
    }
    return ops;
  }

  switch (node.content.type) {
    case "text":
      return [
        {
          type: "text",
          id: node.id,
          frame,
          content: node.content.content,
          style,
          ...(rotation !== undefined ? { rotation } : {}),
          zIndex,
        },
      ];
    case "image": {
      const fit = node.content.content.fit ?? style.image?.fit;
      return [
        {
          type: "image",
          id: node.id,
          assetId: node.content.content.assetId,
          frame,
          style,
          ...(fit ? { fit } : {}),
          ...(node.content.content.crop
            ? { crop: node.content.content.crop }
            : {}),
          ...(node.content.content.alt
            ? { alt: node.content.content.alt }
            : {}),
          ...(rotation !== undefined ? { rotation } : {}),
          zIndex,
        },
      ];
    }
    case "shape":
      return [
        {
          type: "shape",
          id: node.id,
          shape: node.content.content.shape,
          frame,
          style,
          ...(node.content.content.text
            ? { text: node.content.content.text }
            : {}),
          ...(rotation !== undefined ? { rotation } : {}),
          zIndex,
        },
      ];
    case "connector":
      return [
        {
          type: "connector",
          id: node.id,
          from: node.content.content.from,
          to: node.content.content.to,
          ...(node.content.content.routing
            ? { routing: node.content.content.routing }
            : {}),
          frame,
          style,
          zIndex,
        },
      ];
    case "visual": {
      const channelColors = normalizeVisualChannelColors(
        style.visual?.channelColors,
      ).colors;
      const transparentBackground =
        node.content.content.transparentBackground ??
        style.visual?.transparentBackground;
      return [
        {
          type: "visual",
          id: node.id,
          ...(node.content.content.assetId
            ? { assetId: node.content.content.assetId }
            : {}),
          ...(node.content.content.visualId
            ? { visualId: node.content.content.visualId }
            : {}),
          frame,
          style,
          ...(Object.keys(channelColors).length > 0 ? { channelColors } : {}),
          ...(transparentBackground !== undefined
            ? { transparentBackground }
            : {}),
          ...(node.content.content.alt
            ? { alt: node.content.content.alt }
            : {}),
          ...(rotation !== undefined ? { rotation } : {}),
          zIndex,
        },
      ];
    }
    case "table":
      // Table compiles into a tableShape operation for export
      return [
        {
          type: "tableShape",
          id: node.id,
          frame,
          style,
          table: node.content.content,
          zIndex,
        },
      ];
    case "group":
      return [];
    default: {
      void (node.content as never);
      dc.warning(
        "unsupported-export-feature",
        `Node "${node.id}": unknown content type in export`,
      );
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Slide export spec builder
// ---------------------------------------------------------------------------

function buildSlideExportSpec(
  slide: ResolvedSlideRenderTree,
  dc: DiagnosticCollector,
): ExportSlideSpec {
  const background: ExportBackgroundOperation = {
    type: "background",
    fill: slide.background.fill,
  };

  const operations: ExportOperation[] = [];

  // Decorations first (render order: behind user nodes)
  for (const decoration of slide.decorations) {
    operations.push(...nodeToOperations(decoration, dc));
  }

  // Background chrome (e.g. watermark) sits above decorations and below user nodes.
  for (const chrome of slide.chrome
    .filter((node) => (node.layout.zIndex ?? 0) < 0)
    .sort((a, b) => (a.layout.zIndex ?? 0) - (b.layout.zIndex ?? 0))) {
    operations.push(...nodeToOperations(chrome, dc));
  }

  // User nodes in resolved order (already sorted by zIndex in render resolver)
  for (const node of slide.nodes) {
    operations.push(...nodeToOperations(node, dc));
  }

  // Foreground chrome (logo/footer/page number/border/safe-area) overlays content.
  for (const chrome of slide.chrome
    .filter((node) => (node.layout.zIndex ?? 0) >= 0)
    .sort((a, b) => (a.layout.zIndex ?? 0) - (b.layout.zIndex ?? 0))) {
    operations.push(...nodeToOperations(chrome, dc));
  }

  return {
    id: slide.id,
    background,
    operations,
    ...(slide.notes ? { notes: slide.notes } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a resolved render tree into a DOM-free `ExportDeckSpec`.
 *
 * This function is pure. Adapters (browser, PPTX, image) apply the spec.
 */
export function buildExportSpec(
  renderTree: ResolvedDeckRenderTree,
): ExportDeckSpec {
  const dc = new DiagnosticCollector();
  // Carry forward any render-resolve diagnostics
  for (const d of renderTree.diagnostics) dc.add(d);

  const slides: ExportSlideSpec[] = [];
  for (const slide of renderTree.slides) {
    slides.push(buildSlideExportSpec(slide, dc));
  }

  return {
    canvas: renderTree.canvas,
    slides,
    diagnostics: dc.diagnostics,
  };
}
