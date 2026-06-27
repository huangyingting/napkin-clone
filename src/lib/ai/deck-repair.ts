import { GENERATED_DECK_MAX_SLIDES } from "@/lib/limits";
import {
  CURRENT_DECK_SCHEMA_VERSION,
  SLIDE_LAYOUTS,
  type Deck,
  type ElementAlign,
  type ElementBox,
  type SlideElement,
  type SlideLayoutHint,
  type TextElementStyle,
} from "@/lib/presentation/deck";
import {
  type DeckTextRole,
  isDeckTextRole,
} from "@/lib/presentation/deck-theme-tokens";
import {
  normalizeGeneratedDeck,
  type VisualInventory,
} from "@/lib/presentation/deck-layout-assign";
import type { DeckTheme } from "@/lib/presentation/deck";

export const REPAIRED_DECK_MAX_SLIDES = GENERATED_DECK_MAX_SLIDES;

const DEFAULT_THEME = "indigo";
const DEFAULT_LAYOUT: SlideLayoutHint = "blank";
const ELEMENT_ALIGNS: readonly ElementAlign[] = ["left", "center", "right"];
const PRESENTATION_TEXT_ROLES = [
  "title",
  "sectionTitle",
  "body",
  "bullet",
] as const;
type PresentationTextRole = (typeof PRESENTATION_TEXT_ROLES)[number];

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

function isPresentationTextRole(value: unknown): value is PresentationTextRole {
  return (
    typeof value === "string" &&
    (PRESENTATION_TEXT_ROLES as readonly string[]).includes(value)
  );
}

function textRoleToPresentationRole(role: DeckTextRole): PresentationTextRole {
  if (role === "h1") return "title";
  if (role === "h2" || role === "h3" || role === "subtitle") {
    return "sectionTitle";
  }
  if (role === "bullet") return "bullet";
  return "body";
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
  const content = isPlainObject(input.content) ? input.content : {};
  const designOverrides = isPlainObject(input.designOverrides)
    ? input.designOverrides
    : {};

  switch (input.kind) {
    case "text": {
      const role: PresentationTextRole = isPresentationTextRole(input.role)
        ? input.role
        : isDeckTextRole(input.textRole)
          ? textRoleToPresentationRole(input.textRole)
          : "body";
      const text =
        typeof content.text === "string"
          ? content.text
          : typeof input.text === "string"
            ? input.text
            : "";
      return {
        ...base,
        kind: "text",
        role,
        content: {
          kind: "text",
          text,
          paragraphs: Array.isArray(content.paragraphs)
            ? content.paragraphs
            : [{ text }],
          ...(Array.isArray(content.runs)
            ? { runs: content.runs }
            : Array.isArray(input.runs)
              ? { runs: input.runs }
              : {}),
        },
        designOverrides: {
          ...designOverrides,
          textStyle: repairTextStyle(
            isPlainObject(designOverrides.textStyle)
              ? designOverrides.textStyle
              : input.style,
          ),
        },
      } as unknown as SlideElement;
    }
    case "visual": {
      const visualId =
        typeof content.visualId === "string"
          ? content.visualId
          : typeof input.visualId === "string"
            ? input.visualId
            : "";
      if (visualId.length === 0) {
        return undefined;
      }
      const styleThemeId =
        typeof designOverrides.styleThemeId === "string"
          ? designOverrides.styleThemeId
          : typeof content.styleThemeId === "string"
            ? content.styleThemeId
            : typeof input.styleThemeId === "string"
              ? input.styleThemeId
              : undefined;
      return {
        ...base,
        kind: "visual",
        role: "visual",
        content: {
          kind: "visual",
          visualId,
          ...(styleThemeId && styleThemeId.length > 0 ? { styleThemeId } : {}),
          ...(typeof content.alt === "string" && content.alt.length > 0
            ? { alt: content.alt }
            : typeof input.alt === "string" && input.alt.length > 0
              ? { alt: input.alt }
              : {}),
        },
      } as unknown as SlideElement;
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
  elements?: SlideElement[];
}

export function repairSlide(input: unknown, index: number): RepairedSlide {
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
 * Turns the raw parsed model payload into a repaired deck candidate: resolves
 * the deck theme id, maps unknown layouts to `"blank"`, regenerates missing ids, fills
 * sparse content fields, and caps the slide count.
 */
export function repairDeck(
  parsed: unknown,
  inventory?: VisualInventory,
  preferredTheme?: DeckTheme,
): Deck | undefined {
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!isPlainObject(candidate) || !Array.isArray(candidate.slides)) {
    return undefined;
  }

  // Preserve any non-empty string themeId from the model so the downstream
  // normalizer (normalizeGeneratedDeck) can apply the generic resolver
  // fallback — including substituting preferredTheme when the value is
  // unrecognised. Fall back to DEFAULT_THEME only when themeId is absent.
  const candidateDesign = isPlainObject(candidate.design)
    ? candidate.design
    : {};
  const rawThemeId =
    typeof candidateDesign.themeId === "string"
      ? candidateDesign.themeId.trim()
      : typeof candidate.themeId === "string"
        ? candidate.themeId.trim()
        : "";
  const themeId: string = rawThemeId.length > 0 ? rawThemeId : DEFAULT_THEME;

  const slides = candidate.slides
    .slice(0, REPAIRED_DECK_MAX_SLIDES)
    .map((slide, index) => repairSlide(slide, index));

  return normalizeGeneratedDeck(
    {
      slides,
      themeId,
      schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    } as Deck,
    inventory,
    preferredTheme,
  );
}
