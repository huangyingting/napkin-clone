/** Pure document-to-deck derivation helpers. */

import { DEFAULT_SLIDE_FORMAT as DEFAULT_DECK_SLIDE_FORMAT } from "@/lib/presentation/slide-format";
import type { DocumentBlock } from "@/lib/visual/document-export";
import { fnv1aHash32 } from "@/lib/presentation/fnv-hash";
import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
  type DeckTheme,
  type Slide,
} from "./deck-core";
import { makeElementId, makeSlideId } from "./deck-ids";
import type {
  ElementAlign,
  SlideElement,
  TextElementStyle,
  TextRun,
} from "./deck-elements";
import { defaultLayouts, type SlideLayoutHint } from "./deck-layouts-model";

/**
 * Returns a deterministic stable id for a document section whose heading text
 * is `title`. Returns `undefined` for empty/blank headings so that untitled
 * slides keep the index-based fallback matching instead.
 */
function computeSectionId(title: string): string | undefined {
  const key = title.trim().toLowerCase();
  return key ? fnv1aHash32(key) : undefined;
}

// ---------------------------------------------------------------------------
// Transform constants
// ---------------------------------------------------------------------------

/** Maximum visible bullets per content slide before text overflows to notes. */
export const MAX_BULLETS = 5;

/** Builds positioned current elements while deriving a brand-new deck. */
export function buildSlideElementsFromContent(slide: Slide): SlideElement[] {
  const elements: SlideElement[] = [];
  let z = 0;

  const visualIds = slide.visualIds;
  const bullets = slide.bullets;
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
      ...(slide.titleRuns && slide.titleRuns.length > 0
        ? { runs: slide.titleRuns }
        : {}),
      zIndex: z++,
      box: isBigTitle
        ? { x: 8, y: 36, w: 84, h: 28 }
        : { x: 6, y: 6, w: 88, h: 16 },
      style: textStyle(
        isBigTitle ? 9 : 6,
        isBigTitle ? "center" : "left",
        true,
      ),
      textRole: "h1",
      layoutSlot: { kind: "title" },
    });
  }

  const bulletRuns =
    slide.bulletRuns && slide.bulletRuns.length > 0 ? slide.bulletRuns : null;

  if (hasVisual && hasBullets) {
    elements.push({
      id: makeElementId(),
      kind: "bullets",
      bullets: [...bullets],
      ...(bulletRuns ? { bulletRuns } : {}),
      items: bullets.map((text, index) => ({
        text,
        ...(bulletRuns?.[index] && bulletRuns[index].length > 0
          ? { runs: bulletRuns[index] }
          : {}),
      })),
      zIndex: z++,
      box: { x: 6, y: 26, w: 46, h: 66 },
      style: textStyle(4.5, "left", false),
      textRole: "bullet",
      layoutSlot: { kind: "body" },
    });
    elements.push({
      id: makeElementId(),
      kind: "visual",
      visualId: visualIds[0],
      zIndex: z++,
      box: { x: 54, y: 26, w: 40, h: 66 },
      layoutSlot: { kind: "visual" },
    });
  } else if (hasVisual) {
    elements.push({
      id: makeElementId(),
      kind: "visual",
      visualId: visualIds[0],
      zIndex: z++,
      box: { x: 8, y: 24, w: 84, h: 68 },
      layoutSlot: { kind: "visual" },
    });
  } else if (hasBullets) {
    elements.push({
      id: makeElementId(),
      kind: "bullets",
      bullets: [...bullets],
      ...(bulletRuns ? { bulletRuns } : {}),
      items: bullets.map((text, index) => ({
        text,
        ...(bulletRuns?.[index] && bulletRuns[index].length > 0
          ? { runs: bulletRuns[index] }
          : {}),
      })),
      zIndex: z++,
      box: { x: 6, y: 26, w: 88, h: 66 },
      style: textStyle(4.5, "left", false),
      textRole: "bullet",
      layoutSlot: { kind: "body" },
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
      layoutSlot: { kind: "visual", index: i },
    });
  }

  return elements;
}

interface SlideBuilder {
  title: string;
  titleRuns?: TextRun[];
  bullets: string[];
  bulletRuns: TextRun[][];
  visualIds: string[];
  noteLines: string[];
  layout: SlideLayoutHint;
}

function freshSlide(
  title: string,
  layout: SlideLayoutHint = "content",
  titleRuns?: TextRun[],
): SlideBuilder {
  return {
    title,
    ...(titleRuns ? { titleRuns } : {}),
    bullets: [],
    bulletRuns: [],
    visualIds: [],
    noteLines: [],
    layout,
  };
}

function resolveLayout(builder: SlideBuilder): SlideLayoutHint {
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
  const hasBulletRuns = builder.bulletRuns.some((runs) => runs.length > 0);
  const sourceSectionId = computeSectionId(builder.title);
  const slide: Slide = {
    id: makeSlideId(),
    index,
    title: builder.title,
    ...(builder.titleRuns && builder.titleRuns.length > 0
      ? { titleRuns: builder.titleRuns }
      : {}),
    bullets: builder.bullets,
    ...(hasBulletRuns ? { bulletRuns: builder.bulletRuns } : {}),
    visualIds: builder.visualIds,
    layout: resolveLayout(builder),
    notes: builder.noteLines.join("\n").trim(),
    theme,
    ...(sourceSectionId !== undefined ? { sourceSectionId } : {}),
  };
  return {
    ...slide,
    elements: buildSlideElementsFromContent(slide),
    elementsDerived: true,
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
          current = freshSlide(
            trimmed,
            hasContent ? "section" : "title",
            block.runs,
          );
          hasContent = true;
          continue;
        }

        // h2 / h3 → flush current, open content slide carrying section title
        flush();
        current = freshSlide(trimmed, "content", block.runs);
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
        current.bulletRuns.push(block.runs ?? []);
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
      id: makeSlideId(),
      index: 0,
      title: "",
      bullets: [],
      visualIds: [],
      layout: "blank",
      notes: "",
      theme,
      elements: [],
      elementsDerived: false,
    });
  }

  // Re-index after all pushes (index is set at push time but guard may add one)
  return {
    slides,
    theme,
    themeId: theme,
    slideFormat: DEFAULT_DECK_SLIDE_FORMAT,
    layouts: defaultLayouts(),
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  };
}
