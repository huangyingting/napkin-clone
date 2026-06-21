/**
 * Core outline → presentation Deck generation logic (issue #261).
 *
 * Like `@/lib/ai/generate`, this module is intentionally free of any network,
 * DOM, or React dependencies: the LLM call is injected as a `complete` function
 * so the logic can be unit tested deterministically. The route handler wires in
 * the real Azure client.
 *
 * Responsibilities (mirrors {@link generateVisuals}):
 *   - reject empty input and input longer than {@link MAX_INPUT_CHARS} BEFORE
 *     calling the model,
 *   - ask the model for a single {@link Deck} object via
 *     {@link buildDeckGenerationMessages},
 *   - tolerate code fences / surrounding prose when extracting JSON,
 *   - REPAIR the model output (clamp boxes, fix layouts/themes/ids, cap slides)
 *     so it stays {@link safeParseDeck}-valid,
 *   - strip any visual the model invented that is not in the inventory,
 *   - NORMALIZE the repaired deck (issue #264) via
 *     {@link normalizeGeneratedDeck} as the final step so every slide snaps to a
 *     template-conformant, theme-stamped, hierarchy-aware `elements[]` — the
 *     route therefore always returns layout-normalized output,
 *   - retry once on garbled output and, when retries are exhausted, throw a
 *     {@link GenerationError} with a clear message.
 */

import {
  buildDeckGenerationMessages,
  type DeckGenerationOptions,
  type DeckVisualInventoryItem,
} from "@/lib/ai/deck-prompt";
import {
  EmptyInputError,
  GenerationError,
  InputTooLongError,
  MAX_INPUT_CHARS,
  extractJson,
  type CompleteFn,
} from "@/lib/ai/generate";
import {
  DECK_THEMES,
  SLIDE_LAYOUTS,
  makeElementId,
  type Deck,
  type DeckTheme,
  type ElementAlign,
  type ElementBox,
  type SlideElement,
  type SlideLayout,
  type TextElementStyle,
} from "@/lib/presentation/deck";
import { normalizeGeneratedDeck } from "@/lib/presentation/deck-layout-assign";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { stripOrphanedVisuals } from "@/lib/presentation/strip-orphans";

export type { DeckGenerationOptions } from "@/lib/ai/deck-prompt";

/** Upper bound on slides in a generated deck; surplus slides are dropped. */
export const MAX_DECK_SLIDES = 40;

/** Default number of LLM attempts (the first try plus retries). */
const DEFAULT_MAX_ATTEMPTS = 2;

const DEFAULT_THEME: DeckTheme = "default";
const DEFAULT_LAYOUT: SlideLayout = "blank";
const ELEMENT_ALIGNS: readonly ElementAlign[] = ["left", "center", "right"];

export interface GenerateDeckInput {
  /** The structured outline the deck is built from. */
  outline: string;
  /** The visuals the model may reference by id (and only these). */
  visualInventory: ReadonlyArray<DeckVisualInventoryItem>;
  /** Optional length/tone/audience tuning. */
  options?: DeckGenerationOptions;
}

export interface GenerateDeckDeps {
  complete: CompleteFn;
  /** First attempt + retries. Defaults to {@link DEFAULT_MAX_ATTEMPTS}. */
  maxAttempts?: number;
}

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

/** Coerces an arbitrary box-ish value into a finite, in-range {@link ElementBox}. */
function repairBox(input: unknown): ElementBox {
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

function repairTextStyle(input: unknown): TextElementStyle {
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
 * and clamping its box. Returns `undefined` for kinds we do not support or for
 * a `visual` element missing a usable `visualId` (those are dropped).
 */
function repairElement(
  input: unknown,
  zIndex: number,
  usedIds: Set<string>,
): SlideElement | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }

  let id =
    typeof input.id === "string" && input.id.length > 0
      ? input.id
      : makeElementId();
  if (usedIds.has(id)) {
    id = makeElementId();
  }
  usedIds.add(id);

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
    case "bullets":
      return {
        ...base,
        kind: "bullets",
        bullets: toStringArray(input.bullets),
        style: repairTextStyle(input.style),
      };
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

interface NormalizedSlide {
  index: number;
  title: string;
  bullets: string[];
  visualIds: string[];
  layout: SlideLayout;
  notes: string;
  theme: DeckTheme;
  elements?: SlideElement[];
}

function repairSlide(
  input: unknown,
  index: number,
  theme: DeckTheme,
): NormalizedSlide {
  const slide = isPlainObject(input) ? input : {};

  const layout = SLIDE_LAYOUTS.includes(slide.layout as SlideLayout)
    ? (slide.layout as SlideLayout)
    : DEFAULT_LAYOUT;

  const normalized: NormalizedSlide = {
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
        elements.push(element);
      }
    }
    normalized.elements = elements;
  }

  return normalized;
}

/**
 * Turns the raw parsed model payload into a fully repaired, `safeParseDeck`-
 * shaped plain object: defaults the theme, clamps boxes, maps unknown layouts to
 * `"blank"`, regenerates colliding/missing element ids, fills required fields,
 * and caps the slide count to {@link MAX_DECK_SLIDES}. Returns `undefined` when
 * the payload is too garbled to recover (no usable `slides` array).
 */
function repairDeck(parsed: unknown): Deck | undefined {
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!isPlainObject(candidate) || !Array.isArray(candidate.slides)) {
    return undefined;
  }

  const theme = DECK_THEMES.includes(candidate.theme as DeckTheme)
    ? (candidate.theme as DeckTheme)
    : DEFAULT_THEME;

  const slides = candidate.slides
    .slice(0, MAX_DECK_SLIDES)
    .map((slide, index) => repairSlide(slide, index, theme));

  const result = safeParseDeck({ slides, theme });
  return result.success ? result.data : undefined;
}

/**
 * Generates a presentation {@link Deck} from a structured outline plus a visual
 * inventory the model may reference.
 *
 * @throws {EmptyInputError} when the outline is blank.
 * @throws {InputTooLongError} when the outline exceeds {@link MAX_INPUT_CHARS}.
 * @throws {GenerationError} when no valid deck can be produced.
 */
export async function generateDeck(
  input: GenerateDeckInput,
  deps: GenerateDeckDeps,
): Promise<Deck> {
  const outline = typeof input.outline === "string" ? input.outline.trim() : "";
  if (!outline) {
    throw new EmptyInputError();
  }
  if (outline.length > MAX_INPUT_CHARS) {
    throw new InputTooLongError(outline.length);
  }

  const visualInventory = input.visualInventory ?? [];
  const knownVisualIds = new Set(visualInventory.map((item) => item.id));
  const maxAttempts = Math.max(1, deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

  let lastReason = "The AI did not return a valid deck.";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const messages = buildDeckGenerationMessages({
      outline,
      visualInventory,
      options: input.options,
      retryReason: attempt > 0 ? lastReason : undefined,
    });

    let raw: string;
    try {
      raw = await deps.complete(messages);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new GenerationError(
        `The AI service could not be reached: ${reason}`,
        { cause: error },
      );
    }

    const parsed = extractJson(raw);
    if (parsed === undefined) {
      lastReason = "The AI response was not valid JSON.";
      continue;
    }

    const repaired = repairDeck(parsed);
    if (!repaired) {
      lastReason = "The AI response was not a valid deck object.";
      continue;
    }

    return normalizeGeneratedDeck(
      stripOrphanedVisuals(repaired, knownVisualIds),
      knownVisualIds,
    );
  }

  throw new GenerationError(
    `Could not generate a valid deck after ${maxAttempts} attempt(s). ${lastReason}`,
  );
}
