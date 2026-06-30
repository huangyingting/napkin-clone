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
  const v7Deck = buildDeckV7([buildCoverSlide()], {
    theme: { packageId: "ocean" },
  });
  const model = buildPublicPresentationModel({
    title: "Public deck",
    contentJson: { root: { children: [] } },
    deckJson: v7Deck,
    owner: { name: "Ava", plan: "free" },
  });

  assert.equal(model.title, "Public deck");
  assert.equal(model.deckV7.schemaVersion, 7);
  assert.equal(model.themePackage.id, v7Deck.theme.packageId);
  assert.equal(model.deckV7.slides[0].id, v7Deck.slides[0].id);
  assert.equal(model.attribution.ownerName, "Ava");
});

test("buildPublicPresentationModel resolves runtime v7 theme package fallback diagnostics", () => {
  resetBuilderCounter();
  const v7Deck = buildDeckV7([buildCoverSlide()], {
    theme: { packageId: "missing-package" },
  });
  const model = buildPublicPresentationModel({
    title: "Public deck",
    contentJson: { root: { children: [] } },
    deckJson: v7Deck,
    owner: { name: "Ava", plan: "free" },
  });

  assert.equal(model.themePackage.id, "neutral");
  assert.equal(model.diagnostics[0]?.code, "unknown-theme-package");
});

test("buildPublicPresentationModel falls back to blank v7 for invalid deckJson", () => {
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
});

test("buildPublicPresentationModelAny returns the v7-only model", () => {
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
});
