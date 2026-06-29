/**
 * Migration utility: converts a v6 deck to a best-effort v7 deck.
 *
 * This utility lives outside the normal v7 runtime parse path.
 * It is NOT imported by the v7 validator, renderer, or export spec.
 *
 * Strategy:
 * - Map v6 slide elements to explicit v7 nodes with concrete style bindings
 *   and local styles.
 * - The output is a valid v7 deck that can be saved and opened by the v7
 *   runtime.
 * - Slides that cannot be confidently mapped use an explicit "content" template
 *   binding with `style` refs derived from element roles.
 * - No v6 master/chrome elements are preserved (they become theme decorations
 *   via the v7 theme package).
 */

import type { DeckV7, SlideNode, SlideChildNode } from "./schema";
import type { StyleBinding } from "./style-schema";
import type { CanvasSpec } from "./types";

// ---------------------------------------------------------------------------
// V6 type stubs (minimal shape needed for migration — not the full v6 schema)
// ---------------------------------------------------------------------------

type V6Deck = {
  schemaVersion: number;
  canvas?: { format?: string };
  design?: { themeId?: string };
  slides?: V6Slide[];
  [key: string]: unknown;
};

type V6Slide = {
  id: string;
  title?: string;
  notes?: string;
  elements?: V6Element[];
  [key: string]: unknown;
};

