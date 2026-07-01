import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MIN_DECK_SLIDES_MESSAGE } from "@/lib/presentation-vnext";
import { buildDeckV7, buildMinimalDeckV7 } from "@/test/builders/deck-v7";
import { deleteActiveSlideFromToolbar } from "./slide-editor-vnext";

const source = readFileSync(
  new URL("./slide-editor-vnext.tsx", import.meta.url),
  "utf8",
);

describe("SlideEditorVNext toolbar command ownership", () => {
  test("removes generic element insertion from the top toolbar", () => {
    assert.equal(source.includes('aria-label="Insert element"'), false);
  });

  test("passes insertion handlers to the current-object context toolbar", () => {
    assert.equal(source.includes("onInsertText={handleInsertText}"), true);
    assert.equal(source.includes("onInsertShape={handleInsertShape}"), true);
    assert.equal(source.includes("onInsertImage={handleInsertImage}"), true);
    assert.equal(
      source.includes("onInsertVisual={() => void handleInsertVisual()}"),
      true,
    );
    assert.equal(
      source.includes("onInsertConnector={handleInsertConnector}"),
      true,
    );
    assert.equal(source.includes("onInsertTable={handleInsertTable}"), true);
  });

  test("passes delete availability to the current-object context toolbar", () => {
    assert.equal(
      source.includes("canDeleteSlide={deck.slides.length > 1}"),
      true,
    );
  });
});

describe("deleteActiveSlideFromToolbar", () => {
  test("returns invariant status for one-slide decks", () => {
    const deck = buildMinimalDeckV7();
    const result = deleteActiveSlideFromToolbar(deck, deck.slides[0]?.id);

    assert.equal(result.deleted, false);
    assert.equal(result.nextDeck, deck);
    assert.equal(result.nextIndex, 0);
    assert.equal(result.statusMessage, MIN_DECK_SLIDES_MESSAGE);
  });

  test("deletes active slide and advances to the next valid index", () => {
    const deck = buildDeckV7();
    const deletingSlideId = deck.slides[1]!.id;
    const result = deleteActiveSlideFromToolbar(deck, deletingSlideId);

    assert.equal(result.deleted, true);
    assert.equal(result.nextDeck.slides.length, deck.slides.length - 1);
    assert.equal(
      result.nextDeck.slides.some((slide) => slide.id === deletingSlideId),
      false,
    );
    assert.equal(result.nextIndex, 0);
    assert.equal(result.statusMessage, undefined);
  });
});
