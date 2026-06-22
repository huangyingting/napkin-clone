/**
 * Pure, immutable mutation helpers for an edited {@link Deck}.
 *
 * Every function returns a brand-new `Deck` (and new `Slide` objects) — the
 * input is never mutated. After any reorder/add/remove the slides are
 * re-indexed so `slide.index === array position`. No DOM, no React — fully
 * testable under `node --test`.
 */

import type { Deck, DeckTheme, ElementBox, Slide, SlideElement } from "./deck";
import type { SlideFormat } from "./slide-format";
import {
  makeElementId,
  makeSlideId,
  materializeSlideElements,
  migrateSlideToFreeForm,
} from "./deck";
import { type AlignMode, alignBoxes } from "./element-align";

/**
 * `Omit` that distributes over a discriminated union, preserving each member's
 * own fields (the built-in `Omit` collapses a union to its common keys).
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A partial patch for a single element, distributing over the union. */
export type ElementPatch = Partial<
  DistributiveOmit<SlideElement, "id" | "kind">
>;

/** Re-stamps each slide's `index` to match its position in the array. */
function reindex(slides: Slide[]): Slide[] {
  return slides.map((slide, index) =>
    slide.index === index ? slide : { ...slide, index },
  );
}

/** Creates a blank slide. `index` is a placeholder; callers re-index. */
function freshBlankSlide(theme: DeckTheme): Slide {
  return {
    id: makeSlideId(),
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    theme,
  };
}

/** Reorders slides: moves the slide at `fromIndex` to `toIndex`. */
export function reorderSlides(
  deck: Deck,
  fromIndex: number,
  toIndex: number,
): Deck {
  const slides = [...deck.slides];
  if (
    fromIndex < 0 ||
    fromIndex >= slides.length ||
    toIndex < 0 ||
    toIndex >= slides.length ||
    fromIndex === toIndex
  ) {
    return deck;
  }

  const [moved] = slides.splice(fromIndex, 1);
  slides.splice(toIndex, 0, moved);

  return { ...deck, slides: reindex(slides) };
}

/**
 * Moves the slide at `index` one position toward the start (`direction < 0`) or
 * end (`direction > 0`) of the deck, clamping at both ends — a move that would
 * fall off either edge is a no-op that returns the same deck reference. Only the
 * sign of `direction` is used. Delegates to {@link reorderSlides} so re-indexing
 * stays in one place; powers the thumbnail rail's keyboard-accessible ↑/↓
 * reorder buttons.
 */
export function moveSlide(deck: Deck, index: number, direction: number): Deck {
  if (index < 0 || index >= deck.slides.length || direction === 0) {
    return deck;
  }
  const target = index + (direction > 0 ? 1 : -1);
  if (target < 0 || target >= deck.slides.length) {
    return deck;
  }
  return reorderSlides(deck, index, target);
}

/** Adds a blank slide after `afterIndex` (`-1` prepends). */
export function addSlide(deck: Deck, afterIndex: number): Deck {
  const slides = [...deck.slides];
  const insertAt = Math.max(0, Math.min(afterIndex + 1, slides.length));
  slides.splice(insertAt, 0, freshBlankSlide(deck.theme));

  return { ...deck, slides: reindex(slides) };
}

/**
 * Inserts a fully-formed `slide` after `afterIndex` (`-1` prepends), then
 * re-indexes. Unlike {@link addSlide} (which always appends a blank slide), this
 * places a caller-built slide — e.g. one produced by `buildTemplateSlide` — so
 * the editor's template picker can route an authored slide through the same
 * undo/redo `commit` path. The slide is taken as-is; its `theme`/`elements` are
 * preserved verbatim.
 */
export function insertSlide(
  deck: Deck,
  afterIndex: number,
  slide: Slide,
): Deck {
  const slides = [...deck.slides];
  const insertAt = Math.max(0, Math.min(afterIndex + 1, slides.length));
  slides.splice(insertAt, 0, slide);

  return { ...deck, slides: reindex(slides) };
}

