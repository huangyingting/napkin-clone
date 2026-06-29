/**
 * Render tree resolver for the v7 presentation system.
 *
 * `resolveDeckRenderTree` converts a `DeckV7` + loaded `ThemePackageV1` into a
 * `ResolvedDeckRenderTree` that all rendering and export surfaces consume.
 *
 * Rules:
 * - Hidden nodes are excluded.
 * - User nodes are ordered by ascending zIndex with stable tree-order ties.
 * - Theme decorations are injected into `ResolvedSlideRenderTree.decorations`.
 * - Decorations disabled in `DeckThemeBinding.overrides.disabledDecorations`
 *   are omitted.
 * - Decoration visibility is filtered by `SlideProps.decoration` and chrome
 *   by `SlideProps.chrome`.
 * - All token refs are resolved before returning.
 * - Unresolved assets, style refs, and token refs produce diagnostics.
 */

import type { DeckV7, SlideNode, SlideChildNode } from "./schema";
import type { ThemePackageV1 } from "./theme-package-schema";
import type {
  ResolvedDeckRenderTree,
  ResolvedSlideRenderTree,
  ResolvedRenderNode,
  ResolvedNodeContent,
  ResolvedSlideBackground,
} from "./render-tree";
import { resolveNodeStyle, resolveTheme } from "./style-resolver";
import { DiagnosticCollector } from "./diagnostics";
import type { StyleObject } from "./style-schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converts a slide-percent frame to pixel frame given canvas dimensions. */
function frameToPx(
  frame: { x: number; y: number; w: number; h: number },
  canvasWidthPx: number,
  canvasHeightPx: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: (frame.x / 100) * canvasWidthPx,
    y: (frame.y / 100) * canvasHeightPx,
    w: (frame.w / 100) * canvasWidthPx,
    h: (frame.h / 100) * canvasHeightPx,
  };
}

// ---------------------------------------------------------------------------
// Child node resolver
// ---------------------------------------------------------------------------

function resolveChildNode(
  node: SlideChildNode,
  slide: SlideNode,
  deck: DeckV7,
  pkg: ThemePackageV1,
  dc: DiagnosticCollector,
  canvasWidthPx = 960,
  canvasHeightPx = 540,
): ResolvedRenderNode | null {
  if (node.hidden) return null;
  if (!node.layout) {
    dc.error("missing-node-layout", `Node "${node.id}" has no layout`, {
      nodeId: node.id,
      slideId: slide.id,
    });
    return null;
  }

  // Validate asset references
  if (node.type === "image") {
    const assetId = node.content.assetId;
    if (assetId !== "placeholder" && !deck.assets.images[assetId]) {
      dc.error(
        "missing-asset",
        `Image node "${node.id}" references missing asset "${assetId}"`,
        { nodeId: node.id, slideId: slide.id, action: "open-asset-panel" },
      );
    }
  }
  if (node.type === "visual") {
    const { assetId } = node.content;
    if (assetId && !deck.assets.visuals?.[assetId]) {
      dc.error(
        "missing-asset",
        `Visual node "${node.id}" references missing asset "${assetId}"`,
        { nodeId: node.id, slideId: slide.id, action: "open-asset-panel" },
      );
    }
  }

  // Resolve style
  let resolvedStyle: StyleObject = {};
  if (node.style) {
    const { style: s, diagnostics } = resolveNodeStyle(
      node.style,
      deck.theme,
      pkg,
      node.localStyle,
    );
    resolvedStyle = s;
    for (const d of diagnostics) dc.add(d);
  }

  // Resolve layout
  const layout = node.layout;
  const resolvedLayout = {
    ...layout,
    framePx: frameToPx(layout.frame, canvasWidthPx, canvasHeightPx),
  };

  // Build content
  let content: ResolvedNodeContent;
  if (node.type === "group") {
    const children: ResolvedRenderNode[] = [];
    // Sort by zIndex ascending, stable by tree order
    const sorted = [...(node.children ?? [])].sort(
      (a, b) => (a.layout?.zIndex ?? 0) - (b.layout?.zIndex ?? 0),
    );
    for (const child of sorted) {
      const resolved = resolveChildNode(
        child,
        slide,
        deck,
        pkg,
        dc,
        canvasWidthPx,
        canvasHeightPx,
      );
      if (resolved) children.push(resolved);
    }
    content = { type: "group" };
    return {
      id: node.id,
      type: "group",
      role: node.role,
      layout: resolvedLayout,
      style: resolvedStyle,
      content,
      children,
      source: "user",
    };
  }

  switch (node.type) {
    case "text":
      content = { type: "text", content: node.content };
      break;
    case "image":
      content = { type: "image", content: node.content };
      break;
    case "shape":
      content = { type: "shape", content: node.content };
      break;
    case "connector":
      content = { type: "connector", content: node.content };
      break;
    case "table":
      content = { type: "table", content: node.content };
      break;
    case "visual":
      content = { type: "visual", content: node.content };
      break;
    default: {
      void (node as never);
      dc.warning(
        "unknown-template-kind",
        `Unknown node type encountered during render resolve`,
      );
      return null;
    }
  }

  return {
    id: node.id,
    type: node.type,
    role: node.role,
    layout: resolvedLayout,
    style: resolvedStyle,
    content,
    source: "user",
  };
}

