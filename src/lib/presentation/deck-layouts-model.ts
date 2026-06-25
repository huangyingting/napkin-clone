/** Reusable layout and placeholder model helpers. */

import {
  SLIDE_FORMATS as PRESENTATION_SLIDE_FORMATS,
  type SlideFormat as PresentationSlideFormat,
} from "@/lib/presentation/slide-format";
import type { ElementBox, PlaceholderElement } from "./deck-elements";

/**
 * Canonical slide layout hints. Exported as a `const` array so it is the single
 * source of truth for both the {@link SlideLayoutHint} type and any code
 * (validators, AI prompts) that needs to enumerate the allowed values.
 *
 * - `"title"` — large centred title, optional subtitle; no bullets.
 * - `"section"` — section divider (h1 mid-deck).
 * - `"content"` — title + bullet list, optional media.
 * - `"media"` — visual occupies most of the slide; optional caption.
 * - `"blank"` — fallback for unusual combinations.
 */
export const SLIDE_LAYOUTS = [
  "title",
  "section",
  "content",
  "media",
  "blank",
] as const;

/** Slide layout hint used by a future renderer. */
export type SlideLayoutHint = (typeof SLIDE_LAYOUTS)[number];

/** Runtime list of supported reusable placeholder slot kinds. */
export const PLACEHOLDER_TYPES = [
  "title",
  "subtitle",
  "body",
  "visual",
  "footer",
] as const;

/** Placeholder slot kinds supported by reusable slide layouts. */
export type PlaceholderType = (typeof PLACEHOLDER_TYPES)[number];

/** Human-readable placeholder labels shared by the editor and tests. */
export const PLACEHOLDER_TYPE_LABELS: Record<PlaceholderType, string> = {
  title: "Title",
  subtitle: "Subtitle",
  body: "Body",
  visual: "Visual",
  footer: "Footer",
};

/**
 * A reusable slide layout definition. Stored on the deck and applied onto a
 * slide as placeholder elements.
 */
export interface SlideLayout {
  id: string;
  name: string;
  format: PresentationSlideFormat;
  placeholders: PlaceholderElement[];
  /** Human-readable display title shown in the layout picker. */
  title?: string;
  /** Short description of the layout intent. */
  description?: string;
}

function cloneBox(box: ElementBox): ElementBox {
  return { ...box };
}

function clonePlaceholder(
  placeholder: PlaceholderElement,
  overrides: Partial<PlaceholderElement> = {},
): PlaceholderElement {
  const label =
    typeof overrides.label === "string"
      ? overrides.label
      : placeholder.label?.trim()
        ? placeholder.label
        : undefined;
  const next: PlaceholderElement = {
    ...placeholder,
    ...overrides,
    id: overrides.id ?? placeholder.id,
    kind: "placeholder",
    placeholderType: overrides.placeholderType ?? placeholder.placeholderType,
    zIndex: overrides.zIndex ?? placeholder.zIndex,
    box: cloneBox(overrides.box ?? placeholder.box),
  };
  if (label) {
    next.label = label;
  } else {
    delete next.label;
  }
  return next;
}

export function layoutHintForReusableLayout(
  name: string,
): SlideLayoutHint | undefined {
  switch (name) {
    case "blank":
      return "blank";
    case "title-slide":
      return "title";
    case "title-content":
    case "two-column":
      return "content";
    default:
      return undefined;
  }
}

function reusableLayoutBoxes(
  name: string,
): readonly Omit<PlaceholderElement, "id" | "kind" | "zIndex">[] {
  switch (name) {
    case "blank":
      return [];
    case "title-slide":
      return [
        {
          placeholderType: "title",
          label: "Title",
          box: { x: 8, y: 28, w: 84, h: 16 },
        },
        {
          placeholderType: "subtitle",
          label: "Subtitle",
          box: { x: 12, y: 48, w: 76, h: 10 },
        },
        {
          placeholderType: "footer",
          label: "Footer",
          box: { x: 6, y: 90, w: 88, h: 5 },
        },
      ];
    case "title-content":
      return [
        {
          placeholderType: "title",
          label: "Title",
          box: { x: 6, y: 6, w: 88, h: 14 },
        },
        {
          placeholderType: "body",
          label: "Body",
          box: { x: 6, y: 24, w: 44, h: 58 },
        },
        {
          placeholderType: "visual",
          label: "Visual",
          box: { x: 54, y: 24, w: 40, h: 58 },
        },
        {
          placeholderType: "footer",
          label: "Footer",
          box: { x: 6, y: 86, w: 88, h: 6 },
        },
      ];
    case "two-column":
      return [
        {
          placeholderType: "title",
          label: "Title",
          box: { x: 6, y: 6, w: 88, h: 14 },
        },
        {
          placeholderType: "body",
          label: "Left column",
          box: { x: 6, y: 24, w: 42, h: 58 },
        },
        {
          placeholderType: "body",
          label: "Right column",
          box: { x: 52, y: 24, w: 42, h: 58 },
        },
        {
          placeholderType: "footer",
          label: "Footer",
          box: { x: 6, y: 86, w: 88, h: 6 },
        },
      ];
    default:
      return [];
  }
}

const LAYOUT_META: Record<string, { title: string; description: string }> = {
  blank: { title: "Blank", description: "Empty canvas with no placeholders" },
  "title-slide": {
    title: "Title Slide",
    description: "Centered title and subtitle",
  },
  "title-content": {
    title: "Title + Content",
    description: "Slide title with body content area",
  },
  "two-column": {
    title: "Two Column",
    description: "Side-by-side content areas",
  },
};

const BUILTIN_LAYOUTS: readonly SlideLayout[] =
  PRESENTATION_SLIDE_FORMATS.flatMap((format) =>
    (["blank", "title-slide", "title-content", "two-column"] as const).map(
      (name) => ({
        id: `layout:${format}:${name}`,
        name,
        format,
        placeholders: reusableLayoutBoxes(name).map((placeholder, index) => ({
          id: `layout-ph:${format}:${name}:${placeholder.placeholderType}:${index}`,
          kind: "placeholder" as const,
          zIndex: index,
          box: cloneBox(placeholder.box),
          placeholderType: placeholder.placeholderType,
          ...(placeholder.label ? { label: placeholder.label } : {}),
        })),
        ...(LAYOUT_META[name] ?? {}),
      }),
    ),
  );

/** Built-in placeholder layouts available to every deck format. */
export function defaultLayouts(): SlideLayout[] {
  return BUILTIN_LAYOUTS.map((layout) => ({
    ...layout,
    placeholders: layout.placeholders.map((placeholder) =>
      clonePlaceholder(placeholder),
    ),
  }));
}