/** Duplicates the slide at `index`, inserting the copy right after it. */
export function duplicateSlide(deck: Deck, index: number): Deck {
  if (index < 0 || index >= deck.slides.length) {
    return deck;
  }

  const original = deck.slides[index];
  const copy: Slide = {
    ...original,
    id: makeSlideId(),
    bullets: [...original.bullets],
    visualIds: [...original.visualIds],
    ...(original.elements
      ? { elements: original.elements.map((element) => ({ ...element })) }
      : {}),
  };

  const slides = [...deck.slides];
  slides.splice(index + 1, 0, copy);

  return { ...deck, slides: reindex(slides) };
}

/** Removes the slide at `index`, keeping at least one slide in the deck. */
export function removeSlide(deck: Deck, index: number): Deck {
  if (index < 0 || index >= deck.slides.length || deck.slides.length <= 1) {
    return deck;
  }

  const slides = [...deck.slides];
  slides.splice(index, 1);

  return { ...deck, slides: reindex(slides) };
}

/**
 * Legacy slide fields that the free-form `elements[]` track makes authoritative.
 * Once a slide has elements, renderers ignore these, so {@link updateSlide}
 * refuses to patch them to avoid leaving conflicting legacy + free-form content.
 */
const LEGACY_CONTENT_FIELDS = [
  "title",
  "titleRuns",
  "bullets",
  "bulletRuns",
  "visualIds",
  "layout",
] as const satisfies readonly (keyof Slide)[];

/**
 * Updates a slide's field(s) and re-indexes the deck.
 *
 * **Free-form guard:** when the target slide already has authoritative
 * `elements[]`, patches to the legacy content fields (`title`, `titleRuns`,
 * `bullets`, `bulletRuns`, `visualIds`, `layout`) are ignored — renderers read
 * only `elements[]`, so honoring such a patch would silently desync the legacy
 * fallback from the visible slide. All other fields (e.g. `notes`, `background`,
 * `accent`, `elements`, `elementsDerived`) still apply. Legacy slides (no
 * `elements[]`) accept the full patch unchanged.
 */
export function updateSlide(
  deck: Deck,
  index: number,
  patch: Partial<Omit<Slide, "index" | "theme">>,
): Deck {
  if (index < 0 || index >= deck.slides.length) {
    return deck;
  }

  const target = deck.slides[index];
  const hasElements = Boolean(target.elements && target.elements.length > 0);
  const effectivePatch = hasElements ? stripLegacyContentFields(patch) : patch;

  const slides = deck.slides.map((slide, i) =>
    i === index
      ? { ...slide, ...effectivePatch, index: slide.index, theme: slide.theme }
      : slide,
  );

  return { ...deck, slides: reindex(slides) };
}

/** Drops legacy content keys from a slide patch (free-form guard helper). */
function stripLegacyContentFields(
  patch: Partial<Omit<Slide, "index" | "theme">>,
): Partial<Omit<Slide, "index" | "theme">> {
  const next = { ...patch };
  for (const field of LEGACY_CONTENT_FIELDS) {
    delete next[field];
  }
  return next;
}

/** Changes the deck theme, copying it onto every slide. */
export function setDeckTheme(deck: Deck, theme: DeckTheme): Deck {
  return {
    ...deck,
    theme,
    slides: deck.slides.map((slide) =>
      slide.theme === theme ? slide : { ...slide, theme },
    ),
  };
}

/** Changes the deck-wide slide format. */
export function setDeckSlideFormat(deck: Deck, slideFormat: SlideFormat): Deck {
  return deck.slideFormat === slideFormat ? deck : { ...deck, slideFormat };
}

// ---------------------------------------------------------------------------
// Free-form element mutations
// ---------------------------------------------------------------------------

/** Maps a single slide by index, leaving the rest of the deck untouched. */
function mapSlide(
  deck: Deck,
  index: number,
  fn: (slide: Slide) => Slide,
): Deck {
  if (index < 0 || index >= deck.slides.length) {
    return deck;
  }
  const slides = deck.slides.map((slide, i) =>
    i === index ? fn(slide) : slide,
  );
  return { ...deck, slides };
}