// ---------------------------------------------------------------------------
// Decoration resolver
// ---------------------------------------------------------------------------

const DECORATION_VISIBILITY_RANK: Record<string, number> = {
  subtle: 1,
  default: 2,
  expressive: 3,
};

const DECORATION_LEVEL_RANK: Record<string, number> = {
  none: 0,
  subtle: 1,
  default: 2,
  expressive: 3,
};

function resolveDecorations(
  slide: SlideNode,
  pkg: ThemePackageV1,
  deck: DeckV7,
  _dc: DiagnosticCollector,
  canvasWidthPx = 960,
  canvasHeightPx = 540,
): ResolvedRenderNode[] {
  if (!pkg.decorations) return [];

  const disabledIds = new Set(deck.theme.overrides?.disabledDecorations ?? []);

  const decorationLevel = slide.props?.decoration ?? "default";
  const chromeLevel = slide.props?.chrome ?? "default";

  const result: ResolvedRenderNode[] = [];

  for (const recipe of Object.values(pkg.decorations)) {
    if (disabledIds.has(recipe.id)) continue;

    // Filter by visibility level
    if (recipe.visibility) {
      const recipeRank = DECORATION_VISIBILITY_RANK[recipe.visibility] ?? 2;
      const slideRank = DECORATION_LEVEL_RANK[decorationLevel] ?? 2;
      if (recipeRank > slideRank) continue;
    }

    // Filter by chrome level
    if (
      recipe.chrome &&
      recipe.chrome === "minimal" &&
      chromeLevel === "none"
    ) {
      continue;
    }

    result.push({
      id: `decoration-${recipe.id}`,
      type:
        recipe.component === "image"
          ? "image"
          : recipe.component === "text"
            ? "text"
            : "shape",
      role: "themeDecoration",
      layout: {
        ...recipe.layout,
        framePx: frameToPx(recipe.layout.frame, canvasWidthPx, canvasHeightPx),
      },
      style: recipe.style,
      content:
        recipe.component === "text" && recipe.content?.type === "text"
          ? {
              type: "text",
              content: {
                paragraphs: [
                  {
                    id: `decoration-${recipe.id}-p0`,
                    text: recipe.content.text,
                  },
                ],
              },
            }
          : recipe.component === "image" && recipe.content?.type === "image"
            ? {
                type: "image",
                content: { assetId: recipe.content.assetId },
              }
            : { type: "shape", content: { shape: "rect" as const } },
      source: "themeDecoration",
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Slide resolver
// ---------------------------------------------------------------------------

function resolveSlide(
  slide: SlideNode,
  deck: DeckV7,
  pkg: ThemePackageV1,
  dc: DiagnosticCollector,
  canvasWidthPx = 960,
  canvasHeightPx = 540,
): ResolvedSlideRenderTree {
  // Background
  let slideFill = undefined;
  if (slide.style) {
    const { style } = resolveNodeStyle(slide.style, deck.theme, pkg);
    slideFill = style.slide?.background;
  }

  const background: ResolvedSlideBackground = {
    fill: slideFill,
    decorationLevel: slide.props?.decoration ?? "default",
  };

  // Decorations (rendered behind user nodes)
  const decorations = resolveDecorations(
    slide,
    pkg,
    deck,
    dc,
    canvasWidthPx,
    canvasHeightPx,
  );

  // User nodes — filter hidden, sort by zIndex ascending (stable by source order)
  const visibleChildren = slide.children.filter((n) => !n.hidden);
  const sortedChildren = [...visibleChildren].sort(
    (a, b) => (a.layout?.zIndex ?? 0) - (b.layout?.zIndex ?? 0),
  );

  const nodes: ResolvedRenderNode[] = [];
  for (const child of sortedChildren) {
    const resolved = resolveChildNode(
      child,
      slide,
      deck,
      pkg,
      dc,
      canvasWidthPx,
      canvasHeightPx,
    );
    if (resolved) nodes.push(resolved);
  }

  return {
    id: slide.id,
    background,
    decorations,
    nodes,
    ...(slide.notes ? { notes: slide.notes } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ResolveDeckOptions = {
  /** Pixel width of the canvas for `framePx` calculation. Defaults to 960. */
  canvasWidthPx?: number;
  /** Pixel height of the canvas for `framePx` calculation. Defaults to 540. */
  canvasHeightPx?: number;
};

/**
 * Resolves a v7 deck into a `ResolvedDeckRenderTree`.
 *
 * All token refs are resolved. Hidden nodes are excluded.
 * Diagnostics for missing assets, unknown style refs, or missing layouts are
 * returned alongside the resolved tree.
 */
export function resolveDeckRenderTree(
  deck: DeckV7,
  pkg: ThemePackageV1,
  options?: ResolveDeckOptions,
): ResolvedDeckRenderTree {
  const dc = new DiagnosticCollector();
  const cw = options?.canvasWidthPx ?? 960;
  const ch = options?.canvasHeightPx ?? 540;

  const theme = resolveTheme(pkg, deck.theme);

  const slides: ResolvedSlideRenderTree[] = [];
  for (const slide of deck.slides) {
    slides.push(resolveSlide(slide, deck, pkg, dc, cw, ch));
  }

  return {
    canvas: deck.canvas,
    theme,
    slides,
    diagnostics: dc.diagnostics,
  };
}
