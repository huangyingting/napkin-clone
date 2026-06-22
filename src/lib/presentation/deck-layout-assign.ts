/**
 * Layout / template / theme normalization for AI-generated decks (issue #264).
 *
 * `generateDeck` (issue #261) parses and *repairs* raw model output into a
 * `safeParseDeck`-valid {@link Deck}, but a repaired deck can still be "thin":
 * the model may emit only legacy `title` / `bullets` / `visualIds` fields, or
 * positioned `elements[]` that do not match the slide's declared {@link
 * SlideLayoutHint}. Hand-authored slides (from {@link buildTemplateSlide}) and
 * document-derived slides (from {@link materializeSlideElements}) both speak a
 * richer vocabulary: every slide snaps to a layout preset, carries a deck
 * {@link DeckTheme}, and positions title / body / visual elements for clear
 * visual hierarchy.
 *
 * {@link normalizeGeneratedDeck} brings AI output into that same vocabulary so a
 * generated deck renders identically to an authored one in the editor, preview
 * and present routes. It is pure and DOM-free — no React, no network — and
 * fully testable under `node --test`.
 *
 * Rules (see issue #264):
 *  1. Per slide: keep/clean model-provided `elements[]` (clamp boxes, dedupe
 *     ids, re-stack zIndex) when they already match the declared layout;
 *     otherwise re-scaffold from the legacy fields via
 *     {@link materializeSlideElements} so the slide gets hierarchy-appropriate
 *     positioned elements.
 *  2. Place a referenced document visual into a prominent box for slides whose
 *     layout implies a visual (`media`). Only ids present in the supplied
 *     inventory are used; orphaned references are dropped.
 *  3. Stamp the deck theme uniformly on every slide. The model is biased to
 *     return a vibrant theme, but when it returns `"default"` (reserved for
 *     dark/embed contexts) or a missing/invalid theme, substitute a vibrant one
 *     (issue #281): the caller-supplied document-derived `preferredTheme` (from
 *     {@link inferDeckTheme}) when available, otherwise {@link FALLBACK_THEME}.
 *     An explicit NON-default vibrant theme the model chose is preserved. Text
 *     styles are normalized so title vs body hierarchy stays clear.
 *  4. Slides are stamped `elementsDerived = false` (authored). The user chose AI
 *     generation, so the output is treated like hand-authored content and a
 *     later "Sync from document" (issue #221) PRESERVES it instead of clobbering
 *     it with re-materialized document content.
 *  5. Output stays `safeParseDeck`-valid.
 */

import {
  DECK_THEMES,
  makeElementId,
  materializeSlideElements,
  type Deck,
  type DeckTheme,
  type ElementBox,
  type Slide,
  type SlideElement,
  type SlideLayoutHint,
  type TextElement,
  type TextElementStyle,
  type VisualElement,
} from "./deck";

/**
 * Brand-aligned theme used when the deck carries no valid theme. Mirrors the
 * fallback in {@link inferDeckTheme}; we cannot call that helper here because it
 * needs the document's visual blocks, which this normalization layer does not
 * receive.
 */
export const FALLBACK_THEME: DeckTheme = "indigo";

/**
 * Prominent visual box (percent units) used when injecting a document visual
 * into a `media` slide that is missing one. Mirrors the visual-only box in
 * {@link materializeSlideElements} so generated and derived slides share the
 * same approved geometry.
 */
const PROMINENT_VISUAL_BOX: ElementBox = { x: 8, y: 24, w: 84, h: 68 };

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
 * Builds an id → inventory-item lookup so visual elements can be labelled with
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

function isTitleText(element: SlideElement): element is TextElement {
  return element.kind === "text" && element.role === "title";
}

/**
 * Returns `true` when `elements` already carry the kind of content the declared
 * `layout` implies, so they can be cleaned in place rather than re-scaffolded.
 */
