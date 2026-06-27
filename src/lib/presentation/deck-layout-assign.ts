/**
 * Layout / template / theme normalization for AI-generated decks (issue #264).
 *
 * `generateDeck` repairs raw model output into a current-schema {@link Deck},
 * and this module normalizes that output into the same element-first vocabulary
 * used by the editor, preview, and present routes.
 */

import {
  DECK_THEMES,
  type Deck,
  type DeckTheme,
  type Slide,
} from "./deck-core";
import { buildSlideElementsFromContent } from "./deck-derivation";
import type {
  ElementBox,
  SlideElement,
  TextElement,
  TextElementStyle,
} from "./deck-elements";
import { makeElementId } from "./deck-ids";
import type { SlideLayoutHint } from "./deck-layouts-model";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck-core";
import { DEFAULT_SLIDE_FORMAT } from "./slide-format";

/**
 * Brand-aligned theme used when the deck carries no valid theme. Mirrors the
 * fallback in {@link inferDeckTheme}; we cannot call that helper here because it
 * needs the document's visual blocks, which this normalization layer does not
 * receive.
 */
export const FALLBACK_THEME: DeckTheme = "indigo";

/** Minimum body font size (percent of slide height) used for hierarchy. */
const BODY_FONT_SIZE = 4.5;

/** An item the deck may reference by id — structurally a `{ id }` carrier. */
export interface VisualInventoryItem {
  id: string;
  /** Human title of the visual, when known (used as the accessible name). */
  title?: string;
  /** Visual kind/type, e.g. "flowchart" (fallback accessible name source). */
  type?: string;
  /** A short content summary (fallback accessible name source). */
  summary?: string;
}

/** Either a set of known visual ids or any array of `{ id }` carriers. */
export type VisualInventory =
  | ReadonlySet<string>
  | ReadonlyArray<VisualInventoryItem>;

function toKnownIds(
  inventory: VisualInventory | undefined,
): ReadonlySet<string> {
  if (!inventory) return new Set();
  if (inventory instanceof Set) return inventory;
  if (Array.isArray(inventory)) {
    return new Set(inventory.map((item) => item.id));
  }
  return new Set();
}

/**
 * the source visual's title/summary. A plain id `Set` carries no titles, so the
 * map is empty in that case and labels fall back to a sensible default.
 */
function toInventoryMap(
  inventory: VisualInventory | undefined,
): ReadonlyMap<string, VisualInventoryItem> {
  const map = new Map<string, VisualInventoryItem>();
  if (Array.isArray(inventory)) {
    for (const item of inventory) {
      map.set(item.id, item);
    }
  }
  return map;
}

/**
 * Derives an accessible name (alt text) for a referenced visual: its title when
 * known, otherwise a content summary, otherwise a label built from the visual
 * type, falling back to a generic default so the element is never unlabeled.
 * Pure and DOM-free.
 */
export function deriveVisualAccessibleName(
  item: VisualInventoryItem | undefined,
): string {
  const title = item?.title?.trim();
  if (title) return title;
  const summary = item?.summary?.trim();
  if (summary) return summary;
  const type = item?.type?.trim();
  if (type) return `${type[0].toUpperCase()}${type.slice(1)} visual`;
  return "Generated visual";
}

function clampCoord(value: number, fallback: number): number {
  const n =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(100, Math.max(0, n));
}

function clampBox(box: ElementBox): ElementBox {
  return {
    x: clampCoord(box.x, 10),
    y: clampCoord(box.y, 10),
    w: clampCoord(box.w, 80),
    h: clampCoord(box.h, 20),
  };
}

function isVisualSlot(element: SlideElement): boolean {
  return element.kind === "visual" || element.kind === "image";
}

function elementContent(
  element: SlideElement | undefined,
): Record<string, any> {
  if (element === undefined) return {};
  return ((element as any).content ?? {}) as Record<string, any>;
}

function elementRole(element: SlideElement): string | undefined {
  return (element as any).role;
}

function elementText(element: SlideElement): string {
  return elementContent(element).text ?? "";
}

function elementVisualId(element: SlideElement): string | undefined {
  return elementContent(element).visualId;
}

function slideLayout(slide: Slide): SlideLayoutHint {
  return ((slide as any).templateId ?? "blank") as SlideLayoutHint;
}

function slideVisualIds(slide: Slide): string[] {
  const ids = new Set<string>();
  for (const element of slide.elements ?? []) {
    const visualId = elementVisualId(element);
    if (visualId) ids.add(visualId);
  }
  return [...ids];
}

