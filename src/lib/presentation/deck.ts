/**
 * Deck / slide data model and the pure article→slides transform.
 *
 * Design goals:
 *  - Pure and headless — no DOM, no React, no browser APIs.  Fully testable
 *    under `node --test`.
 *  - Block types are reused from `document-export.ts` rather than redefined;
 *    import them and never duplicate the schema.
 *  - Deterministic: the same block list always produces the same deck.
 *
 * Grouping rules implemented by `buildDeckFromBlocks`:
 *  1. An **h1** heading always opens a new title/section slide.
 *  2. An **h2** heading opens a new content slide whose title is carried forward
 *     as the section context for subsequent h2+ slides.
 *  3. **Paragraphs and list items** after the first `MAX_BULLETS` bullets are
 *     demoted to speaker notes on the current slide rather than shown as body
 *     bullets.  This keeps visible slide content tight.
 *  4. A **visual block** is attached to the current slide if the slide has no
 *     visual yet; otherwise it gets its own dedicated media slide.
 *  5. An **hr** (horizontal rule) acts as an explicit slide boundary — it flushes
 *     the current slide and starts a new one carrying the previous section title.
 *  6. Blocks that arrive before any heading are collected onto a preamble slide
 *     with an empty title.
 */

import type { DocumentBlock } from "@/lib/visual/document-export";

// ---------------------------------------------------------------------------
// Deck / Slide types
// ---------------------------------------------------------------------------

/** Presentation themes — mirrors the Visual theme palette names. */
export type DeckTheme =
  | "indigo"
  | "ocean"
  | "forest"
  | "sunset"
  | "grape"
  | "default";

/**
 * Slide layout hint used by a future renderer.
 *
 * - `"title"` — large centred title, optional subtitle; no bullets.
 * - `"section"` — section divider (h1 mid-deck).
 * - `"content"` — title + bullet list, optional media.
 * - `"media"` — visual occupies most of the slide; optional caption.
 * - `"blank"` — fallback for unusual combinations.
 */
export type SlideLayout = "title" | "section" | "content" | "media" | "blank";

// ---------------------------------------------------------------------------
// Free-form slide elements (additive, backward compatible)
// ---------------------------------------------------------------------------

/**
 * Positioned box for a free-form element, expressed in **percentages** of the
 * slide (0–100). Percentage units keep slides resolution- and aspect-ratio
 * independent so the same deck renders identically at any size.
 */
export interface ElementBox {
  /** Left edge, percent of slide width. */
  x: number;
  /** Top edge, percent of slide height. */
  y: number;
  /** Width, percent of slide width. */
  w: number;
  /** Height, percent of slide height. */
  h: number;
}

export type ElementAlign = "left" | "center" | "right";

/** Text styling shared by `text` and `bullets` elements. */
export interface TextElementStyle {
  /** Font size as a percent of slide height (rendered via `cqh`). */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: ElementAlign;
  /** Optional hex color override; falls back to the theme color when unset. */
  color?: string;
}

export type ShapeKind = "rect" | "ellipse" | "line";

interface BaseElement {
  /** Stable identifier, unique within a slide. */
  id: string;
  /** Positioned box in percent units. */
  box: ElementBox;
  /** Stacking order — higher renders on top. */
  zIndex: number;
}

export interface TextElement extends BaseElement {
  kind: "text";
  text: string;
  style: TextElementStyle;
  /** Theming hint for the default color when `style.color` is unset. */
  role: "title" | "body";
}

export interface BulletsElement extends BaseElement {
  kind: "bullets";
  bullets: string[];
  style: TextElementStyle;
}

export interface VisualElement extends BaseElement {
  kind: "visual";
  visualId: string;
  /**
   * Optional restyle applied over the referenced document visual at render
   * time — a {@link StyleTheme} id (see `@/lib/visual/themes`). When set, every
   * renderer re-tints the visual via `applyTheme` before drawing, so editor,
   * present and the public viewer stay identical. Absent → the visual renders
   * in its original document style.
   */
  styleThemeId?: string;
}

