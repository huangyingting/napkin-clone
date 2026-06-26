import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultLayouts } from "./deck";
import { safeParseDeck } from "./deck-schema";
import { currentDeck } from "./deck-schema.test-helpers";

// ---------------------------------------------------------------------------
// Reusable layouts
// ---------------------------------------------------------------------------

test("safeParseDeck round-trips reusable layouts", () => {
  const layouts = defaultLayouts().filter((layout) => layout.format === "16:9");
  const result = safeParseDeck({
    ...(currentDeck() as object),
    layouts,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.layouts?.length, layouts.length);
    assert.equal(
      result.data.layouts?.[1]?.placeholders[0]?.kind,
      "placeholder",
    );
  }
});

// ---------------------------------------------------------------------------
// deckContentHash round-trips (issue #205 — staleness signal in deck JSON)
// ---------------------------------------------------------------------------

test("safeParseDeck preserves a deckContentHash when present", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    deckContentHash: "abc12345",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.deckContentHash, "abc12345");
  }
});

test("safeParseDeck omits deckContentHash when absent or empty", () => {
  const absent = safeParseDeck(currentDeck());
  assert.equal(absent.success, true);
  if (absent.success) {
    assert.equal(absent.data.deckContentHash, undefined);
  }

  const empty = safeParseDeck({
    ...(currentDeck() as object),
    deckContentHash: "",
  });
  assert.equal(empty.success, true);
  if (empty.success) {
    assert.equal(empty.data.deckContentHash, undefined);
  }
});

test("safeParseDeck rejects a non-string deckContentHash", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    deckContentHash: 42,
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// elementsDerived provenance flag (issue #221, #486)
// ---------------------------------------------------------------------------

test("safeParseDeck round-trips the elementsDerived flag (true preserved)", () => {
  const withTrue = safeParseDeck({
    ...(currentDeck() as { slides: { [k: string]: unknown }[] }),
    slides: [
      {
        ...(currentDeck() as { slides: object[] }).slides[0],
        elementsDerived: true,
      },
    ],
  });
  assert.equal(withTrue.success, true);
  if (withTrue.success) {
    assert.equal(withTrue.data.slides[0].elementsDerived, true);
  }

  const withFalse = safeParseDeck({
    ...(currentDeck() as { slides: object[] }),
    slides: [
      {
        ...(currentDeck() as { slides: object[] }).slides[0],
        elementsDerived: false,
      },
    ],
  });
  assert.equal(withFalse.success, true);
  if (withFalse.success) {
    assert.equal(withFalse.data.slides[0].elementsDerived, false);
  }
});

test("safeParseDeck leaves elementsDerived absent when absent", () => {
  const result = safeParseDeck(currentDeck());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.slides[0].elementsDerived, undefined);
  }
});

test("safeParseDeck rejects non-boolean elementsDerived", () => {
  const result = safeParseDeck({
    ...(currentDeck() as { slides: object[] }),
    slides: [
      {
        ...(currentDeck() as { slides: object[] }).slides[0],
        elementsDerived: "yes",
      },
    ],
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Stable slide id
// ---------------------------------------------------------------------------

test("safeParseDeck rejects a slide missing its id", () => {
  const input = currentDeck() as { slides: Array<Record<string, unknown>> };
  delete input.slides[0].id;
  const result = safeParseDeck(input);
  assert.equal(result.success, false);
});

test("safeParseDeck preserves an existing slide id", () => {
  const input = {
    ...(currentDeck() as { slides: object[] }),
    slides: [
      {
        ...(currentDeck() as { slides: object[] }).slides[0],
        id: "sl-existing-abc",
      },
    ],
  };
  const result = safeParseDeck(input);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.slides[0].id, "sl-existing-abc");
  }
});