function slideBullets(slide: Slide): string[] {
  const bullet = (slide.elements ?? []).find(
    (element) => element.kind === "text" && elementRole(element) === "bullet",
  );
  const paragraphs = elementContent(bullet as SlideElement).paragraphs ?? [];
  return paragraphs.map((paragraph: any) => paragraph.text ?? "");
}

function isTitleText(element: SlideElement): element is TextElement {
  return (
    element.kind === "text" &&
    ["title", "sectionTitle"].includes(elementRole(element) ?? "") &&
    elementText(element).trim().length > 0
  );
}

/**
 * Returns `true` when `elements` already carry the kind of content the declared
 * template implies, so they can be cleaned in place rather than re-scaffolded.
 */
function elementsMatchTemplate(
  templateId: SlideLayoutHint,
  elements: readonly SlideElement[],
): boolean {
  if (elements.length === 0) return false;
  switch (templateId) {
    case "media":
      return elements.some(isVisualSlot);
    case "title":
    case "section":
      return elements.some(isTitleText);
    case "content":
      return elements.some((el) => el.kind === "text");
    case "blank":
      return true;
    default:
      return true;
  }
}

/**
 * Normalizes the hierarchy styling of a text element: a title is always bold
 * and at least as large as body text; a body keeps its size but never smaller
 * than the body minimum. Boxes are clamped and a fresh, unique id is assigned.
 */
function applyTextHierarchy(element: TextElement): TextElement {
  const role = elementRole(element);
  const style: TextElementStyle = {
    ...(((element as any).designOverrides?.textStyle ??
      {}) as TextElementStyle),
  };
  if (!Number.isFinite(style.fontSize) || style.fontSize <= 0) {
    style.fontSize =
      role === "title" || role === "sectionTitle" ? 6 : BODY_FONT_SIZE;
  }
  if (role === "title" || role === "sectionTitle") {
    style.bold = true;
    if (style.fontSize < BODY_FONT_SIZE) {
      style.fontSize = BODY_FONT_SIZE;
    }
  }
  return {
    ...(element as any),
    role,
    designOverrides: {
      ...((element as any).designOverrides ?? {}),
      textStyle: style,
    },
  } as TextElement;
}

function normalizeElement(
  element: SlideElement,
  zIndex: number,
  id: string,
  box: ElementBox,
  inventory: ReadonlyMap<string, VisualInventoryItem>,
): SlideElement {
  if (element.kind === "text") {
    const role = elementRole(element);
    const text = elementText(element);
    const content = elementContent(element);
    return applyTextHierarchy({
      id,
      kind: "text",
      role: role ?? "body",
      box,
      zIndex,
      content: {
        kind: "text",
        text,
        paragraphs: content.paragraphs ?? [{ text }],
        ...(content.runs ? { runs: content.runs } : {}),
      },
      designOverrides: {
        ...((element as any).designOverrides ?? {}),
        textStyle: (element as any).designOverrides?.textStyle,
      },
    } as unknown as TextElement) as SlideElement;
  }
  if (element.kind === "visual") {
    const visualId = elementVisualId(element) ?? "";
    const content = elementContent(element);
    const alt =
      content.alt ?? deriveVisualAccessibleName(inventory.get(visualId));
    return {
      id,
      kind: "visual",
      role: "visual",
      box,
      zIndex,
      content: {
        kind: "visual",
        visualId,
        ...(content.styleThemeId ? { styleThemeId: content.styleThemeId } : {}),
        ...(alt ? { alt } : {}),
      },
    } as unknown as SlideElement;
  }
  return { ...(element as any), id, zIndex, box } as SlideElement;
}

/**
 * Cleans a single model-provided element: clamps its box, re-stacks its zIndex,
 * guarantees a unique id, applies text hierarchy, labels visual elements with an
 * accessible name, and drops `visual` elements whose id is not in the inventory
 * (returns `undefined` for those).
 */
function cleanElement(
  element: SlideElement,
  zIndex: number,
  usedIds: Set<string>,
  knownIds: ReadonlySet<string>,
  inventory: ReadonlyMap<string, VisualInventoryItem>,
): SlideElement | undefined {
  if (
    element.kind === "visual" &&
    !knownIds.has(elementVisualId(element) ?? "")
  ) {
    return undefined;
  }

  let id = element.id && element.id.length > 0 ? element.id : makeElementId();
  if (usedIds.has(id)) {
    id = makeElementId();
  }
  usedIds.add(id);

  return normalizeElement(
    element,
    zIndex,
    id,
    clampBox(element.box),
    inventory,
  );
}

