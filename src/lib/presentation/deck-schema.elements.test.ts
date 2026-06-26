import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParseDeck, validateElement } from "./deck-schema";
import type { Deck } from "./deck";
import { currentDeck, elementDeck } from "./deck-schema.test-helpers";

test("safeParseDeck accepts a current deck", () => {
  const result = safeParseDeck(currentDeck());
  assert.equal(result.success, true);
  if (result.success) {
    assert.ok(
      Array.isArray(result.data.slides[0].elements) &&
        result.data.slides[0].elements.length > 0,
    );
    assert.equal(result.data.slideFormat, "16:9");
  }
});

test("safeParseDeck round-trips a deck slide format", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    slideFormat: "4:3",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.slideFormat, "4:3");
  }
});

test("safeParseDeck preserves an optional deck themeId", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    themeId: "amber",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.themeId, "amber");
  }
});

test("safeParseDeck rejects an unknown slide format", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    slideFormat: "1:1",
  });
  assert.equal(result.success, false);
});

test("safeParseDeck round-trips every element kind", () => {
  const input = elementDeck([
    {
      id: "t",
      kind: "text",
      textRole: "h1",
      text: "Hello",
      paragraphs: [{ text: "Hello" }],
      zIndex: 0,
      box: { x: 1, y: 2, w: 3, h: 4 },
      style: { fontSize: 6, bold: true, italic: false, align: "center" },
    },
    {
      id: "b",
      kind: "text",
      text: "one\ntwo",
      paragraphs: [
        { text: "one", listType: "bullet" },
        { text: "two", listType: "bullet" },
      ],
      textRole: "bullet",
      zIndex: 1,
      box: { x: 1, y: 2, w: 3, h: 4 },
      style: { fontSize: 4, bold: false, italic: true, align: "left" },
    },
    {
      id: "v",
      kind: "visual",
      visualId: "vis-1",
      zIndex: 2,
      box: { x: 1, y: 2, w: 3, h: 4 },
    },
    {
      id: "i",
      kind: "image",
      src: "https://example.com/a.png",
      alt: "alt",
      zIndex: 3,
      box: { x: 1, y: 2, w: 3, h: 4 },
    },
    {
      id: "s",
      kind: "shape",
      shape: "ellipse",
      color: "#00ff00",
      zIndex: 4,
      box: { x: 1, y: 2, w: 3, h: 4 },
    },
    {
      id: "c",
      kind: "connector",
      start: { x: 1, y: 2 },
      end: { x: 4, y: 5 },
      zIndex: 5,
      box: { x: 0, y: 0, w: 10, h: 10 },
    },
  ]);

  const result = safeParseDeck(input);
  assert.equal(result.success, true);
  if (result.success) {
    const slide = result.data.slides[0];
    assert.equal(slide.elements?.length, 6);
    assert.equal(slide.background, "#101010");
    assert.equal(slide.accent, "#abcdef");
  }
});

test("safeParseDeck round-trips run-level underline and fontSize", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "underlined-text",
        kind: "text",
        text: "Hello",
        paragraphs: [
          {
            text: "Hello",
            runs: [{ text: "Hello", underline: true, fontSize: 4 }],
          },
        ],
        runs: [{ text: "Hello", underline: true, fontSize: 4 }],
        zIndex: 0,
        box: { x: 1, y: 2, w: 30, h: 12 },
        style: { fontSize: 4, bold: false, italic: false, align: "left" },
      },
    ]),
  );

  assert.equal(result.success, true);
  if (result.success) {
    const element = result.data.slides[0]?.elements?.[0];
    assert.ok(element);
    assert.equal(element.kind, "text");
    if (element.kind === "text") {
      assert.equal(element.runs?.[0]?.underline, true);
      assert.equal(element.runs?.[0]?.fontSize, 4);
      assert.equal(element.paragraphs?.[0]?.runs?.[0]?.underline, true);
      assert.equal(element.paragraphs?.[0]?.runs?.[0]?.fontSize, 4);
    }
  }
});

test("safeParseDeck rejects an unknown element kind", () => {
  const result = safeParseDeck(
    elementDeck([
      { id: "x", kind: "nope", zIndex: 0, box: { x: 0, y: 0, w: 1, h: 1 } },
    ]),
  );
  assert.equal(result.success, false);
});

test("validateElement rejects a placeholder element", () => {
  assert.throws(
    () =>
      validateElement(
        {
          id: "ph-title",
          kind: "placeholder",
          placeholderType: "title",
          zIndex: 0,
          box: { x: 0, y: 0, w: 10, h: 10 },
        },
        "element",
      ),
    /element\.kind must be one of: text, visual, image, shape, connector/,
  );
});

test("safeParseDeck rejects a non-hex background", () => {
  const input = elementDeck([]) as { slides: { background: string }[] };
  input.slides[0].background = "red";
  assert.equal(safeParseDeck(input).success, false);
});

test("safeParseDeck rejects a text element missing its style", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "t",
        kind: "text",
        textRole: "body",
        text: "x",
        zIndex: 0,
        box: { x: 0, y: 0, w: 1, h: 1 },
      },
    ]),
  );
  assert.equal(result.success, false);
});

test("validated elements preserve a stable shape", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "s",
        kind: "shape",
        shape: "rect",
        color: "#123456",
        zIndex: 0,
        box: { x: 5, y: 5, w: 10, h: 10 },
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const deck: Deck = result.data;
    const element = deck.slides[0].elements?.[0];
    assert.equal(element?.kind, "shape");
    if (element?.kind === "shape") {
      assert.equal(element.color, "#123456");
      assert.equal(element.shape, "rect");
    }
  }
});
