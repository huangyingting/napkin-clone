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
  DeckChromeBorder,
  DeckChromeConfig,
  DeckChromeFooter,
  DeckChromeKind,
  DeckChromeLogo,
  DeckChromePageNumber,
  DeckChromeSafeArea,
  DeckChromeWatermark,
  DeckV7,
  LayoutBox,
  SlideProps,
  SlideNode,
  SlideChildNode,
  TextContent,
} from "./schema";
import type { ThemePackageV1 } from "./theme-package-schema";
import type {
  ResolvedDeckRenderTree,
  ResolvedSlideRenderTree,
  ResolvedRenderNode,
  ResolvedNodeContent,
  ResolvedSlideBackground,
} from "./render-tree";
import {
  resolveNodeStyle,
  resolveTheme,
  resolveTokensInStyle,
} from "./style-resolver";
import { DiagnosticCollector, retargetDiagnostic } from "./diagnostics";
import type { StyleObject, StylePatch } from "./style-schema";
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
    const crop = node.content.crop;
    if (crop) {
      const invalidSides = (["top", "right", "bottom", "left"] as const).filter(
        (side) => {
          const value = crop[side];
          return !Number.isFinite(value) || value < 0 || value > 95;
        },
      );
      if (
        invalidSides.length > 0 ||
        crop.left + crop.right >= 99 ||
        crop.top + crop.bottom >= 99
      ) {
        dc.warning(
          "unsupported-export-feature",
          `Image node "${node.id}" has crop values outside safe bounds; render clamps the crop UI and export may differ`,
          {
            nodeId: node.id,
            slideId: slide.id,
            path: `slides.${slide.id}.nodes.${node.id}.content.crop`,
            details: {
              invalidSides,
              horizontalCrop: crop.left + crop.right,
              verticalCrop: crop.top + crop.bottom,
            },
          },
        );
      }
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
          from: resolveConnectorEndpoint(
            node.content.from,
            node,
            slide,
            dc,
            "from",
          ),
          to: resolveConnectorEndpoint(node.content.to, node, slide, dc, "to"),
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
  dc: DiagnosticCollector,
  endpointKey: "from" | "to",
): ConnectorEndpoint {
  if (endpoint.kind === "point") return endpoint;
  if (!connector.layout) return endpoint;
  const target = findSlideChildNode(slide.children, endpoint.nodeId);
  if (!target?.layout) {
    dc.warning(
      "unsupported-export-feature",
      `Connector "${connector.id}" ${endpointKey} endpoint references missing node "${endpoint.nodeId}"`,
      {
        nodeId: connector.id,
        slideId: slide.id,
        path: `slides.${slide.id}.nodes.${connector.id}.content.${endpointKey}`,
        details: { targetNodeId: endpoint.nodeId, anchor: endpoint.anchor },
      },
    );
    return endpoint;
  }
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
  dc: DiagnosticCollector,
  canvasWidthPx = 960,
  canvasHeightPx = 540,
): ResolvedRenderNode[] {
  const disabledIds = new Set(deck.theme.overrides?.disabledDecorations ?? []);
  if (!pkg.decorations) {
    for (const decorationId of disabledIds) {
      dc.warning(
        "missing-decoration",
        `Theme override disables missing decoration "${decorationId}"`,
        {
          slideId: slide.id,
          path: `theme.overrides.disabledDecorations.${decorationId}`,
          action: {
            type: "restore-decoration",
            payload: { decorationId },
          },
          details: {
            decorationId,
            themePackageId: pkg.id,
          },
        },
      );
    }
    return [];
  }

  for (const decorationId of disabledIds) {
    if (!pkg.decorations[decorationId]) {
      dc.warning(
        "missing-decoration",
        `Theme override disables missing decoration "${decorationId}"`,
        {
          slideId: slide.id,
          path: `theme.overrides.disabledDecorations.${decorationId}`,
          action: {
            type: "restore-decoration",
            payload: { decorationId },
          },
          details: {
            decorationId,
            themePackageId: pkg.id,
          },
        },
      );
    }
  }

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

    if (
      recipe.component === "image" &&
      recipe.content?.type === "image" &&
      !deck.assets.images[recipe.content.assetId] &&
      !pkg.assets?.images?.[recipe.content.assetId]
    ) {
      dc.error(
        "missing-decoration",
        `Theme decoration "${recipe.id}" references missing image asset "${recipe.content.assetId}"`,
        {
          slideId: slide.id,
          path: `decorations.${recipe.id}.content.assetId`,
          details: {
            decorationId: recipe.id,
            assetId: recipe.content.assetId,
            themePackageId: pkg.id,
          },
        },
      );
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
// Deck chrome resolver
// ---------------------------------------------------------------------------

const DECK_CHROME_KINDS: DeckChromeKind[] = [
  "logo",
  "watermark",
  "border",
  "safeArea",
  "footer",
  "pageNumber",
];

const LOGO_SIZE_FRAME: Record<
  NonNullable<DeckChromeLogo["size"]>,
  { w: number; h: number }
> = {
  small: { w: 8, h: 5 },
  medium: { w: 12, h: 7 },
  large: { w: 16, h: 9 },
};

const WATERMARK_FONT_SIZE: Record<
  NonNullable<DeckChromeWatermark["size"]>,
  number
> = {
  small: 28,
  medium: 40,
  large: 54,
};

function mergeStylePatch(
  base: StylePatch = {},
  patch?: StylePatch,
): StyleObject {
  if (!patch) return base as StyleObject;
  const result: StyleObject = { ...(base as StyleObject) };
  for (const key of Object.keys(patch) as (keyof StylePatch)[]) {
    const patchValue = patch[key];
    if (patchValue === undefined) continue;
    const baseValue = base[key];
    if (
      typeof baseValue === "object" &&
      baseValue !== null &&
      !Array.isArray(baseValue) &&
      typeof patchValue === "object" &&
      patchValue !== null &&
      !Array.isArray(patchValue)
    ) {
      (result as Record<string, unknown>)[key] = {
        ...(baseValue as Record<string, unknown>),
        ...(patchValue as Record<string, unknown>),
      };
    } else {
      (result as Record<string, unknown>)[key] = patchValue;
    }
  }
  return result;
}

function mergeChromeItem<T extends { style?: StylePatch }>(
  base: T | undefined,
  patch: Partial<T> | undefined,
): T | undefined {
  if (!base && !patch) return undefined;
  return {
    ...(base ?? ({} as T)),
    ...(patch ?? {}),
    style: mergeStylePatch(base?.style, patch?.style),
  } as T;
}

function mergeChromeConfig(
  base: Partial<DeckChromeConfig> | undefined,
  patch: Partial<DeckChromeConfig> | undefined,
): Partial<DeckChromeConfig> {
  if (!base) return patch ?? {};
  if (!patch) return base;
  return {
    logo: mergeChromeItem(base.logo, patch.logo),
    footer: mergeChromeItem(base.footer, patch.footer),
    pageNumber: mergeChromeItem(base.pageNumber, patch.pageNumber),
    watermark: mergeChromeItem(base.watermark, patch.watermark),
    border: mergeChromeItem(base.border, patch.border),
    safeArea: mergeChromeItem(base.safeArea, patch.safeArea),
  };
}

function baseDeckChromeConfig(
  deck: DeckV7,
  pkg: ThemePackageV1,
): Partial<DeckChromeConfig> {
  return mergeChromeConfig(
    mergeChromeConfig(pkg.chrome, deck.theme.overrides?.chrome),
    deck.chrome,
  );
}

function slideChromeItem<T extends { style?: StylePatch }>(
  base: T | undefined,
  override:
    | { mode: "inherit" }
    | { mode: "disabled" }
    | { mode: "detached"; nodeId?: string }
    | { mode: "override"; value: Partial<T> }
    | undefined,
): T | null | undefined {
  if (override?.mode === "disabled" || override?.mode === "detached") {
    return null;
  }
  if (override?.mode === "override") {
    return mergeChromeItem(base, override.value);
  }
  return base;
}

function logoFrame(item: DeckChromeLogo): LayoutBox {
  if (item.layout) return item.layout;
  const size = item.size ?? "medium";
  const placement = item.placement ?? "top-right";
  const box = LOGO_SIZE_FRAME[size] ?? LOGO_SIZE_FRAME.medium;
  const margin = 4;
  return {
    frame: {
      x: placement.endsWith("right") ? 100 - box.w - margin : margin,
      y: placement.startsWith("bottom") ? 100 - box.h - margin : margin,
      w: box.w,
      h: box.h,
    },
    zIndex: 920,
  };
}

function footerFrame(item: DeckChromeFooter): LayoutBox {
  return (
    item.layout ?? {
      frame: { x: 6, y: 91, w: 88, h: 5 },
      zIndex: 900,
    }
  );
}

function pageNumberFrame(item: DeckChromePageNumber): LayoutBox {
  if (item.layout) return item.layout;
  const placement = item.placement ?? "bottom-right";
  const width = 18;
  return {
    frame: {
      x:
        placement === "bottom-left"
          ? 6
          : placement === "bottom-center"
            ? (100 - width) / 2
            : 94 - width,
      y: 91,
      w: width,
      h: 5,
    },
    zIndex: 910,
  };
}

function watermarkFrame(item: DeckChromeWatermark): LayoutBox {
  if (item.layout) return item.layout;
  return {
    frame:
      item.layoutMode === "diagonal"
        ? { x: 10, y: 42, w: 80, h: 16 }
        : { x: 18, y: 42, w: 64, h: 16 },
    rotation: item.layoutMode === "diagonal" ? -28 : undefined,
    zIndex: -20,
  };
}

function borderFrame(item: DeckChromeBorder): LayoutBox {
  return (
    item.layout ?? {
      frame: { x: 1, y: 1, w: 98, h: 98 },
      zIndex: 930,
    }
  );
}

function safeAreaFrame(item: DeckChromeSafeArea, deck: DeckV7): LayoutBox {
  if (item.layout) return item.layout;
  const insets = item.insets ??
    deck.canvas.safeArea ?? { top: 6, right: 6, bottom: 6, left: 6 };
  return {
    frame: {
      x: insets.left,
      y: insets.top,
      w: Math.max(0.1, 100 - insets.left - insets.right),
      h: Math.max(0.1, 100 - insets.top - insets.bottom),
    },
    zIndex: 940,
  };
}

function textContent(id: string, text: string): TextContent {
  return { paragraphs: [{ id: `${id}-p0`, text }] };
}

function pageNumberText(
  item: DeckChromePageNumber,
  slideIndex: number,
  slideCount: number,
): string {
  return item.format === "number-total"
    ? `${slideIndex + 1} / ${slideCount}`
    : String(slideIndex + 1);
}

function pageNumberAlign(
  placement: DeckChromePageNumber["placement"],
): "left" | "center" | "right" {
  if (placement === "bottom-left") return "left";
  if (placement === "bottom-center") return "center";
  return "right";
}

function shouldRenderChromeKind(
  kind: DeckChromeKind,
  chromeLevel: SlideProps["chrome"] | undefined,
): boolean {
  if (chromeLevel === "none") return false;
  if (chromeLevel === "minimal") {
    return kind === "logo" || kind === "border" || kind === "safeArea";
  }
  return true;
}

function resolvedChromeLayout(
  layout: LayoutBox,
  canvasWidthPx: number,
  canvasHeightPx: number,
) {
  return {
    ...layout,
    framePx: frameToPx(layout.frame, canvasWidthPx, canvasHeightPx),
  };
}

function resolveChromeStyle(
  style: StyleObject,
  deck: DeckV7,
  pkg: ThemePackageV1,
  dc: DiagnosticCollector,
  ctx: string,
): StyleObject {
  return resolveTokensInStyle(
    style,
    resolveTheme(pkg, deck.theme).tokens,
    dc,
    ctx,
  );
}

function resolveDeckChrome(
  slide: SlideNode,
  deck: DeckV7,
  pkg: ThemePackageV1,
  slideIndex: number,
  slideCount: number,
  dc: DiagnosticCollector,
  canvasWidthPx = 960,
  canvasHeightPx = 540,
): ResolvedRenderNode[] {
  const base = baseDeckChromeConfig(deck, pkg);
  const overrides = slide.props?.deckChrome;
  const chromeLevel = slide.props?.chrome ?? "default";
  const result: ResolvedRenderNode[] = [];

  for (const kind of DECK_CHROME_KINDS) {
    if (!shouldRenderChromeKind(kind, chromeLevel)) continue;

    if (kind === "logo") {
      const item = slideChromeItem(base.logo, overrides?.logo);
      if (!item || item.enabled === false || !item.assetId) continue;
      const id = "deck-chrome-logo";
      if (item.assetId !== "placeholder" && !deck.assets.images[item.assetId]) {
        dc.error(
          "missing-asset",
          `Deck chrome logo references missing asset "${item.assetId}"`,
          {
            nodeId: id,
            slideId: slide.id,
            action: { type: "open-asset-panel" },
            details: { assetId: item.assetId },
          },
        );
      }
      result.push({
        id,
        type: "image",
        role: "image",
        layout: resolvedChromeLayout(
          logoFrame(item),
          canvasWidthPx,
          canvasHeightPx,
        ),
        style: resolveChromeStyle(
          mergeStylePatch({ image: { fit: "contain" } }, item.style),
          deck,
          pkg,
          dc,
          "chrome.logo.style",
        ),
        content: {
          type: "image",
          content: {
            assetId: item.assetId,
            alt: item.alt ?? "Deck logo",
            fit: "contain",
          },
        },
        source: "deckChrome",
        chromeKind: "logo",
        locked: true,
      });
      continue;
    }

    if (kind === "footer") {
      const item = slideChromeItem(base.footer, overrides?.footer);
      if (!item || item.enabled === false || !item.text) continue;
      const id = "deck-chrome-footer";
      const align = item.align ?? "center";
      result.push({
        id,
        type: "text",
        role: "caption",
        layout: resolvedChromeLayout(
          footerFrame(item),
          canvasWidthPx,
          canvasHeightPx,
        ),
        style: resolveChromeStyle(
          mergeStylePatch(
            {
              text: {
                fontSizePt: 9,
                color: "#64748b",
                align,
                verticalAlign: "middle",
              },
            },
            item.style,
          ),
          deck,
          pkg,
          dc,
          "chrome.footer.style",
        ),
        content: { type: "text", content: textContent(id, item.text) },
        source: "deckChrome",
        chromeKind: "footer",
        locked: true,
      });
      continue;
    }

    if (kind === "pageNumber") {
      const item = slideChromeItem(base.pageNumber, overrides?.pageNumber);
      if (!item || item.enabled === false) continue;
      const id = "deck-chrome-pageNumber";
      result.push({
        id,
        type: "text",
        role: "caption",
        layout: resolvedChromeLayout(
          pageNumberFrame(item),
          canvasWidthPx,
          canvasHeightPx,
        ),
        style: resolveChromeStyle(
          mergeStylePatch(
            {
              text: {
                fontSizePt: 9,
                color: "#64748b",
                align: pageNumberAlign(item.placement),
                verticalAlign: "middle",
              },
            },
            item.style,
          ),
          deck,
          pkg,
          dc,
          "chrome.pageNumber.style",
        ),
        content: {
          type: "text",
          content: textContent(
            id,
            pageNumberText(item, slideIndex, slideCount),
          ),
        },
        source: "deckChrome",
        chromeKind: "pageNumber",
        locked: true,
      });
      continue;
    }

    if (kind === "watermark") {
      const item = slideChromeItem(base.watermark, overrides?.watermark);
      if (!item || item.enabled === false || !item.text) continue;
      const id = "deck-chrome-watermark";
      const size = item.size ?? "medium";
      const fontSize = WATERMARK_FONT_SIZE[size] ?? WATERMARK_FONT_SIZE.medium;
      result.push({
        id,
        type: "text",
        role: "background",
        layout: resolvedChromeLayout(
          watermarkFrame(item),
          canvasWidthPx,
          canvasHeightPx,
        ),
        style: resolveChromeStyle(
          mergeStylePatch(
            {
              text: {
                fontSizePt: fontSize,
                color: "#64748b",
                weight: 700,
                align: "center",
                verticalAlign: "middle",
              },
              opacity: item.opacity ?? 0.18,
            },
            item.style,
          ),
          deck,
          pkg,
          dc,
          "chrome.watermark.style",
        ),
        content: { type: "text", content: textContent(id, item.text) },
        source: "deckChrome",
        chromeKind: "watermark",
        locked: true,
      });
      continue;
    }

    if (kind === "border") {
      const item = slideChromeItem(base.border, overrides?.border);
      if (!item || item.enabled === false) continue;
      result.push({
        id: "deck-chrome-border",
        type: "shape",
        role: "background",
        layout: resolvedChromeLayout(
          borderFrame(item),
          canvasWidthPx,
          canvasHeightPx,
        ),
        style: resolveChromeStyle(
          mergeStylePatch(
            {
              stroke: {
                color: item.color ?? "#cbd5e1",
                widthPt: item.widthPt ?? 1,
              },
            },
            item.style,
          ),
          deck,
          pkg,
          dc,
          "chrome.border.style",
        ),
        content: { type: "shape", content: { shape: "rect" as const } },
        source: "deckChrome",
        chromeKind: "border",
        locked: true,
      });
      continue;
    }

    const item = slideChromeItem(base.safeArea, overrides?.safeArea);
    if (!item || item.enabled === false) continue;
    result.push({
      id: "deck-chrome-safeArea",
      type: "shape",
      role: "background",
      layout: resolvedChromeLayout(
        safeAreaFrame(item, deck),
        canvasWidthPx,
        canvasHeightPx,
      ),
      style: resolveChromeStyle(
        mergeStylePatch(
          {
            stroke: {
              color: item.color ?? "#94a3b8",
              widthPt: item.widthPt ?? 0.75,
              dash: "dashed",
            },
            opacity: 0.5,
          },
          item.style,
        ),
        deck,
        pkg,
        dc,
        "chrome.safeArea.style",
      ),
      content: { type: "shape", content: { shape: "rect" as const } },
      source: "deckChrome",
      chromeKind: "safeArea",
      locked: true,
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
  slideIndex: number,
  slideCount: number,
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

  const chrome = resolveDeckChrome(
    slide,
    deck,
    pkg,
    slideIndex,
    slideCount,
    dc,
    canvasWidthPx,
    canvasHeightPx,
  );

  return {
    id: slide.id,
    background,
    decorations,
    chrome,
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
  for (const [index, slide] of deck.slides.entries()) {
    slides.push(
      resolveSlide(slide, deck, pkg, dc, index, deck.slides.length, cw, ch),
    );
  }

  return {
    canvas: deck.canvas,
    theme,
    slides,
    diagnostics: dc.diagnostics,
  };
}