/**
 * Builds the normalized `elements[]` for one slide. Cleans the model's elements
 * when they match the declared layout; otherwise builds current elements from
 * the slide's repaired content fields, then re-stamps hierarchy and ids.
 */
function buildElements(
  slide: Slide,
  visualRefs: string[],
  knownIds: ReadonlySet<string>,
  inventory: ReadonlyMap<string, VisualInventoryItem>,
): SlideElement[] {
  const usedIds = new Set<string>();

  let source: readonly SlideElement[];
  if (
    slide.elements &&
    slide.elements.length > 0 &&
    elementsMatchTemplate(slideLayout(slide), slide.elements)
  ) {
    source = slide.elements;
  } else {
    source = buildSlideElementsFromContent({
      ...slide,
      templateId: slideLayout(slide),
      visualRefs,
      bodyTexts: slideBullets(slide),
      elements: undefined,
    });
  }

  const elements: SlideElement[] = [];
  for (const element of source) {
    const cleaned = cleanElement(
      element,
      elements.length,
      usedIds,
      knownIds,
      inventory,
    );
    if (cleaned) {
      elements.push(cleaned);
    }
  }

  return elements;
}

function normalizeSlide(
  slide: Slide,
  index: number,
  knownIds: ReadonlySet<string>,
  inventory: ReadonlyMap<string, VisualInventoryItem>,
): Slide {
  const visualRefs = slideVisualIds(slide).filter((id) => knownIds.has(id));
  const elements = buildElements(slide, visualRefs, knownIds, inventory);
  const layout = slideLayout(slide);

  return {
    id: slide.id,
    index,
    title: slide.title,
    ...(slide.notes !== undefined ? { notes: slide.notes } : {}),
    ...(layout !== "blank" ? { templateId: layout } : {}),
    elements,
  } as unknown as Slide;
}

function resolveThemeId(deck: Deck, preferredTheme?: DeckTheme): DeckTheme {
  const themeId = (deck as any).design?.themeId;
  // Preserve an explicit, recognised named theme the model chose.
  if (themeId !== "default" && DECK_THEMES.includes(themeId as DeckTheme)) {
    return themeId as DeckTheme;
  }
  // Unrecognised themeId (e.g. a legacy persisted value) — substitute a
  // vibrant one (issue #281): prefer a document-derived theme when supplied,
  // otherwise fall back to the brand-aligned indigo.
  if (preferredTheme && DECK_THEMES.includes(preferredTheme)) {
    return preferredTheme;
  }
  return FALLBACK_THEME;
}

/**
 * Normalizes a validated, repaired {@link Deck} (as produced by `generateDeck`)
 * so every slide snaps to a template-conformant, deck-theme-aware
 * set of positioned `elements[]`. Pure and deterministic except for generated
 * element ids. The result remains `safeParseDeck`-valid.
 *
 * @param deck       A repaired model deck candidate to normalize.
 * @param inventory  Visuals the deck may reference, as a set of ids or any
 *                   array of `{ id }` carriers. Visuals not present here are
 *                   dropped. Omit for "no known visuals".
 * @param preferredTheme  A document-derived vibrant theme (from
 *                   {@link inferDeckTheme}) used when the model returns an
 *                   unrecognised themeId (issue #281). An explicit named theme
 *                   the model chose is always preserved. Falls back to
 *                   {@link FALLBACK_THEME} when omitted.
 */
export function normalizeGeneratedDeck(
  deck: Deck,
  inventory?: VisualInventory,
  preferredTheme?: DeckTheme,
): Deck {
  const knownIds = toKnownIds(inventory);
  const inventoryMap = toInventoryMap(inventory);
  const themeId = resolveThemeId(deck, preferredTheme);
  const slides = deck.slides.map((slide, index) =>
    normalizeSlide(slide, index, knownIds, inventoryMap),
  );
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: (deck as any).canvas ?? { format: DEFAULT_SLIDE_FORMAT },
    design: { ...((deck as any).design ?? {}), themeId },
    masters: (deck as any).masters ?? [
      { id: "master-default", name: "Default", elements: [] },
    ],
    defaultMasterId: (deck as any).defaultMasterId ?? "master-default",
    ...((deck as any).deckContentHash !== undefined
      ? { deckContentHash: (deck as any).deckContentHash }
      : {}),
    slides,
  } as unknown as Deck;
}