type V6Element = {
  id: string;
  kind?: string;
  role?: string;
  box?: { x?: number; y?: number; w?: number; h?: number };
  zIndex?: number;
  rotation?: number;
  locked?: boolean;
  hidden?: boolean;
  content?: unknown;
  style?: Record<string, unknown>;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _migId = 0;
function nextMigId(prefix: string): string {
  return `${prefix}-mig-${(++_migId).toString(36).padStart(4, "0")}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mapCanvasFormat(format: string | undefined): CanvasSpec["format"] {
  switch (format) {
    case "16:9":
      return "16:9";
    case "4:3":
      return "4:3";
    case "square":
      return "square";
    default:
      return "16:9";
  }
}

function canvasFromFormat(format: CanvasSpec["format"]): CanvasSpec {
  const heights: Record<CanvasSpec["format"], number> = {
    "16:9": 56.25,
    "4:3": 75,
    square: 100,
    custom: 56.25,
  };
  return {
    format,
    width: 100,
    height: heights[format],
    unit: "percent",
  };
}

// ---------------------------------------------------------------------------
// Element role -> style ref mapping
// ---------------------------------------------------------------------------

function roleToStyleRef(role: string | undefined): StyleBinding {
  switch (role) {
    case "title":
      return { ref: "text.title" };
    case "subtitle":
      return { ref: "text.subtitle" };
    case "body":
    case "bullets":
      return { ref: "text.body" };
    case "kicker":
      return { ref: "text.kicker" };
    case "caption":
      return { ref: "text.caption" };
    case "quote":
      return { ref: "text.quote" };
    case "metric":
      return { ref: "text.metric" };
    case "visual":
      return { ref: "media.hero" };
    case "image":
      return { ref: "media.inline" };
    case "background":
      return { ref: "decoration.background" };
    case "shape":
    case "callout":
      return { ref: "surface.callout" };
    default:
      return { ref: "text.body" };
  }
}

// ---------------------------------------------------------------------------
// Element -> node conversion
// ---------------------------------------------------------------------------

function elementToNode(el: V6Element): SlideChildNode | null {
  const id = el.id ?? nextMigId("node");
  const box = el.box ?? {};
  const frame = {
    x: typeof box.x === "number" ? box.x : 5,
    y: typeof box.y === "number" ? box.y : 5,
    w: typeof box.w === "number" ? box.w : 90,
    h: typeof box.h === "number" ? box.h : 90,
  };
  const layout = {
    frame,
    zIndex: typeof el.zIndex === "number" ? el.zIndex : 0,
    ...(typeof el.rotation === "number" ? { rotation: el.rotation } : {}),
  };
  const style = roleToStyleRef(el.role ?? el.kind);

  const base = {
    id,
    layout,
    style,
    ...(el.locked ? { locked: true } : {}),
    ...(el.hidden ? { hidden: true } : {}),
  };

  const kind = el.kind;

  if (kind === "text" || kind === "title" || kind === "bullets") {
    // Extract text content from v6 content
    const v6Content = el.content;
    let text = "";
    if (typeof v6Content === "string") {
      text = v6Content;
    } else if (isPlainObject(v6Content) && typeof v6Content.text === "string") {
      text = v6Content.text;
    }
    return {
      ...base,
      type: "text",
      role: (el.role as SlideChildNode["role"]) ?? "body",
      content: {
        paragraphs: [{ id: nextMigId("para"), text }],
      },
    } as SlideChildNode;
  }

  if (kind === "image") {
    const v6Content = isPlainObject(el.content) ? el.content : {};
    const assetId =
      typeof v6Content.assetId === "string"
        ? v6Content.assetId
        : nextMigId("asset");
    return {
      ...base,
      type: "image",
      role: "image",
      content: { assetId },
    } as SlideChildNode;
  }

  if (kind === "shape") {
    const v6Content = isPlainObject(el.content) ? el.content : {};
    const shape =
      typeof v6Content.shape === "string" ? v6Content.shape : "rect";
    return {
      ...base,
      type: "shape",
      role: "callout",
      content: { shape: shape as import("./schema").ShapeKind },
    } as SlideChildNode;
  }

  if (kind === "visual") {
    const v6Content = isPlainObject(el.content) ? el.content : {};
    return {
      ...base,
      type: "visual",
      role: "visual",
      content: {
        ...(typeof v6Content.visualId === "string"
          ? { visualId: v6Content.visualId }
          : {}),
        ...(typeof v6Content.assetId === "string"
          ? { assetId: v6Content.assetId }
          : {}),
      },
    } as SlideChildNode;
  }

  if (kind === "connector") {
    return {
      ...base,
      type: "connector",
      role: "connector",
      content: {
        from: {
          kind: "point",
          point: { x: frame.x, y: frame.y + frame.h / 2 },
        },
        to: {
          kind: "point",
          point: { x: frame.x + frame.w, y: frame.y + frame.h / 2 },
        },
        routing: "straight",
      },
    } as SlideChildNode;
  }

  // Fallback: convert to text node
  return {
    ...base,
    type: "text",
    content: { paragraphs: [{ id: nextMigId("para"), text: "" }] },
  } as SlideChildNode;
}

// ---------------------------------------------------------------------------
// Slide migration
// ---------------------------------------------------------------------------

function migrateSlide(v6Slide: V6Slide): SlideNode {
  const slideId = v6Slide.id ?? nextMigId("slide");
  const elements = Array.isArray(v6Slide.elements) ? v6Slide.elements : [];

  const children: SlideChildNode[] = [];
  for (const el of elements) {
    const node = elementToNode(el);
    if (node) children.push(node);
  }

  // Infer template kind from elements (best-effort)
  const hasTitle = elements.some(
    (e) => e.role === "title" || e.kind === "title",
  );
  const hasImage = elements.some(
    (e) => e.kind === "image" || e.role === "image",
  );
  const hasVisual = elements.some(
    (e) => e.kind === "visual" || e.role === "visual",
  );
  const hasMetric = elements.some((e) => e.role === "metric");
  const kind = hasMetric
    ? "metric-row"
    : hasImage || hasVisual
      ? "visual-focus"
      : hasTitle && elements.length === 1
        ? "cover"
        : "content";

  return {
    id: slideId,
    type: "slide",
    template: { kind },
    children,
    style: { ref: "slide.content" },
    ...(v6Slide.notes ? { notes: v6Slide.notes } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type MigrateV6Result = {
  deck: DeckV7;
  warnings: string[];
};

/**
 * Converts a v6 deck object into a best-effort v7 deck.
 *
 * - Not called by the v7 runtime; use only as a one-time migration step.
 * - Output is explicit nodes with concrete style bindings, not perfectly semantic.
 * - Warnings list any issues encountered during conversion.
 */
export function migrateV6ToDeckV7(input: unknown): MigrateV6Result {
  const warnings: string[] = [];

  if (!isPlainObject(input)) {
    warnings.push("Input is not an object; returning empty deck");
    return {
      deck: buildEmptyDeckV7(),
      warnings,
    };
  }

  const v6 = input as V6Deck;

  if (typeof v6.schemaVersion !== "number" || v6.schemaVersion !== 6) {
    warnings.push(
      `Input schemaVersion is ${v6.schemaVersion}; expected 6. Attempting migration anyway.`,
    );
  }

  const canvasFormat = mapCanvasFormat(v6.canvas?.format);
  const canvas = canvasFromFormat(canvasFormat);

  const packageId =
    typeof v6.design?.themeId === "string" && v6.design.themeId.length > 0
      ? v6.design.themeId
      : "clarity";

  const v6Slides = Array.isArray(v6.slides) ? v6.slides : [];
  if (v6Slides.length === 0) {
    warnings.push("No slides found in v6 deck; creating a placeholder slide");
  }

  const slides: SlideNode[] =
    v6Slides.length > 0
      ? v6Slides.map(migrateSlide)
      : [buildPlaceholderSlide()];

  const deck: DeckV7 = {
    schemaVersion: 7,
    canvas,
    theme: { packageId },
    assets: { images: {} },
    slides,
  };

  return { deck, warnings };
}

function buildEmptyDeckV7(): DeckV7 {
  return {
    schemaVersion: 7,
    canvas: canvasFromFormat("16:9"),
    theme: { packageId: "clarity" },
    assets: { images: {} },
    slides: [buildPlaceholderSlide()],
  };
}

function buildPlaceholderSlide(): SlideNode {
  return {
    id: nextMigId("slide"),
    type: "slide",
    template: { kind: "content" },
    style: { ref: "slide.content" },
    children: [
      {
        id: nextMigId("title"),
        type: "text",
        role: "title",
        layout: { frame: { x: 5, y: 10, w: 90, h: 20 }, zIndex: 1 },
        style: { ref: "text.title" },
        content: {
          paragraphs: [{ id: nextMigId("para"), text: "Untitled Slide" }],
        },
      },
    ],
  };
}
