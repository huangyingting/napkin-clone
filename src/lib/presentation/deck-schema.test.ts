import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck } from "./deck";
import { safeParseDeck } from "./deck-schema";

// ---------------------------------------------------------------------------
// Backward compatibility — legacy decks (no elements) still validate
// ---------------------------------------------------------------------------

function legacyDeck(): unknown {
  return {
    theme: "default",
    slides: [
      {
        index: 0,
        title: "Legacy",
        bullets: ["a", "b"],
        visualIds: [],
        layout: "content",
        notes: "",
        theme: "default",
      },
    ],
  };
}

test("safeParseDeck accepts a legacy deck without elements", () => {
  const result = safeParseDeck(legacyDeck());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.slides[0].elements, undefined);
  }
});

// ---------------------------------------------------------------------------
// Free-form element validation
// ---------------------------------------------------------------------------

function elementDeck(elements: unknown[]): unknown {
  return {
    theme: "indigo",
    slides: [
      {
        index: 0,
        title: "",
        bullets: [],
        visualIds: [],
        layout: "blank",
        notes: "",
        theme: "indigo",
        background: "#101010",
        accent: "#abcdef",
        elements,
      },
    ],
  };
}

test("safeParseDeck round-trips every element kind", () => {
  const input = elementDeck([
    {
      id: "t",
      kind: "text",
      role: "title",
      text: "Hello",
      zIndex: 0,
      box: { x: 1, y: 2, w: 3, h: 4 },
      style: { fontSize: 6, bold: true, italic: false, align: "center" },
    },
    {
      id: "b",
      kind: "bullets",
      bullets: ["one", "two"],
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
  ]);

  const result = safeParseDeck(input);
  assert.equal(result.success, true);
  if (result.success) {
    const slide = result.data.slides[0];
    assert.equal(slide.elements?.length, 5);
    assert.equal(slide.background, "#101010");
    assert.equal(slide.accent, "#abcdef");
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
        role: "body",
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
