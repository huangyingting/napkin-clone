/**
 * Slide templates — pure, DOM-free constructors that turn a chosen layout
 * ("kind") into a ready-to-edit {@link Slide}.
 *
 * The "+ Add slide" picker offers a small menu of starting points (Title,
 * Content, Visual spotlight, Two-column, Blank). Non-blank templates emit a
 * slide whose `elements[]` are pre-built from real text/image/visual elements,
 * so the slide is immediately editable with no materialization step.
 *
 * Template slides are **hand-authored**, not derived: they carry
 * `elementsDerived: false` so "Sync from document" preserves their `elements[]`
 * verbatim.
 *
 * Pure and deterministic except for the generated element ids — fully testable
 * under `node --test`.
 */

import type { Slide } from "./deck-core";
import type {
  ElementAlign,
  ElementBox,
  ImageElement,
  SlideElement,
  TextElement,
  TextElementStyle,
  VisualElement,
} from "./deck-elements";
import { makeElementId, makeSlideId } from "./deck-ids";
import {
  defaultLayouts,
  PLACEHOLDER_TYPE_LABELS,
  type LayoutPlaceholder,
  type PlaceholderType,
  type SlideLayout as ReusableSlideLayout,
  type SlideLayoutHint,
} from "./deck-layouts-model";
import { DEFAULT_SLIDE_FORMAT, type SlideFormat } from "./slide-format";

/**
 * Maps a {@link PlaceholderType} onto its semantic {@link DeckTextRole} (#610)
 * so materialized template text inherits deck-template typography. The concrete
 * `style` set alongside remains the authoritative local style during the
 * render-wiring transition (#598); this is additive metadata.
 */
function placeholderTextRole(type: PlaceholderType): string {
  switch (type) {
    case "title":
      return "title";
    case "subtitle":
      return "subtitle";
    case "footer":
      return "footer";
    case "visual":
    case "body":
      return "body";
  }
}

/** The set of layouts the "+ Add slide" picker can insert. */
export type SlideTemplateKind =
  | "title"
  | "content"
  | "visual"
  | "two-column"
  | "blank";

