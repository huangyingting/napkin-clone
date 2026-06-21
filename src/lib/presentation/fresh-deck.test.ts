import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck } from "./deck";
import { normalizeDeckRaw, pickFreshestDeck } from "./fresh-deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_DECK: Deck = {
  slides: [
    {
      index: 0,
      title: "Base",
      bullets: [],
      visualIds: [],
      layout: "title",
      notes: "",
      theme: "default",
    },
  ],
  theme: "default",
};

const FETCHED_DECK: Deck = {
  slides: [
    {
      index: 0,
      title: "Fetched (remote)",
      bullets: ["Remote bullet"],
      visualIds: [],
      layout: "content",
      notes: "",
      theme: "indigo",
    },
  ],
  theme: "indigo",
};

const FALLBACK_DECK: Deck = {
  slides: [
    {
      index: 0,
      title: "Fallback (prop)",
      bullets: [],
      visualIds: [],
      layout: "section",
      notes: "",
      theme: "ocean",
    },
  ],
  theme: "ocean",
};

// ---------------------------------------------------------------------------
// normalizeDeckRaw
// ---------------------------------------------------------------------------

test("normalizeDeckRaw — returns object unchanged", () => {
  const obj = { slides: [], theme: "default" };
  assert.strictEqual(normalizeDeckRaw(obj), obj);
});

test("normalizeDeckRaw — parses valid JSON string", () => {
  const serialized = JSON.stringify(FETCHED_DECK);
  const result = normalizeDeckRaw(serialized);
  assert.deepStrictEqual(result, FETCHED_DECK);
});

test("normalizeDeckRaw — returns invalid JSON string as-is (not throwing)", () => {
  const bad = "not-json{{{";
  const result = normalizeDeckRaw(bad);
  assert.strictEqual(result, bad);
});

test("normalizeDeckRaw — returns null unchanged", () => {
  assert.strictEqual(normalizeDeckRaw(null), null);
});

test("normalizeDeckRaw — returns undefined unchanged", () => {
  assert.strictEqual(normalizeDeckRaw(undefined), undefined);
});

// ---------------------------------------------------------------------------
// pickFreshestDeck
// ---------------------------------------------------------------------------

test("pickFreshestDeck — uses fetched when valid", () => {
  const result = pickFreshestDeck(FETCHED_DECK, FALLBACK_DECK, BASE_DECK);
  assert.strictEqual(result.theme, "indigo");
  assert.strictEqual(result.slides[0]?.title, "Fetched (remote)");
});

test("pickFreshestDeck — falls back to fallbackRaw when fetched is null", () => {
  const result = pickFreshestDeck(null, FALLBACK_DECK, BASE_DECK);
  assert.strictEqual(result.theme, "ocean");
  assert.strictEqual(result.slides[0]?.title, "Fallback (prop)");
});

test("pickFreshestDeck — falls back to fallbackRaw when fetched is invalid", () => {
  const invalid = { slides: "not-an-array", theme: "default" };
  const result = pickFreshestDeck(invalid, FALLBACK_DECK, BASE_DECK);
  assert.strictEqual(result.theme, "ocean");
});

test("pickFreshestDeck — falls back to baseDeck when both raw sources are invalid", () => {
  const result = pickFreshestDeck(null, undefined, BASE_DECK);
  assert.strictEqual(result.theme, "default");
  assert.strictEqual(result.slides[0]?.title, "Base");
});

test("pickFreshestDeck — accepts fetched as JSON string", () => {
  const serialized = JSON.stringify(FETCHED_DECK);
  const result = pickFreshestDeck(serialized, FALLBACK_DECK, BASE_DECK);
  assert.strictEqual(result.theme, "indigo");
  assert.strictEqual(result.slides[0]?.title, "Fetched (remote)");
});

test("pickFreshestDeck — accepts fallbackRaw as JSON string", () => {
  const serialized = JSON.stringify(FALLBACK_DECK);
  const result = pickFreshestDeck(null, serialized, BASE_DECK);
  assert.strictEqual(result.theme, "ocean");
});

test("pickFreshestDeck — uses fetched even when fallback is also valid", () => {
  const result = pickFreshestDeck(FETCHED_DECK, FALLBACK_DECK, BASE_DECK);
  // Fetched takes priority
  assert.strictEqual(result.slides[0]?.title, "Fetched (remote)");
});
