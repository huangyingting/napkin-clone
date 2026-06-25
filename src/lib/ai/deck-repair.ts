import { GENERATED_DECK_MAX_SLIDES } from "@/lib/limits";
import {
  CURRENT_DECK_SCHEMA_VERSION,
  DECK_THEMES,
  SLIDE_LAYOUTS,
  type Deck,
  type DeckTheme,
  type ElementAlign,
  type ElementBox,
  type SlideElement,
  type SlideLayoutHint,
  type TextElementStyle,
} from "@/lib/presentation/deck";

export const REPAIRED_DECK_MAX_SLIDES = GENERATED_DECK_MAX_SLIDES;

const DEFAULT_THEME: DeckTheme = "default";
const DEFAULT_LAYOUT: SlideLayoutHint = "blank";
const ELEMENT_ALIGNS: readonly ElementAlign[] = ["left", "center", "right"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

function fallbackElementId(
  zIndex: number,
  usedIds: ReadonlySet<string>,
): string {
  let suffix = zIndex + 1;
  let id = `el-${suffix}`;
  while (usedIds.has(id)) {
    suffix += 1;
    id = `el-${suffix}`;
  }
  return id;
}

/** Coerces an arbitrary box-ish value into a finite, in-range {@link ElementBox}. */
export function repairBox(input: unknown): ElementBox {
  const box = isPlainObject(input) ? input : {};
  const coord = (value: unknown, fallback: number): number =>
    clamp(isFiniteNumber(value) ? value : fallback, 0, 100);
  return {
    x: coord(box.x, 10),
    y: coord(box.y, 10),
    w: coord(box.w, 80),
    h: coord(box.h, 20),
  };
}

export function repairTextStyle(input: unknown): TextElementStyle {
  const style = isPlainObject(input) ? input : {};
  const align: ElementAlign = ELEMENT_ALIGNS.includes(
    style.align as ElementAlign,
  )
    ? (style.align as ElementAlign)
    : "left";
  return {
    fontSize: isFiniteNumber(style.fontSize) ? style.fontSize : 4.5,
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
    align,
    ...(isHexColor(style.color) ? { color: style.color } : {}),
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Normalizes one raw element into a schema-shaped element, regenerating its id
 * and clamping its box. Returns `undefined` for kinds we do not support or for a
 * `visual` element missing a usable `visualId` (those are dropped).
 */
export function repairElement(
  input: unknown,
  zIndex: number,
  usedIds: ReadonlySet<string> = new Set<string>(),
): SlideElement | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }

  let id =
    typeof input.id === "string" && input.id.length > 0
      ? input.id
      : fallbackElementId(zIndex, usedIds);
  if (usedIds.has(id)) {
    id = fallbackElementId(zIndex, usedIds);
  }

  const base = { id, box: repairBox(input.box), zIndex };

  switch (input.kind) {
    case "text":
      return {
        ...base,
        kind: "text",
        text: typeof input.text === "string" ? input.text : "",
        role: input.role === "title" ? "title" : "body",
        style: repairTextStyle(input.style),
      };
    case "bullets": {
      const bullets = toStringArray(input.bullets);
      return {
        ...base,
        kind: "bullets",
        bullets,
        items: Array.isArray(input.items)
          ? input.items
              .filter(
                (item): item is { text: string } =>
                  isPlainObject(item) && typeof item.text === "string",
              )
              .map((item) => ({ text: item.text }))
          : bullets.map((text) => ({ text })),
        style: repairTextStyle(input.style),
      };
    }
    case "visual": {
      if (typeof input.visualId !== "string" || input.visualId.length === 0) {
        return undefined;
      }
      return {
        ...base,
        kind: "visual",
        visualId: input.visualId,
        ...(typeof input.styleThemeId === "string" &&
        input.styleThemeId.length > 0
          ? { styleThemeId: input.styleThemeId }
          : {}),
      };
    }
    default:
      return undefined;
  }
}

export interface RepairedSlide {
  id: string;
  index: number;
  title: string;
  bullets: string[];
  visualIds: string[];
  layout: SlideLayoutHint;
  notes: string;
  theme: DeckTheme;
  elements?: SlideElement[];
}

export function repairSlide(
  input: unknown,
  index: number,
  theme: DeckTheme,
): RepairedSlide {
  const slide = isPlainObject(input) ? input : {};

  const layout = SLIDE_LAYOUTS.includes(slide.layout as SlideLayoutHint)
    ? (slide.layout as SlideLayoutHint)
    : DEFAULT_LAYOUT;

  const normalized: RepairedSlide = {
    id:
      typeof slide.id === "string" && slide.id.length > 0
        ? slide.id
        : `sl-${index + 1}`,
    index,
    title: typeof slide.title === "string" ? slide.title : "",
    bullets: toStringArray(slide.bullets),
    visualIds: toStringArray(slide.visualIds),
    layout,
    notes: typeof slide.notes === "string" ? slide.notes : "",
    theme,
  };

  if (Array.isArray(slide.elements)) {
    const usedIds = new Set<string>();
    const elements: SlideElement[] = [];
    for (const raw of slide.elements) {
      const element = repairElement(raw, elements.length, usedIds);
      if (element) {
        usedIds.add(element.id);
        elements.push(element);
      }
    }
    normalized.elements = elements;
  }

  return normalized;
}

/**
 * Turns the raw parsed model payload into a repaired deck candidate: defaults
 * the theme, maps unknown layouts to `"blank"`, regenerates missing ids, fills
 * sparse content fields, and caps the slide count.
 */
export function repairDeck(parsed: unknown): Deck | undefined {
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!isPlainObject(candidate) || !Array.isArray(candidate.slides)) {
    return undefined;
  }

  const theme = DECK_THEMES.includes(candidate.theme as DeckTheme)
    ? (candidate.theme as DeckTheme)
    : DEFAULT_THEME;

  const slides = candidate.slides
    .slice(0, REPAIRED_DECK_MAX_SLIDES)
    .map((slide, index) => repairSlide(slide, index, theme));

  return {
    slides,
    theme,
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  } as Deck;
}
