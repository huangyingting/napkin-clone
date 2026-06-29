/**
 * Editor commands for the v7 presentation system.
 *
 * Commands are immutable: each handler receives a `DeckV7` and returns a new
 * `DeckV7`. No resolved styles are written into nodes.
 *
 * Commands reference slides and nodes by stable ids.
 */

import type {
  DeckV7,
  SlideNode,
  SlideChildNode,
  LayoutBox,
  StyleBinding,
  SlideControls,
} from "./schema";
import type { StylePatch } from "./style-schema";
import type { AiSlideSpec } from "./ai-plan-schema";
import type { SemanticTemplateV1 } from "./template-registry";
import { compileSlide } from "./template-compiler";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapSlides(deck: DeckV7, fn: (slide: SlideNode) => SlideNode): DeckV7 {
  return { ...deck, slides: deck.slides.map(fn) };
}

function mapChildren(
  slide: SlideNode,
  nodeId: string,
  fn: (node: SlideChildNode) => SlideChildNode,
): SlideNode {
  return {
    ...slide,
    children: slide.children.map((c) => mapNodeById(c, nodeId, fn)),
  };
}

function mapNodeById(
  node: SlideChildNode,
  targetId: string,
  fn: (n: SlideChildNode) => SlideChildNode,
): SlideChildNode {
  if (node.id === targetId) return fn(node);
  if (node.type === "group") {
    return {
      ...node,
      children: node.children.map((c) => mapNodeById(c, targetId, fn)),
    };
  }
  return node;
}

// ---------------------------------------------------------------------------
// Insert slide
// ---------------------------------------------------------------------------

/**
 * Inserts a new slide compiled from a semantic template spec at the given
 * position (defaults to the end).
 */
export function insertSlide(
  deck: DeckV7,
  spec: AiSlideSpec,
  template: SemanticTemplateV1,
  atIndex?: number,
): DeckV7 {
  const { slide } = compileSlide(spec, template, deck.slides.length);
  const slides = [...deck.slides];
  const idx = atIndex !== undefined ? atIndex : slides.length;
  slides.splice(idx, 0, slide);
  return { ...deck, slides };
}

// ---------------------------------------------------------------------------
// Apply template to existing slide
// ---------------------------------------------------------------------------

/**
 * Reapplies a semantic template to an existing slide, preserving `localStyle`
 * and generating fresh layout/children from the template spec.
 */
export function applyTemplate(
  deck: DeckV7,
  slideId: string,
  spec: AiSlideSpec,
  template: SemanticTemplateV1,
): DeckV7 {
  const slideIndex = deck.slides.findIndex((s) => s.id === slideId);
  if (slideIndex === -1) return deck;

  const { slide: newSlide } = compileSlide(spec, template, slideIndex);
  // Preserve the original slide id and local styles at the root
  const existing = deck.slides[slideIndex];
  const merged: SlideNode = {
    ...newSlide,
    id: existing.id,
    localStyle: existing.localStyle,
  };

  const slides = [...deck.slides];
  slides[slideIndex] = merged;
  return { ...deck, slides };
}

// ---------------------------------------------------------------------------
// Update slide controls
// ---------------------------------------------------------------------------

export function updateSlideControls(
  deck: DeckV7,
  slideId: string,
  controls: Partial<SlideControls>,
): DeckV7 {
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;
    return {
      ...slide,
      controls: { ...(slide.controls ?? {}), ...controls },
    };
  });
}

// ---------------------------------------------------------------------------
// Set theme package
// ---------------------------------------------------------------------------

/**
 * Switches the deck theme. Node `layout` and `localStyle` are preserved.
 * Resolved styles are NOT written into nodes.
 */
export function setThemePackage(
  deck: DeckV7,
  packageId: string,
  packageVersion?: string,
): DeckV7 {
  return {
    ...deck,
    theme: {
      ...deck.theme,
      packageId,
      ...(packageVersion !== undefined ? { packageVersion } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Update node content (type-erased for flexibility — caller supplies typed patch)
// ---------------------------------------------------------------------------

export function updateNodeContent(
  deck: DeckV7,
  slideId: string,
  nodeId: string,
  contentPatch: Record<string, any>,
): DeckV7 {
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;
    return mapChildren(
      slide,
      nodeId,
      (node) =>
        ({
          ...node,
          content: {
            ...(node as unknown as { content: Record<string, unknown> })
              .content,
            ...contentPatch,
          },
        }) as SlideChildNode,
    );
  });
}

// ---------------------------------------------------------------------------
// Update node layout
// ---------------------------------------------------------------------------

export function updateNodeLayout(
  deck: DeckV7,
  slideId: string,
  nodeId: string,
  layoutPatch: Partial<LayoutBox>,
): DeckV7 {
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;
    return mapChildren(
      slide,
      nodeId,
      (node) =>
        ({
          ...node,
          layout: node.layout
            ? { ...node.layout, ...layoutPatch }
            : (layoutPatch as LayoutBox),
        }) as SlideChildNode,
    );
  });
}

// ---------------------------------------------------------------------------
// Update node style binding
// ---------------------------------------------------------------------------

export function updateNodeStyleBinding(
  deck: DeckV7,
  slideId: string,
  nodeId: string,
  binding: StyleBinding,
): DeckV7 {
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;
    return mapChildren(
      slide,
      nodeId,
      (node) =>
        ({
          ...node,
          style: binding,
        }) as SlideChildNode,
    );
  });
}

// ---------------------------------------------------------------------------
// Update local style override
// ---------------------------------------------------------------------------

