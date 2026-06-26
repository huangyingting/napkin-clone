import assert from "node:assert/strict";
import { test } from "node:test";

import type { Slide, SlideElement, TextElementStyle } from "./deck";
import { deriveSlideTitle, slideEffectiveTitle } from "./slide-title";

const STYLE: TextElementStyle = {
  fontSize: 4,
  bold: false,
  italic: false,
  align: "left",
};

function baseSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: "test-id",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    ...overrides,
  };
}

function textElement(
  id: string,
  text: string,
  kind: "title" | "body",
  zIndex: number,
): SlideElement {
  return {
    kind: "text",
    id,
    text,
    ...(kind === "title" ? { textRole: "h1" as const } : {}),
    style: STYLE,
    zIndex,
    box: { x: 0, y: 0, w: 50, h: 10 },
  };
}

test("deriveSlideTitle ignores flat slide title without elements", () => {
  const slide = baseSlide({ title: "  Quarterly results  " });
  assert.equal(deriveSlideTitle(slide, 3), "Slide 4");
});

test("deriveSlideTitle prefers a title-role text element over body text", () => {
  const slide = baseSlide({
    elements: [
      textElement("a", "Body copy", "body", 0),
      textElement("b", "Headline", "title", 1),
    ],
  });
  assert.equal(deriveSlideTitle(slide, 0), "Headline");
});

test("deriveSlideTitle falls back to the first text element when no title role", () => {
  const slide = baseSlide({
    elements: [textElement("a", "  First text  ", "body", 0)],
  });
  assert.equal(deriveSlideTitle(slide, 0), "First text");
});

test("deriveSlideTitle ignores blank text elements", () => {
  const slide = baseSlide({
    elements: [
      textElement("a", "   ", "title", 0),
      textElement("b", "Real text", "body", 1),
    ],
  });
  assert.equal(deriveSlideTitle(slide, 0), "Real text");
});

test("deriveSlideTitle falls back to 'Slide N' (1-based) when empty", () => {
  assert.equal(deriveSlideTitle(baseSlide(), 0), "Slide 1");
  assert.equal(deriveSlideTitle(baseSlide({ index: 4 }), 4), "Slide 5");
});

test("slideEffectiveTitle reads the title element", () => {
  const slide = baseSlide({
    title: "Stale title mirror",
    elements: [textElement("a", "Renamed on stage", "title", 0)],
  });
  assert.equal(slideEffectiveTitle(slide), "Renamed on stage");
  assert.equal(deriveSlideTitle(slide, 0), "Renamed on stage");
});

test("slideEffectiveTitle ignores slide.title when no title element exists", () => {
  const slide = baseSlide({
    title: "Title mirror",
    elements: [textElement("a", "Body copy", "body", 0)],
  });
  assert.equal(slideEffectiveTitle(slide), "");
  assert.equal(deriveSlideTitle(slide, 0), "Body copy");
});

test("slideEffectiveTitle returns empty without a title element", () => {
  const slide = baseSlide({ title: "  Plain title mirror  " });
  assert.equal(slideEffectiveTitle(slide), "");
  const blank = baseSlide();
  assert.equal(slideEffectiveTitle(blank), "");
});
