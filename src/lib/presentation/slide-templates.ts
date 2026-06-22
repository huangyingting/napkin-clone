/**
 * Slide templates — pure, DOM-free constructors that turn a chosen layout
 * ("kind") into a ready-to-edit {@link Slide}.
 *
 * The "+ Add slide" picker offers a small menu of starting points (Title,
 * Content, Visual spotlight, Two-column, Blank). Non-blank templates emit a
 * slide whose `elements[]` are pre-built either from the reusable placeholder
 * layouts ({@link defaultLayouts}) or, for the spotlight variant, shared
 * geometry helpers, so the slide is immediately editable with no materialization
 * step.
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
  defaultLayouts,
  makeElementId,
  makeSlideId,
  type DeckTheme,
  type ElementAlign,
  type ElementBox,
  type ImageElement,
  type Slide,
  type SlideElement,
  type SlideLayout as ReusableSlideLayout,
  type SlideLayoutHint,
  type TextElement,
  type TextElementStyle,
  type VisualElement,
  resetLayout,
} from "./deck";
import { DEFAULT_SLIDE_FORMAT, type SlideFormat } from "./slide-format";

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
  /** Target slide format so placeholder layouts match the current deck. */
  slideFormat?: SlideFormat;
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
    description: "Centered title and subtitle placeholders",
  },
  {
    kind: "content",
    label: "Content",
    description: "Title, body, and visual placeholders",
  },
  {
    kind: "visual",
    label: "Visual spotlight",
    description: "Full-bleed visual with a caption",
  },
  {
    kind: "two-column",
    label: "Two-column",
    description: "Title over two body placeholders",
  },
  {
    kind: "blank",
    label: "Blank",
    description: "Empty slide to build from scratch",
  },
];

// ---------------------------------------------------------------------------
// Shared spotlight geometry — kept local because only the visual template still
// uses bespoke boxes; the other templates route through `defaultLayouts()`.
// ---------------------------------------------------------------------------

const BOX = {
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
  layout: SlideLayoutHint,
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

function findDefaultLayout(
  name: "title-slide" | "title-content" | "two-column",
  format: SlideFormat | undefined,
): ReusableSlideLayout {
  const slideFormat = format ?? DEFAULT_SLIDE_FORMAT;
  const layouts = defaultLayouts();
  const match =
    layouts.find(
      (layout) => layout.name === name && layout.format === slideFormat,
    ) ?? layouts.find((layout) => layout.name === name);
  if (!match) {
    throw new Error(`Missing built-in slide layout "${name}"`);
  }
  return match;
}

function placeholderTemplateSlide(
  name: "title-slide" | "title-content" | "two-column",
  theme: DeckTheme,
  slideFormat: SlideFormat | undefined,
): Slide {
  const hint: SlideLayoutHint = name === "title-slide" ? "title" : "content";
  return resetLayout(
    authoredSlide(hint, theme, []),
    findDefaultLayout(name, slideFormat),
  );
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
  const { theme, slideFormat } = ctx;

  switch (kind) {
    case "title":
      return placeholderTemplateSlide("title-slide", theme, slideFormat);

    case "content":
      return placeholderTemplateSlide("title-content", theme, slideFormat);

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
      return placeholderTemplateSlide("two-column", theme, slideFormat);

    case "blank":
      return blankSlide(theme);
  }
}
