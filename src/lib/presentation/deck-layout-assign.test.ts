import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveVisualAccessibleName,
  FALLBACK_THEME,
  normalizeGeneratedDeck,
} from "@/lib/presentation/deck-layout-assign";
import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
  type Slide,
  type SlideElement,
} from "@/lib/presentation/deck";
import { safeParseDeck } from "@/lib/presentation/deck-schema";

const KNOWN = new Set(["vis-1", "vis-2"]);

type SlideFixture = Partial<Slide> & {
  templateId?: string;
  bulletTexts?: string[];
  visualRefs?: string[];
};

function textElement(
  id: string,
  role: "title" | "bullet" | "body",
  value: string,
  zIndex: number,
): SlideElement {
  return {
    id,
    kind: "text",
    role,
    zIndex,
    box:
      role === "title"
        ? { x: 6, y: 6, w: 88, h: 16 }
        : { x: 6, y: 26, w: 88, h: 66 },
    content: {
      kind: "text",
      text: value,
      paragraphs:
        role === "bullet"
          ? value.split("\n").map((text) => ({ text, listType: "bullet" }))
          : [{ text: value }],
    },
    designOverrides: {
      textStyle: {
        fontSize: role === "title" ? 6 : 4.5,
        bold: role === "title",
        italic: false,
        align: "left",
      },
    },
  } as unknown as SlideElement;
}

function visualElement(
  id: string,
  visualId: string,
  zIndex: number,
  alt?: string,
): SlideElement {
  return {
    id,
    kind: "visual",
    role: "visual",
    zIndex,
    box: { x: 8, y: 24, w: 84, h: 68 },
    content: {
      kind: "visual",
      visualId,
      ...(alt ? { alt } : {}),
    },
  } as unknown as SlideElement;
}

function slide(overrides: SlideFixture = {}): Slide {
  const {
    bulletTexts = [],
    elements: suppliedElements,
    templateId = "content",
    visualRefs = [],
    ...rest
  } = overrides;
  const title = rest.title ?? "Slide";
  const generatedElements = [
    ...(title.trim().length > 0
      ? [textElement("title", "title", title, 0)]
      : []),
    ...(bulletTexts.length > 0
      ? [textElement("body", "bullet", bulletTexts.join("\n"), 1)]
      : []),
    ...visualRefs.map((visualId, index) =>
      visualElement(`visual-${index}`, visualId, 2 + index),
    ),
  ];

  return {
    id: "test-id",
    index: 0,
    title,
    notes: "",
    ...(templateId !== "blank" ? { templateId } : {}),
    elements: suppliedElements ?? generatedElements,
    ...rest,
  } as unknown as Slide;
}

function deck(slides: Slide[], themeId: string = "indigo"): Deck {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides,
  } as unknown as Deck;
}

function presentationThemeId(deck: Deck): string | undefined {
  return (deck as any).design?.themeId;
}

function content(element: unknown): any {
  return (element as any)?.content ?? {};
}

function role(element: unknown): string | undefined {
  return (element as any)?.role;
}

function text(element: unknown): string | undefined {
  return content(element).text;
}

function textStyle(element: unknown): any {
  return (element as any)?.designOverrides?.textStyle;
}

function visualId(element: unknown): string | undefined {
  return content(element).visualId;
}

function alt(element: unknown): string | undefined {
  return content(element).alt;
}

function slideVisualIds(slide: Slide): string[] {
  return (slide.elements ?? [])
    .filter((element) => element.kind === "visual")
    .map((element) => visualId(element))
    .filter((id): id is string => typeof id === "string");
}

function area(element: Extract<SlideElement, { box: unknown }>): number {
  return element.box.w * element.box.h;
}

