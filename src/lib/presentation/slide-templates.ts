/**
 * Slide templates — pure, DOM-free constructors that turn a chosen layout
 * ("kind") into a ready-to-edit {@link Slide}.
 *
 * The "+ Add slide" picker offers a small menu of starting points (Title,
 * Content, Visual spotlight, Two-column, Blank). Each NON-blank template emits a
 * slide whose `elements[]` are pre-built from the shared {@link ElementBox}
 * geometry and {@link makeElementId} helpers, so the slide is immediately
 * editable with no materialization step.
 *
 * Crucially, template slides are **hand-authored**, not derived: they carry
 * `elementsDerived: false` so "Sync from document" (issue #221) preserves their
 * `elements[]` verbatim instead of clobbering them with re-materialized document
 * content. The Blank template reproduces the legacy blank slide exactly (no
 * `elements[]`, no flag) so today's behavior is unchanged.
 *
 * Pure and deterministic except for the generated element ids — fully testable
 * under `node --test`.
 */

import {
  makeElementId,
  makeSlideId,
  type BulletsElement,
  type DeckTheme,
  type ElementAlign,
  type ElementBox,
  type ImageElement,
  type Slide,
  type SlideElement,
  type SlideLayout,
  type TextElement,
  type TextElementStyle,
  type VisualElement,
} from "./deck";

/** The set of layouts the "+ Add slide" picker can insert. */
export type SlideTemplateKind =
  | "title"
  | "content"
  | "visual"
  | "two-column"
  | "blank";

/** Context threaded into {@link buildTemplateSlide} from the editor. */
export interface SlideTemplateContext {
  /** Theme stamped on the new slide (mirrors `Deck.theme`). */
  theme: DeckTheme;
  /**
   * Optional document visual to seed the "Visual spotlight" template with. When
   * absent the template drops in an empty image placeholder element instead, so
   * the layout works whether or not the document has visuals yet.
   */
  visualId?: string;
}

/** Static metadata describing one template option for the picker UI. */
export interface SlideTemplateOption {
  kind: SlideTemplateKind;
  label: string;
  description: string;
}

/**
 * The ordered list of templates surfaced by the picker. Pure data so the UI and
 * tests share a single source of truth for which kinds exist.
 */
export const SLIDE_TEMPLATES: readonly SlideTemplateOption[] = [
  {
    kind: "title",
    label: "Title",
    description: "Centered title with a subtitle",
  },
  {
    kind: "content",
    label: "Content",
    description: "Title with a bullet list",
  },
  {
    kind: "visual",
    label: "Visual spotlight",
    description: "Full-bleed visual with a caption",
  },
  {
    kind: "two-column",
    label: "Two-column",
    description: "Title over two bullet columns",
  },
  {
    kind: "blank",
    label: "Blank",
    description: "Empty slide to build from scratch",
  },
];

// ---------------------------------------------------------------------------
// Shared geometry — percentage boxes mirroring `materializeSlideElements`
// so templates reuse the same approved spacing rather than ad-hoc pixels.
// ---------------------------------------------------------------------------

const BOX = {
  /** Centered hero title for the Title template. */
  heroTitle: { x: 8, y: 32, w: 84, h: 22 },
  /** Subtitle beneath the hero title. */
  heroSubtitle: { x: 8, y: 56, w: 84, h: 12 },
  /** Top-aligned heading for content/two-column templates. */
  heading: { x: 6, y: 6, w: 88, h: 16 },
  /** Full-width body bullet list. */
  body: { x: 6, y: 26, w: 88, h: 66 },
  /** Left column body for the two-column template. */
  columnLeft: { x: 6, y: 26, w: 42, h: 66 },
  /** Right column body for the two-column template. */
  columnRight: { x: 52, y: 26, w: 42, h: 66 },
  /** Full-bleed visual/image stage for the spotlight template. */
  spotlight: { x: 4, y: 6, w: 92, h: 74 },
  /** Caption strip beneath the spotlight visual. */
  caption: { x: 6, y: 82, w: 88, h: 12 },
} satisfies Record<string, ElementBox>;

