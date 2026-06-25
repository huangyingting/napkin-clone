import assert from "node:assert/strict";
import { test } from "node:test";

import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";
import { normalizePersistedDeckJson } from "./persisted-deck";

const VALID_DECK = {
  slides: [
    {
      id: "slide-1",
      index: 0,
      title: "Valid deck",
      bullets: [],
      visualIds: [],
      layout: "title",
      notes: "",
      theme: "default",
      elements: [],
    },
  ],
  theme: "default",
  schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
};

test("normalizePersistedDeckJson — returns null unchanged", () => {
  assert.strictEqual(normalizePersistedDeckJson(null), null);
});

test("normalizePersistedDeckJson — returns undefined unchanged", () => {
  assert.strictEqual(normalizePersistedDeckJson(undefined), undefined);
});

test("normalizePersistedDeckJson — returns an object deck unchanged", () => {
  assert.strictEqual(normalizePersistedDeckJson(VALID_DECK), VALID_DECK);
});

test("normalizePersistedDeckJson — returns malformed objects unchanged", () => {
  const malformed = { not: "a deck" };
  assert.strictEqual(normalizePersistedDeckJson(malformed), malformed);
});

test("normalizePersistedDeckJson — rejects serialized JSON strings", () => {
  assert.strictEqual(
    normalizePersistedDeckJson(JSON.stringify(VALID_DECK)),
    null,
  );
});