test("every slide gets template-conformant positioned elements", () => {
  const input = deck([
    slide({ index: 0, title: "Title", templateId: "title" }),
    slide({
      index: 1,
      title: "Content",
      bulletTexts: ["a", "b"],
      templateId: "content",
    }),
    slide({
      index: 2,
      title: "Visual",
      visualRefs: ["vis-1"],
      templateId: "media",
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);

  for (const currentSlide of result.slides) {
    assert.ok(
      currentSlide.elements && currentSlide.elements.length > 0,
      "slide has elements",
    );
    for (const element of currentSlide.elements) {
      assert.ok(element.id.length > 0, "element has id");
      const { x, y, w, h } = element.box;
      for (const value of [x, y, w, h]) {
        assert.ok(value >= 0 && value <= 100, `coord ${value} in range`);
      }
      assert.equal(typeof element.zIndex, "number");
    }
    const ids = currentSlide.elements.map((element) => element.id);
    assert.equal(new Set(ids).size, ids.length, "unique ids");
  }

  assert.ok(
    result.slides[0].elements?.some((element) => element.kind === "text"),
  );
  assert.ok(
    result.slides[1].elements?.some(
      (element) => element.kind === "text" && role(element) === "bullet",
    ),
  );
  assert.ok(
    result.slides[2].elements?.some((element) => element.kind === "visual"),
  );
});

test("a media slide preserves its authored visual box", () => {
  const input = deck([
    slide({ title: "Spotlight", visualRefs: ["vis-1"], templateId: "media" }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  const visual = result.slides[0].elements?.find(
    (element) => element.kind === "visual",
  );
  assert.ok(visual && visual.kind === "visual");
  assert.equal(visualId(visual), "vis-1");
  assert.ok(area(visual) >= 50 * 50, "visual box is prominent");
});

test("does not invent a media visual when elements lack a visual reference", () => {
  const input = deck([
    slide({
      title: "Spotlight",
      templateId: "media",
      elements: [textElement("cap", "body", "Caption", 0)],
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  assert.ok(
    !result.slides[0].elements?.some((element) => element.kind === "visual"),
  );
});

test("re-scaffolds elements that do not match the declared template", () => {
  const input = deck([
    slide({
      title: "Mismatch",
      templateId: "content",
      elements: [visualElement("v", "vis-1", 0)],
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  assert.ok(
    result.slides[0].elements?.some((element) => element.kind === "text"),
  );
});

test("keeps and cleans model elements that match the template", () => {
  const input = deck([
    slide({
      title: "Authored",
      templateId: "content",
      elements: [
        textElement("t", "title", "My Title", 0),
        textElement("b", "bullet", "one\ntwo", 1),
      ],
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  const elements = result.slides[0].elements ?? [];
  const title = elements.find((element) => element.kind === "text");
  assert.ok(title && title.kind === "text" && text(title) === "My Title");
  assert.ok(
    elements.some(
      (element) => element.kind === "text" && role(element) === "bullet",
    ),
  );
});

test("title text is forced bold for clear hierarchy", () => {
  const heading = textElement("t", "title", "Heading", 0) as any;
  heading.designOverrides.textStyle.bold = false;
  const input = deck([
    slide({
      title: "Hierarchy",
      templateId: "content",
      elements: [heading],
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  const title = result.slides[0].elements?.find(
    (element) => element.kind === "text",
  );
  assert.ok(title && title.kind === "text" && textStyle(title).bold === true);
});

test("keeps the generated theme at deck level", () => {
  const input = deck(
    [slide({ index: 0, title: "A" }), slide({ index: 1, title: "B" })],
    "ocean",
  );

  const result = normalizeGeneratedDeck(input, KNOWN);
  assert.equal(presentationThemeId(result), "ocean");
});

test("falls back to indigo when the presentation theme is missing/invalid", () => {
  const bad = {
    design: { themeId: "neon" },
    slides: [slide({ title: "A" })],
  } as Deck;

  const result = normalizeGeneratedDeck(bad, KNOWN);
  assert.equal(presentationThemeId(result), FALLBACK_THEME);
});

test("upgrades a model 'default' theme to preferredTheme (#281)", () => {
  const input = deck([slide({ title: "A" })], "default");

  const result = normalizeGeneratedDeck(input, KNOWN, "ocean");

  assert.equal(presentationThemeId(result), "ocean");
  assert.ok(safeParseDeck(result).success);
});

test("upgrades a model 'default' theme to indigo when no preferred (#281)", () => {
  const input = deck([slide({ title: "A" })], "default");

  const result = normalizeGeneratedDeck(input, KNOWN);

  assert.equal(presentationThemeId(result), FALLBACK_THEME);
  assert.notEqual(presentationThemeId(result), "default");
  assert.ok(safeParseDeck(result).success);
});

test("preserves an explicit vibrant themeId over preferredTheme (#281)", () => {
  const input = deck([slide({ title: "A" })], "forest");

  const result = normalizeGeneratedDeck(input, KNOWN, "ocean");

  assert.equal(presentationThemeId(result), "forest");
  assert.ok(safeParseDeck(result).success);
});

test("uses preferredTheme when the presentation theme is missing/invalid (#281)", () => {
  const bad = {
    design: { themeId: "neon" },
    slides: [slide({ title: "A" })],
  } as Deck;

  const result = normalizeGeneratedDeck(bad, KNOWN, "grape");

  assert.equal(presentationThemeId(result), "grape");
  assert.ok(safeParseDeck(result).success);
});

test("normalization with preferredTheme does not mutate the input deck (#281)", () => {
  const input = deck([slide({ title: "A" })], "default");
  const snapshot = JSON.parse(JSON.stringify(input));

  normalizeGeneratedDeck(input, KNOWN, "sunset");

  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot);
});

test("normalization keeps slide records in the current element-first shape", () => {
  const input = deck([
    slide({ title: "A", bulletTexts: ["x"] }),
    slide({ index: 1, title: "B", visualRefs: ["vis-1"], templateId: "media" }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  for (const currentSlide of result.slides) {
    assert.ok(Array.isArray(currentSlide.elements));
  }
});

test("drops visual references that are not in the inventory", () => {
  const input = deck([
    slide({
      title: "Orphan",
      visualRefs: ["vis-1", "ghost"],
      templateId: "media",
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  const visualRefs = slideVisualIds(result.slides[0]);
  assert.ok(!visualRefs.includes("ghost"));
  assert.deepEqual(visualRefs, ["vis-1"]);
});

test("edge case: slide with no visual yields no visual element", () => {
  const input = deck([
    slide({
      title: "Text only",
      bulletTexts: ["a", "b"],
      templateId: "content",
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  assert.ok(
    !result.slides[0].elements?.some((element) => element.kind === "visual"),
  );
  assert.ok(
    result.slides[0].elements?.some(
      (element) => element.kind === "text" && role(element) === "bullet",
    ),
  );
});

test("edge case: slide with multiple visuals keeps every known visual", () => {
  const input = deck([
    slide({
      title: "Gallery",
      visualRefs: ["vis-1", "vis-2"],
      templateId: "media",
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  const ids = slideVisualIds(result.slides[0]);
  assert.deepEqual(new Set(ids), new Set(["vis-1", "vis-2"]));
});

test("output is safeParseDeck-valid", () => {
  const input = deck([
    slide({ index: 0, title: "T", templateId: "title" }),
    slide({ index: 1, title: "C", bulletTexts: ["a"], templateId: "content" }),
    slide({ index: 2, title: "M", visualRefs: ["vis-1"], templateId: "media" }),
    slide({ index: 3, title: "", templateId: "blank" }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  assert.ok(safeParseDeck(result).success);
});

test("works with an array inventory of { id } carriers", () => {
  const input = deck([
    slide({ title: "M", visualRefs: ["vis-1"], templateId: "media" }),
  ]);

  const inventory = [
    { id: "vis-1", title: "Chart", type: "chart", summary: "" },
  ];
  const result = normalizeGeneratedDeck(input, inventory);
  assert.ok(
    result.slides[0].elements?.some((element) => element.kind === "visual"),
  );
});

test("deriveVisualAccessibleName prefers title, then summary, then type", () => {
  assert.equal(
    deriveVisualAccessibleName({
      id: "v",
      title: "Revenue chart",
      type: "chart",
      summary: "Q3 revenue",
    }),
    "Revenue chart",
  );
  assert.equal(
    deriveVisualAccessibleName({
      id: "v",
      type: "flowchart",
      summary: "Onboarding flow",
    }),
    "Onboarding flow",
  );
  assert.equal(
    deriveVisualAccessibleName({ id: "v", type: "mindmap" }),
    "Mindmap visual",
  );
  assert.equal(deriveVisualAccessibleName(undefined), "Generated visual");
  assert.equal(deriveVisualAccessibleName({ id: "v" }), "Generated visual");
});

test("normalization labels visual elements with the inventory title", () => {
  const input = deck([
    slide({ title: "M", visualRefs: ["vis-1"], templateId: "media" }),
  ]);

  const inventory = [
    { id: "vis-1", title: "Revenue chart", type: "chart", summary: "Q3" },
  ];
  const result = normalizeGeneratedDeck(input, inventory);
  const visual = result.slides[0].elements?.find(
    (element) => element.kind === "visual",
  );
  assert.ok(visual && visual.kind === "visual");
  assert.equal(alt(visual), "Revenue chart");
});

test("normalization falls back to a default visual label without titles", () => {
  const input = deck([
    slide({ title: "M", visualRefs: ["vis-1"], templateId: "media" }),
  ]);

  const result = normalizeGeneratedDeck(input, new Set(["vis-1"]));
  const visual = result.slides[0].elements?.find(
    (element) => element.kind === "visual",
  );
  assert.ok(visual && visual.kind === "visual");
  assert.equal(alt(visual), "Generated visual");
});

test("normalization preserves a model-supplied visual alt", () => {
  const input = deck([
    slide({
      title: "M",
      visualRefs: ["vis-1"],
      templateId: "media",
      elements: [visualElement("v", "vis-1", 0, "Author supplied label")],
    }),
  ]);

  const inventory = [{ id: "vis-1", title: "Revenue chart", type: "chart" }];
  const result = normalizeGeneratedDeck(input, inventory);
  const visual = result.slides[0].elements?.find(
    (element) => element.kind === "visual",
  );
  assert.ok(visual && visual.kind === "visual");
  assert.equal(alt(visual), "Author supplied label");
});
