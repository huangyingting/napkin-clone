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
    visualId,
    zIndex: 0,
    box: { x: 0, y: 0, w: 50, h: 50 },
  };
}

function slide(partial: Partial<Slide>): Slide {
  return {
    id: "slide-1",
    index: 0,
    title: "Slide",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    ...partial,
  };
}

function deck(slides: Slide[]): Deck {
  return {
    themeId: "default",
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    slides,
  };
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
        visualIds: ["keep", "gone"],
        elements: [
          visualElement("el-keep", "keep"),
          visualElement("el-gone", "gone"),
        ],
      }),
    ]),
    owner: { name: null, email: "owner@example.com", plan: "free" },
  });

  assert.equal(model.title, "Public deck");
  assert.deepEqual(Object.keys(model.visuals), ["keep"]);
  assert.deepEqual(
    model.deck.slides[0].elements?.map((element) => element.id),
    ["el-keep"],
  );
  assert.equal(model.attribution.ownerName, "owner");
});

test("buildPublicPresentationModel falls back to a block-derived deck when persisted deck is invalid", () => {
  const model = buildPublicPresentationModel({
    title: "Fallback deck",
    contentJson: contentWithVisual("vis-1"),
    deckJson: { schemaVersion: -1 },
    owner: { name: "Ava", email: "ava@example.com", plan: "free" },
  });

  assert.equal(model.title, "Fallback deck");
  assert.ok(model.deck.slides.length > 0);
  assert.deepEqual(Object.keys(model.visuals), ["vis-1"]);
  assert.equal(model.attribution.ownerName, "Ava");
});
