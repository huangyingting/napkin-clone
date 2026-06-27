import assert from "node:assert/strict";
import { test } from "node:test";

import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";
import { safeParseDeck } from "./deck-schema";

function textElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "el-title",
    kind: "text",
    role: "title",
    box: { x: 8, y: 8, w: 84, h: 12 },
    zIndex: 0,
    content: {
      kind: "text",
      text: "Hello",
      paragraphs: [{ text: "Hello" }],
    },
    ...overrides,
  };
}

function masterElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "master-footer",
    kind: "text",
    role: "footer",
    masterChromeKind: "footer",
    layer: "foreground",
    locked: true,
    box: { x: 8, y: 92, w: 84, h: 4 },
    zIndex: 0,
    content: {
      kind: "text",
      text: "Footer",
      paragraphs: [{ text: "Footer" }],
    },
    ...overrides,
  };
}

function minimalV6Deck(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [
      {
        id: "master-default",
        name: "Default",
        elements: [masterElement()],
      },
    ],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Hello",
        elements: [textElement()],
      },
    ],
    ...overrides,
  };
}

test("safeParseDeck accepts a minimal v6 deck", () => {
  const result = safeParseDeck(minimalV6Deck());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
});

test("safeParseDeck rejects unknown top-level fields", () => {
  const result = safeParseDeck(minimalV6Deck({ unexpectedDeckField: true }));
  assert.equal(result.success, false);
  assert.match(result.error, /Deck\.unexpectedDeckField/);
});

test("safeParseDeck rejects unknown slide fields", () => {
  const deck = minimalV6Deck();
  const slide = (deck.slides as Record<string, unknown>[])[0];
  slide.unexpectedSlideField = true;
  const result = safeParseDeck(deck);
  assert.equal(result.success, false);
  assert.match(result.error, /slides\[0\]\.unexpectedSlideField/);
});

test("safeParseDeck rejects mismatched element kind and content.kind", () => {
  const deck = minimalV6Deck({
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Hello",
        elements: [
          textElement({
            content: { kind: "image", src: "https://example.test/a.png" },
          }),
        ],
      },
    ],
  });
  const result = safeParseDeck(deck);
  assert.equal(result.success, false);
  assert.match(result.error, /content\.kind must match element kind/);
});

test("safeParseDeck requires master element layer and locked=true", () => {
  const missingLayer = safeParseDeck(
    minimalV6Deck({
      masters: [
        {
          id: "master-default",
          name: "Default",
          elements: [masterElement({ layer: undefined })],
        },
      ],
    }),
  );
  assert.equal(missingLayer.success, false);
  assert.match(missingLayer.error, /layer must/);

  const unlocked = safeParseDeck(
    minimalV6Deck({
      masters: [
        {
          id: "master-default",
          name: "Default",
          elements: [masterElement({ locked: false })],
        },
      ],
    }),
  );
  assert.equal(unlocked.success, false);
  assert.match(unlocked.error, /locked must be true/);
});

test("safeParseDeck rejects masterChromeKind on slide elements", () => {
  const result = safeParseDeck(
    minimalV6Deck({
      slides: [
        {
          id: "slide-1",
          index: 0,
          title: "Hello",
          elements: [textElement({ masterChromeKind: "footer" })],
        },
      ],
    }),
  );
  assert.equal(result.success, false);
  assert.match(result.error, /masterChromeKind is not part/);
});

test("safeParseDeck requires defaultMasterId to reference an existing master", () => {
  const result = safeParseDeck(minimalV6Deck({ defaultMasterId: "missing" }));
  assert.equal(result.success, false);
  assert.match(result.error, /defaultMasterId must reference/);
});
