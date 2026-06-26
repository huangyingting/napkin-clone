import assert from "node:assert/strict";
import test from "node:test";

import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";

import { PERSISTED_JSON_CONTRACTS } from "./persisted-json";

function validDeck(): unknown {
  return {
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Intro",
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
        elements: [],
      },
    ],
    themeId: "indigo",
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  };
}

function validVisual(): unknown {
  return {
    version: 1,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: [{ id: "n1", label: "Start" }],
    edges: [],
  };
}

test("persisted JSON registry points at current validators", () => {
  assert.deepEqual(Object.keys(PERSISTED_JSON_CONTRACTS).sort(), [
    "Comment.anchor",
    "Document.contentJson:visual",
    "Document.deckJson",
    "DocumentVersion.contentJson:visual",
    "DocumentVersion.deckJson",
    "Visual.data",
  ]);
  assert.equal(
    PERSISTED_JSON_CONTRACTS["Document.deckJson"].validate(validDeck()).success,
    true,
  );
  assert.equal(
    PERSISTED_JSON_CONTRACTS["Visual.data"].validate(validVisual()).success,
    true,
  );
});

// @compat — confirms superseded deck shapes and retired anchor types are rejected at the persistence boundary
test("registry rejects superseded deck and invalid comment anchor shapes", () => {
  assert.equal(
    PERSISTED_JSON_CONTRACTS["Document.deckJson"].validate(
      JSON.stringify(validDeck()),
    ).success,
    false,
  );
  assert.equal(
    PERSISTED_JSON_CONTRACTS["Comment.anchor"].validate({
      anchorType: "legacy",
    }).success,
    false,
  );
  assert.equal(
    PERSISTED_JSON_CONTRACTS["Comment.anchor"].validate({
      slideId: "s1",
      elementId: "e1",
      anchorGeometry: { x: 10, y: 20 },
    }).success,
    true,
  );
});
