import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck } from "./deck";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";
import { pickFreshestDeck } from "./fresh-deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function deck(themeId: string, title: string): Deck {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: `sl-${themeId}`,
        index: 0,
        title,
        notes: "",
        elements: [
          {
            id: `el-${themeId}-title`,
            kind: "text",
            role: "title",
            content: {
              kind: "text",
              text: title,
              paragraphs: [{ text: title }],
            },
            zIndex: 0,
            box: { x: 6, y: 6, w: 88, h: 16 },
            designOverrides: {
              textStyle: {
                fontSize: 6,
                bold: true,
                italic: false,
                align: "left",
              },
            },
          },
        ],
      },
    ],
  } as unknown as Deck;
}

function themeId(deck: Deck): string | undefined {
  return (deck as any).design?.themeId;
}

const BASE_DECK = deck("default", "Base");
const FETCHED_DECK = deck("indigo", "Fetched (remote)");
const CACHED_DECK = deck("ocean", "Cached (prop)");

// ---------------------------------------------------------------------------
// pickFreshestDeck
// ---------------------------------------------------------------------------

test("pickFreshestDeck — uses fetched when valid", () => {
  const result = pickFreshestDeck(FETCHED_DECK, CACHED_DECK, BASE_DECK);
  assert.strictEqual(themeId(result), "indigo");
  assert.strictEqual(result.slides[0]?.title, "Fetched (remote)");
});

test("pickFreshestDeck — uses cachedRaw when fetched is null", () => {
  const result = pickFreshestDeck(null, CACHED_DECK, BASE_DECK);
  assert.strictEqual(themeId(result), "ocean");
  assert.strictEqual(result.slides[0]?.title, "Cached (prop)");
});

test("pickFreshestDeck — uses cachedRaw when fetched is invalid", () => {
  const invalid = { slides: "not-an-array", themeId: "default" };
  const result = pickFreshestDeck(invalid, CACHED_DECK, BASE_DECK);
  assert.strictEqual(themeId(result), "ocean");
});

test("pickFreshestDeck — uses baseDeck when both raw sources are invalid", () => {
  const result = pickFreshestDeck(null, undefined, BASE_DECK);
  assert.strictEqual(themeId(result), "default");
  assert.strictEqual(result.slides[0]?.title, "Base");
});

test("pickFreshestDeck — rejects fetched JSON string", () => {
  const serialized = JSON.stringify(FETCHED_DECK);
  const result = pickFreshestDeck(serialized, CACHED_DECK, BASE_DECK);
  assert.strictEqual(themeId(result), "ocean");
  assert.strictEqual(result.slides[0]?.title, "Cached (prop)");
});

test("pickFreshestDeck — rejects cachedRaw JSON string", () => {
  const serialized = JSON.stringify(CACHED_DECK);
  const result = pickFreshestDeck(null, serialized, BASE_DECK);
  assert.strictEqual(themeId(result), "default");
});

test("pickFreshestDeck — uses fetched even when cachedRaw is also valid", () => {
  const result = pickFreshestDeck(FETCHED_DECK, CACHED_DECK, BASE_DECK);
  // Fetched takes priority
  assert.strictEqual(result.slides[0]?.title, "Fetched (remote)");
});