export interface ImageElement extends BaseElement {
  kind: "image";
  src: string;
  alt?: string;
}

export interface ShapeElement extends BaseElement {
  kind: "shape";
  shape: ShapeKind;
  /** Hex fill (rect/ellipse) or stroke (line) color. */
  color: string;
}

/** Discriminated union of every free-form slide element. */
export type SlideElement =
  | TextElement
  | BulletsElement
  | VisualElement
  | ImageElement
  | ShapeElement;

/** A single slide in the presentation deck. */
export interface Slide {
  /** Zero-based position in the deck. */
  index: number;

  /** Slide heading / title text (may be empty for the first/preamble slide). */
  title: string;

  /**
   * Body bullet strings — truncated to at most `MAX_BULLETS` items.
   * Surplus text is moved to `notes`.
   */
  bullets: string[];

  /**
   * Stable visual IDs attached to this slide.  Usually one entry; empty when
   * the slide has no visual content.
   */
  visualIds: string[];

  /** Renderer layout hint derived from the content composition. */
  layout: SlideLayout;

  /** Speaker notes — overflow prose + quote blocks. */
  notes: string;

  /** Presentation theme applied to the deck (copied from `Deck.theme`). */
  theme: DeckTheme;

  /**
   * Free-form positioned elements. When present and non-empty, this is the
   * **authoritative** slide content and renderers ignore the legacy
   * `title`/`bullets`/`visualIds`/`layout` fields. Absent for decks authored
   * before the free-form editor — those still render via the legacy layouts.
   */
  elements?: SlideElement[];

  /** Optional per-slide background color (hex), overriding the theme bg. */
  background?: string;

  /** Optional per-slide accent color (hex), overriding the theme accent. */
  accent?: string;
}

/** A complete presentation deck derived from a document's block structure. */
export interface Deck {
  /** Ordered list of slides. */
  slides: Slide[];

  /** Theme applied uniformly to all slides. */
  theme: DeckTheme;

  /**
   * Stable hash of the document content this deck was last derived/synced
   * against (see `deck-hash.ts`). Embedded in the persisted deck JSON — NO
   * schema change — so staleness can be detected without a separate column:
   * on open the editor recomputes the live content hash and compares it against
   * this value to surface `isDeckStale`. Absent for decks authored before this
   * signal existed (legacy) — those are treated as "staleness unknown" and the
   * banner stays hidden, while the manual "Sync from document" action remains
   * available.
   */
  deckContentHash?: string;
}

// ---------------------------------------------------------------------------
// Transform constants
// ---------------------------------------------------------------------------

/** Maximum visible bullets per content slide before text overflows to notes. */
export const MAX_BULLETS = 5;

// ---------------------------------------------------------------------------
// Element helpers
// ---------------------------------------------------------------------------

let elementIdCounter = 0;

/** Generates a stable-enough unique id for a new slide element. */
export function makeElementId(): string {
  elementIdCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `el-${Date.now().toString(36)}-${elementIdCounter}-${rand}`;
}

/**
 * Default centered box for a freshly inserted visual element, in percent units.
 * Wide and tall enough to read on a blank slide while leaving a margin so the
 * insert never butts against the slide edge. Kept as a named constant so the
 * "Insert visual" picker and tests share one source of truth.
 */
export const DEFAULT_VISUAL_BOX: ElementBox = { x: 25, y: 18, w: 50, h: 64 };

/**
 * Builds a {@link VisualElement} (sans `zIndex`) for the given document visual,
 * positioned at a default centered {@link ElementBox}. Pure and DOM-free: the
 * "Insert document visual" picker routes the result through
 * `addElement`/`onDeckChange` so the insert is undoable. `zIndex` is assigned by
 * `addElement`, so it is intentionally omitted here.
 */