/**
 * Materializes a slide's legacy content into free-form elements (no-op when the
 * slide already has elements). After this the slide is edited element-first.
 *
 * Delegates to {@link migrateSlideToFreeForm} — the single audited legacy →
 * free-form upgrade — so the `elementsDerived` provenance (issue #221) stays
 * consistent with every other upgrade path.
 */
export function materializeSlide(deck: Deck, index: number): Deck {
  return mapSlide(deck, index, migrateSlideToFreeForm);
}

/**
 * True when a slide still holds legacy content (title / bullets / visuals) that
 * has not yet been materialized into free-form `elements`. A blank slide with
 * no legacy content returns `false` — there is nothing to derive.
 *
 * Pure and deterministic: mirrors the element-producing branches of
 * {@link materializeSlideElements} without generating any ids, so it is safe to
 * call repeatedly (e.g. from the editor on open, or from tests).
 */
export function slideNeedsMaterialization(slide: Slide): boolean {
  if (slide.elements && slide.elements.length > 0) {
    return false;
  }
  return Boolean(
    slide.title ||
    (slide.bullets?.length ?? 0) > 0 ||
    (slide.visualIds?.length ?? 0) > 0,
  );
}

/**
 * Materializes every legacy slide in the deck so each one is directly editable
 * element-first. Slides that already have elements — or that are blank with no
 * legacy content — are left untouched.
 *
 * Returns the *same* deck reference when nothing needs materializing, so a
 * history `commit` of the result is a no-op (the snapshot reducer skips
 * reference-equal decks) and the editor can call this on open without polluting
 * undo history for already-materialized decks.
 */
export function materializeDeck(deck: Deck): Deck {
  let changed = false;
  const slides = deck.slides.map((slide) => {
    if (!slideNeedsMaterialization(slide)) {
      return slide;
    }
    changed = true;
    return migrateSlideToFreeForm(slide);
  });
  return changed ? { ...deck, slides } : deck;
}

/** Returns the next z-index above the current maximum on a slide. */
function nextZIndex(elements: readonly SlideElement[]): number {
  return (
    elements.reduce((max, element) => Math.max(max, element.zIndex), -1) + 1
  );
}

/**
 * Marks a slide's `elements[]` as hand-edited (issue #221): clears the
 * `elementsDerived` provenance flag so "Sync from document" preserves the
 * elements verbatim instead of re-materializing them from document content.
 * Applied by every element-editing mutation (add/update/remove/reorder).
 */
function markElementsEdited(slide: Slide): Slide {
  return slide.elementsDerived === false
    ? slide
    : { ...slide, elementsDerived: false };
}

/** Appends a new element to a slide, materializing legacy content first. */
export function addElement(
  deck: Deck,
  index: number,
  element: DistributiveOmit<SlideElement, "id" | "zIndex"> & {
    id?: string;
    zIndex?: number;
  },
): Deck {
  return mapSlide(deck, index, (slide) => {
    const existing =
      slide.elements && slide.elements.length > 0
        ? slide.elements
        : materializeSlideElements(slide);
    const next: SlideElement = {
      ...element,
      id: element.id ?? makeElementId(),
      zIndex: element.zIndex ?? nextZIndex(existing),
    } as SlideElement;
    return markElementsEdited({ ...slide, elements: [...existing, next] });
  });
}

/** Patches a single element on a slide by id (cannot change `id`/`kind`). */
export function updateElement(
  deck: Deck,
  index: number,
  elementId: string,
  patch: ElementPatch,
): Deck {
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    return markElementsEdited({
      ...slide,
      elements: slide.elements.map((element) =>
        element.id === elementId
          ? ({
              ...element,
              ...patch,
              id: element.id,
              kind: element.kind,
            } as SlideElement)
          : element,
      ),
    });
  });
}

