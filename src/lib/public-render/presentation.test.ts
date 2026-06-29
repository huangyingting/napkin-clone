import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDeckV7,
  buildCoverSlide,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";

import {
  buildPublicPresentationModel,
  buildPublicPresentationModelAny,
} from "./presentation";

test("buildPublicPresentationModel carries valid v7 deckJson", () => {
  resetBuilderCounter();
  const v7Deck = buildDeckV7([buildCoverSlide()]);
  const model = buildPublicPresentationModel({
    title: "Public deck",
    contentJson: { root: { children: [] } },
    deckJson: v7Deck,
    owner: { name: "Ava", plan: "free" },
  });

  assert.equal(model.title, "Public deck");
  assert.equal(model.deckV7.schemaVersion, 7);
  assert.equal(model.deckV7.slides[0].id, v7Deck.slides[0].id);
  assert.equal(model.attribution.ownerName, "Ava");
  // Theme resolution should be present
  assert.ok(model.themeResolution != null);
  assert.ok(model.themeResolution.pkg != null);
  assert.equal(model.openError, undefined);
});

test("buildPublicPresentationModel falls back to blank v7 for invalid deckJson and surfaces openError", () => {
  const model = buildPublicPresentationModel({
    title: "Fallback deck",
    contentJson: { root: { children: [] } },
    deckJson: { schemaVersion: -1 },
    owner: { name: null, plan: "free" },
  });

  assert.equal(model.title, "Fallback deck");
  assert.equal(model.deckV7.schemaVersion, 7);
  assert.equal(model.deckV7.title, "Fallback deck");
  assert.equal(model.attribution.ownerName, "Document owner");
  // Should carry an openError since deckJson was non-null but invalid
  assert.ok(typeof model.openError === "string" && model.openError.length > 0);
  // Theme resolution should still be present (neutral fallback)
  assert.ok(model.themeResolution != null);
  assert.ok(model.themeResolution.pkg != null);
});

test("buildPublicPresentationModel uses blank deck (no openError) when deckJson is null", () => {
  const model = buildPublicPresentationModel({
    title: "Empty deck",
    contentJson: { root: { children: [] } },
    deckJson: null,
    owner: { name: null, plan: "free" },
  });

  assert.equal(model.deckV7.schemaVersion, 7);
  assert.equal(model.openError, undefined);
});

test("buildPublicPresentationModel resolves known theme with no diagnostic", () => {
  // Build a deck that explicitly uses the neutral package id
  resetBuilderCounter();
  const v7Deck = buildDeckV7([buildCoverSlide()]);
  // Override the packageId to "neutral" (registered)
  const neutralDeck = {
    ...v7Deck,
    theme: { ...v7Deck.theme, packageId: "neutral" as const },
  };
  const model = buildPublicPresentationModel({
    title: "Themed deck",
    contentJson: {},
    deckJson: neutralDeck,
    owner: { name: "Bo", plan: "pro" },
  });

  assert.equal(model.themeResolution.diagnostic, undefined);
});

test("buildPublicPresentationModelAny returns the v7-only model with themeResolution", () => {
  resetBuilderCounter();
  const v7Deck = buildDeckV7([buildCoverSlide()]);
  const model = buildPublicPresentationModelAny({
    title: "vNext deck",
    contentJson: { root: { children: [] } },
    deckJson: v7Deck,
    owner: { name: "Alex", plan: "pro" },
  });

  assert.equal(model.title, "vNext deck");
  assert.equal(model.deckV7.schemaVersion, 7);
  assert.equal(model.attribution.ownerName, "Alex");
  assert.ok(model.themeResolution != null);
});
