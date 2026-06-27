/** Pure document-to-deck derivation helpers. */

import type { DocumentBlock } from "@/lib/content";
import { fnv1aHash32 } from "@/lib/presentation/fnv-hash";
import { DEFAULT_SLIDE_FORMAT as DEFAULT_DECK_SLIDE_FORMAT } from "@/lib/presentation/slide-format";
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
import type { SlideLayoutHint } from "./deck-layouts-model";

/** Maximum visible bullets per content slide before text overflows to notes. */
export const MAX_BULLETS = 5;

type PresentationRole = "title" | "sectionTitle" | "bullet" | "visual";

type DerivedSlideContent = {
  id?: string;
  index?: number;
  title: string;
  titleRuns?: TextRun[];
  bullets: string[];
  bulletRuns?: TextRun[][];
  visualIds: string[];
  notes?: string;
  elements?: unknown;
  elementsDerived?: unknown;
  noteLines?: string[];
  layout: SlideLayoutHint;
};

interface SlideBuilder extends Omit<DerivedSlideContent, "bulletRuns" | "noteLines"> {
  bulletRuns: TextRun[][];
  noteLines: string[];
}

/**
 * Returns a deterministic stable id for a document section whose heading text
 * is `title`. Returns `undefined` for empty/blank headings so that untitled
 * slides keep the index-based fallback matching instead.
 */
function computeSectionId(title: string): string | undefined {
  const key = title.trim().toLowerCase();
  return key ? fnv1aHash32(key) : undefined;
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
  if (builder.visualIds.length > 0 && builder.bullets.length === 0) {
    return "media";
  }
  if (
    builder.visualIds.length > 0 ||
    builder.bullets.length > 0 ||
    builder.layout === "content"
  ) {
    return "content";
  }
  return "blank";
}

function textStyle(
  fontSize: number,
  align: ElementAlign,
  bold: boolean,
): TextElementStyle {
  return { fontSize, align, bold, italic: false };
}

function buildTextElement(input: {
  role: PresentationRole;
  text: string;
  paragraphs: Array<Record<string, unknown>>;
  runs?: TextRun[];
  zIndex: number;
  box: { x: number; y: number; w: number; h: number };
  style: TextElementStyle;
}): SlideElement {
  return {
    id: makeElementId(),
    kind: "text",
    role: input.role,
    box: input.box,
    zIndex: input.zIndex,
    content: {
      kind: "text",
      text: input.text,
      paragraphs: input.paragraphs,
      ...(input.runs && input.runs.length > 0 ? { runs: input.runs } : {}),
    },
    designOverrides: { textStyle: input.style },
  } as unknown as SlideElement;
}

function buildVisualContentElement(input: {
  visualId: string;
  zIndex: number;
  box: { x: number; y: number; w: number; h: number };
}): SlideElement {
  return {
    id: makeElementId(),
    kind: "visual",
    role: "visual",
    box: input.box,
    zIndex: input.zIndex,
    content: { kind: "visual", visualId: input.visualId },
  } as unknown as SlideElement;
}

/** Builds positioned v6 slide elements from document-derived slide content. */
export function buildSlideElementsFromContent(
  slide: DerivedSlideContent,
): SlideElement[] {
  const elements: SlideElement[] = [];
  let zIndex = 0;

  const visualIds = slide.visualIds;
  const bullets = slide.bullets;
  const hasVisual = visualIds.length > 0;
  const hasBullets = bullets.length > 0;
  const isBigTitle = slide.layout === "title" || slide.layout === "section";

  if (slide.title) {
    const titleRuns = slide.titleRuns?.length ? slide.titleRuns : undefined;
    elements.push(
      buildTextElement({
        role: slide.layout === "section" ? "sectionTitle" : "title",
        text: slide.title,
        paragraphs: [
          {
            text: slide.title,
            ...(titleRuns ? { runs: titleRuns } : {}),
          },
        ],
        ...(titleRuns ? { runs: titleRuns } : {}),
        zIndex: zIndex++,
        box: isBigTitle
          ? { x: 8, y: 36, w: 84, h: 28 }
          : { x: 6, y: 6, w: 88, h: 16 },
        style: textStyle(
          isBigTitle ? 9 : 6,
          isBigTitle ? "center" : "left",
          true,
        ),
      }),
    );
  }

  const bulletRuns = slide.bulletRuns?.length ? slide.bulletRuns : undefined;
  const bulletParagraphs = bullets.map((text, index) => ({
    text,
    ...(bulletRuns?.[index]?.length ? { runs: bulletRuns[index] } : {}),
    listType: "bullet" as const,
  }));

  if (hasVisual && hasBullets) {
    elements.push(
      buildTextElement({
        role: "bullet",
        text: bullets.join("\n"),
        paragraphs: bulletParagraphs,
        zIndex: zIndex++,
        box: { x: 6, y: 26, w: 46, h: 66 },
        style: textStyle(4.5, "left", false),
      }),
      buildVisualContentElement({
        visualId: visualIds[0],
        zIndex: zIndex++,
        box: { x: 54, y: 26, w: 40, h: 66 },
      }),
    );
  } else if (hasVisual) {
    elements.push(
      buildVisualContentElement({
        visualId: visualIds[0],
        zIndex: zIndex++,
        box: { x: 8, y: 24, w: 84, h: 68 },
      }),
    );
  } else if (hasBullets) {
    elements.push(
      buildTextElement({
        role: "bullet",
        text: bullets.join("\n"),
        paragraphs: bulletParagraphs,
        zIndex: zIndex++,
        box: { x: 6, y: 26, w: 88, h: 66 },
        style: textStyle(4.5, "left", false),
      }),
    );
  }

  for (let index = 1; index < visualIds.length; index += 1) {
    elements.push(
      buildVisualContentElement({
        visualId: visualIds[index],
        zIndex: zIndex++,
        box: { x: 12 + index * 4, y: 30 + index * 4, w: 38, h: 38 },
      }),
    );
  }

  return elements;
}