/**
 * Aligns the elements named by `elementIds` on the slide at `index` to a shared
 * edge/center, computed from their selection bounding box via the pure
 * {@link alignBoxes} math (issue #237). Only the listed elements move; every
 * other element is left untouched. Pure and immutable — the input deck is never
 * mutated.
 *
 * Like every element mutation this clears `elementsDerived` so the slide is
 * treated as hand-edited. A no-op (bad index, no `elements[]`, or none of the
 * ids present) returns the same slide.
 */
export function alignElements(
  deck: Deck,
  index: number,
  elementIds: readonly string[],
  mode: AlignMode,
): Deck {
  const ids = new Set(elementIds);
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    const targets = slide.elements.filter((element) => ids.has(element.id));
    if (targets.length === 0) {
      return slide;
    }
    const aligned = alignBoxes(
      targets.map((element) => element.box),
      mode,
    );
    const boxById = new Map<string, ElementBox>();
    targets.forEach((element, i) => boxById.set(element.id, aligned[i]));
    return markElementsEdited({
      ...slide,
      elements: slide.elements.map((element) => {
        const box = boxById.get(element.id);
        return box ? { ...element, box } : element;
      }),
    });
  });
}

/**
 * Default offset (percent of slide) applied to a duplicated element so the copy
 * is visibly nudged off its original and immediately grabbable.
 */
export const DUPLICATE_ELEMENT_OFFSET_PCT = 2;

/** Result of {@link duplicateElement}: the next deck and the new copy's id. */
export interface DuplicateElementResult {
  /** The deck with the clone appended (or the original deck on a no-op). */
  deck: Deck;
  /**
   * Id of the freshly created copy so the caller can select it, or `null` when
   * the duplicate was a no-op (slide/element not found, or no `elements[]`).
   */
  newElementId: string | null;
}

/** Offsets a box by `delta` percent on both axes, clamped within the slide. */
function offsetBox(box: ElementBox, delta: number): ElementBox {
  return {
    ...box,
    x: Math.max(0, Math.min(100 - box.w, box.x + delta)),
    y: Math.max(0, Math.min(100 - box.h, box.y + delta)),
  };
}

/**
 * Clones the element `elementId` on the slide at `index`, appending the copy
 * with a fresh {@link makeElementId} id, a small {@link
 * DUPLICATE_ELEMENT_OFFSET_PCT} offset, and the next z-index above all others so
 * it sits on top. Pure and immutable: the original element and deck are left
 * untouched. Returns the next deck plus the new copy's id so the caller can
 * select it; a no-op (bad index, missing element, or a slide with no
 * `elements[]`) returns the same deck and a `null` id.
 *
 * Like every element mutation this clears `elementsDerived` so the slide is
 * treated as hand-edited.
 */
export function duplicateElement(
  deck: Deck,
  index: number,
  elementId: string,
): DuplicateElementResult {
  if (index < 0 || index >= deck.slides.length) {
    return { deck, newElementId: null };
  }
  const slide = deck.slides[index];
  if (!slide.elements) {
    return { deck, newElementId: null };
  }
  const original = slide.elements.find((element) => element.id === elementId);
  if (!original) {
    return { deck, newElementId: null };
  }

  const newElementId = makeElementId();
  const copy: SlideElement = {
    ...original,
    id: newElementId,
    zIndex: nextZIndex(slide.elements),
    box: offsetBox(original.box, DUPLICATE_ELEMENT_OFFSET_PCT),
  };

  const nextSlide = markElementsEdited({
    ...slide,
    elements: [...slide.elements, copy],
  });
  const slides = deck.slides.map((current, i) =>
    i === index ? nextSlide : current,
  );

  return { deck: { ...deck, slides }, newElementId };
}

/** Result of {@link duplicateElements}: the next deck and the new copies' ids. */
export interface DuplicateElementsResult {
  /** The deck with the clones appended (or the original deck on a no-op). */
  deck: Deck;
  /**
   * Ids of the freshly created copies, in the same order as the originals were
   * found on the slide, so the caller can select the new copies. Empty on a
   * no-op (slide/element not found, or no `elements[]`).
   */
  newElementIds: string[];
}

