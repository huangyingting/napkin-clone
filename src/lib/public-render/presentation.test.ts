import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
  type Slide,
  type SlideElement,
} from "@/lib/presentation/deck";

import { buildPublicPresentationModel } from "./presentation";

function visualElement(id: string, visualId: string): SlideElement {
  return {
    id,
    kind: "visual",
    role: "visual",
    content: { kind: "visual", visualId },
    zIndex: 0,
    box: { x: 0, y: 0, w: 50, h: 50 },
  } as unknown as SlideElement;
}

function slide(partial: Partial<Slide>): Slide {
  return {
    id: "slide-1",
    index: 0,
    title: "Slide",
    notes: "",
    ...partial,
  } as unknown as Slide;
}

function deck(slides: Slide[]): Deck {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides,
  } as unknown as Deck;
}

function contentWithVisual(visualId: string): unknown {
  return {
    root: {
      children: [{ type: "visual", visualId, visual: { type: "flowchart" } }],
      direction: "ltr",
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}

test("buildPublicPresentationModel strips orphan visual references from persisted decks", () => {
  const model = buildPublicPresentationModel({
    title: "Public deck",
    contentJson: contentWithVisual("keep"),
    deckJson: deck([
      slide({
        elements: [
          visualElement("el-keep", "keep"),
          visualElement("el-gone", "gone"),
        ],
      }),
    ]),
    owner: { name: null, plan: "free" },
  });

  assert.equal(model.title, "Public deck");
  assert.deepEqual(Object.keys(model.visuals), ["keep"]);
  assert.deepEqual(
    model.deck.slides[0].elements?.map((element) => element.id),
    ["el-keep"],
  );
  assert.equal(model.attribution.ownerName, "Document owner");
});

test("buildPublicPresentationModel falls back to a block-derived deck when persisted deck is invalid", () => {
  const model = buildPublicPresentationModel({
    title: "Fallback deck",
    contentJson: contentWithVisual("vis-1"),
    deckJson: { schemaVersion: -1 },
    owner: { name: "Ava", plan: "free" },
  });

  assert.equal(model.title, "Fallback deck");
  assert.ok(model.deck.slides.length > 0);
  assert.deepEqual(Object.keys(model.visuals), ["vis-1"]);
  assert.equal(model.attribution.ownerName, "Ava");
});

import { buildPublicPresentationModelAny } from "./presentation";
import {
  buildDeckV7,
  buildCoverSlide,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";

test("buildPublicPresentationModelAny returns v7 model for valid v7 deckJson", () => {
  resetBuilderCounter();
  const v7Deck = buildDeckV7([buildCoverSlide()]);
  const model = buildPublicPresentationModelAny({
    title: "vNext deck",
    contentJson: { root: { children: [] } },
    deckJson: v7Deck,
    owner: { name: "Alex", plan: "pro" },
  });
  assert.equal(model.kind, "v7");
  if (model.kind === "v7") {
    assert.equal(model.title, "vNext deck");
    assert.equal(model.deckV7.schemaVersion, 7);
    assert.equal(model.attribution.ownerName, "Alex");
  }
});

test("buildPublicPresentationModelAny falls back to v6 for legacy deckJson", () => {
  const model = buildPublicPresentationModelAny({
    title: "Legacy",
    contentJson: { root: { children: [] } },
    deckJson: { schemaVersion: 5 },
    owner: { name: null, plan: "free" },
  });
  assert.equal(model.kind, "v6");
});

test("buildPublicPresentationModel carries deckV7 field for valid v7 deckJson", () => {
  resetBuilderCounter();
  const v7Deck = buildDeckV7([buildCoverSlide()]);
  const model = buildPublicPresentationModel({
    title: "Hybrid",
    contentJson: { root: { children: [] } },
    deckJson: v7Deck,
    owner: { name: null, plan: "free" },
  });
  assert.ok(
    model.deckV7 !== undefined,
    "Expected deckV7 field to be populated",
  );
  assert.equal(model.deckV7?.schemaVersion, 7);
});