function finaliseSlide(builder: SlideBuilder, index: number): Slide {
  const layout = resolveLayout(builder);
  const hasBulletRuns = builder.bulletRuns.some((runs) => runs.length > 0);
  const content: DerivedSlideContent = {
    title: builder.title,
    ...(builder.titleRuns?.length ? { titleRuns: builder.titleRuns } : {}),
    bullets: builder.bullets,
    ...(hasBulletRuns ? { bulletRuns: builder.bulletRuns } : {}),
    visualIds: builder.visualIds,
    noteLines: builder.noteLines,
    layout,
  };
  const sourceSectionId = computeSectionId(builder.title);

  return {
    id: makeSlideId(),
    index,
    title: builder.title,
    notes: builder.noteLines.join("\n").trim(),
    ...(layout !== "blank" ? { templateId: layout } : {}),
    ...(sourceSectionId !== undefined
      ? { source: { sectionId: sourceSectionId } }
      : {}),
    elements: buildSlideElementsFromContent(content),
  } as unknown as Slide;
}

/**
 * Derives a v6 `Deck` from an ordered array of `DocumentBlock` values produced
 * by `collectDocumentBlocks`.
 */
export function buildDeckFromBlocks(
  blocks: DocumentBlock[],
  themeId: DeckTheme = "indigo",
): Deck {
  const slides: Slide[] = [];
  let current: SlideBuilder = freshSlide("", "blank");
  let sectionTitle = "";
  let hasContent = false;

  const flush = () => {
    if (
      current.title ||
      current.bullets.length > 0 ||
      current.visualIds.length > 0 ||
      current.noteLines.length > 0
    ) {
      slides.push(finaliseSlide(current, slides.length));
    }
  };

  for (const block of blocks) {
    if (block.kind === "text") {
      const { blockType, text } = block;
      const trimmed = text.trim();

      if (blockType === "heading") {
        const level = block.level ?? 2;

        if (level === 1) {
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

        flush();
        current = freshSlide(trimmed, "content", block.runs);
        if (!hasContent) hasContent = true;
        continue;
      }

      if (blockType === "hr") {
        flush();
        current = freshSlide(sectionTitle, "content");
        continue;
      }

      if (blockType === "quote") {
        if (trimmed) current.noteLines.push(trimmed);
        if (!hasContent) hasContent = true;
        continue;
      }

      if (!trimmed) continue;

      if (current.bullets.length < MAX_BULLETS) {
        current.bullets.push(trimmed);
        current.bulletRuns.push(block.runs ?? []);
      } else {
        current.noteLines.push(trimmed);
      }
      if (!hasContent) hasContent = true;
      continue;
    }

    if (!hasContent) hasContent = true;

    if (current.visualIds.length === 0) {
      current.visualIds.push(block.visualId);
    } else {
      flush();
      current = freshSlide(sectionTitle, "media");
      current.visualIds.push(block.visualId);
    }
  }

  flush();

  if (slides.length === 0) {
    slides.push({
      id: makeSlideId(),
      index: 0,
      title: "",
      notes: "",
      elements: [],
    } as unknown as Slide);
  }

  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: DEFAULT_DECK_SLIDE_FORMAT },
    design: { themeId },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides,
  } as unknown as Deck;
}