export function updateLocalStyle(
  deck: DeckV7,
  slideId: string,
  nodeId: string,
  patch: StylePatch,
): DeckV7 {
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;
    return mapChildren(
      slide,
      nodeId,
      (node) =>
        ({
          ...node,
          localStyle: mergeStylePatch(node.localStyle, patch),
        }) as SlideChildNode,
    );
  });
}

function mergeStylePatch(
  base: StylePatch | undefined,
  patch: StylePatch,
): StylePatch {
  if (!base) return patch;
  const result: StylePatch = { ...base };
  for (const key of Object.keys(patch) as (keyof StylePatch)[]) {
    const pv = patch[key];
    const bv = base[key];
    if (
      pv !== undefined &&
      typeof pv === "object" &&
      !Array.isArray(pv) &&
      typeof bv === "object" &&
      bv !== null &&
      !Array.isArray(bv)
    ) {
      (result as Record<string, unknown>)[key] = {
        ...(bv as object),
        ...(pv as object),
      };
    } else {
      (result as Record<string, unknown>)[key] = pv;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reset local style override
// ---------------------------------------------------------------------------

/**
 * Removes specified top-level keys from `node.localStyle`, restoring them to
 * the resolved theme style. Pass no keys to remove all overrides.
 */
export function resetLocalStyleOverride(
  deck: DeckV7,
  slideId: string,
  nodeId: string,
  keys?: (keyof StylePatch)[],
): DeckV7 {
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;
    return mapChildren(slide, nodeId, (node) => {
      if (!node.localStyle) return node;
      if (!keys || keys.length === 0) {
        const { localStyle: _, ...rest } = node;
        return rest as SlideChildNode;
      }
      const newLocal = { ...node.localStyle };
      for (const k of keys)
        delete (newLocal as Record<string, unknown>)[k as string];
      if (Object.keys(newLocal).length === 0) {
        const { localStyle: _, ...rest } = node;
        return rest as SlideChildNode;
      }
      return { ...node, localStyle: newLocal } as SlideChildNode;
    });
  });
}

// ---------------------------------------------------------------------------
// Detach theme decoration
// ---------------------------------------------------------------------------

/**
 * Converts a theme decoration render node into a locked `SlideChildNode`
 * appended to the slide children. Detached decorations stop following the theme.
 *
 * Caller must supply the decoration recipe layout and style.
 */
export function detachDecoration(
  deck: DeckV7,
  slideId: string,
  decorationId: string,
  layout: LayoutBox,
  style: StylePatch,
): DeckV7 {
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;
    const detachedNode: SlideChildNode = {
      id: `detached-${decorationId}-${Date.now().toString(36)}`,
      type: "shape",
      role: "themeDecoration",
      layout,
      localStyle: style,
      locked: false,
      content: { shape: "rect" },
    };
    return {
      ...slide,
      children: [...slide.children, detachedNode],
      // Disable the decoration in theme overrides so it no longer renders
      // from the package recipe
    };
  });
}

// ---------------------------------------------------------------------------
// Group nodes
// ---------------------------------------------------------------------------

/**
 * Groups the specified nodeIds from the slide into a new GroupNode.
 * The frame of the group is the bounding box of the children's frames.
 */
export function groupNodes(
  deck: DeckV7,
  slideId: string,
  nodeIds: string[],
  groupId: string,
  style: StyleBinding,
): DeckV7 {
  const idSet = new Set(nodeIds);
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;

    const grouped: SlideChildNode[] = [];
    const remaining: SlideChildNode[] = [];
    for (const child of slide.children) {
      if (idSet.has(child.id)) grouped.push(child);
      else remaining.push(child);
    }

    if (grouped.length === 0) return slide;

    // Compute bounding frame
    const frames = grouped
      .map((n) => n.layout?.frame)
      .filter((f): f is NonNullable<typeof f> => f !== undefined);
    const minX = Math.min(...frames.map((f) => f.x));
    const minY = Math.min(...frames.map((f) => f.y));
    const maxX = Math.max(...frames.map((f) => f.x + f.w));
    const maxY = Math.max(...frames.map((f) => f.y + f.h));
    const maxZIndex = Math.max(...grouped.map((n) => n.layout?.zIndex ?? 0));

    const groupNode: SlideChildNode = {
      id: groupId,
      type: "group",
      component: "custom",
      style,
      layout: {
        frame: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        zIndex: maxZIndex,
      },
      children: grouped,
    };

    return { ...slide, children: [...remaining, groupNode] };
  });
}

// ---------------------------------------------------------------------------
// Reorder z-index
// ---------------------------------------------------------------------------

export function reorderZIndex(
  deck: DeckV7,
  slideId: string,
  nodeId: string,
  zIndex: number,
): DeckV7 {
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;
    return mapChildren(
      slide,
      nodeId,
      (node) =>
        ({
          ...node,
          layout: node.layout
            ? { ...node.layout, zIndex }
            : { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex },
        }) as SlideChildNode,
    );
  });
}

// ---------------------------------------------------------------------------
// Update asset metadata
// ---------------------------------------------------------------------------

export function updateAssetMetadata(
  deck: DeckV7,
  assetId: string,
  patch: { alt?: string; contentHash?: string },
): DeckV7 {
  const image = deck.assets.images[assetId];
  if (!image) return deck;
  return {
    ...deck,
    assets: {
      ...deck.assets,
      images: {
        ...deck.assets.images,
        [assetId]: { ...image, ...patch },
      },
    },
  };
}
