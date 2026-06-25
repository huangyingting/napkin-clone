import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck } from "./deck";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";
import { pickFreshestDeck } from "./fresh-deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_DECK: Deck = {
  slides: [
    {
      id: "sl-base",
      index: 0,
      title: "Base",
      bullets: [],
      visualIds: [],
      layout: "title",
      notes: "",
      elements: [
        {
          id: "el-base-title",
          kind: "text",
          role: "title",
          text: "Base",
          zIndex: 0,
          box: { x: 6, y: 6, w: 88, h: 16 },
          style: { fontSize: 6, bold: true, italic: false, align: "left" },
        },
      ],
    },
  ],
  themeId: "default",
  schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
};

const FETCHED_DECK: Deck = {
  slides: [
    {
      id: "sl-fetched",
      index: 0,
      title: "Fetched (remote)",
      bullets: ["Remote bullet"],
      visualIds: [],
      layout: "content",
      notes: "",
      elements: [
        {
          id: "el-fetched-title",
          kind: "text",
          role: "title",
          text: "Fetched (remote)",
          zIndex: 0,
          box: { x: 6, y: 6, w: 88, h: 16 },
          style: { fontSize: 6, bold: true, italic: false, align: "left" },
        },
        {
          id: "el-fetched-body",
          kind: "bullets",
          bullets: ["Remote bullet"],
          items: [{ text: "Remote bullet" }],
          zIndex: 1,
          box: { x: 6, y: 26, w: 88, h: 66 },
          style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
        },
      ],
    },
  ],
  themeId: "indigo",
  schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
};

const CACHED_DECK: Deck = {
  slides: [
    {
      id: "sl-cached",
      index: 0,
      title: "Cached (prop)",
      bullets: [],
      visualIds: [],
      layout: "section",
      notes: "",
      elements: [
        {
          id: "el-cached-title",
          kind: "text",
          role: "title",
          text: "Cached (prop)",
          zIndex: 0,
          box: { x: 6, y: 6, w: 88, h: 16 },
          style: { fontSize: 6, bold: true, italic: false, align: "left" },
        },
      ],
    },
  ],
  themeId: "ocean",
  schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
};

// ---------------------------------------------------------------------------
// pickFreshestDeck
// ---------------------------------------------------------------------------

test("pickFreshestDeck — uses fetched when valid", () => {
  const result = pickFreshestDeck(FETCHED_DECK, CACHED_DECK, BASE_DECK);
  assert.strictEqual(result.themeId, "indigo");
  assert.strictEqual(result.slides[0]?.title, "Fetched (remote)");
});

test("pickFreshestDeck — uses cachedRaw when fetched is null", () => {
  const result = pickFreshestDeck(null, CACHED_DECK, BASE_DECK);
  assert.strictEqual(result.themeId, "ocean");
  assert.strictEqual(result.slides[0]?.title, "Cached (prop)");
});

test("pickFreshestDeck — uses cachedRaw when fetched is invalid", () => {
  const invalid = { slides: "not-an-array", themeId: "default" };
  const result = pickFreshestDeck(invalid, CACHED_DECK, BASE_DECK);
  assert.strictEqual(result.themeId, "ocean");
});

test("pickFreshestDeck — uses baseDeck when both raw sources are invalid", () => {
  const result = pickFreshestDeck(null, undefined, BASE_DECK);
  assert.strictEqual(result.themeId, "default");
  assert.strictEqual(result.slides[0]?.title, "Base");
});

test("pickFreshestDeck — rejects fetched JSON string", () => {
  const serialized = JSON.stringify(FETCHED_DECK);
  const result = pickFreshestDeck(serialized, CACHED_DECK, BASE_DECK);
  assert.strictEqual(result.themeId, "ocean");
  assert.strictEqual(result.slides[0]?.title, "Cached (prop)");
});

test("pickFreshestDeck — rejects cachedRaw JSON string", () => {
  const serialized = JSON.stringify(CACHED_DECK);
  const result = pickFreshestDeck(null, serialized, BASE_DECK);
  assert.strictEqual(result.themeId, "default");
});

test("pickFreshestDeck — uses fetched even when cachedRaw is also valid", () => {
  const result = pickFreshestDeck(FETCHED_DECK, CACHED_DECK, BASE_DECK);
  // Fetched takes priority
  assert.strictEqual(result.slides[0]?.title, "Fetched (remote)");
});