export function buildVisualElement(
  visualId: string,
  options: { id?: string; box?: ElementBox; styleThemeId?: string } = {},
): Omit<VisualElement, "zIndex"> & { id: string } {
  return {
    id: options.id ?? makeElementId(),
    kind: "visual",
    visualId,
    box: options.box ?? { ...DEFAULT_VISUAL_BOX },
    ...(options.styleThemeId ? { styleThemeId: options.styleThemeId } : {}),
  };
}

/**
 * Returns the slide's free-form elements, deriving them from the legacy
 * `title` / `bullets` / `visualIds` fields when the slide has none yet.
 *
 * Pure and deterministic except for generated element ids. Used by the editor
 * to "materialize" a legacy slide into editable elements on demand, and by
 * tests. Renderers should prefer an existing `slide.elements` and only call
 * this when they explicitly want a derived element list.
 */
export function materializeSlideElements(slide: Slide): SlideElement[] {
  if (slide.elements && slide.elements.length > 0) {
    return slide.elements;
  }

  const elements: SlideElement[] = [];
  let z = 0;

  const visualIds = slide.visualIds ?? [];
  const bullets = slide.bullets ?? [];
  const hasVisual = visualIds.length > 0;
  const hasBullets = bullets.length > 0;
  const isBigTitle = slide.layout === "title" || slide.layout === "section";

  const textStyle = (
    fontSize: number,
    align: ElementAlign,
    bold: boolean,
  ): TextElementStyle => ({ fontSize, align, bold, italic: false });

  if (slide.title) {
    elements.push({
      id: makeElementId(),
      kind: "text",
      role: "title",
      text: slide.title,
      zIndex: z++,
      box: isBigTitle
        ? { x: 8, y: 36, w: 84, h: 28 }
        : { x: 6, y: 6, w: 88, h: 16 },
      style: textStyle(
        isBigTitle ? 9 : 6,
        isBigTitle ? "center" : "left",
        true,
      ),
    });
  }

  if (hasVisual && hasBullets) {
    elements.push({
      id: makeElementId(),
      kind: "bullets",
      bullets: [...bullets],
      zIndex: z++,
      box: { x: 6, y: 26, w: 46, h: 66 },
      style: textStyle(4.5, "left", false),
    });
    elements.push({
      id: makeElementId(),
      kind: "visual",
      visualId: visualIds[0],
      zIndex: z++,
      box: { x: 54, y: 26, w: 40, h: 66 },
    });
  } else if (hasVisual) {
    elements.push({
      id: makeElementId(),
      kind: "visual",
      visualId: visualIds[0],
      zIndex: z++,
      box: { x: 8, y: 24, w: 84, h: 68 },
    });
  } else if (hasBullets) {
    elements.push({
      id: makeElementId(),
      kind: "bullets",
      bullets: [...bullets],
      zIndex: z++,
      box: { x: 6, y: 26, w: 88, h: 66 },
      style: textStyle(4.5, "left", false),
    });
  }

  // Stack any additional visuals beyond the first as cascaded tiles.
  for (let i = 1; i < visualIds.length; i++) {
    elements.push({
      id: makeElementId(),
      kind: "visual",
      visualId: visualIds[i],
      zIndex: z++,
      box: { x: 12 + i * 4, y: 30 + i * 4, w: 38, h: 38 },
    });
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Internal builder helpers
// ---------------------------------------------------------------------------

interface SlideBuilder {
  title: string;
  bullets: string[];
  visualIds: string[];
  noteLines: string[];
  layout: SlideLayout;
}

function freshSlide(
  title: string,
  layout: SlideLayout = "content",
): SlideBuilder {
  return { title, bullets: [], visualIds: [], noteLines: [], layout };
}

function resolveLayout(builder: SlideBuilder): SlideLayout {
  if (builder.layout === "title" || builder.layout === "section") {
    return builder.layout;
  }
  // Visual-only → media (even if the builder was opened as "content")
  if (builder.visualIds.length > 0 && builder.bullets.length === 0) {
    return "media";
  }
  // Has any content, or was explicitly opened as a content slide (h2/h3 heading)
  if (
    builder.visualIds.length > 0 ||
    builder.bullets.length > 0 ||
    builder.layout === "content"
  ) {
    return "content";
  }
  return "blank";
}

function finaliseSlide(
  builder: SlideBuilder,
  index: number,
  theme: DeckTheme,
): Slide {
  return {
    index,
    title: builder.title,
    bullets: builder.bullets,
    visualIds: builder.visualIds,
    layout: resolveLayout(builder),
    notes: builder.noteLines.join("\n").trim(),
    theme,
  };
}

// ---------------------------------------------------------------------------
// buildDeckFromBlocks — pure transform
// ---------------------------------------------------------------------------

/**
 * Derives a `Deck` from an ordered array of `DocumentBlock` values produced by
 * `collectDocumentBlocks`.
 *
 * The transform is pure and deterministic: given the same input it always
 * returns the same deck.  It never throws — malformed or empty input yields a
 * deck with a single blank slide.
 *
 * @param blocks  Block list from `collectDocumentBlocks`.
 * @param theme   Presentation theme to stamp on every slide.  Defaults to
 *                `"default"`.
 * @returns A fully-populated `Deck`.
 */
export function buildDeckFromBlocks(
  blocks: DocumentBlock[],
  theme: DeckTheme = "default",
): Deck {
  const slides: Slide[] = [];
  let current: SlideBuilder = freshSlide("", "blank");
  let sectionTitle = "";
  let hasContent = false;

  const flush = () => {
    // Only emit a slide if it has any content (title, bullets, visuals, notes)
    if (
      current.title ||
      current.bullets.length > 0 ||
      current.visualIds.length > 0 ||
      current.noteLines.length > 0
    ) {
      slides.push(finaliseSlide(current, slides.length, theme));
    }
  };

  for (const block of blocks) {
    if (block.kind === "text") {
      const { blockType, text } = block;
      const trimmed = text.trim();

      if (blockType === "heading") {
        const level = block.level ?? 2;

        if (level === 1) {
          // h1 → flush current, open title/section slide
          flush();
          sectionTitle = trimmed;
          current = freshSlide(trimmed, hasContent ? "section" : "title");
          hasContent = true;
          continue;
        }

        // h2 / h3 → flush current, open content slide carrying section title
        flush();
        current = freshSlide(trimmed, "content");
        if (!hasContent) hasContent = true;
        continue;
      }

      if (blockType === "hr") {
        // Explicit slide break — flush and continue with same section title
        flush();
        current = freshSlide(sectionTitle, "content");
        continue;
      }

      if (blockType === "quote") {
        // Quotes always go to notes
        if (trimmed) current.noteLines.push(trimmed);
        if (!hasContent) hasContent = true;
        continue;
      }

      if (!trimmed) continue;

      // paragraph / listitem
      if (current.bullets.length < MAX_BULLETS) {
        current.bullets.push(trimmed);
      } else {
        current.noteLines.push(trimmed);
      }
      if (!hasContent) hasContent = true;
      continue;
    }

    // Visual block
    if (block.kind === "visual") {
      if (!hasContent) hasContent = true;

      if (current.visualIds.length === 0) {
        // Attach to current slide
        current.visualIds.push(block.visualId);
      } else {
        // Current slide already has a visual → flush and open a dedicated media slide
        flush();
        current = freshSlide(sectionTitle, "media");
        current.visualIds.push(block.visualId);
      }
    }
  }

  // Flush the final in-progress slide
  flush();

  // Guard: never return an empty deck
  if (slides.length === 0) {
    slides.push({
      index: 0,
      title: "",
      bullets: [],
      visualIds: [],
      layout: "blank",
      notes: "",
      theme,
    });
  }

  // Re-index after all pushes (index is set at push time but guard may add one)
  return { slides, theme };
}