/**
 * Clones every element named in `elementIds` on the slide at `index` in a single
 * mutation — the multi-select counterpart of {@link duplicateElement} (issue
 * #245). Each copy gets a fresh {@link makeElementId} id, the same small
 * {@link DUPLICATE_ELEMENT_OFFSET_PCT} offset, and a z-index above all existing
 * elements (copies keep their relative stacking order). Routing the whole group
 * through one mutation keeps it a single undo/redo `commit`. Pure and immutable;
 * clears `elementsDerived`. A no-op returns the same deck and an empty id list.
 */
export function duplicateElements(
  deck: Deck,
  index: number,
  elementIds: readonly string[],
): DuplicateElementsResult {
  if (index < 0 || index >= deck.slides.length) {
    return { deck, newElementIds: [] };
  }
  const slide = deck.slides[index];
  if (!slide.elements) {
    return { deck, newElementIds: [] };
  }
  const ids = new Set(elementIds);
  const originals = slide.elements.filter((element) => ids.has(element.id));
  if (originals.length === 0) {
    return { deck, newElementIds: [] };
  }

  let z = nextZIndex(slide.elements);
  const newElementIds: string[] = [];
  const copies: SlideElement[] = originals.map((original) => {
    const newElementId = makeElementId();
    newElementIds.push(newElementId);
    return {
      ...original,
      id: newElementId,
      zIndex: z++,
      box: offsetBox(original.box, DUPLICATE_ELEMENT_OFFSET_PCT),
    };
  });

  const nextSlide = markElementsEdited({
    ...slide,
    elements: [...slide.elements, ...copies],
  });
  const slides = deck.slides.map((current, i) =>
    i === index ? nextSlide : current,
  );

  return { deck: { ...deck, slides }, newElementIds };
}

/** Removes an element from a slide by id. */
export function removeElement(
  deck: Deck,
  index: number,
  elementId: string,
): Deck {
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    return markElementsEdited({
      ...slide,
      elements: slide.elements.filter((element) => element.id !== elementId),
    });
  });
}

/**
 * Removes every element named in `elementIds` from the slide at `index` in a
 * single mutation — the multi-select counterpart of {@link removeElement}
 * (issue #245). Routing a multi-delete through one mutation keeps it a single
 * undo/redo `commit` (the caller never chains per-element removes). Pure and
 * immutable; like every element mutation it clears `elementsDerived`. A no-op
 * (empty `elementIds`, bad index, no `elements[]`, or no id present) returns the
 * same slide reference so a `commit` of the result is skipped.
 */
export function removeElements(
  deck: Deck,
  index: number,
  elementIds: readonly string[],
): Deck {
  const ids = new Set(elementIds);
  if (ids.size === 0) {
    return deck;
  }
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    const next = slide.elements.filter((element) => !ids.has(element.id));
    if (next.length === slide.elements.length) {
      return slide;
    }
    return markElementsEdited({ ...slide, elements: next });
  });
}

/**
 * Nudges every element named in `elementIds` on the slide at `index` by the same
 * `dx`/`dy` delta (percent of slide), clamping each box so it stays within the
 * slide (issue #245). Powers the keyboard arrow-nudge across a multi-selection;
 * sizes are never changed and elements not in `elementIds` are left untouched.
 * Pure and immutable; clears `elementsDerived`. A no-op (empty `elementIds`,
 * zero delta, bad index, no `elements[]`, or no id present) returns the same
 * slide reference.
 */
export function nudgeElements(
  deck: Deck,
  index: number,
  elementIds: readonly string[],
  dx: number,
  dy: number,
): Deck {
  const ids = new Set(elementIds);
  if (ids.size === 0 || (dx === 0 && dy === 0)) {
    return deck;
  }
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    let changed = false;
    const elements = slide.elements.map((element) => {
      if (!ids.has(element.id)) {
        return element;
      }
      changed = true;
      const { box } = element;
      return {
        ...element,
        box: {
          ...box,
          x: Math.max(0, Math.min(100 - box.w, box.x + dx)),
          y: Math.max(0, Math.min(100 - box.h, box.y + dy)),
        },
      };
    });
    return changed ? markElementsEdited({ ...slide, elements }) : slide;
  });
}

