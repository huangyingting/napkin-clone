import assert from "node:assert/strict";
import { test } from "node:test";

import type { Slide, SlideElement, TextElementStyle } from "./deck";
import { deriveSlideTitle } from "./slide-title";

const STYLE: TextElementStyle = {
  fontSize: 4,
  bold: false,
  italic: false,
  align: "left",
};

function baseSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    theme: "default",
    ...overrides,
  };
}

function textElement(
  id: string,
  text: string,
  role: "title" | "body",
  zIndex: number,
): SlideElement {
  return {
    kind: "text",
    id,
    text,
    role,
    style: STYLE,
    zIndex,
    box: { x: 0, y: 0, w: 50, h: 10 },
  };
}

test("deriveSlideTitle uses the explicit slide title when present", () => {
  const slide = baseSlide({ title: "  Quarterly results  " });
  assert.equal(deriveSlideTitle(slide, 3), "Quarterly results");
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
