import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveVisualAccessibleName,
  FALLBACK_THEME,
  normalizeGeneratedDeck,
} from "@/lib/presentation/deck-layout-assign";
import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import type {
  Deck,
  DeckTheme,
  Slide,
  SlideElement,
} from "@/lib/presentation/deck";

const KNOWN = new Set(["vis-1", "vis-2"]);

function slide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: "test-id",
    index: 0,
    title: "Slide",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "indigo",
    ...overrides,
  };
}

function deck(slides: Slide[], theme: DeckTheme = "indigo"): Deck {
  return {
    theme,
    slides,
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  };
}

function area(el: Extract<SlideElement, { box: unknown }>): number {
  return el.box.w * el.box.h;
}

test("every slide gets template-conformant positioned elements", () => {
  const input = deck([
    slide({ index: 0, title: "Title", layout: "title" }),
    slide({
      index: 1,
      title: "Content",
      bullets: ["a", "b"],
      layout: "content",
    }),
    slide({
      index: 2,
      title: "Visual",
      visualIds: ["vis-1"],
      layout: "media",
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);

  for (const s of result.slides) {
    assert.ok(s.elements && s.elements.length > 0, "slide has elements");
    for (const el of s.elements) {
      assert.ok(el.id.length > 0, "element has id");
      const { x, y, w, h } = el.box;
      for (const v of [x, y, w, h]) {
        assert.ok(v >= 0 && v <= 100, `coord ${v} in range`);
      }
      assert.equal(typeof el.zIndex, "number");
    }
    const ids = s.elements.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, "unique ids");
  }

  // Layout-appropriate kinds are present.
  assert.ok(result.slides[0].elements?.some((e) => e.kind === "text"));
  assert.ok(result.slides[1].elements?.some((e) => e.kind === "bullets"));
  assert.ok(result.slides[2].elements?.some((e) => e.kind === "visual"));
});

test("a media slide places its chosen visual in a prominent box", () => {
  const input = deck([
    slide({ title: "Spotlight", visualIds: ["vis-1"], layout: "media" }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  const visual = result.slides[0].elements?.find((e) => e.kind === "visual");
  assert.ok(visual && visual.kind === "visual");
  assert.equal(visual.visualId, "vis-1");
  // Prominent: occupies a large share of the slide.
  assert.ok(area(visual) >= 50 * 50, "visual box is prominent");
});

test("injects a prominent visual when a media slide's elements lack one", () => {
  // Model-authored elements declare media layout but only carry a caption.
  const input = deck([
    slide({
      title: "Spotlight",
      visualIds: ["vis-2"],
      layout: "media",
      elements: [
        {
          id: "cap",
          kind: "text",
          role: "body",
          text: "Caption",
          zIndex: 0,
          box: { x: 6, y: 82, w: 88, h: 12 },
          style: { fontSize: 4.5, bold: false, italic: false, align: "center" },
        },
      ],
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  const visual = result.slides[0].elements?.find((e) => e.kind === "visual");
  assert.ok(visual && visual.kind === "visual");
  assert.equal(visual.visualId, "vis-2");
  assert.ok(area(visual) >= 50 * 50);
});

test("re-scaffolds elements that do not match the declared layout", () => {
  // A media slide whose only element is a stray bullets list gets re-scaffolded.
  const input = deck([
    slide({
      title: "Mismatch",
      bullets: ["x"],
      visualIds: ["vis-1"],
      layout: "media",
      elements: [
        {
          id: "b",
          kind: "bullets",
          bullets: ["x"],
          items: [{ text: "x" }],
          zIndex: 0,
          box: { x: 6, y: 26, w: 88, h: 66 },
          style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
        },
      ],
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  assert.ok(result.slides[0].elements?.some((e) => e.kind === "visual"));
});

test("keeps and cleans model elements that match the layout", () => {
  const input = deck([
    slide({
      title: "Authored",
      layout: "content",
      elements: [
        {
          id: "t",
          kind: "text",
          role: "title",
          text: "My Title",
          zIndex: 0,
          box: { x: 6, y: 6, w: 88, h: 16 },
          style: { fontSize: 6, bold: true, italic: false, align: "left" },
        },
        {
          id: "b",
          kind: "bullets",
          bullets: ["one", "two"],
          items: [{ text: "one" }, { text: "two" }],
          zIndex: 1,
          box: { x: 6, y: 26, w: 88, h: 66 },
          style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
        },
      ],
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  const els = result.slides[0].elements ?? [];
  const title = els.find((e) => e.kind === "text");
  assert.ok(title && title.kind === "text" && title.text === "My Title");
  assert.ok(els.some((e) => e.kind === "bullets"));
});

test("title text is forced bold for clear hierarchy", () => {
  const input = deck([
    slide({
      title: "Hierarchy",
      layout: "content",
      elements: [
        {
          id: "t",
          kind: "text",
          role: "title",
          text: "Heading",
          zIndex: 0,
          box: { x: 6, y: 6, w: 88, h: 16 },
          style: { fontSize: 6, bold: false, italic: false, align: "left" },
        },
      ],
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  const title = result.slides[0].elements?.find((e) => e.kind === "text");
  assert.ok(title && title.kind === "text" && title.style.bold === true);
});

test("stamps the deck theme uniformly across all slides", () => {
  const input = deck(
    [
      slide({ index: 0, theme: "ocean", title: "A" }),
      slide({ index: 1, theme: "ocean", title: "B", bullets: ["x"] }),
    ],
    "ocean",
  );

  const result = normalizeGeneratedDeck(input, KNOWN);
  assert.equal(result.theme, "ocean");
  for (const s of result.slides) {
    assert.equal(s.theme, "ocean");
  }
});

test("falls back to indigo when the deck theme is missing/invalid", () => {
  // Construct a deck object with an invalid theme at runtime (bypasses parse).
  const bad = {
    theme: "neon" as unknown as Deck["theme"],
    slides: [slide({ title: "A" })],
  } as Deck;

  const result = normalizeGeneratedDeck(bad, KNOWN);
  assert.equal(result.theme, FALLBACK_THEME);
  assert.equal(result.slides[0].theme, FALLBACK_THEME);
});

test("upgrades a model 'default' theme to preferredTheme (#281)", () => {
  const input = deck([slide({ title: "A" })], "default");

  const result = normalizeGeneratedDeck(input, KNOWN, "ocean");

  assert.equal(result.theme, "ocean");
  for (const s of result.slides) {
    assert.equal(s.theme, "ocean");
  }
  assert.ok(safeParseDeck(result).success);
});

test("upgrades a model 'default' theme to indigo when no preferred (#281)", () => {
  const input = deck([slide({ title: "A" })], "default");

  const result = normalizeGeneratedDeck(input, KNOWN);

  assert.equal(result.theme, FALLBACK_THEME);
  assert.notEqual(result.theme, "default");
  assert.ok(safeParseDeck(result).success);
});

test("preserves an explicit vibrant theme over preferredTheme (#281)", () => {
  const input = deck([slide({ title: "A", theme: "forest" })], "forest");

  const result = normalizeGeneratedDeck(input, KNOWN, "ocean");

  assert.equal(result.theme, "forest");
  for (const s of result.slides) {
    assert.equal(s.theme, "forest");
  }
  assert.ok(safeParseDeck(result).success);
});

test("uses preferredTheme when the deck theme is missing/invalid (#281)", () => {
  const bad = {
    theme: "neon" as unknown as Deck["theme"],
    slides: [slide({ title: "A" })],
  } as Deck;

  const result = normalizeGeneratedDeck(bad, KNOWN, "grape");

  assert.equal(result.theme, "grape");
  assert.ok(safeParseDeck(result).success);
});

test("normalization with preferredTheme does not mutate the input deck (#281)", () => {
  const input = deck([slide({ title: "A" })], "default");
  const snapshot = JSON.parse(JSON.stringify(input));

  normalizeGeneratedDeck(input, KNOWN, "sunset");

  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot);
});

test("marks every slide elementsDerived=false (authored)", () => {
  const input = deck([
    slide({ title: "A", bullets: ["x"] }),
    slide({ index: 1, title: "B", visualIds: ["vis-1"], layout: "media" }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  for (const s of result.slides) {
    assert.equal(s.elementsDerived, false);
  }
});

test("drops visual references that are not in the inventory", () => {
  const input = deck([
    slide({
      title: "Orphan",
      visualIds: ["vis-1", "ghost"],
      layout: "media",
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  assert.deepEqual(result.slides[0].visualIds, ["vis-1"]);
  const visualIds = (result.slides[0].elements ?? [])
    .filter((e) => e.kind === "visual")
    .map((e) => (e.kind === "visual" ? e.visualId : ""));
  assert.ok(!visualIds.includes("ghost"));
});

test("edge case: slide with no visual yields no visual element", () => {
  const input = deck([
    slide({ title: "Text only", bullets: ["a", "b"], layout: "content" }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  assert.ok(!result.slides[0].elements?.some((e) => e.kind === "visual"));
  assert.ok(result.slides[0].elements?.some((e) => e.kind === "bullets"));
});

test("edge case: slide with multiple visuals keeps every known visual", () => {
  const input = deck([
    slide({
      title: "Gallery",
      visualIds: ["vis-1", "vis-2"],
      layout: "media",
    }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  const ids = (result.slides[0].elements ?? [])
    .filter((e) => e.kind === "visual")
    .map((e) => (e.kind === "visual" ? e.visualId : ""));
  assert.deepEqual(new Set(ids), new Set(["vis-1", "vis-2"]));
});

test("output is safeParseDeck-valid", () => {
  const input = deck([
    slide({ index: 0, title: "T", layout: "title" }),
    slide({ index: 1, title: "C", bullets: ["a"], layout: "content" }),
    slide({ index: 2, title: "M", visualIds: ["vis-1"], layout: "media" }),
    slide({ index: 3, title: "", layout: "blank" }),
  ]);

  const result = normalizeGeneratedDeck(input, KNOWN);
  assert.ok(safeParseDeck(result).success);
});

test("works with an array inventory of { id } carriers", () => {
  const input = deck([
    slide({ title: "M", visualIds: ["vis-1"], layout: "media" }),
  ]);

  const inventory = [
    { id: "vis-1", title: "Chart", type: "chart", summary: "" },
  ];
  const result = normalizeGeneratedDeck(input, inventory);
  assert.ok(result.slides[0].elements?.some((e) => e.kind === "visual"));
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
    slide({ title: "M", visualIds: ["vis-1"], layout: "media" }),
  ]);

  const inventory = [
    { id: "vis-1", title: "Revenue chart", type: "chart", summary: "Q3" },
  ];
  const result = normalizeGeneratedDeck(input, inventory);
  const visual = result.slides[0].elements?.find((e) => e.kind === "visual");
  assert.ok(visual && visual.kind === "visual");
  assert.equal(visual.alt, "Revenue chart");
});

test("normalization falls back to a default visual label without titles", () => {
  const input = deck([
    slide({ title: "M", visualIds: ["vis-1"], layout: "media" }),
  ]);

  // A plain id Set carries no titles, so the accessible name falls back.
  const result = normalizeGeneratedDeck(input, new Set(["vis-1"]));
  const visual = result.slides[0].elements?.find((e) => e.kind === "visual");
  assert.ok(visual && visual.kind === "visual");
  assert.equal(visual.alt, "Generated visual");
});

test("normalization preserves a model-supplied visual alt", () => {
  const input = deck([
    slide({
      title: "M",
      visualIds: ["vis-1"],
      layout: "media",
      elements: [
        {
          id: "v",
          kind: "visual",
          visualId: "vis-1",
          alt: "Author supplied label",
          zIndex: 0,
          box: { x: 8, y: 24, w: 84, h: 68 },
        },
      ],
    }),
  ]);

  const inventory = [{ id: "vis-1", title: "Revenue chart", type: "chart" }];
  const result = normalizeGeneratedDeck(input, inventory);
  const visual = result.slides[0].elements?.find((e) => e.kind === "visual");
  assert.ok(visual && visual.kind === "visual");
  assert.equal(visual.alt, "Author supplied label");
});