/** Raises an element above all others on its slide. */
export function bringElementToFront(
  deck: Deck,
  index: number,
  elementId: string,
): Deck {
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    const top = nextZIndex(slide.elements);
    return markElementsEdited({
      ...slide,
      elements: slide.elements.map((element) =>
        element.id === elementId ? { ...element, zIndex: top } : element,
      ),
    });
  });
}

/** Lowers an element beneath all others on its slide. */
export function sendElementToBack(
  deck: Deck,
  index: number,
  elementId: string,
): Deck {
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    const bottom =
      slide.elements.reduce(
        (min, element) => Math.min(min, element.zIndex),
        Number.POSITIVE_INFINITY,
      ) - 1;
    return markElementsEdited({
      ...slide,
      elements: slide.elements.map((element) =>
        element.id === elementId ? { ...element, zIndex: bottom } : element,
      ),
    });
  });
}

/** Sets (or clears, with `undefined`) a slide's background color override. */
export function setSlideBackground(
  deck: Deck,
  index: number,
  background: string | undefined,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const next = { ...slide };
    if (background === undefined) {
      delete next.background;
    } else {
      next.background = background;
    }
    return next;
  });
}

/**
 * Sets multiple element boxes at once on a slide (used by group drag-move so a
 * whole group moves in a single, undoable mutation).
 */
export function setElementBoxes(
  deck: Deck,
  index: number,
  boxesById: Record<string, ElementBox>,
): Deck {
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    return markElementsEdited({
      ...slide,
      elements: slide.elements.map((element) =>
        boxesById[element.id]
          ? { ...element, box: boxesById[element.id] }
          : element,
      ),
    });
  });
}

/** Assigns a fresh group id to the given elements; returns it for re-selection. */
export function groupElements(
  deck: Deck,
  index: number,
  ids: readonly string[],
): { deck: Deck; groupId: string } {
  const groupId = makeElementId();
  const idSet = new Set(ids);
  const next = mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    return markElementsEdited({
      ...slide,
      elements: slide.elements.map((element) =>
        idSet.has(element.id) ? { ...element, groupId } : element,
      ),
    });
  });
  return { deck: next, groupId };
}

/** Clears the given `groupId` from every element that carries it. */
export function ungroupElements(
  deck: Deck,
  index: number,
  groupId: string,
): Deck {
  return mapSlide(deck, index, (slide) => {
    if (!slide.elements) {
      return slide;
    }
    return markElementsEdited({
      ...slide,
      elements: slide.elements.map((element) => {
        if (element.groupId !== groupId) {
          return element;
        }
        const copy = { ...element };
        delete (copy as { groupId?: string }).groupId;
        return copy;
      }),
    });
  });
}

/** Sets (or clears, with `undefined`) a slide's accent color override. */
export function setSlideAccent(
  deck: Deck,
  index: number,
  accent: string | undefined,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const next = { ...slide };
    if (accent === undefined) {
      delete next.accent;
    } else {
      next.accent = accent;
    }
    return next;
  });
}

/**
 * Sets (or clears) a slide's background gradient. Setting it clears any
 * background image so the precedence (image > gradient > solid) stays clean.
 */
export function setSlideBackgroundGradient(
  deck: Deck,
  index: number,
  gradient: { from: string; to: string; angle?: number } | undefined,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const next = { ...slide };
    if (gradient === undefined) {
      delete next.backgroundGradient;
    } else {
      next.backgroundGradient = gradient;
      delete next.backgroundImage;
    }
    return next;
  });
}

/**
 * Sets (or clears) a slide's background image. Setting it clears any background
 * gradient so the precedence stays clean.
 */
export function setSlideBackgroundImage(
  deck: Deck,
  index: number,
  image: string | undefined,
): Deck {
  return mapSlide(deck, index, (slide) => {
    const next = { ...slide };
    if (image === undefined) {
      delete next.backgroundImage;
    } else {
      next.backgroundImage = image;
      delete next.backgroundGradient;
    }
    return next;
  });
}