function elementsMatchLayout(
  layout: SlideLayoutHint,
  elements: readonly SlideElement[],
): boolean {
  if (elements.length === 0) return false;
  switch (layout) {
    case "media":
      return elements.some(isVisualSlot);
    case "title":
    case "section":
      return elements.some(isTitleText);
    case "content":
      return elements.some((el) => el.kind === "bullets" || el.kind === "text");
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
  const style: TextElementStyle = { ...element.style };
  if (!Number.isFinite(style.fontSize) || style.fontSize <= 0) {
    style.fontSize = element.role === "title" ? 6 : BODY_FONT_SIZE;
  }
  if (element.role === "title") {
    style.bold = true;
    if (style.fontSize < BODY_FONT_SIZE) {
      style.fontSize = BODY_FONT_SIZE;
    }
  }
  return { ...element, style };
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
  if (element.kind === "visual" && !knownIds.has(element.visualId)) {
    return undefined;
  }

  let id = element.id && element.id.length > 0 ? element.id : makeElementId();
  if (usedIds.has(id)) {
    id = makeElementId();
  }
  usedIds.add(id);

  const base = { ...element, id, zIndex, box: clampBox(element.box) };
  if (base.kind === "text") {
    return applyTextHierarchy(base as TextElement);
  }
  if (base.kind === "visual") {
    const visual = base as VisualElement;
    // Ensure a generated visual carries an accessible name; preserve an
    // explicit one the model already supplied.
    if (!visual.alt || visual.alt.trim().length === 0) {
      return {
        ...visual,
        alt: deriveVisualAccessibleName(inventory.get(visual.visualId)),
      };
    }
    return visual;
  }
  return base;
}

/**
 * Builds the normalized `elements[]` for one slide. Cleans the model's elements
 * when they match the declared layout; otherwise re-scaffolds them from the
 * slide's legacy fields via {@link materializeSlideElements}, then re-stamps
 * hierarchy and ids.
 */
function buildElements(
  slide: Slide,
  visualIds: string[],
  knownIds: ReadonlySet<string>,
  inventory: ReadonlyMap<string, VisualInventoryItem>,
): SlideElement[] {
  const usedIds = new Set<string>();

  let source: readonly SlideElement[];
  if (
    slide.elements &&
    slide.elements.length > 0 &&
    elementsMatchLayout(slide.layout, slide.elements)
  ) {
    source = slide.elements;
  } else {
    // Re-scaffold from the legacy fields so the slide gets hierarchy-aware,
    // template-conformant positioned elements.
    source = materializeSlideElements({
      ...slide,
      visualIds,
      elements: undefined,
      elementsDerived: undefined,
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

  // Rule 2: a media slide must place its document visual prominently. If a
  // known visual is referenced but no visual/image element carries it, inject
  // one into the prominent slot.
  if (slide.layout === "media") {
    const hasVisualElement = elements.some(isVisualSlot);
    const visualId = visualIds.find((id) => knownIds.has(id));
    if (!hasVisualElement && visualId) {
      elements.push({
        id: makeElementId(),
        kind: "visual",
        visualId,
        alt: deriveVisualAccessibleName(inventory.get(visualId)),
        zIndex: elements.length,
        box: { ...PROMINENT_VISUAL_BOX },
      });
    }
  }

  return elements;
}

function normalizeSlide(
  slide: Slide,
  index: number,
  theme: DeckTheme,
  knownIds: ReadonlySet<string>,
  inventory: ReadonlyMap<string, VisualInventoryItem>,
): Slide {
  const visualIds = (slide.visualIds ?? []).filter((id) => knownIds.has(id));
  const elements = buildElements(slide, visualIds, knownIds, inventory);

  return {
    ...slide,
    index,
    theme,
    visualIds,
    elements,
    // AI output is treated as hand-authored content: preserve it on sync.
    elementsDerived: false,
  };
}

function resolveTheme(deck: Deck, preferredTheme?: DeckTheme): DeckTheme {
  // Preserve an explicit, valid NON-default vibrant theme the model chose.
  if (deck.theme !== "default" && DECK_THEMES.includes(deck.theme)) {
    return deck.theme;
  }
  // The model returned "default", or a missing/invalid theme. Substitute a
  // vibrant one (issue #281): prefer a document-derived theme when supplied,
  // otherwise the brand-aligned indigo — never the bleak "default".
  if (
    preferredTheme &&
    preferredTheme !== "default" &&
    DECK_THEMES.includes(preferredTheme)
  ) {
    return preferredTheme;
  }
  return FALLBACK_THEME;
}

/**
 * Normalizes a validated, repaired {@link Deck} (as produced by `generateDeck`)
 * so every slide snaps to a template-conformant, theme-stamped, hierarchy-aware
 * set of positioned `elements[]`. Pure and deterministic except for generated
 * element ids. The result remains `safeParseDeck`-valid.
 *
 * @param deck       A `safeParseDeck`-valid deck to normalize.
 * @param inventory  Visuals the deck may reference, as a set of ids or any
 *                   array of `{ id }` carriers. Visuals not present here are
 *                   dropped. Omit for "no known visuals".
 * @param preferredTheme  A document-derived vibrant theme (from
 *                   {@link inferDeckTheme}) used when the model returns
 *                   `"default"` or a missing/invalid theme (issue #281). An
 *                   explicit NON-default vibrant theme the model chose is always
 *                   preserved. Falls back to {@link FALLBACK_THEME} when omitted.
 */
export function normalizeGeneratedDeck(
  deck: Deck,
  inventory?: VisualInventory,
  preferredTheme?: DeckTheme,
): Deck {
  const knownIds = toKnownIds(inventory);
  const inventoryMap = toInventoryMap(inventory);
  const theme = resolveTheme(deck, preferredTheme);
  const slides = deck.slides.map((slide, index) =>
    normalizeSlide(slide, index, theme, knownIds, inventoryMap),
  );
  return { ...deck, theme, slides };
}
