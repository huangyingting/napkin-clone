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
}

/** A complete presentation deck derived from a document's block structure. */
export interface Deck {
  /** Ordered list of slides. */
  slides: Slide[];

  /** Theme applied uniformly to all slides. */
  theme: DeckTheme;
}

// ---------------------------------------------------------------------------
// Transform constants
// ---------------------------------------------------------------------------

/** Maximum visible bullets per content slide before text overflows to notes. */
export const MAX_BULLETS = 5;

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
