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

import type {
  ConnectorEndpoint,
  DeckV7,
  SlideNode,
  SlideChildNode,
} from "./schema";
import type { ThemePackageV1 } from "./theme-package-schema";
import type {
  ResolvedDeckRenderTree,
  ResolvedSlideRenderTree,
  ResolvedRenderNode,
  ResolvedNodeContent,
  ResolvedSlideBackground,
} from "./render-tree";
import { resolveNodeStyle, resolveTheme } from "./style-resolver";
import { DiagnosticCollector, retargetDiagnostic } from "./diagnostics";
import type { StyleObject } from "./style-schema";
import { normalizeVisualChannelColors } from "./visual-channel-colors";

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
        {
          nodeId: node.id,
          slideId: slide.id,
          action: { type: "open-asset-panel" },
          details: { assetId },
        },
      );
    }
  }
  if (node.type === "visual") {
    const { assetId } = node.content;
    if (assetId && !deck.assets.visuals?.[assetId]) {
      dc.error(
        "missing-asset",
        `Visual node "${node.id}" references missing asset "${assetId}"`,
        {
          nodeId: node.id,
          slideId: slide.id,
          action: { type: "open-asset-panel" },
          details: { assetId },
        },
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
    for (const d of diagnostics) {
      dc.add(retargetDiagnostic(d, { nodeId: node.id, slideId: slide.id }));
    }
  }

  if (node.type === "visual") {
    const { unsupportedChannels } = normalizeVisualChannelColors(
      resolvedStyle.visual?.channelColors,
    );
    for (const channel of unsupportedChannels) {
      dc.warning(
        "unsupported-export-feature",
        `Visual node "${node.id}" uses unsupported channel color "${channel}"; render and export ignore it`,
        {
          nodeId: node.id,
          slideId: slide.id,
          path: `slides.${slide.id}.nodes.${node.id}.style.visual.channelColors.${channel}`,
          details: { channel },
        },
      );
    }
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
      locked: node.locked,
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
      content = {
        type: "connector",
        content: {
          ...node.content,
          from: resolveConnectorEndpoint(node.content.from, node, slide),
          to: resolveConnectorEndpoint(node.content.to, node, slide),
        },
      };
      break;
    case "table":
      content = { type: "table", content: node.content };
      break;
    case "visual":
      if (node.content.assetId) {
        const visualAsset = deck.assets.visuals?.[node.content.assetId];
        content = {
          type: "visual",
          content: {
            ...node.content,
            ...(visualAsset?.visualId && node.content.visualId === undefined
              ? { visualId: visualAsset.visualId }
              : {}),
            ...(visualAsset?.alt && node.content.alt === undefined
              ? { alt: visualAsset.alt }
              : {}),
          },
        };
      } else {
        content = { type: "visual", content: node.content };
      }
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
    locked: node.locked,
  };
}

function resolveConnectorEndpoint(
  endpoint: ConnectorEndpoint,
  connector: SlideChildNode,
  slide: SlideNode,
): ConnectorEndpoint {
  if (endpoint.kind === "point") return endpoint;
  if (!connector.layout) return endpoint;
  const target = findSlideChildNode(slide.children, endpoint.nodeId);
  if (!target?.layout) return endpoint;
  const anchor = targetAnchorPoint(target.layout.frame, endpoint.anchor);
  const frame = connector.layout.frame;
  if (frame.w <= 0 || frame.h <= 0) return endpoint;
  return {
    kind: "point",
    point: {
      x: ((anchor.x - frame.x) / frame.w) * 100,
      y: ((anchor.y - frame.y) / frame.h) * 100,
    },
  };
}

function findSlideChildNode(
  nodes: readonly SlideChildNode[],
  id: string,
): SlideChildNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === "group") {
      const found = findSlideChildNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function targetAnchorPoint(
  frame: { x: number; y: number; w: number; h: number },
  anchor: Extract<ConnectorEndpoint, { kind: "node" }>["anchor"],
): { x: number; y: number } {
  switch (anchor) {
    case "top":
      return { x: frame.x + frame.w / 2, y: frame.y };
    case "right":
      return { x: frame.x + frame.w, y: frame.y + frame.h / 2 };
    case "bottom":
      return { x: frame.x + frame.w / 2, y: frame.y + frame.h };
    case "left":
      return { x: frame.x, y: frame.y + frame.h / 2 };
    case "center":
    default:
      return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
  }
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

    if (
      recipe.appliesTo?.templateKinds &&
      !recipe.appliesTo.templateKinds.includes(slide.template.kind)
    ) {
      continue;
    }
    if (
      recipe.appliesTo?.layoutIds &&
      (slide.template.layoutId === undefined ||
        !recipe.appliesTo.layoutIds.includes(slide.template.layoutId))
    ) {
      continue;
    }

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
    const { style, diagnostics } = resolveNodeStyle(
      slide.style,
      deck.theme,
      pkg,
      slide.localStyle,
    );
    slideFill = style.slide?.background;
    for (const d of diagnostics) dc.add(d);
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