function textStyle(
  fontSize: number,
  align: ElementAlign,
  bold: boolean,
): TextElementStyle {
  return { fontSize, align, bold, italic: false };
}

function titleElement(
  text: string,
  box: ElementBox,
  zIndex: number,
  options: { big?: boolean; align?: ElementAlign } = {},
): TextElement {
  const big = options.big ?? false;
  return {
    id: makeElementId(),
    kind: "text",
    role: "title",
    text,
    zIndex,
    box: { ...box },
    style: textStyle(
      big ? 9 : 6,
      options.align ?? (big ? "center" : "left"),
      true,
    ),
  };
}

function bodyTextElement(
  text: string,
  box: ElementBox,
  zIndex: number,
  align: ElementAlign = "center",
): TextElement {
  return {
    id: makeElementId(),
    kind: "text",
    role: "body",
    text,
    zIndex,
    box: { ...box },
    style: textStyle(4.5, align, false),
  };
}

function bulletsElement(
  bullets: string[],
  box: ElementBox,
  zIndex: number,
): BulletsElement {
  return {
    id: makeElementId(),
    kind: "bullets",
    bullets,
    zIndex,
    box: { ...box },
    style: textStyle(4.5, "left", false),
  };
}

function spotlightElement(
  zIndex: number,
  visualId: string | undefined,
): VisualElement | ImageElement {
  if (visualId) {
    return {
      id: makeElementId(),
      kind: "visual",
      visualId,
      zIndex,
      box: { ...BOX.spotlight },
    };
  }
  return {
    id: makeElementId(),
    kind: "image",
    src: "",
    alt: "Visual placeholder",
    zIndex,
    box: { ...BOX.spotlight },
  };
}

/** Builds an authored (non-derived) slide from a template's elements. */
function authoredSlide(
  layout: SlideLayout,
  theme: DeckTheme,
  elements: SlideElement[],
  visualIds: string[] = [],
): Slide {
  return {
    id: makeSlideId(),
    index: 0,
    title: "",
    bullets: [],
    visualIds,
    layout,
    notes: "",
    theme,
    elements,
    // Hand-authored: the merge step must PRESERVE these elements rather than
    // re-materialize them from document content (issue #221).
    elementsDerived: false,
  };
}

/** Reproduces the legacy blank slide exactly — no elements, no derived flag. */
function blankSlide(theme: DeckTheme): Slide {
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

/**
 * Constructs a {@link Slide} for the given template `kind`.
 *
 * Non-blank templates return a slide with a pre-built `elements[]` and
 * `elementsDerived === false` (authored, preserved on sync). The Blank template
 * returns the legacy blank slide. `index` is a placeholder — the caller
 * re-indexes when inserting into the deck.
 */
export function buildTemplateSlide(
  kind: SlideTemplateKind,
  ctx: SlideTemplateContext,
): Slide {
  const { theme } = ctx;

  switch (kind) {
    case "title":
      return authoredSlide("title", theme, [
        titleElement("Title", BOX.heroTitle, 0, { big: true }),
        bodyTextElement("Subtitle", BOX.heroSubtitle, 1, "center"),
      ]);

    case "content":
      return authoredSlide("content", theme, [
        titleElement("Title", BOX.heading, 0),
        bulletsElement(
          ["First point", "Second point", "Third point"],
          BOX.body,
          1,
        ),
      ]);

    case "visual": {
      const visual = spotlightElement(0, ctx.visualId);
      return authoredSlide(
        "media",
        theme,
        [visual, bodyTextElement("Caption", BOX.caption, 1, "center")],
        ctx.visualId ? [ctx.visualId] : [],
      );
    }

    case "two-column":
      return authoredSlide("content", theme, [
        titleElement("Title", BOX.heading, 0),
        bulletsElement(["Point one", "Point two"], BOX.columnLeft, 1),
        bulletsElement(["Point three", "Point four"], BOX.columnRight, 2),
      ]);

    case "blank":
      return blankSlide(theme);
  }
}