/** Context threaded into {@link buildTemplateSlide} from the editor. */
export interface SlideTemplateContext {
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
    description: "Editable title, subtitle, and footer",
  },
  {
    kind: "content",
    label: "Content",
    description: "Editable title, body, visual, and footer",
  },
  {
    kind: "visual",
    label: "Visual spotlight",
    description: "Full-bleed visual with a caption",
  },
  {
    kind: "two-column",
    label: "Two-column",
    description: "Editable title over two body columns",
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

export const TEMPLATE_IMAGE_PLACEHOLDER_SRC =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20800%20450%22%3E%3Crect%20width%3D%22800%22%20height%3D%22450%22%20rx%3D%2228%22%20fill%3D%22%23f4f4f5%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2224%22%20width%3D%22752%22%20height%3D%22402%22%20rx%3D%2224%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%226%22%20stroke-dasharray%3D%2218%2016%22%2F%3E%3Cpath%20d%3D%22M300%20265l78-78%2062%2062%2036-36%2074%2074%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%2214%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Ccircle%20cx%3D%22330%22%20cy%3D%22160%22%20r%3D%2226%22%20fill%3D%22%2371717a%22%2F%3E%3Ctext%20x%3D%22400%22%20y%3D%22345%22%20text-anchor%3D%22middle%22%20font-family%3D%22Inter%2CArial%2Csans-serif%22%20font-size%3D%2244%22%20fill%3D%22%2371717a%22%3EAdd%20image%3C%2Ftext%3E%3C%2Fsvg%3E";

function placeholderImageElement(
  label: string,
  box: ElementBox,
  zIndex: number,
): ImageElement {
  return {
    id: makeElementId(),
    kind: "image",
    role: "image",
    zIndex,
    box: { ...box },
    content: {
      kind: "image",
      src: TEMPLATE_IMAGE_PLACEHOLDER_SRC,
      alt: `${label} placeholder`,
    },
  } as unknown as ImageElement;
}

function textStyle(
  fontSize: number,
  align: ElementAlign,
  bold: boolean,
): TextElementStyle {
  return { fontSize, align, bold, italic: false };
}

function templateTextStyle(type: PlaceholderType): TextElementStyle {
  switch (type) {
    case "title":
      return textStyle(6.5, "center", true);
    case "subtitle":
      return textStyle(4.5, "center", false);
    case "body":
      return textStyle(4.25, "left", false);
    case "footer":
      return textStyle(2.4, "center", false);
    case "visual":
      return textStyle(4.5, "center", true);
  }
}

function placeholderLabel(placeholder: LayoutPlaceholder): string {
  return (
    placeholder.label?.trim() ||
    PLACEHOLDER_TYPE_LABELS[placeholder.placeholderType]
  );
}

function materializePlaceholderElement(
  placeholder: LayoutPlaceholder,
  zIndex: number,
): SlideElement {
  const label = placeholderLabel(placeholder);
  if (placeholder.placeholderType === "visual") {
    return placeholderImageElement(label, placeholder.box, zIndex);
  }

  return {
    id: makeElementId(),
    kind: "text",
    role: placeholderTextRole(placeholder.placeholderType),
    zIndex,
    box: { ...placeholder.box },
    content: { kind: "text", text: label, paragraphs: [{ text: label }] },
    designOverrides: {
      textStyle: templateTextStyle(placeholder.placeholderType),
    },
  } as unknown as SlideElement;
}

function bodyTextElement(
  text: string,
  box: ElementBox,
  zIndex: number,
  align: ElementAlign = "center",
  textRole?: string,
): TextElement {
  return {
    id: makeElementId(),
    kind: "text",
    ...(textRole ? { role: textRole } : {}),
    zIndex,
    box: { ...box },
    content: { kind: "text", text, paragraphs: [{ text }] },
    designOverrides: { textStyle: textStyle(4.5, align, false) },
  } as unknown as TextElement;
}

function spotlightElement(
  zIndex: number,
  visualId: string | undefined,
): VisualElement | ImageElement {
  if (visualId) {
    return {
      id: makeElementId(),
      kind: "visual",
      role: "visual",
      zIndex,
      box: { ...BOX.spotlight },
      content: { kind: "visual", visualId },
    } as unknown as VisualElement;
  }
  return placeholderImageElement("Visual", BOX.spotlight, zIndex);
}

/** Builds an authored (non-derived) slide from a template's elements. */
function authoredSlide(
  layout: SlideLayoutHint,
  elements: SlideElement[],
): Slide {
  return {
    id: makeSlideId(),
    index: 0,
    title: "",
    notes: "",
    ...(layout !== "blank" ? { templateId: layout } : {}),
    elements,
  } as unknown as Slide;
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

function layoutTemplateSlide(
  name: "title-slide" | "title-content" | "two-column",
  slideFormat: SlideFormat | undefined,
): Slide {
  const hint: SlideLayoutHint = name === "title-slide" ? "title" : "content";
  const layout = findDefaultLayout(name, slideFormat);
  return authoredSlide(
    hint,
    layout.placeholders.map((placeholder, index) =>
      materializePlaceholderElement(placeholder, index),
    ),
  );
}

function blankSlide(): Slide {
  return {
    id: makeSlideId(),
    index: 0,
    title: "",
    notes: "",
    elements: [],
  } as unknown as Slide;
}

/**
 * Constructs a {@link Slide} for the given template `kind`.
 *
 * Non-blank templates return a slide with a pre-built `elements[]` and
 * `elementsDerived === false` (authored, preserved on sync). `index` is a
 * placeholder — the caller re-indexes when inserting into the deck.
 */
export function buildTemplateSlide(
  kind: SlideTemplateKind,
  ctx: SlideTemplateContext,
): Slide {
  const { slideFormat } = ctx;

  switch (kind) {
    case "title":
      return layoutTemplateSlide("title-slide", slideFormat);

    case "content":
      return layoutTemplateSlide("title-content", slideFormat);

    case "visual": {
      const visual = spotlightElement(0, ctx.visualId);
      return authoredSlide(
        "media",
        [
          visual,
          bodyTextElement("Caption", BOX.caption, 1, "center", "caption"),
        ],
      );
    }

    case "two-column":
      return layoutTemplateSlide("two-column", slideFormat);

    case "blank":
      return blankSlide();
  }
}
